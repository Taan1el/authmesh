# ADR 001: Native SQLite WAL and Multi-Tenant Relational RBAC Architecture

## Status
Accepted

## Context
Enterprise security platforms require reliable multi-tenant relational identity storage, role-to-permission mappings, and atomic transaction guarantees for user onboarding, status toggling, and role changes. Standard database setups frequently require running external PostgreSQL or MySQL daemons, complicating local development and evaluation.

For AuthMesh, we required:
1. Zero-dependency local developer execution (`npm run dev` working instantly without Docker or database setup).
2. Strict relational integrity, foreign keys with cascading updates, and indexed email/role lookups.
3. Sub-millisecond policy retrieval and identity authorization evaluation.

## Decision
1. **Node.js 24 Native `node:sqlite` (`DatabaseSync`)**:
   - Utilize Node.js's built-in SQLite driver in WAL (Write-Ahead Logging) mode.
   - Enforce foreign keys via `PRAGMA foreign_keys = ON;`.
   - Store relational user accounts, role definitions, and API credentials with indexed constraints.

2. **Declarative Hierarchical RBAC Policy Model**:
   - Roles map to permission arrays containing discrete actions (`users:read`, `deploy:execute`) or namespace wildcards (`users:*`, `*`).
   - The authorization engine (`PolicyService`) evaluates incoming actor scopes against protected route requirements in microsecond in-memory operations.

## Consequences
- **Positive**: Blazing fast sub-millisecond RBAC evaluation, zero external database setup friction, full ACID transaction isolation.
- **Positive**: Test suite can instantiate isolated `:memory:` databases in parallel with zero pollution.
- **Trade-off**: Advanced cross-region multi-primary clustering would require distributed SQLite (e.g. LiteFS) or migration to PostgreSQL in hyperscale deployments.
