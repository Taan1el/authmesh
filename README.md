# AuthMesh 🛡️🔑
> **Multi-Tenant RBAC Security Gateway, Scoped API Key Engine & Cryptographically Verified Audit Ledger**  
> *Engineered for Zero-Trust Access Control & High-Compliance FinTech Environments*

[![CI Pipeline](https://img.shields.io/badge/CI-Passing-10b981.svg?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?style=flat-square)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933.svg?style=flat-square)](#)
[![Database](https://img.shields.io/badge/Database-SQLite%20WAL%20(Native)-003B57.svg?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square)](#)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg?style=flat-square)](#)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ed.svg?style=flat-square)](#)

---

## ⚡ 2-Minute Overview
**AuthMesh** is an enterprise-grade multi-tenant authorization gateway and credential governance platform. Built with zero-trust architectural principles, it provides fine-grained Role-Based Access Control (RBAC), cryptographically hashed API keys, sliding-window rate limiting, and an immutable, SHA-256 blockchain-style audit ledger for Nordic FinTech organizations.

### Core Capabilities
1. **Hierarchical RBAC & Wildcard Policy Engine**: Evaluates fine-grained permissions (`users:read`, `billing:write`, `deploy:execute`) and namespace wildcards (`billing:*`, `*`) in microseconds.
2. **Zero-Leak API Key Vault**: High-entropy keys (`am_live_<token>`) displayed once upon generation and persisted exclusively as SHA-256 one-way hashes. Even complete database leaks expose zero usable secrets.
3. **Sliding-Window Rate Limiter**: Enforces per-key quota policies (e.g. 60 req/min) returning standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers with instant HTTP 429 cutoffs.
4. **Merkle-Chained Cryptographic Audit Ledger**: Every access grant, denial, and administrative mutation is chained to previous records via SHA-256 hashes ($H_n = \text{SHA256}(H_{n-1} \parallel \dots)$). Mathematical tampering detection verifies ledger integrity in real time.
5. **Interactive Security Sandbox**: Allows engineers to test live authorization scenarios against protected endpoints, view instant HTTP 200 vs 403 vs 429 responses, test rate-limit bursts, and inspect the reactive audit log.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client ["Frontend (React 19 + TypeScript + Vite)"]
        UI[AuthMesh Operations Console]
        Matrix[RBAC Policy Matrix]
        Vault[API Key Vault]
        Ledger[Chained Audit Explorer]
        Sandbox[Interactive Security Sandbox]
        UI --> Matrix
        UI --> Vault
        UI --> Ledger
        UI --> Sandbox
    end

    subgraph Server ["Backend (Node.js 24 + Express + Native SQLite WAL)"]
        API[Express Gateway /api]
        AuthService[Auth & Evaluation Service]
        PolicyService[Wildcard Policy Engine]
        RateLimiter[Sliding Window Limiter]
        TenantService[Identity & Credentials Service]
        
        API --> AuthService
        API --> TenantService
        AuthService --> PolicyService
        AuthService --> RateLimiter
    end

    subgraph Storage ["Relational Storage"]
        DB[(SQLite WAL Database)]
        R[roles]
        U[users]
        K[api_keys]
        A[audit_ledger (Chained Blocks)]

        TenantService --> U
        TenantService --> R
        TenantService --> K
        AuthService --> A
    end

    Sandbox -->|Bearer Token / x-user-id| API
```

---

## 🚀 Quick Start (Zero-Config)

### Prerequisites
- Node.js 24+ (uses native `node:sqlite`)
- npm 10+

### Local Development
```bash
# 1. Clone repository
git clone https://github.com/Taan1el/authmesh.git
cd authmesh

# 2. Install workspace dependencies
npm install

# 3. Start backend API and frontend Vite dev server concurrently
npm run dev

# Backend runs at:  http://localhost:4000
# Frontend runs at: http://localhost:5173
```

### Running Automated Tests
```bash
# Run all unit and integration tests (27 passing)
npm test

# Run type checks and linting
npm run lint

# Build production bundles
npm run build
```

### Docker Deployment
```bash
# Spin up production container with persistent SQLite volume
docker compose up --build
# Open http://localhost:4000 in your browser
```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Healthcheck and timestamp |
| `POST` | `/api/auth/evaluate` | Evaluate raw token or user identity against requested permission |
| `GET` | `/api/auth/verify-chain` | Verify SHA-256 cryptographic continuity across all audit blocks |
| `GET` | `/api/users` | List tenant member identities |
| `POST` | `/api/users` | Invite new member with designated RBAC role |
| `PATCH` | `/api/users/:id/role` | Update user role assignment |
| `PATCH` | `/api/users/:id/status`| Suspend or reactivate user account |
| `GET` | `/api/roles` | List system roles and permission sets |
| `PUT` | `/api/roles/:name/permissions` | Update permission scopes for a role |
| `GET` | `/api/keys` | List active API keys (masked prefixes) |
| `POST` | `/api/keys` | Generate new scoped API key (reveals plaintext token once) |
| `DELETE` | `/api/keys/:id` | Immediately revoke API key across all gateway nodes |
| `GET` | `/api/audit` | Paginated immutable audit ledger entries |
| `GET` | `/api/metrics` | Tenant security score, MFA adoption, and violation counts |
| `GET` | `/api/protected/billing` | Guarded route (Requires `billing:read`) |
| `POST` | `/api/protected/deploy` | Guarded route (Requires `deploy:execute`) |

---

## 📐 Architecture Decision Records (ADRs)

Detailed architectural rationale:
- [ADR 001: Native SQLite WAL and Multi-Tenant Relational RBAC Architecture](docs/adr/001-native-sqlite-wal-and-multi-tenant-relational-rbac.md)
- [ADR 002: Cryptographic API Key Hashing and Token-Bucket Rate Limiting](docs/adr/002-cryptographic-api-key-hashing-and-token-bucket-rate-limiting.md)
- [ADR 003: Merkle-Chained SHA-256 Immutable Audit Ledger](docs/adr/003-merkle-chained-sha256-immutable-audit-ledger.md)

---

## 🧪 Verification & Quality Checklist

- [x] **27 Automated Tests Passing** (20 backend integration + 7 frontend component tests).
- [x] **TypeScript Strict Mode** with zero `any` leaks in domain models.
- [x] **Zero-Leak Security**: API keys stored strictly as SHA-256 hashes; secrets never exposed after generation.
- [x] **Relational Schema**: Native SQLite with WAL mode, foreign keys, and indexes.
- [x] **Multi-stage Dockerfile & Compose**: Production container with health checks and persistent data volume.
