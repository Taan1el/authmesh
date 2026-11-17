# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-11-17

### Added
- An access policy designer on the Pages build. Switch Data source to "Your workspace" and import a `policy.json` file, start from the sample policy or start empty. The workspace is saved in this browser only, with a revision number, and a change made in another tab is picked up instead of overwritten.
- A versioned policy file with roles, permissions and members. Every problem found on import is reported with its path and what was expected, and nothing is saved until the whole file is valid. Import says how many roles and members it will replace before it replaces them, and Export writes the file back out.
- Add, edit and delete roles, and add, move, suspend and remove members, in your workspace. Editing a role shows which scopes are added or removed and which members gain or lose which permission before you save.
- An Access test view. Pick or type a member or a role and a permission or a request such as `GET /api/protected/billing`, and see Allowed or Denied with the exact reason, the scope that matched and every role that grants it.
- A Changes view that compares the current policy, the baseline or a policy file with another version: scopes added and removed per role, members added, removed, moved or suspended, and the permissions each member gains or loses. It exports a Markdown change review.
- An audit log verifier under Audit log. Paste or open an exported log and see whether the hash chain is intact or where it first breaks (a changed, removed, moved or missing entry). Imported logs are shown 25 entries to a page instead of stopping at 100. In the demo, Export current log writes the demo's own log in the same format.
- Offline use. After one visit the Pages build loads without a network. When a new version is published the page shows "A new version is ready." with a Reload button and never reloads by itself.
- A Content-Security-Policy for the Pages build that allows no other hosts, and a line on the page saying data stays in this browser and that the tool designs and tests a policy but does not protect a live API.
- A quiet reminder to export a backup after you change your workspace.
- Tests for the policy file parser, the access test against the server's own decision code, the route table, the policy diff, the audit chain verifier (changed, rehashed, moved, removed and truncated entries), the browser workspace store, the import confirmation, and accessibility checks for each new screen.

### Changed
- The server and the browser now share one decision function (`shared/access-decision.ts`) and one table of guarded routes and their permissions (`shared/routes.ts`), so the Access test and the gateway cannot disagree.
- The sidebar lists Access test and Changes after Audit log. In your workspace it hides Sandbox and API keys, which belong to the sample organization.
- Downloaded files keep their temporary link for ten seconds before it is revoked.

## [Unreleased]

### Added
- Automated accessibility checks (axe) for every sidebar view and both dialogs, plus keyboard tests for the sidebar tabs and the dialog focus trap.
- A test that checks every sideways-scrolling table and code block has a keyboard focus stop, a region role and a name.

### Fixed
- The sidebar tabs now follow the standard keyboard pattern: only the current tab is in the Tab order, Arrow Up and Arrow Down move between views with wrap-around, and Home and End jump to the first and last view.
- The API key and invite dialogs now keep Tab and Shift+Tab inside the dialog, and focus returns to the button that opened the dialog when it closes.
- Tables and code blocks that scroll sideways on narrow screens can now be reached and scrolled with the keyboard, and show a focus outline in the accent color.

### Changed
- New visual identity: a dark petrol sidebar lists Sandbox, Permissions, API keys, Members and Audit log with counts, and the security score sits on one line at the bottom of it. The main column shows one panel at a time on a pale slate background, with compact tables, dot-and-text status labels and a flat meter for MFA adoption.
- Typography is now IBM Plex Sans with IBM Plex Mono for keys, paths and hashes. The stats strip and top header are gone; the sidebar replaces them. Behavior, features and API calls are unchanged.

## [1.0.0] - 2026-10-02

### Added
- Express gateway with hierarchical RBAC: exact-permission, namespace-wildcard (`billing:*`), and universal-wildcard (`*`) scopes, evaluated against either a user's role or a bearer API key.
- Scoped API key vault: keys are generated once (`am_live_<64-char hex>`), shown in full exactly once, and stored only as a SHA-256 hash; revocation and expiry are enforced on every evaluation.
- Sliding-window rate limiting per API key, with `X-RateLimit-*` response headers and 429 responses when a key's quota is exceeded.
- A SHA-256 hash-chained audit ledger recording every access grant, denial, and administrative change, plus an endpoint that walks the chain and reports whether it is still intact.
- Native SQLite (`node:sqlite`, WAL mode) relational storage for users, roles, API keys, and the audit ledger, seeded with a sample organization.
- React 19 operations console: a single stats strip, an RBAC policy matrix, an API key vault, a tenant identity directory, a chained audit trail explorer, and an interactive sandbox for dispatching requests at protected endpoints as different users or keys.
- In-browser demo mode for the GitHub Pages build: the exact same RBAC engine, rate limiter, and audit-chain code run against an in-memory, localStorage-backed store instead of the API, seeded with the same organization as the local server, with a banner explaining the demo and a "Reset sample data" control.
- Self-hosted Sora, Geist and Geist Mono fonts, one design-token stylesheet, a shared page container, a shared pluralize helper and 44px controls and checkboxes across the console, with a flat layout: tables for keys, roles and members, a narrow form column beside the sandbox result, and a dense audit list with hashes in mono.
- Docker image (multi-stage build, runs as a non-root user) and a Compose file for local use.
- CI workflow (lint, type-check, test, build, and a Docker build, across Node 22 and 24) and a GitHub Pages deployment workflow.

### Fixed
- The server hashes API keys and audit entries with `node:crypto`; the hand-written SHA-256 is now used only by the browser demo, and a parity test keeps both producing identical hashes.
- API error responses no longer leak internal error text or stack traces; unexpected errors are logged server-side and returned to the client as a generic message.
- Tenant API input (emails, role names, permission strings, rate limits, expiry, pagination limits) is validated and clamped instead of trusted as-is.
- The production server build wrote its output to the wrong path and referenced shared types incorrectly, and the Docker image ran as root from the wrong working directory; both are fixed, and the compiled layout is now covered by the CI Docker build.
- `npm run dev` only started the Express server, so the Vite client silently never ran despite the README describing both starting together; it now runs both.
- The Security Sandbox's "Simulated User" dropdown could visually show a user selected while the component's own state was still empty (state initialized before the user list loaded), so the very first "Dispatch Request" click failed with a validation error instead of evaluating access.
- A denied request with an unrecognized bearer token (401) was labeled "FORBIDDEN" in the sandbox output, the same label used for a recognized-but-insufficiently-scoped request (403).
- Form fields in the API key and invite-member modals had visible labels not associated with their inputs, the protected-endpoint picker was a `div` unreachable by keyboard, and several controls lost their focus ring with no visible replacement.
