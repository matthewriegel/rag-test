import { config as dotenvConfig } from 'dotenv';
import { AppConfig } from './types.js';
import { azureConfig } from './azure.js';

// Load environment variables
dotenvConfig();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value || defaultValue || '';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseFloat(value) : defaultValue;
}

export const config: AppConfig = {
  env: getEnvVar('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3000),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  azureMode: process.env['AZURE_MODE'] === 'true',

  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY'),
    timeoutMs: getEnvNumber('OPENAI_TIMEOUT_MS', 30000),
    models: {
      generation: 'gpt-4-turbo-preview', // Using gpt-4-turbo-preview as gpt-4.1-mini doesn't exist
      embedding: 'text-embedding-3-large',
    },
  },

  qdrant: {
    url: getEnvVar('QDRANT_URL', 'http://localhost:6333'),
    collectionName: getEnvVar('QDRANT_COLLECTION_NAME', 'rag_documents'),
    apiKey: process.env['QDRANT_API_KEY'],
    vectorSize: 3072, // text-embedding-3-large produces 3072-dimensional vectors
  },

  redis: {
    url: getEnvVar('REDIS_URL', 'redis://localhost:6379'),
    password: process.env['REDIS_PASSWORD'],
    db: getEnvNumber('REDIS_DB', 0),
  },

  cache: {
    queryTTL: getEnvNumber('CACHE_QUERY_TTL', 3600),
    customerTTL: getEnvNumber('CACHE_CUSTOMER_TTL', 86400),
    embeddingTTL: getEnvNumber('CACHE_EMBEDDING_TTL', 604800),
  },

  rag: {
    topK: getEnvNumber('RAG_TOP_K', 5),
    chunkSize: getEnvNumber('RAG_CHUNK_SIZE', 500),
    chunkOverlap: getEnvNumber('RAG_CHUNK_OVERLAP', 100),
  },

  confidence: {
    weights: {
      similarity: getEnvFloat('CONFIDENCE_WEIGHT_SIMILARITY', 0.5),
      metadata: getEnvFloat('CONFIDENCE_WEIGHT_METADATA', 0.3),
      llm: getEnvFloat('CONFIDENCE_WEIGHT_LLM', 0.2),
    },
  },

  auth: {
    jwtSecret: getEnvVar('JWT_SECRET', 'development-secret-change-in-production'),
    apiKey: getEnvVar('API_KEY', 'development-api-key'),
  },

  rateLimit: {
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
    maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  },
};

// Validate confidence weights sum to 1.0 (with tolerance for floating point)
const weightSum =
  config.confidence.weights.similarity +
  config.confidence.weights.metadata +
  config.confidence.weights.llm;

if (Math.abs(weightSum - 1.0) > 0.01) {
  throw new Error(
    `Confidence weights must sum to 1.0, got ${weightSum}. Check CONFIDENCE_WEIGHT_* environment variables.`
  );
}

// Export azure config for use by Azure adapters
export { azureConfig };
