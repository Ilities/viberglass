import express, { Express } from 'express';
import request from 'supertest';

export class TestServer {
  private app: Express | null = null;
  private server: any = null;

  async start(app: Express): Promise<Express> {
    this.app = app;
    return this.app;
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  getApp(): Express | null {
    return this.app;
  }

  request(): request.SuperTest<request.Test> {
    if (!this.app) {
      throw new Error('Server not started');
    }
    return request(this.app);
  }
}
