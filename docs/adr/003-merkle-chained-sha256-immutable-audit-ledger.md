# ADR 003: Merkle-Chained SHA-256 Immutable Audit Ledger

## Status
Accepted

## Context
Compliance regulations in European FinTech and enterprise security (SOC 2, ISO 27001, GDPR) require immutable audit logging of administrative changes, credential issuance, and access violations. Standard database logs are vulnerable to database administrators or attackers executing `UPDATE` or `DELETE` statements to cover their tracks after unauthorized access.

## Decision
1. **Cryptographic Blockchain-Style Hash Chaining**:
   - Each audit log entry is linked to the previous block via `prev_hash`.
   - The block's own SHA-256 `hash` is computed from:
     $$\text{hash} = \text{SHA256}(\text{prev\_hash} \parallel \text{actor\_id} \parallel \text{action} \parallel \text{resource} \parallel \text{status} \parallel \text{created\_at} \parallel \text{details})$$
   - The first entry connects to a known constant genesis hash:
     `0000000000000000000000000000000000000000000000000000000000000000`

2. **Automated Chain Verification (`verifyAuditChain`)**:
   - The engine iterates through the ledger sequence and recalculates the SHA-256 digest of each block, verifying that:
     1. Computed hash matches stored `hash`.
     2. Block's `prev_hash` matches previous block's `hash`.
   - If any record was altered, deleted, or inserted out of order, verification instantly identifies the exact broken block ID.

## Consequences
- **Positive**: Complete tamper evidence; unauthorized database tampering breaks the mathematical hash chain.
- **Positive**: High performance: SHA-256 hash generation on modern CPUs takes $< 2\ \mu\text{s}$ per record.
