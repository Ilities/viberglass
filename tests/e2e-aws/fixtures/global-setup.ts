import { checkAPIHealth } from './aws-setup';

/**
 * Global setup for AWS E2E tests
 * Runs once before all tests
 */
export default async function globalSetup() {
  console.log('🚀 Global Setup: AWS E2E Tests\n');

  const apiUrl = process.env.AWS_API_URL;

  if (!apiUrl) {
    throw new Error('AWS_API_URL environment variable is required');
  }

  // Check API health before running tests
  console.log(`Checking API health: ${apiUrl}/health`);
  const isHealthy = await checkAPIHealth(apiUrl);

  if (!isHealthy) {
    throw new Error(`API is not healthy at ${apiUrl}. Please check deployment.`);
  }

  console.log('✅ API is healthy\n');

  // Additional pre-flight checks could go here:
  // - Verify AWS credentials are configured
  // - Check required environment variables
  // - Validate test tenant exists

  console.log('✅ Global setup complete\n');
}
