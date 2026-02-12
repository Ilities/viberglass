# Viberglass Receiver - Bug Capture & PM Integration Service

An MVP implementation of a bug capture service that receives automated bug reports from widgets and integrates with project management systems for auto-fix processing.

## 🚀 Features

### Bug Capture Service (Step 2)
- **RESTful API** for receiving bug reports from web widgets
- **File Upload Support** for screenshots and screen recordings (AWS S3)
- **Comprehensive Metadata Storage** (browser info, console logs, errors, technical details)
- **PostgreSQL Database** with optimized schema for bug reports and media assets
- **Input Validation** using Joi with detailed error responses
- **Rate Limiting & Abuse Prevention** ready

### PM System Integration Layer (Step 3)
- **Multi-Platform Support**: GitHub, Jira, Linear (extensible architecture)
- **Webhook Processing** with signature verification and audit logging
- **Auto-Fix Detection** via multiple strategies (labels, title prefixes, description markers)
- **Custom Field Mapping** for technical metadata
- **Message Queue Integration** using Redis + Bull for async processing

### Additional Features
- **TypeScript** implementation with comprehensive type safety
- **API Documentation** with interactive examples
- **Health Monitoring** endpoints and queue status
- **Test Suite** with integration test examples
- **Docker-Ready** architecture
- **Graceful Shutdown** handling

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+
- Redis 6+
- AWS S3 bucket (for media storage)

## 🛠️ Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

Create PostgreSQL database and run the schema:

```bash
createdb viberglass_receiver
psql -d viberglass_receiver -f src/config/database.sql
```

### 3. Environment Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=viberglass_receiver
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false

# Redis Configuration (for message queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AWS S3 Configuration (for media storage)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=eu-west-1
AWS_S3_BUCKET=viberglass-media

# GitHub Integration
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Other PM Integrations
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USERNAME=your_email
JIRA_API_TOKEN=your_api_token

LINEAR_API_KEY=your_linear_api_key
```

### 4. Build & Start

```bash
# Development mode
npm run dev

# Production build
npm run build
npm start

# Run tests
npm test
```

## 📡 API Usage

### Health Check
```bash
curl http://localhost:8888/health
```

### Create Bug Report

```bash
curl -X POST http://localhost:8888/api/tickets \
  -F "screenshot=@screenshot.png" \
  -F "recording=@recording.mp4" \
  -F "projectId=123e4567-e89b-12d3-a456-426614174000" \
  -F "title=Button not clickable on mobile" \
  -F "description=The submit button cannot be clicked on mobile devices" \
  -F "severity=high" \
  -F "category=UI/UX" \
  -F "ticketSystem=github" \
  -F "autoFixRequested=true" \
  -F 'metadata={
    "browser": {"name": "Chrome", "version": "91.0.4472.124"},
    "os": {"name": "Android", "version": "11"},
    "screen": {"width": 360, "height": 640, "viewportWidth": 360, "viewportHeight": 640, "pixelRatio": 3},
    "network": {"userAgent": "Mozilla/5.0...", "language": "en-US", "cookiesEnabled": true, "onLine": true},
    "console": [],
    "errors": [],
    "pageUrl": "https://example.com/checkout",
    "timestamp": "2023-12-13T19:11:00.000Z",
    "timezone": "America/New_York"
  }' \
  -F 'annotations=[
    {"id": "ann1", "type": "arrow", "x": 100, "y": 200, "color": "red"}
  ]'
```

### Jobs API (AI Agent Execution)

The Jobs API manages AI agent execution for automated bug fixing. These endpoints integrate with the Viberator worker service.

#### Submit Job
```bash
curl -X POST http://localhost:8888/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "https://github.com/example/repo.git",
    "task": "Fix null pointer exception in user service",
    "branch": "main",
    "baseBranch": "main",
    "context": {
      "language": "java",
      "severity": "high"
    },
    "settings": {
      "testingRequired": true
    },
    "tenantId": "optional-tenant-id"
  }'
```

#### Get Job Status
```bash
curl http://localhost:8888/api/jobs/job_1234567890_abc123
```

#### List Jobs
```bash
# List all jobs
curl http://localhost:8888/api/jobs?limit=20

# Filter by status
curl http://localhost:8888/api/jobs?status=completed&limit=10
```

#### Delete Job
```bash
curl -X DELETE http://localhost:8888/api/jobs/job_1234567890_abc123
```

#### Queue Statistics
```bash
curl http://localhost:8888/api/jobs/stats/queue
```

### Webhook Endpoints

Configure webhooks in your PM systems:

- **GitHub**: `POST /api/webhooks/github`
- **Jira**: `POST /api/webhooks/jira`
- **Shortcut**: `POST /api/webhooks/shortcut`
- **Custom**: `POST /api/webhooks/custom/:configId`

### API Documentation

Visit `http://localhost:3000/api/docs` for complete API documentation with examples.

## 🔄 Auto-Fix Flow

1. **Widget captures bug** → POST `/api/bug-reports`
2. **Files uploaded to S3**, metadata stored in PostgreSQL
3. **Webhook creates ticket** in configured PM system
4. **Auto-fix detection** checks for tags/markers:
   - Labels: `auto-fix`, `ai-fix`, `🤖 auto-fix`
   - Title prefixes: `[AUTO-FIX]`, `[AI-FIX]`
   - Description markers: `<!-- AUTO-FIX -->`
5. **Job queued** in Redis for AI agent processing
6. **AI agent processes** (placeholder implementation)
7. **Pull request created** with fix

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Widget    │───▶│  Bug Receiver    │───▶│   PM Systems    │
│                 │    │     (Step 2)     │    │    (Step 3)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Message Queue   │
                       │    (Redis)       │
                       └──────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   AI Agent       │
                       │ (Future Step)    │
                       └──────────────────┘
```

### Components

- **Express.js API** with TypeScript
- **PostgreSQL** for structured data (bug reports, projects, audit logs)
- **AWS S3** for media asset storage
- **Redis + Bull** for message queuing
- **PM Integrations** (GitHub, Jira, Linear)

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific component
npm test -- --testNamePattern="Bug Reports API"

# Run with coverage
npm test -- --coverage
```

## 📊 Monitoring

### Queue Status
```bash
curl http://localhost:3000/api/webhooks/status
```

### Webhook Events
Check the `webhook_events` table for audit logs of all processed webhooks.

### Auto-Fix Queue
Monitor the `auto_fix_queue` table for processing status.

## 🔧 Configuration

### PM System Setup

#### GitHub
1. Create a personal access token with `repo` and `admin:repo_hook` scopes
2. Set `GITHUB_TOKEN` in environment
3. Configure webhook: `POST /api/webhooks/github`
4. Add webhook secret for security

#### Jira
1. Create API token in Jira settings
2. Configure `JIRA_BASE_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`
3. Set up webhook in Jira admin

#### Shortcut
1. Generate API key in Shortcut settings
2. Set `SHORTCUT_API_KEY` environment variable
3. Configure webhook in Shortcut workspace settings

### Auto-Fix Detection

Configure detection strategies per project:

```typescript
{
  labelMatching: ['auto-fix', 'ai-fix', '🤖 auto-fix'],
  titlePrefixes: ['[AUTO-FIX]', '[AI-FIX]'],
  descriptionMarkers: ['<!-- AUTO-FIX -->'],
  projectSettings: {
    enableForAllBugs: false,
    enableForSeverity: ['high', 'critical']
  }
}
```

## 🚀 Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY views ./views
COPY public ./public
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Environment Variables for Production
- Set `NODE_ENV=production`
- Configure proper database connection pooling
- Set up Redis cluster for high availability
- Configure AWS IAM roles for S3 access
- Set webhook secrets for security

## 🔒 Security Considerations

- **Webhook Signature Verification** (GitHub HMAC-SHA256)
- **Input Validation** with Joi schemas
- **File Type Validation** for uploads
- **Rate Limiting** ready for implementation
- **SQL Injection Prevention** via parameterized queries
- **XSS Protection** via input sanitization

## 📝 Development Notes

This is an MVP implementation focusing on steps 2 and 3 of the bug fixing widget solution:

- **Step 2**: Bug Capture Service ✅
- **Step 3**: PM System Integration Layer ✅
- **Step 1**: Web Widget (separate project)
- **Step 4**: AI Agent Processing (future enhancement)

### Future Enhancements
- Real AI agent integration for auto-fix processing
- Additional PM system integrations (GitLab, Azure DevOps, etc.)
- Advanced webhook retry mechanisms
- Real-time notifications via WebSockets
- Dashboard UI for monitoring and management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Note**: This implementation provides a solid foundation for automated bug fixing workflows. The AI agent processing component would be the next major development phase to complete the full vision.
