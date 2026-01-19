import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { setupTestDatabase, teardownTestDatabase } from '../helpers';

describe('API Integration Tests', () => {
  let app: Express;
  let db: any;

  beforeAll(async () => {
    // Setup test database
    const testDb = await setupTestDatabase();
    db = testDb.db;

    // Setup Express app with test routes
    app = express();
    app.use(express.json());

    // Add your actual API routes here
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });
  });

  describe('Database Integration', () => {
    it('should connect to test database', async () => {
      expect(db).toBeDefined();
      const result = await db.executeQuery('SELECT 1 as value');
      expect(result.rows[0].value).toBe(1);
    });
  });
});
