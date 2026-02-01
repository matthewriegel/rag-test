import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { logger } from '../logger.js';

export class OpenAIClient {
  private client: OpenAI;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeoutMs,
      maxRetries: this.maxRetries,
    });
  }

  async createEmbedding(text: string): Promise<number[]> {
    return this.withRetry(async () => {
      logger.debug({ textLength: text.length }, 'Creating embedding');

      const response = await this.client.embeddings.create({
        model: config.openai.models.embedding,
        input: text,
      });

      if (!response.data[0]) {
        throw new Error('No embedding returned from OpenAI');
      }

      return response.data[0].embedding;
    }, 'createEmbedding');
  }

  async createBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return this.withRetry(async () => {
      logger.debug({ count: texts.length }, 'Creating batch embeddings');

      const response = await this.client.embeddings.create({
        model: config.openai.models.embedding,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    }, 'createBatchEmbeddings');
  }

  async generateCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    return this.withRetry(async () => {
      logger.debug({ messageCount: messages.length }, 'Generating completion');

      const response = await this.client.chat.completions.create({
        model: config.openai.models.generation,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No completion returned from OpenAI');
      }

      return content;
    }, 'generateCompletion');
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (this.isRetryableError(error)) {
          logger.warn(
            {
              attempt,
              maxRetries: this.maxRetries,
              operation: operationName,
              error: lastError.message,
            },
            'Retrying OpenAI operation'
          );

          if (attempt < this.maxRetries) {
            await this.sleep(this.retryDelay * attempt);
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      // Retry on rate limits and server errors
      return error.status === 429 || (error.status && error.status >= 500);
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const openaiClient = new OpenAIClient();
