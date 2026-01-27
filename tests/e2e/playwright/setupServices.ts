import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { LocalstackContainer } from "@testcontainers/localstack";
import { writeFileSync } from "fs";
import { join } from "path";

const ENV_FILE = join(process.cwd(), ".env.e2e");

export async function setupServices() {
  console.log("Starting E2E test services...");

  // Start PostgreSQL container
  const postgres = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("viberglass")
    .withUsername("viberglass")
    .withPassword("viberglass")
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

  // Write .env.e2e file
  const envContent = `
# E2E Test Environment
DATABASE_URL=${postgres.getConnectionUri()}
AWS_ENDPOINT_URL=http://localhost:${localstack.getMappedPort(4566)}
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
S3_BUCKET=test-bucket
SQS_QUEUE_URL=http://localhost:${localstack.getMappedPort(4566)}/000000000000/test-queue
NODE_ENV=test
BACKEND_PORT=3001
`;

  writeFileSync(ENV_FILE, envContent.trim());
  console.log(`Environment file written to ${ENV_FILE}`);

  // Store container IDs for cleanup
  const stateFile = join(process.cwd(), ".e2e-state.json");
  const state = {
    postgresId: postgres.getId(),
    localstackId: localstack.getId(),
    postgresPort: postgres.getMappedPort(5432),
    localstackPort: localstack.getMappedPort(4566),
  };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));

  console.log("E2E test services ready!");
  console.log(`Run tests with: npm test`);
}

setupServices().catch(console.error);
