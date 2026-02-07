import { Request, Response, NextFunction } from "express";
import logger from "../../config/logger";

// Common paths that bots scan for
const BLOCKED_PATHS = new Set([
  // Environment/config files
  "/.env",
  "/.env.local",
  "/.env.production",
  "/.env.development",
  "/.env.example",
  "/.env.backup",
  "/.env.save",
  "/env",
  "/.config",
  "/config.json",
  "/config.xml",
  "/config.yaml",
  "/.htaccess",
  "/.htpasswd",
  "/web.config",
  "/.dockerenv",
  "/docker-compose.yml",
  "/Dockerfile",
  "/package.json",
  "/package-lock.json",
  "/yarn.lock",
  "/composer.json",

  // Git repositories
  "/.git",
  "/.git/HEAD",
  "/.git/config",
  "/.git/index",
  "/.git/logs/HEAD",

  // Common admin panels
  "/admin",
  "/administrator",
  "/wp-admin",
  "/wp-login.php",
  "/phpmyadmin",
  "/phpMyAdmin",
  "/pma",
  "/mysql",
  "/mysqladmin",

  // API exploration probes
  "/swagger",
  "/swagger-ui",
  "/swagger-ui.html",
  "/api-docs",
  "/graphql",
  "/graphiql",
  "/playground",
  "/openapi.json",
  "/actuator",
  "/actuator/health",
  "/actuator/env",
  "/actuator/configprops",
  "/actuator/metrics",

  // Common vulnerabilities
  "/../",
  "/....//",
  "/%2e%2e/",
  "/.%00/",
  "/.;/",

  // Server files
  "/server-status",
  "/server-info",
  "/status",
  "/info",
  "/version",
  "/version.txt",

  // Backup/temp files
  "/backup",
  "/backups",
  "/backup.zip",
  "/backup.tar.gz",
  "/dump.sql",
  "/database.sql",
  "/old",
  "/temp",
  "/tmp",

  // CMS platforms
  "/wordpress",
  "/wp",
  "/wp-content",
  "/wp-includes",
  "/wp-json",
  "/wp-config.php",
  "/xmlrpc.php",
  "/drupal",
  "/joomla",
  "/administrator",

  // Framework probes
  "/laravel",
  "/artisan",
  "/django",
  "/django-admin",
  "/flask",
  "/rails",
  "/spring-boot",
  "/nestjs",

  // Cloud platforms
  "/aws",
  "/ec2",
  "/s3",
  "/lambda",
  "/azure",
  "/gcp",
  "/firebase",
  "/heroku",

  // Dangerous patterns
  "/cgi-bin",
  "/cgi-bin/printenv",
  "/cgi-bin/test-cgi",
  "/cgi-bin/bash",
  "/shell",
  "/console",
  "/cmd",
  "/command",
  "/exec",
  "/execute",
  "/run",
  "/eval",
  "/debug",
  "/trace",
  "/.DS_Store",
  "/Thumbs.db",
  "/desktop.ini",
  "/.idea",
  "/.vscode",
]);

// Pattern-based blocking (regex)
const BLOCKED_PATTERNS = [
  /^\/(\.+\/)+/,  // Path traversal attempts like /../../etc/passwd
  /^\/\.(env|git|docker|htaccess|htpasswd)/i,  // Hidden files
  /^\/(wp-|wordpress)/i,  // WordPress probes
  /^\/(admin|login|signin|auth)[\/]?$/i,  // Generic admin paths
  /^\/(config|settings|preferences)\.json$/i,  // Config files
  /\.(backup|bak|swp|swx|save|old|orig|dist|~)$/i,  // Backup files
  /\.(sql|sqlite|sqlite3|db|mdb|accdb)$/i,  // Database files
  /\.(log|logs|trace)$/i,  // Log files
  /^\/(upload|uploads|file|files|image|images)\/\.\./i,  // Upload path traversal
];

/**
 * Middleware to block malicious/bot scanning requests
 * Returns 444 (Nginx-style connection close) for blocked requests
 */
export function maliciousRequestBlocker(req: Request, res: Response, next: NextFunction): void {
  const path = req.path.toLowerCase();
  const originalUrl = req.originalUrl.toLowerCase();
  
  // Check exact path matches
  if (BLOCKED_PATHS.has(req.path) || BLOCKED_PATHS.has(path)) {
    logger.warn("Blocked malicious request", {
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get("user-agent"),
      reason: "blocked_path",
    });
    
    // Return 444-like response (drop connection without response body)
    res.status(404).end();
    return;
  }
  
  // Check pattern matches
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(req.path) || pattern.test(originalUrl)) {
      logger.warn("Blocked malicious request", {
        ip: req.ip,
        method: req.method,
        path: req.path,
        originalUrl: req.originalUrl,
        userAgent: req.get("user-agent"),
        reason: "blocked_pattern",
        pattern: pattern.toString(),
      });
      
      res.status(404).end();
      return;
    }
  }
  
  next();
}

/**
 * Rate limiter specifically for suspicious requests
 * Tracks IPs that make blocked requests and applies stricter rate limiting
 */
const suspiciousIps = new Map<string, { count: number; firstSeen: number; blocked: boolean }>();
const SUSPICIOUS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SUSPICIOUS_THRESHOLD = 5; // Block after 5 suspicious requests
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Cleanup every 10 minutes

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of suspiciousIps.entries()) {
    if (now - data.firstSeen > SUSPICIOUS_WINDOW_MS) {
      suspiciousIps.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function suspiciousIpTracker(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || "unknown";
  const path = req.path.toLowerCase();
  
  // Check if this looks like a scanning attempt
  const isSuspicious = 
    BLOCKED_PATHS.has(req.path) ||
    BLOCKED_PATHS.has(path) ||
    BLOCKED_PATTERNS.some(p => p.test(req.path) || p.test(req.originalUrl));
  
  if (isSuspicious) {
    const now = Date.now();
    const existing = suspiciousIps.get(ip);
    
    if (existing) {
      existing.count++;
      
      // Block IP if threshold reached
      if (existing.count >= SUSPICIOUS_THRESHOLD && !existing.blocked) {
        existing.blocked = true;
        logger.error("IP flagged for suspicious activity", {
          ip,
          count: existing.count,
          path: req.path,
        });
      }
    } else {
      suspiciousIps.set(ip, { count: 1, firstSeen: now, blocked: false });
    }
    
    // If IP is blocked, return 403
    const ipData = suspiciousIps.get(ip);
    if (ipData?.blocked) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  
  next();
}

// Export for testing
export { BLOCKED_PATHS, BLOCKED_PATTERNS, suspiciousIps };
