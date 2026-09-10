# ADR 002: Cryptographic API Key Hashing and Token-Bucket Rate Limiting

## Status
Accepted

## Context
Service-to-service communication requires programmatic API keys with bounded permission scopes. In traditional insecure implementations, API keys are stored in plaintext in the database, meaning any database snapshot leak compromises all keys. Furthermore, unmetered API keys expose services to denial-of-service or credential scraping attacks.

## Decision
1. **One-Way Cryptographic Token Hashing (`hashApiKey`)**:
   - Keys are generated with a high-entropy format: `am_live_<48 hex chars>`.
   - The plaintext token is returned to the user **strictly once** at creation time.
   - The database only stores:
     - `key_hash`: Cryptographic SHA-256 digest of the token.
     - `key_prefix`: Masked identifier for UI reference (e.g., `am_live_8f3d...1b4a`).
   - Incoming request tokens are hashed and matched via index against `key_hash`.

2. **Sliding-Window Rate Limiting Engine (`RateLimiterService`)**:
   - Tracks request timestamps per active key ID over a 60-second sliding window.
   - When quota is exceeded, requests are immediately rejected with HTTP `429 Too Many Requests`.
   - Populates standard rate-limiting headers:
     - `X-RateLimit-Limit`: Maximum requests allowed per minute.
     - `X-RateLimit-Remaining`: Remaining allowance in active window.
     - `X-RateLimit-Reset`: Seconds until window resets.

## Consequences
- **Positive**: Zero-leak token security: even a full database dump yields zero usable plaintext API keys.
- **Positive**: Proactive defense against DDoS and noisy neighbor workloads.
