# Backend Setup Guide

To run the backend of this application, you need the following services and configurations.

## 🛠 Required Services
*   **PostgreSQL**: For database storage (Default: `5432`)
*   **Redis**: For message queue processing with Bull (Default: `6379`)
*   **AWS S3**: For storing screenshots and recordings.

---

## 🚀 Local Setup

### 1. Database Setup
Create a PostgreSQL database and initialize the schema:
```bash
createdb vibug_receiver
psql -d vibug_receiver -f backend/src/config/database.sql
```


### 2. Environment Configuration
Create a `.env` file in the `backend` directory:
```bash
cp backend/.env.example backend/.env
```

Update `DB_PASSWORD`, `REDIS_HOST`, and `AWS` credentials.

### 3. Install & Run
From the project root:
```bash
npm install
npm run backend:dev
```


---

## 🐳 Docker Setup

The easiest way to run the backend with its dependencies (Postgres & Redis) is using Docker Compose.

### 1. Create a `docker-compose.yml`
In the project root, create a `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: vibug_receiver
      POSTGRES_PASSWORD: your_password
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - DB_HOST=postgres
      - REDIS_HOST=redis
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
```


### 2. Run with Compose
```bash
docker-compose up --build
```


---

## 📡 Verification
*   **Health Check**: `GET http://localhost:3000/health`
*   **API Docs**: `GET http://localhost:3000/api/docs`
*   **Queue Status**: `GET http://localhost:3000/api/webhooks/status`

## 🔧 Integrations (Optional)
To enable ticket synchronization, provide API keys in `.env` for:
*   **GitHub**: `GITHUB_TOKEN`
*   **Jira**: `JIRA_API_TOKEN` & `JIRA_BASE_URL`
*   **Linear**: `LINEAR_API_KEY`