# ATOMS Firestore Security Specification (Phase 0 — Payload-First TDD)

## 1. Data Invariants
1. **Default Deny**: No document outside `/users/{userId}`, `/users/{userId}/private/info`, `/users/{userId}/experiments/{experimentId}`, and `/users/{userId}/bookmarks/{bookmarkId}` is ever readable or writable.
2. **Verified Identity**: Every authenticated read/write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Owner Isolation & No Privilege Escalation**: `uid` / `ownerUid` must strictly equal `request.auth.uid`; `role` on `UserAccount` must equal `'researcher'` and cannot be changed to `'admin'`; no cross-user `get` or `list` is allowed.
4. **PII Isolation**: Email lives strictly in `/users/{userId}/private/info` (`allow list: if false; allow get: if isOwner(userId) && privateDocId == 'info';`).
5. **Master Gate**: Subcollection writes and document reads (`/users/{userId}/experiments/*`, `/users/{userId}/bookmarks/*`, `/users/{userId}/private/*`) verify `exists(/databases/$(database)/documents/users/$(userId))`.
6. **Immutability & Server Timestamps**: `uid`, `ownerUid`, `experimentId`, `bookmarkId`, `role`, and `createdAt` are immutable once created. `createdAt == request.time` on create; `updatedAt == request.time` on create/update.
7. **Strict Schema & Bounds**: Exact key sets via `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` action branches on update, regex `^[a-zA-Z0-9_\-]+$` + `.size() <= 128` on all IDs, numeric bounds on `Z` (`1..118`) and `N` (`0..120`), and bounded lists (`executions.size() <= 10`).

---

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: `PERMISSION_DENIED`)

1. **Unauthenticated Write**: Create `/users/alice` with `request.auth == null`.
2. **Unverified Email Spoof**: Create `/users/alice/private/info` with `email_verified == false`.
3. **Cross-User Read/PII Theft**: User `bob` (`uid='bob'`) calls `get` on `/users/alice/private/info` or `/users/alice`.
4. **Blanket User List Scraping**: Any signed-in user calls `list` on `/users` or `/users/alice/private`.
5. **Identity Spoofing on Create**: User `bob` creates `/users/bob/experiments/exp1` with `ownerUid: 'alice'`.
6. **Privilege Escalation (Ghost/Role Tampering)**: User `alice` creates or updates `/users/alice` with `role: 'admin'`.
7. **Shadow Field Injection ("Ghost Field")**: User `alice` creates `/users/alice/bookmarks/b1` adding extra key `isVerified: true`.
8. **ID Poisoning / Resource Exhaustion**: User `alice` attempts create with `experimentId` length `1500` or invalid chars `../hack`.
9. **Orphaned Subcollection Write (Master Gate Bypass)**: User `alice` writes `/users/alice/experiments/exp1` before `/users/alice` parent document exists.
10. **Temporal Forgery**: User `alice` submits `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
11. **Immortality Violation on Update**: User `alice` updates `/users/alice/experiments/exp1` changing `createdAt` or `experimentId`.
12. **Out-of-Range Physics / Unbounded Array Poisoning**: User `alice` writes `AtomicBookmark` with `Z: 999` or `CloudExperimentRecord` with `executions` array of 15 entries (`> 10`).
