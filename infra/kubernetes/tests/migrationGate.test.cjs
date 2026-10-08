const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const manifest = execFileSync('helm', ['template', 'gate-test', 'infra/kubernetes/chart',
  '--namespace', 'apps', '-f', 'infra/kubernetes/chart/values-local.yaml'], { cwd: root, encoding: 'utf8' });
const script = manifest.split('  wait.cjs: |\n')[1].split('  bucket.cjs: |')[0]
  .split('\n').map(line => line.replace(/^    /, '')).join('\n')
  .split('wait().catch')[0];

async function runGate(mode, responses, files = ['101_strategy.js', '113_tracker_links.js', 'migrator.js', '113_tracker_links.js.map']) {
  let connections = 0;
  let closed = 0;
  const queries = [];
  class Client {
    async connect() { connections++; }
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      const response = responses[Math.min(connections - 1, responses.length - 1)];
      if (response instanceof Error) throw response;
      return { rows: response.map(name => ({ name })) };
    }
    async end() { closed++; }
  }
  const context = vm.createContext({
    require(name) {
      if (name === 'pg') return { Client };
      if (name === 'node:fs') return { readdirSync: () => files };
      throw new Error('Unexpected module: ' + name);
    },
    process: { argv: ['node', 'wait.cjs', mode], env: {} },
    console: { log() {} },
    setTimeout(callback) { queueMicrotask(callback); },
  });
  vm.runInContext(script, context);
  await context.wait();
  assert.equal(closed, connections);
  return { connections, queries };
}

test('an existing Kubernetes migration does not release a backend with pending migrations', async () => {
  const result = await runGate('migrations', [['101_strategy'], ['101_strategy', '113_tracker_links']]);
  assert.equal(result.connections, 2);
});

test('all image migrations must be present, including gaps before the latest migration', async () => {
  const result = await runGate('migrations', [['113_tracker_links'], ['101_strategy', '113_tracker_links']]);
  assert.equal(result.connections, 2);
});

test('database readiness does not depend on a migration table', async () => {
  const result = await runGate('database', [new Error('database starting'), ['ready']], []);
  assert.equal(result.connections, 2);
  assert.equal(result.queries[1].sql, 'SELECT 1');
});

test('fresh installs retry until the migration table exists and is complete', async () => {
  const result = await runGate('migrations', [new Error('table missing'), [], ['101_strategy', '113_tracker_links']]);
  assert.equal(result.connections, 3);
});

test('a failed migration times out instead of starting the backend', async () => {
  await assert.rejects(runGate('migrations', [['101_strategy']]), /Timed out waiting for migrations/);
});

test('an image without migration files fails instead of passing an empty check', async () => {
  await assert.rejects(runGate('migrations', [[]], ['migrator.js']), /No migrations found/);
});
