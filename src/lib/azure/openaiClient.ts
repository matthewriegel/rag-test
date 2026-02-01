/**
 * Azure OpenAI Client Wrapper
 * Provides compatibility layer between OpenAI SDK and Azure OpenAI SDK
 */

import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { azureConfig } from '../../config/azure.js';
import { logger } from '../logger.js';

export class AzureOpenAIClientWrapper {
  private client: AzureOpenAI;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor() {
    if (!azureConfig.openai.endpoint) {
      throw new Error('AZURE_OPENAI_ENDPOINT is required in Azure mode');
    }

    // Use API key or DefaultAzureCredential based on configuration
    const clientConfig: {
      endpoint?: string;
      apiVersion?: string;
      apiKey?: string;
      azureADTokenProvider?: () => Promise<string>;
    } = {
      endpoint: azureConfig.openai.endpoint,
      apiVersion: azureConfig.openai.apiVersion,
    };

    if (azureConfig.openai.apiKey) {
      // Use API key authentication
      clientConfig.apiKey = azureConfig.openai.apiKey;
    } else if (azureConfig.keyVault.useDefaultCredential) {
      // Use managed identity / DefaultAzureCredential
      const credential = new DefaultAzureCredential();
      const scope = 'https://cognitiveservices.azure.com/.default';
      clientConfig.azureADTokenProvider = getBearerTokenProvider(credential, scope);
    } else {
      throw new Error('AZURE_OPENAI_KEY is required or configure Azure DefaultAzureCredential');
    }

    this.client = new AzureOpenAI(clientConfig);

    logger.info(
      {
        endpoint: azureConfig.openai.endpoint,
        generationDeployment: azureConfig.openai.deployments.generation,
        embeddingDeployment: azureConfig.openai.deployments.embedding,
        authMethod: azureConfig.openai.apiKey ? 'api-key' : 'managed-identity',
      },
      'Azure OpenAI client initialized'
    );
  }

  /**
   * Create embedding for a single text
   */
  async createEmbedding(text: string): Promise<number[]> {
    return this.withRetry(async () => {
      logger.debug({ textLength: text.length }, 'Creating Azure OpenAI embedding');

      const response = await this.client.embeddings.create({
        model: azureConfig.openai.deployments.embedding,
        input: text,
      });

      if (!response.data[0]) {
        throw new Error('No embedding returned from Azure OpenAI');
      }

      // Normalize embedding vector (Azure OpenAI embeddings are already normalized)
      return response.data[0].embedding;
    }, 'createEmbedding');
  }

  /**
   * Create batch embeddings for multiple texts
   */
  async createBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return this.withRetry(async () => {
      logger.debug({ count: texts.length }, 'Creating batch Azure OpenAI embeddings');

      const response = await this.client.embeddings.create({
        model: azureConfig.openai.deployments.embedding,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    }, 'createBatchEmbeddings');
  }

  /**
   * Generate chat completion
   */
  async generateCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      requestConfidenceScore?: boolean;
    }
  ): Promise<string> {
    return this.withRetry(async () => {
      logger.debug({ messageCount: messages.length }, 'Generating Azure OpenAI completion');

      // If confidence score is requested, add instruction to system message
      let modifiedMessages = messages;
      if (options?.requestConfidenceScore) {
        modifiedMessages = this.addConfidenceInstructions(messages);
      }

      const response = await this.client.chat.completions.create({
        model: azureConfig.openai.deployments.generation,
        messages: modifiedMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No completion returned from Azure OpenAI');
      }

      return content;
    }, 'generateCompletion');
  }

  /**
   * Add confidence score instructions to messages
   */
  private addConfidenceInstructions(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const modifiedMessages = [...messages];
    
    // Find system message and append confidence instruction
    const systemIndex = modifiedMessages.findIndex((m) => m.role === 'system');
    if (systemIndex >= 0 && modifiedMessages[systemIndex]) {
      modifiedMessages[systemIndex] = {
        role: modifiedMessages[systemIndex].role,
        content:
          modifiedMessages[systemIndex].content +
          '\n\nAfter your answer, include your confidence level on a scale of 0.0 to 1.0 in the format: "Confidence: 0.XX"',
      };
    } else {
      // Add new system message if none exists
      modifiedMessages.unshift({
        role: 'system',
        content:
          'After your answer, include your confidence level on a scale of 0.0 to 1.0 in the format: "Confidence: 0.XX"',
      });
    }

    return modifiedMessages;
  }

  /**
   * Retry wrapper with exponential backoff
   */
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
            'Retrying Azure OpenAI operation'
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

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // OpenAI SDK errors
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: number }).status;
      // Retry on rate limits (429) and server errors (5xx)
      return status === 429 || (status !== undefined && status >= 500);
    }
    return false;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const azureOpenAIClient = new AzureOpenAIClientWrapper();
