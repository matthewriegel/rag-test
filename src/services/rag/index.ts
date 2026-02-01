import { embeddingService } from '../../lib/embeddings/index.js';
import { vectorStore } from '../../lib/vectorStore/index.js';
import { cacheService } from '../../lib/cache/index.js';
import { openaiClient } from '../../lib/openai/client.js';
import { FormQueryRequest, FormQueryResponse, Source } from '../../config/types.js';
import { logger } from '../../lib/logger.js';
import {
  calculateConfidence,
  calculateSimilarityScore,
  calculateMetadataScore,
  extractLLMConfidence,
} from './confidence.js';
import { config } from '../../config/index.js';

export class RAGService {
  /**
   * Process a form query with full RAG pipeline
   */
  async processQuery(request: FormQueryRequest): Promise<FormQueryResponse> {
    const { customerId, formQuestion, context = {} } = request;

    logger.info(
      {
        customerId,
        questionLength: formQuestion.length,
      },
      'Processing RAG query'
    );

    // Check cache first
    const cachedResult = await cacheService.getCachedQuery<FormQueryResponse>(
      formQuestion,
      customerId
    );

    if (cachedResult) {
      logger.info('Returning cached query result');
      return { ...cachedResult, cached: true };
    }

    try {
      // Create embedding for the query
      const queryEmbedding = await this.getOrCreateEmbedding(formQuestion);

      // Search vector store
      const filter = customerId ? { customerId } : undefined;
      const searchResults = await vectorStore.search(
        queryEmbedding,
        config.rag.topK,
        filter
      );

      if (searchResults.length === 0) {
        logger.warn('No search results found');
        return {
          answer: 'I could not find relevant information to answer this question.',
          dataPath: [],
          confidence: 0.0,
          sources: [],
        };
      }

      // Re-rank results (simple heuristic: prioritize by similarity and metadata match)
      const rerankedResults = this.rerank(searchResults, context);

      // Generate answer using LLM
      const { answer, reasoning, llmConfidence } = await this.generateAnswer(
        formQuestion,
        rerankedResults
      );

      // Build sources
      const sources: Source[] = rerankedResults.map((result) => ({
        docId: String(result.payload.metadata['documentId'] ?? ''),
        chunkIndex: Number(result.payload.metadata['chunkIndex'] ?? 0),
        similarity: result.score,
      }));

      // Build data paths
      const dataPaths = this.extractDataPaths(rerankedResults);

      // Calculate confidence
      const simScore = calculateSimilarityScore(
        rerankedResults.map((r) => r.score),
        3
      );
      const metaScore = this.calculateAggregateMetadataScore(
        rerankedResults,
        context
      );

      const confidenceResult = calculateConfidence({
        simScore,
        metaScore,
        llmScore: llmConfidence,
      });

      logger.info(
        {
          confidence: confidenceResult.finalConfidence,
          sources: sources.length,
        },
        'Query processed successfully'
      );

      const response: FormQueryResponse = {
        answer,
        dataPath: dataPaths,
        confidence: confidenceResult.finalConfidence,
        sources,
        cached: false,
        debug: {
          llm_reasoning: reasoning,
        },
      };

      // Cache the response
      await cacheService.cacheQuery(formQuestion, customerId, response);

      return response;
    } catch (error) {
      logger.error({ error }, 'RAG query processing failed');
      throw error;
    }
  }

  /**
   * Get embedding from cache or create new one
   */
  private async getOrCreateEmbedding(text: string): Promise<number[]> {
    const cached = await cacheService.getCachedEmbedding(text);
    if (cached) {
      logger.debug('Using cached embedding');
      return cached;
    }

    const embedding = await embeddingService.embedText(text);
    await cacheService.cacheEmbedding(text, embedding);
    return embedding;
  }

  /**
   * Simple re-ranking: boost results with better metadata matches
   */
  private rerank(
    results: Array<{
      id: string;
      score: number;
      payload: {
        content: string;
        metadata: Record<string, unknown>;
      };
    }>,
    context: Record<string, unknown>
  ): typeof results {
    if (Object.keys(context).length === 0) {
      return results;
    }

    // Calculate metadata boost for each result
    const scored = results.map((result) => {
      const metaScore = calculateMetadataScore(context, result.payload.metadata);
      const boostedScore = result.score * (1 + metaScore * 0.1); // 10% boost for perfect metadata match
      return { ...result, score: boostedScore };
    });

    // Sort by boosted score
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Generate answer using LLM with retrieved context
   */
  private async generateAnswer(
    question: string,
    results: Array<{
      payload: {
        content: string;
        metadata: Record<string, unknown>;
      };
    }>
  ): Promise<{
    answer: string;
    reasoning: string;
    llmConfidence: number;
  }> {
    // Build context from retrieved documents
    const context = results
      .map(
        (result, idx) => {
          const docId = result.payload.metadata['documentId'];
          const docIdStr = typeof docId === 'string' ? docId : 'unknown';
          return `[${idx + 1}] ${result.payload.content}\n(Source: ${docIdStr})`;
        }
      )
      .join('\n\n');

    const systemPrompt = `You are a helpful assistant that answers questions based on the provided context.
Your task is to:
1. Provide a clear, accurate answer based only on the given context
2. Include the source document IDs where you found the information
3. Provide brief reasoning about your answer
4. Rate your confidence in the answer from 0.0 to 1.0

Format your response as:
Answer: [your answer]
Reasoning: [brief explanation]
Confidence: [0.0-1.0]`;

    const userPrompt = `Context:
${context}

Question: ${question}`;

    const response = await openaiClient.generateCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 1000,
      }
    );

    // Parse response
    const answerMatch = response.match(/Answer:\s*(.+?)(?=\n(?:Reasoning|Confidence|$))/s);
    const reasoningMatch = response.match(/Reasoning:\s*(.+?)(?=\n(?:Confidence|$))/s);

    const answer = answerMatch?.[1]?.trim() || response;
    const reasoning = reasoningMatch?.[1]?.trim() || 'No explicit reasoning provided';
    const llmConfidence = extractLLMConfidence(response);

    return {
      answer,
      reasoning,
      llmConfidence,
    };
  }

  /**
   * Extract data paths from results
   */
  private extractDataPaths(
    results: Array<{
      payload: {
        metadata: Record<string, unknown>;
      };
    }>
  ): string[] {
    const paths = new Set<string>();

    for (const result of results) {
      const meta = result.payload.metadata;
      const docId = meta['documentId'];
      const chunkIndex = meta['chunkIndex'];

      if (typeof docId === 'string' && typeof chunkIndex === 'number') {
        paths.add(`${docId}#chunk${chunkIndex}`);
      }
    }

    return Array.from(paths);
  }

  /**
   * Calculate aggregate metadata score across all results
   */
  private calculateAggregateMetadataScore(
    results: Array<{
      payload: {
        metadata: Record<string, unknown>;
      };
    }>,
    context: Record<string, unknown>
  ): number {
    if (results.length === 0) {
      return 0;
    }

    const scores = results.map((result) =>
      calculateMetadataScore(context, result.payload.metadata)
    );

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
}

export const ragService = new RAGService();
