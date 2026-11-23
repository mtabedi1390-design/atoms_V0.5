import blueprint from "../../firebase-blueprint.json";
import type {
  ExperimentDefinition,
  ExperimentExecution,
  ExperimentKind,
  ExperimentResultRecord,
} from "@/experiments/schema";
import type { WorkspaceId } from "@/app/useAtomsLaboratory";

export const BLUEPRINT_ID_PATTERN = new RegExp(
  blueprint.entities.UserAccount.properties.uid.pattern,
);

export const BLUEPRINT_LIMITS = {
  idMaxLength: blueprint.entities.UserAccount.properties.uid.maxLength,
  displayNameMinLength: blueprint.entities.UserAccount.properties.displayName.minLength,
  displayNameMaxLength: blueprint.entities.UserAccount.properties.displayName.maxLength,
  emailMaxLength: blueprint.entities.UserPrivateInfo.properties.email.maxLength,
  experimentTitleMaxLength: blueprint.entities.CloudExperimentRecord.properties.title.maxLength,
  providerIdMaxLength: blueprint.entities.CloudExperimentRecord.properties.providerId.maxLength,
  providerVersionMaxLength: blueprint.entities.CloudExperimentRecord.properties.providerVersion.maxLength,
  constantsVersionMaxLength: blueprint.entities.CloudExperimentRecord.properties.constantsVersion.maxLength,
  maxExecutionsPerExperiment: 10,
  bookmarkLabelMaxLength: blueprint.entities.AtomicBookmark.properties.label.maxLength,
  bookmarkNotesMaxLength: blueprint.entities.AtomicBookmark.properties.notes.maxLength,
  allowedRoles: blueprint.entities.UserAccount.properties.role.enum,
  allowedTheoryModes: blueprint.entities.UserAccount.properties.preferredTheoryMode.enum,
  allowedBases: blueprint.entities.UserAccount.properties.preferredBasis.enum,
  allowedExperimentKinds: blueprint.entities.CloudExperimentRecord.properties.kind.enum,
  allowedWorkspaces: blueprint.entities.AtomicBookmark.properties.workspace.enum,
} as const;

export type AllowedBasis =
  | "sto-3g"
  | "6-31g"
  | "cc-pvdz"
  | "cc-pvtz"
  | "aug-cc-pvtz"
  | "def2-svp"
  | "def2-tzvp";
export type AllowedTheoryMode = "schrodinger" | "dirac";

export interface UserAccountDoc {
  readonly uid: string;
  readonly displayName: string;
  readonly role: "researcher";
  readonly preferredZ: number;
  readonly preferredTheoryMode: AllowedTheoryMode;
  readonly preferredBasis: AllowedBasis;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export interface UserPrivateInfoDoc {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export interface CloudExperimentDoc {
  readonly experimentId: string;
  readonly ownerUid: string;
  readonly title: string;
  readonly kind: ExperimentKind;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly Z: number;
  readonly N: number;
  readonly constantsVersion: string;
  readonly definition: Record<string, unknown>;
  readonly executions: readonly Record<string, unknown>[];
  readonly latestResult?: Record<string, unknown>;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export interface AtomicBookmarkDoc {
  readonly bookmarkId: string;
  readonly ownerUid: string;
  readonly label: string;
  readonly Z: number;
  readonly N: number;
  readonly workspace: WorkspaceId;
  readonly theoryMode: AllowedTheoryMode;
  readonly notes: string;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

export function sanitizeId(raw: string, fallback = "item"): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, BLUEPRINT_LIMITS.idMaxLength);
  if (!cleaned || !BLUEPRINT_ID_PATTERN.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export function clampInt(val: number, min: number, max: number): number {
  const n = Math.round(Number.isFinite(val) ? val : min);
  return Math.max(min, Math.min(max, n));
}

export function truncateRequiredString(raw: string, maxLen: number, fallback: string): string {
  const trimmed = raw.trim();
  const nonEmpty = trimmed.length > 0 ? trimmed : fallback;
  return nonEmpty.slice(0, maxLen);
}

/**
 * Strips `undefined`, non-finite numbers, typed arrays, and oversized fields (like 3D volumeGrid arrays)
 * into clean Firestore-native Maps and Lists guaranteed well below Firestore's 1 MB document limit.
 */
export function toFirestorePlainValue(value: unknown, depth = 0): unknown {
  if (depth > 14) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    // Cap large numerical arrays (e.g. long radial plots) while preserving spectra/orbitals/CSFs
    const capped = value.length > 250 ? value.slice(0, 250) : value;
    return capped.map((item) => toFirestorePlainValue(item, depth + 1));
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as Iterable<number>).slice(0, 64);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (k === "volumeGrid" && v && typeof v === "object") {
        // Keep metadata only, omitting raw 3D Float64 volumetric values to avoid 1 MB Firestore overflow
        const g = v as Record<string, unknown>;
        out[k] = {
          omittedFromCloudSync: true,
          quantity: typeof g.quantity === "string" ? g.quantity : "density",
          gridN: typeof g.gridN === "number" ? g.gridN : 0,
        };
        continue;
      }
      if (k === "radialProfile" && v && typeof v === "object") {
        const rp = v as Record<string, unknown>;
        out[k] = {
          omittedRawArrays: true,
          integratedElectrons: typeof rp.integratedElectrons === "number" ? rp.integratedElectrons : null,
        };
        continue;
      }
      out[k] = toFirestorePlainValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function sanitizeUserAccountFields(input: {
  uid: string;
  displayName: string;
  preferredZ: number;
  preferredTheoryMode: string;
  preferredBasis: string;
}): Omit<UserAccountDoc, "createdAt" | "updatedAt"> {
  const theoryMode = (BLUEPRINT_LIMITS.allowedTheoryModes as readonly string[]).includes(
    input.preferredTheoryMode,
  )
    ? (input.preferredTheoryMode as AllowedTheoryMode)
    : "schrodinger";
  const basis = (BLUEPRINT_LIMITS.allowedBases as readonly string[]).includes(input.preferredBasis)
    ? (input.preferredBasis as AllowedBasis)
    : "cc-pvdz";

  return {
    uid: sanitizeId(input.uid),
    displayName: truncateRequiredString(
      input.displayName,
      BLUEPRINT_LIMITS.displayNameMaxLength,
      "ATOMS Researcher",
    ),
    role: "researcher",
    preferredZ: clampInt(input.preferredZ, 1, 118),
    preferredTheoryMode: theoryMode,
    preferredBasis: basis,
  };
}

export function sanitizeCloudExperimentFields(input: {
  ownerUid: string;
  definition: ExperimentDefinition;
  executions: readonly ExperimentExecution[];
  latestResult?: ExperimentResultRecord;
}): Omit<CloudExperimentDoc, "createdAt" | "updatedAt"> {
  const experimentId = sanitizeId(input.definition.id, `exp_${Date.now()}`);
  const ownerUid = sanitizeId(input.ownerUid);
  const kind = (BLUEPRINT_LIMITS.allowedExperimentKinds as readonly string[]).includes(
    input.definition.kind,
  )
    ? input.definition.kind
    : "single-state";

  const recentExecutions = input.executions
    .slice(-BLUEPRINT_LIMITS.maxExecutionsPerExperiment)
    .map((ex) => toFirestorePlainValue(ex) as Record<string, unknown>);

  const base: Omit<CloudExperimentDoc, "createdAt" | "updatedAt"> = {
    experimentId,
    ownerUid,
    title: truncateRequiredString(
      input.definition.title,
      BLUEPRINT_LIMITS.experimentTitleMaxLength,
      "ATOMS Experiment",
    ),
    kind,
    providerId: truncateRequiredString(
      input.definition.providerId,
      BLUEPRINT_LIMITS.providerIdMaxLength,
      "unknown-provider",
    ),
    providerVersion: truncateRequiredString(
      input.definition.providerVersion,
      BLUEPRINT_LIMITS.providerVersionMaxLength,
      "0.7.1",
    ),
    Z: clampInt(input.definition.system.Z, 1, 118),
    N: clampInt(input.definition.system.N, 0, 120),
    constantsVersion: truncateRequiredString(
      input.definition.constantsVersion,
      BLUEPRINT_LIMITS.constantsVersionMaxLength,
      "CODATA-2018",
    ),
    definition: toFirestorePlainValue(input.definition) as Record<string, unknown>,
    executions: recentExecutions,
    ...(input.latestResult
      ? { latestResult: toFirestorePlainValue(input.latestResult) as Record<string, unknown> }
      : {}),
  };

  return base;
}

export function sanitizeAtomicBookmarkFields(input: {
  bookmarkId: string;
  ownerUid: string;
  label: string;
  Z: number;
  N: number;
  workspace: string;
  theoryMode: string;
  notes: string;
}): Omit<AtomicBookmarkDoc, "createdAt" | "updatedAt"> {
  const workspace = (BLUEPRINT_LIMITS.allowedWorkspaces as readonly string[]).includes(input.workspace)
    ? (input.workspace as WorkspaceId)
    : "workbench";
  const theoryMode = (BLUEPRINT_LIMITS.allowedTheoryModes as readonly string[]).includes(input.theoryMode)
    ? (input.theoryMode as AllowedTheoryMode)
    : "schrodinger";

  return {
    bookmarkId: sanitizeId(input.bookmarkId, `bm_${Date.now()}`),
    ownerUid: sanitizeId(input.ownerUid),
    label: truncateRequiredString(input.label, BLUEPRINT_LIMITS.bookmarkLabelMaxLength, "Saved System"),
    Z: clampInt(input.Z, 1, 118),
    N: clampInt(input.N, 0, 120),
    workspace,
    theoryMode,
    notes: input.notes.trim().slice(0, BLUEPRINT_LIMITS.bookmarkNotesMaxLength),
  };
}
