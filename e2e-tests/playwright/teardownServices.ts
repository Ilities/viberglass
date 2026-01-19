import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import Docker from 'dockerode';

const STATE_FILE = join(process.cwd(), '.e2e-state.json');
const ENV_FILE = join(process.cwd(), '.env.e2e');

export async function teardownServices() {
  console.log('Stopping E2E test services...');

  try {
    const stateContent = readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(stateContent);

    const docker = new Docker();

    // Stop and remove PostgreSQL container
    try {
      const postgresContainer = docker.getContainer(state.postgresId);
      await postgresContainer.stop();
      await postgresContainer.remove();
      console.log('PostgreSQL container stopped and removed');
    } catch (err) {
      console.error('Error stopping PostgreSQL container:', err);
    }

    // Stop and remove LocalStack container
    try {
      const localstackContainer = docker.getContainer(state.localstackId);
      await localstackContainer.stop();
      await localstackContainer.remove();
      console.log('LocalStack container stopped and removed');
    } catch (err) {
      console.error('Error stopping LocalStack container:', err);
    }

    // Clean up state files
    unlinkSync(STATE_FILE);
    console.log('State file removed');

    try {
      unlinkSync(ENV_FILE);
      console.log('Environment file removed');
    } catch (err) {
      // File might not exist
    }

    console.log('E2E test services stopped!');
  } catch (err) {
    console.error('Error reading state file:', err);
    console.log('Make sure to run setup first');
  }
}

teardownServices().catch(console.error);
