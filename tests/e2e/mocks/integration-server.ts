import http from 'http';
import { URL } from 'url';

/**
 * A lightweight mock server that mimics GitHub (and potentially other integrations).
 * It stores requests in memory so tests can assert against them.
 */
export class MockIntegrationServer {
  private server: http.Server;
  private port: number;
  
  // Store received data for assertions
  public requests: {
    issues: any[];
    webhooks: any[];
    pullRequests: any[];
    comments: any[];
  } = {
    issues: [],
    webhooks: [],
    pullRequests: [],
    comments: []
  };

  // Pre-configured responses
  public nextIssueNumber = 100;
  public nextPrNumber = 200;

  constructor(port: number = 9999) {
    this.port = port;
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`Mock Integration Server running on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  reset() {
    this.requests = {
      issues: [],
      webhooks: [],
      pullRequests: [],
      comments: []
    };
    this.nextIssueNumber = 100;
    this.nextPrNumber = 200;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        this.route(req, res, parsedBody);
      } catch (e) {
        console.error('Error parsing body', e);
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse, body: any) {
    const url = new URL(req.url || '', `http://localhost:${this.port}`);
    const path = url.pathname;
    const method = req.method;

    console.log(`[MockServer] ${method} ${path}`);

    // MOCK GITHUB endpoints

    // GET User (Authentication check)
    if (method === 'GET' && path === '/user') {
      return this.json(res, { login: 'mock-user', id: 1 });
    }

    // POST Create Issue
    if (method === 'POST' && path.match(/\/repos\/[^/]+\/[^/]+\/issues$/)) {
      const issue = {
        number: this.nextIssueNumber++,
        id: Math.floor(Math.random() * 100000),
        title: body.title,
        body: body.body,
        state: 'open',
        labels: body.labels || [],
        html_url: `http://localhost:${this.port}/mock/issue/${this.nextIssueNumber-1}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.requests.issues.push({ ...issue, _reqBody: body });
      return this.json(res, issue, 201);
    }

    // POST Create Webhook
    if (method === 'POST' && path.match(/\/repos\/[^/]+\/[^/]+\/hooks$/)) {
      const hook = {
        id: Math.floor(Math.random() * 100000),
        url: body.config?.url,
        active: true
      };
      this.requests.webhooks.push({ ...hook, _reqBody: body });
      return this.json(res, hook, 201);
    }

    // POST Create Pull Request
    if (method === 'POST' && path.match(/\/repos\/[^/]+\/[^/]+\/pulls$/)) {
      const pr = {
        number: this.nextPrNumber++,
        id: Math.floor(Math.random() * 100000),
        title: body.title,
        body: body.body,
        state: 'open',
        html_url: `http://localhost:${this.port}/mock/pull/${this.nextPrNumber-1}`,
        head: { ref: body.head },
        base: { ref: body.base },
        created_at: new Date().toISOString()
      };
      this.requests.pullRequests.push({ ...pr, _reqBody: body });
      return this.json(res, pr, 201);
    }

    // POST Comment on Issue
    if (method === 'POST' && path.match(/\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/)) {
      const match = path.match(/\/issues\/(\d+)\/comments/);
      const issueNumber = match ? match[1] : '?';
      const comment = {
        id: Math.floor(Math.random() * 100000),
        body: body.body,
        html_url: `http://localhost:${this.port}/mock/comment/1`,
        created_at: new Date().toISOString()
      };
      this.requests.comments.push({ ...comment, issueNumber, _reqBody: body });
      return this.json(res, comment, 201);
    }

     // PATCH Update Issue
     if (method === 'PATCH' && path.match(/\/repos\/[^/]+\/[^/]+\/issues\/\d+$/)) {
        const match = path.match(/\/issues\/(\d+)/);
        const issueNumber = match ? match[1] : '?';
        // Just return a dummy updated issue
        return this.json(res, { number: issueNumber, ...body }, 200);
    }

    // Default 404
    res.writeHead(404);
    res.end('Not Found');
  }

  private json(res: http.ServerResponse, data: any, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}
