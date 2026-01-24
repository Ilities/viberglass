import { test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface E2EFixtures {
  baseURL: string;
  backendURL: string;
}

const stateFile = join(process.cwd(), '.e2e-state.json');
let envVars: Record<string, string> = {};

try {
  const envFile = join(process.cwd(), '.env.e2e');
  const envContent = readFileSync(envFile, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      envVars[key] = values.join('=');
    }
  });
} catch (err) {
  console.warn('No .env.e2e file found, using defaults');
}

export const test = base.extend<E2EFixtures>({
  baseURL: async ({}, use) => {
    await use(process.env.BASE_URL || 'http://localhost:3000');
  },
  backendURL: async ({}, use) => {
    await use(process.env.BACKEND_URL || 'http://localhost:3001');
  },
});

export { expect } from '@playwright/test';
