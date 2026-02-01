export interface AppConfig {
  env: string;
  port: number;
  logLevel: string;
  openai: OpenAIConfig;
  qdrant: QdrantConfig;
  redis: RedisConfig;
  cache: CacheConfig;
  rag: RAGConfig;
  confidence: ConfidenceConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
}

export interface OpenAIConfig {
  apiKey: string;
  timeoutMs: number;
  models: {
    generation: string;
    embedding: string;
  };
}

export interface QdrantConfig {
  url: string;
  collectionName: string;
  apiKey?: string | undefined;
  vectorSize: number;
}

export interface RedisConfig {
  url: string;
  password?: string | undefined;
  db: number;
}

export interface CacheConfig {
  queryTTL: number;
  customerTTL: number;
  embeddingTTL: number;
}

export interface RAGConfig {
  topK: number;
  chunkSize: number;
  chunkOverlap: number;
}

export interface ConfidenceConfig {
  weights: {
    similarity: number;
    metadata: number;
    llm: number;
  };
}

export interface AuthConfig {
  jwtSecret: string;
  apiKey: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// API Types
export interface FormQueryRequest {
  customerId?: string | undefined;
  formQuestion: string;
  context?: Record<string, unknown> | undefined;
}

export interface FormQueryResponse {
  answer: string;
  dataPath: string[];
  confidence: number;
  sources: Source[];
  debug?: {
    llm_reasoning?: string;
  };
}

export interface Source {
  docId: string;
  chunkIndex: number;
  similarity: number;
}

export interface IngestRequest {
  documentId: string;
  customerId?: string | undefined;
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface IngestResponse {
  success: boolean;
  documentId: string;
  chunksCreated: number;
}

// Vector Store Types
export interface Document {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  customerId?: string | undefined;
  documentId: string;
  chunkIndex: number;
  totalChunks: number;
  source?: string | undefined;
  [key: string]: unknown;
}

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  embedding?: number[] | undefined;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: {
    content: string;
    metadata: DocumentMetadata;
  };
}

// Confidence Calculation Types
export interface ConfidenceSignals {
  simScore: number;
  metaScore: number;
  llmScore: number;
}

export interface ConfidenceResult {
  finalConfidence: number;
  signals: ConfidenceSignals;
  calculation: string;
}

// Customer Data Types
export interface CustomerData {
  customerId: string;
  name: string;
  data: Record<string, unknown>;
}

// Metrics Types
export interface Metrics {
  queryLatency: number[];
  ingestionRate: number;
  cacheHitRate: number;
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
}
