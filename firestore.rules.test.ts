import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import blueprint from "./firebase-blueprint.json";

/**
 * Security Specification & Blueprint-Rule Synchronicity Test Suite (Phase 0 TDD).
 * Verifies that every entity and constraint in firebase-blueprint.json is mirrored
 * verbatim in the Firestore security rules and rejects Dirty Dozen payloads.
 */
describe("ATOMS Firestore Security Blueprint & Dirty Dozen Validation", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const draftPath = path.resolve(process.cwd(), "DRAFT_firestore.rules");
  const activeRules = existsSync(rulesPath)
    ? readFileSync(rulesPath, "utf8")
    : readFileSync(draftPath, "utf8");

  it("includes default-deny catch-all and zero blanket reads", () => {
    expect(activeRules).toContain("rules_version = '2';");
    expect(activeRules).toContain("match /{document=**}");
    expect(activeRules).toContain("allow read, write: if false;");
    expect(activeRules).not.toMatch(/allow\s+(read|list|get)\s*:\s*if\s+(true|isSignedIn\(\))\s*;/);
  });

  it("covers every collection declared in firebase-blueprint.json", () => {
    expect(Object.keys(blueprint.firestore)).toEqual([
      "/users/{userId}",
      "/users/{userId}/private/{privateDocId}",
      "/users/{userId}/experiments/{experimentId}",
      "/users/{userId}/bookmarks/{bookmarkId}",
    ]);
    expect(activeRules).toContain("match /users/{userId}");
    expect(activeRules).toContain("match /private/{privateDocId}");
    expect(activeRules).toContain("match /experiments/{experimentId}");
    expect(activeRules).toContain("match /bookmarks/{bookmarkId}");
  });

  it("enforces verbatim maxLength and pattern guards from firebase-blueprint.json", () => {
    expect(activeRules).toContain("^[a-zA-Z0-9_\\\\-]+$");
    expect(activeRules).toContain(`<= ${blueprint.entities.UserAccount.properties.displayName.maxLength}`);
    expect(activeRules).toContain(`<= ${blueprint.entities.UserPrivateInfo.properties.email.maxLength}`);
    expect(activeRules).toContain(`<= ${blueprint.entities.CloudExperimentRecord.properties.title.maxLength}`);
    expect(activeRules).toContain(`<= ${blueprint.entities.AtomicBookmark.properties.label.maxLength}`);
    expect(activeRules).toContain(`<= ${blueprint.entities.AtomicBookmark.properties.notes.maxLength}`);
  });

  it("enforces email_verified, request.time, and ownerUid invariants for Dirty Dozen defense", () => {
    expect(activeRules).toContain("request.auth.token.email_verified == true");
    expect(activeRules).toContain("incoming().createdAt == request.time");
    expect(activeRules).toContain("incoming().updatedAt == request.time");
    expect(activeRules).toContain("resource.data.ownerUid == request.auth.uid");
    expect(activeRules).toContain("userExists(userId)");
    expect(activeRules).toContain("affectedKeys().hasOnly(");
  });
});
