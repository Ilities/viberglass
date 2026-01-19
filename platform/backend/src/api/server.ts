#!/usr/bin/env node

import app from './app';
import * as http from 'http';
import * as dotenv from 'dotenv';
import { OrphanSweeper } from '../workers/OrphanSweeper';

// Load environment variables
dotenv.config();

// Initialize orphan sweeper for stuck job detection
const orphanSweeper = new OrphanSweeper({
  sweepIntervalMs: parseInt(process.env.ORPHAN_SWEEP_INTERVAL_MS || '60000', 10),
  jobTimeoutMs: parseInt(process.env.ORPHAN_JOB_TIMEOUT_MS || '1800000', 10),
});

// Normalize a port into a number, string, or false
function normalizePort(val: string): number | string | false {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
}

// Event listener for HTTP server "error" event
function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // Handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

// Event listener for HTTP server "listening" event
function onListening(): void {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr?.port;
  
  console.log('[DEBUG_LOG] Server starting up...');
  console.log('[DEBUG_LOG] Environment:', process.env.NODE_ENV || 'development');
  console.log('[DEBUG_LOG] Listening on ' + bind);
  console.log('[DEBUG_LOG] Health check: http://localhost:' + (addr as any)?.port + '/health');
  console.log('[DEBUG_LOG] API docs: http://localhost:' + (addr as any)?.port + '/api/docs');
  
  // Log configuration status
  console.log('[DEBUG_LOG] Configuration status:');
  console.log('[DEBUG_LOG] - Database:', process.env.DB_HOST ? '✓' : '✗ (using defaults)');
  console.log('[DEBUG_LOG] - Redis:', process.env.REDIS_HOST ? '✓' : '✗ (using defaults)');
  console.log('[DEBUG_LOG] - AWS S3:', process.env.AWS_ACCESS_KEY_ID ? '✓' : '✗ (not configured)');
  console.log('[DEBUG_LOG] - GitHub Token:', process.env.GITHUB_TOKEN ? '✓' : '✗ (not configured)');
  
  console.log('[DEBUG_LOG] Server ready to receive bug reports!');
  console.log('[DEBUG_LOG] Starting orphan sweeper for stuck job detection...');

  // Start orphan sweeper after server is listening
  orphanSweeper.start();
}

// Get port from environment and store in Express
const port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

// Create HTTP server
const server = http.createServer(app);

// Listen on provided port, on all network interfaces
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[DEBUG_LOG] SIGTERM received, shutting down gracefully...');
  orphanSweeper.stop();
  server.close(() => {
    console.log('[DEBUG_LOG] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[DEBUG_LOG] SIGINT received, shutting down gracefully...');
  orphanSweeper.stop();
  server.close(() => {
    console.log('[DEBUG_LOG] Server closed');
    process.exit(0);
  });
});

export default server;