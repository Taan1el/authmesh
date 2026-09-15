# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-09-15

### Added
- Express gateway with hierarchical RBAC: exact-permission, namespace-wildcard (`billing:*`), and universal-wildcard (`*`) scopes, evaluated against either a user's role or a bearer API key.
- Scoped API key vault: keys are generated once (`am_live_<64-char hex>`), shown in full exactly once, and stored only as a SHA-256 hash; revocation and expiry are enforced on every evaluation.
- Sliding-window rate limiting per API key, with `X-RateLimit-*` response headers and 429 responses when a key's quota is exceeded.
- A SHA-256 hash-chained audit ledger recording every access grant, denial, and administrative change, plus an endpoint that walks the chain and reports whether it is still intact.
- Native SQLite (`node:sqlite`, WAL mode) relational storage for users, roles, API keys, and the audit ledger, seeded with a sample organization.
- React 19 operations console: security posture KPIs, an RBAC policy matrix, an API key vault, a tenant identity directory, a chained audit trail explorer, and an interactive sandbox for dispatching requests at protected endpoints as different users or keys.
- In-browser demo mode for the GitHub Pages build: the exact same RBAC engine, rate limiter, and audit-chain code run against an in-memory, localStorage-backed store instead of the API, seeded with the same organization as the local server, with a banner explaining the demo and a "Reset demo data" control.
- Docker image (multi-stage build, runs as a non-root user) and a Compose file for local use.
- CI workflow (lint, type-check, test, build, and a Docker build, across Node 22 and 24) and a GitHub Pages deployment workflow.

### Fixed
- API error responses no longer leak internal error text or stack traces; unexpected errors are logged server-side and returned to the client as a generic message.
- Tenant API input (emails, role names, permission strings, rate limits, expiry, pagination limits) is validated and clamped instead of trusted as-is.
- The production server build wrote its output to the wrong path and referenced shared types incorrectly, and the Docker image ran as root from the wrong working directory; both are fixed, and the compiled layout is now covered by the CI Docker build.
- `npm run dev` only started the Express server, so the Vite client silently never ran despite the README describing both starting together; it now runs both.
- The Security Sandbox's "Simulated User" dropdown could visually show a user selected while the component's own state was still empty (state initialized before the user list loaded), so the very first "Dispatch Request" click failed with a validation error instead of evaluating access.
- A denied request with an unrecognized bearer token (401) was labeled "FORBIDDEN" in the sandbox output, the same label used for a recognized-but-insufficiently-scoped request (403).
- Form fields in the API key and invite-member modals had visible labels not associated with their inputs, the protected-endpoint picker was a `div` unreachable by keyboard, and several controls lost their focus ring with no visible replacement.
