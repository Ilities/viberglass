import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { LocalstackContainer } from "@testcontainers/localstack";
import { writeFileSync } from "fs";
import { join } from "path";

const ENV_FILE = join(process.cwd(), ".env.e2e");

export async function setupServices() {
  console.log("Starting E2E test services...");

  // Start PostgreSQL container
  const postgres = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("viberator")
    .withUsername("viberator")
    .withPassword("viberator")
    .withExposedPorts(5432)
    .start();

  console.log(`PostgreSQL started at ${postgres.getConnectionUri()}`);

  // Start LocalStack container
  const localstack = await new LocalstackContainer(
    "localstack/localstack:latest",
  )
    .withExposedPorts(4566)
    .withEnvironment({
      SERVICES: "s3,sqs,lambda",
      DEBUG: "1",
    })
    .start();

  console.log(`LocalStack started at ${localstack.getConnectionUri()}`);

  // Write .env.e2e file using DB_* vars (backend reads these, not DATABASE_URL)
  const dbPort = postgres.getMappedPort(5432);
  const localstackPort = localstack.getMappedPort(4566);

  const envContent = `
# E2E Test Environment
DB_HOST=localhost
DB_PORT=${dbPort}
DB_NAME=viberator
DB_USER=viberator
DB_PASSWORD=viberator
AWS_ENDPOINT_URL=http://localhost:${localstackPort}
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=eu-west-1
S3_BUCKET=test-bucket
SQS_QUEUE_URL=http://localhost:${localstackPort}/000000000000/test-queue
NODE_ENV=test
AUTH_ENABLED=false
BASE_URL=http://localhost:3000
BACKEND_URL=http://localhost:8888
`.trim();

  writeFileSync(ENV_FILE, envContent);
  console.log(`Environment file written to ${ENV_FILE}`);

  // Store container IDs for cleanup
  const stateFile = join(process.cwd(), ".e2e-state.json");
  const state = {
    postgresId: postgres.getId(),
    localstackId: localstack.getId(),
    postgresPort: dbPort,
    localstackPort,
  };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));

  console.log("E2E test services ready!");
  console.log(`Run tests with: npm test`);
}

setupServices().catch(console.error);
