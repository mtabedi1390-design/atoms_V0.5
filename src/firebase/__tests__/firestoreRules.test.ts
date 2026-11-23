import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import blueprint from "../../../firebase-blueprint.json";
import {
  BLUEPRINT_ID_PATTERN,
  BLUEPRINT_LIMITS,
  sanitizeAtomicBookmarkFields,
  sanitizeCloudExperimentFields,
  sanitizeUserAccountFields,
  toFirestorePlainValue,
} from "../validation";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createNonRelativisticState } from "@/domain/quantum";
import { createExperimentDefinition } from "@/experiments/schema";

describe("Firebase Blueprint, Security Rules & Payload Sanitization", () => {
  const rulesText = existsSync(path.resolve(process.cwd(), "firestore.rules"))
    ? readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8")
    : "";

  it("enforces default-deny catch-all, email_verified, and verbatim blueprint limits in firestore.rules", () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toContain("match /{document=**}");
    expect(rulesText).toContain("allow read, write: if false;");
    expect(rulesText).toContain("request.auth.token.email_verified == true");
    expect(rulesText).toContain(`<= ${BLUEPRINT_LIMITS.displayNameMaxLength}`);
    expect(rulesText).toContain(`<= ${BLUEPRINT_LIMITS.emailMaxLength}`);
    expect(rulesText).toContain(`<= ${BLUEPRINT_LIMITS.experimentTitleMaxLength}`);
    expect(rulesText).toContain(`<= ${BLUEPRINT_LIMITS.bookmarkLabelMaxLength}`);
    expect(rulesText).toContain(`<= ${BLUEPRINT_LIMITS.bookmarkNotesMaxLength}`);
    expect(rulesText).toContain("userExists(userId)");
    expect(Object.keys(blueprint.firestore)).toHaveLength(4);
    for (const kind of [
      "total-density",
      "single-state",
      "energy-spectrum",
      "e1-transition",
      "spectroscopy-series",
      "multi-electron-hf",
      "ls-term-ci",
    ]) {
      expect(blueprint.entities.CloudExperimentRecord.properties.kind.enum).toContain(kind);
      expect(rulesText).toContain(`'${kind}'`);
    }
  });

  it("sanitizes UserAccount and AtomicBookmark fields to adhere strictly to blueprint bounds", () => {
    const acc = sanitizeUserAccountFields({
      uid: "user/with invalid!chars",
      displayName: "x".repeat(200),
      preferredZ: 999,
      preferredTheoryMode: "invalid-mode",
      preferredBasis: "nonexistent-basis",
    });
    expect(BLUEPRINT_ID_PATTERN.test(acc.uid)).toBe(true);
    expect(acc.displayName.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.displayNameMaxLength);
    expect(acc.role).toBe("researcher");
    expect(acc.preferredZ).toBe(118);
    expect(acc.preferredTheoryMode).toBe("schrodinger");
    expect(acc.preferredBasis).toBe("cc-pvdz");

    const bm = sanitizeAtomicBookmarkFields({
      bookmarkId: "../bad-id",
      ownerUid: "uid_123",
      label: "B".repeat(250),
      Z: 0,
      N: -5,
      workspace: "not-a-workspace",
      theoryMode: "dirac",
      notes: "N".repeat(1200),
    });
    expect(BLUEPRINT_ID_PATTERN.test(bm.bookmarkId)).toBe(true);
    expect(bm.label.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.bookmarkLabelMaxLength);
    expect(bm.Z).toBe(1);
    expect(bm.N).toBe(0);
    expect(bm.workspace).toBe("workbench");
    expect(bm.notes.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.bookmarkNotesMaxLength);
  });

  it("strips volumetric arrays and non-finite/undefined values into native Firestore Maps/Lists", () => {
    const iso = defaultIsotopeForZ(6);
    const system = createAtomicSystem({
      Z: 6,
      N: 6,
      massNumber: iso.massNumber,
      nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
    });
    const def = createExperimentDefinition({
      kind: "single-state",
      title: "T".repeat(300),
      system,
      quantumStates: [createNonRelativisticState({ n: 2, l: 1, m_l: 0, m_s: 0.5, basis: "real" })],
      providerId: "schrodinger-coulomb",
      providerVersion: "0.6.0",
      observables: ["total-energy"],
    });

    const sanitized = sanitizeCloudExperimentFields({
      ownerUid: "researcher_01",
      definition: def,
      executions: [],
      latestResult: undefined,
    });

    expect(sanitized.title.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.experimentTitleMaxLength);
    expect(sanitized.Z).toBe(6);
    expect(sanitized.N).toBe(6);
    expect(sanitized.executions).toEqual([]);

    const stripped = toFirestorePlainValue({
      energy: -37.5,
      badNum: Number.NaN,
      undef: undefined,
      volumeGrid: { quantity: "density", gridN: 32, values: new Float32Array(32768) },
    }) as Record<string, unknown>;
    expect(stripped.badNum).toBeNull();
    expect("undef" in stripped).toBe(false);
    expect((stripped.volumeGrid as Record<string, unknown>).omittedFromCloudSync).toBe(true);
  });
});
