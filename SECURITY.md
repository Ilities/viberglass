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
- **Webhook Signature Verification**: HMAC-SHA256 signatures are required on every
  inbound webhook. A delivery for a configuration with no secret is rejected, not
  accepted unsigned.
- **Agent Credential Boundary**: Spawned agent CLIs receive a deny-by-default
  environment (`sanitizeAgentEnvironment` in `@viberglass/agent-core`). SCM tokens,
  AWS credentials and platform secrets are withheld. Git authenticates per-invocation
  via `GIT_CONFIG_*`.
- **Container Network Isolation**: The Docker strategy defaults to bridge networking.
  Host networking is opt-in per clanker configuration.
- **KMS Scoping**: Worker roles may use the KMS key only via SSM (`kms:ViaService`),
  not as a general decryption mechanism.

## Agent Trust Boundary

Viberglass takes instructions from sources an attacker can influence: ticket bodies,
issue comments, and the target repository's own `AGENTS.md`. The application feeds these to agent
CLIs running with their permission prompts disabled. The threat model therefore treats
**the agent process as untrusted**, and the controls above are about what the agent
process can reach, not about stopping it from being talked into things.

### Currently enforced

| Boundary | Control |
|---|---|
| Inbound webhook authenticity | Mandatory HMAC signature; no unsigned fallback |
| Agent → credentials | Allowlisted spawn environment; git auth out-of-band |
| Agent → host network | Bridge networking by default under Docker |
| Worker → KMS | `kms:ViaService` restricted to SSM |
| Worker → other tenants' SSM | Per-tenant ARNs when `tenantIds` is configured |

### Known gaps

These are documented rather than fixed, and are tracked for the containment work:

- **Prompt injection.** Ticket content is interpolated into prompt templates by raw
  string substitution. The XML delimiters around it are cosmetic and can be escaped by
  a body containing the closing tag. There is no trust labeling of untrusted content,
  and templates instruct the agent to follow the target repo's `AGENTS.md`.
- **Egress.** Worker security groups allow all outbound traffic. There are no VPC
  endpoints, no proxy and no destination allowlist. Bridge networking constrains the
  agent's access to the *host*, not to the internet.
- **Credential lifetime and scope.** SCM access uses long-lived per-tenant PATs with no
  expiry or rotation. 
- **Credential reachability.** Secrets are resolved into the worker's own
  `process.env`. The agent doesn't inherit them, but a vault-and-proxy design that
  keeps tokens out of the worker process entirely has not been built.
- **MCP authorization.** `/api/mcp` authenticates the caller but never threads
  `authContext` into the tool services, so any valid API token can list every project
  and trigger phase runs. With auth disabled the route mounts a mock admin.
- **Rate limiting.** Not implemented. `helmet` is applied; no request throttling is.
- **Sandboxing.** Isolation is the container boundary only — no gVisor, bubblewrap or
  microVM layer, and no tamper-resistant audit log the agent cannot alter.

### Deployment guidance

- Set `viberglass-workers:tenantIds` on any stack serving more than one tenant.
- Configure a webhook secret for every provider configuration; unsigned deliveries are
  rejected, so an unset secret disables the endpoint rather than opening it.
- Do not set `networkMode: host` in clanker configuration for workloads processing
  externally-submitted tickets.
- Treat every repository an agent is pointed at as capable of instructing it.

## Security Audit Trail

All security-related changes are documented in our release notes and security advisories.

### Recent Security Updates

- **2026-01**: Added webhook signature verification
- **2026-02**: Implemented tenant isolation improvements
- **2026-03**: Enhanced secret encryption with AWS KMS integration
- **2026-09**: Closed the webhook signature fail-open; introduced the agent credential
  boundary; moved git authentication out of the remote URL; defaulted Docker workers to
  bridge networking; scoped worker KMS use to SSM and made worker SSM grants
  tenant-scopable

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
