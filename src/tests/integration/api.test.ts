import request from 'supertest';
import { createApp } from '../../api/index.js';
import { config } from '../../config/index.js';

describe('API Integration Tests', () => {
  const app = createApp();
  const apiKey = config.auth.apiKey;

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.text).toContain('rag_uptime_seconds');
      expect(response.text).toContain('rag_total_queries');
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('POST /ingest', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app).post('/ingest').send({
        documentId: 'test-doc',
        content: 'Test content',
      });

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .post('/ingest')
        .set('x-api-key', 'wrong-key')
        .send({
          documentId: 'test-doc',
          content: 'Test content',
        });

      expect(response.status).toBe(403);
    });

    it('should reject requests with missing documentId', async () => {
      const response = await request(app)
        .post('/ingest')
        .set('x-api-key', apiKey)
        .send({
          content: 'Test content',
        });

      expect(response.status).toBe(400);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.error).toContain('documentId');
    });

    it('should reject requests with missing content', async () => {
      const response = await request(app)
        .post('/ingest')
        .set('x-api-key', apiKey)
        .send({
          documentId: 'test-doc',
        });

      expect(response.status).toBe(400);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.error).toContain('content');
    });
  });

  describe('POST /form-query', () => {
    it('should reject requests with missing formQuestion', async () => {
      const response = await request(app).post('/form-query').send({});

      expect(response.status).toBe(400);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(response.body.error).toContain('formQuestion');
    });

    it('should reject requests with non-string formQuestion', async () => {
      const response = await request(app).post('/form-query').send({
        formQuestion: 123,
      });

      expect(response.status).toBe(400);
    });
  });
});
