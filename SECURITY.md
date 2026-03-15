# Security Policy

## Supported Versions

We release patches for security vulnerabilities regularly. The following versions are currently supported:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to [security@viberglass.io](mailto:security@viberglass.io) or use the GitHub Security Advisories feature.

### What to Include

Please include the following information in your report:

- **Type of issue** (e.g., SQL injection, XSS, CSRF, authentication bypass)
- **Full paths of source file(s) related to the issue**
- **Location of the affected source code** (tag/branch/commit or direct URL)
- **Step-by-step instructions to reproduce the issue**
- **Proof-of-concept or exploit code (if possible)**
- **Impact of the issue**, including how an attacker might exploit it

### What to Expect

- **Initial Response**: You will receive an acknowledgment within 48 hours
- **Status Update**: We will provide a status update within 5 business days
- **Resolution Timeline**: We aim to resolve critical issues within 30 days

### Process

1. Submit your report to security@viberglass.io
2. Our security team will review and confirm the vulnerability
3. We will develop a fix and test it thoroughly
4. Once resolved, we will publish a security advisory
5. You will be credited in the advisory (unless you prefer to remain anonymous)

## Security Best Practices

### For Users

- Keep your Viberglass installation up to date
- Use strong, unique passwords for all accounts
- Enable two-factor authentication where available
- Regularly rotate API keys and secrets
- Follow the principle of least privilege for access control
- Monitor logs for suspicious activity

### For Contributors

- Never commit secrets, API keys, or credentials to the repository
- Use environment variables for sensitive configuration
- Validate and sanitize all user inputs
- Use parameterized queries to prevent SQL injection
- Implement proper authentication and authorization checks
- Follow secure coding practices

## Known Security Features

- **Encryption at Rest**: Secrets and credentials are encrypted using AES-256
- **Encryption in Transit**: All API communications use HTTPS/TLS
- **Webhook Signature Verification**: HMAC-SHA256 signatures for webhook authenticity
- **Tenant Isolation**: Multi-tenant architecture with data isolation
- **Input Validation**: Comprehensive input validation and sanitization
- **Rate Limiting**: API rate limiting to prevent abuse

## Security Audit Trail

All security-related changes are documented in our release notes and security advisories.

### Recent Security Updates

- **2026-01**: Added webhook signature verification
- **2026-02**: Implemented tenant isolation improvements
- **2026-03**: Enhanced secret encryption with AWS KMS integration

## Contact

For security-related questions or concerns:

- **Email**: security@viberglass.io
- **GitHub Security Advisories**: https://github.com/Ilities/viberglass/security/advisories

## Acknowledgments

We would like to thank the following for their contributions to our security:

- All security researchers who have responsibly disclosed vulnerabilities
- The open-source community for their ongoing security reviews

---

This security policy is subject to change. Please check back regularly for updates.
