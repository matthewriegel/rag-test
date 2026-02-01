/**
 * Unified OpenAI Client Factory
 * Returns either Azure OpenAI client or standard OpenAI client based on configuration
 */

import { config } from '../../config/index.js';
import { OpenAIClient } from '../openai/client.js';
import { AzureOpenAIClientWrapper } from './openaiClient.js';
import { logger } from '../logger.js';

/**
 * Interface that both clients must implement
 */
export interface IOpenAIClient {
  createEmbedding(text: string): Promise<number[]>;
  createBatchEmbeddings(texts: string[]): Promise<number[][]>;
  generateCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      requestConfidenceScore?: boolean;
    }
  ): Promise<string>;
}

/**
 * Get the appropriate OpenAI client based on configuration
 */
export function getOpenAIClient(): IOpenAIClient {
  if (config.azureMode) {
    logger.info('Using Azure OpenAI client');
    return new AzureOpenAIClientWrapper();
  } else {
    logger.info('Using standard OpenAI client');
    return new OpenAIClient();
  }
}

// Export singleton instance
export const openAIClient = getOpenAIClient();
