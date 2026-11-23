import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  ExperimentDefinition,
  ExperimentExecution,
  ExperimentResultRecord,
} from "@/experiments/schema";
import { db } from "./client";
import { handleFirestoreError, OperationType } from "./errors";
import {
  BLUEPRINT_LIMITS,
  sanitizeAtomicBookmarkFields,
  sanitizeCloudExperimentFields,
  sanitizeId,
  sanitizeUserAccountFields,
  type AtomicBookmarkDoc,
  type CloudExperimentDoc,
  type UserAccountDoc,
} from "./validation";

function toMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toMillis" in ts && typeof (ts as { toMillis: () => number }).toMillis === "function") {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export async function ensureUserAccountAndPrivateInfo(user: User): Promise<UserAccountDoc> {
  const uid = sanitizeId(user.uid);
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;
  const userRef = doc(db, "users", uid);
  const privateRef = doc(db, "users", uid, "private", "info");

  let accountSnap;
  try {
    accountSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  let accountData: UserAccountDoc;
  if (!accountSnap.exists()) {
    const clean = sanitizeUserAccountFields({
      uid,
      displayName: user.displayName ?? user.email?.split("@")[0] ?? "ATOMS Researcher",
      preferredZ: 6,
      preferredTheoryMode: "schrodinger",
      preferredBasis: "cc-pvdz",
    });
    const createPayload = {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(userRef, createPayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
    accountData = clean;
  } else {
    accountData = accountSnap.data() as UserAccountDoc;
  }

  // Master gate guarantees /users/{uid} now exists before touching /private/info
  const emailClean = (user.email ?? "").trim().slice(0, BLUEPRINT_LIMITS.emailMaxLength);
  if (emailClean.length >= 3 && user.emailVerified) {
    let privateSnap;
    try {
      privateSnap = await getDoc(privateRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, privatePath);
    }

    if (!privateSnap.exists()) {
      try {
        await setDoc(privateRef, {
          uid,
          email: emailClean,
          emailVerified: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, privatePath);
      }
    } else {
      try {
        await updateDoc(privateRef, {
          email: emailClean,
          emailVerified: true,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, privatePath);
      }
    }
  }

  return accountData;
}

export async function updateUserPreferencesInCloud(
  uidRaw: string,
  patch: {
    displayName: string;
    preferredZ: number;
    preferredTheoryMode: string;
    preferredBasis: string;
  },
): Promise<void> {
  const uid = sanitizeId(uidRaw);
  const path = `users/${uid}`;
  const clean = sanitizeUserAccountFields({ uid, ...patch });
  try {
    await updateDoc(doc(db, "users", uid), {
      displayName: clean.displayName,
      preferredZ: clean.preferredZ,
      preferredTheoryMode: clean.preferredTheoryMode,
      preferredBasis: clean.preferredBasis,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncExperimentToCloud(
  uidRaw: string,
  entry: {
    readonly definition: ExperimentDefinition;
    readonly executions: readonly ExperimentExecution[];
    readonly latestResult?: ExperimentResultRecord;
  },
): Promise<void> {
  const uid = sanitizeId(uidRaw);
  const clean = sanitizeCloudExperimentFields({
    ownerUid: uid,
    definition: entry.definition,
    executions: entry.executions,
    latestResult: entry.latestResult,
  });
  const path = `users/${uid}/experiments/${clean.experimentId}`;
  const ref = doc(db, "users", uid, "experiments", clean.experimentId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(ref, {
        title: clean.title,
        kind: clean.kind,
        providerId: clean.providerId,
        providerVersion: clean.providerVersion,
        Z: clean.Z,
        N: clean.N,
        constantsVersion: clean.constantsVersion,
        definition: clean.definition,
        executions: clean.executions,
        ...(clean.latestResult ? { latestResult: clean.latestResult } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function deleteCloudExperiment(uidRaw: string, experimentIdRaw: string): Promise<void> {
  const uid = sanitizeId(uidRaw);
  const expId = sanitizeId(experimentIdRaw);
  const path = `users/${uid}/experiments/${expId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "experiments", expId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAtomicBookmarkToCloud(
  uidRaw: string,
  input: {
    bookmarkId: string;
    label: string;
    Z: number;
    N: number;
    workspace: string;
    theoryMode: string;
    notes: string;
  },
): Promise<void> {
  const uid = sanitizeId(uidRaw);
  const clean = sanitizeAtomicBookmarkFields({ ...input, ownerUid: uid });
  const path = `users/${uid}/bookmarks/${clean.bookmarkId}`;
  const ref = doc(db, "users", uid, "bookmarks", clean.bookmarkId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(ref, {
        label: clean.label,
        Z: clean.Z,
        N: clean.N,
        workspace: clean.workspace,
        theoryMode: clean.theoryMode,
        notes: clean.notes,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export async function deleteAtomicBookmarkFromCloud(
  uidRaw: string,
  bookmarkIdRaw: string,
): Promise<void> {
  const uid = sanitizeId(uidRaw);
  const bmId = sanitizeId(bookmarkIdRaw);
  const path = `users/${uid}/bookmarks/${bmId}`;
  try {
    await deleteDoc(doc(db, "users", uid, "bookmarks", bmId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserAccount(
  uidRaw: string,
  onData: (account: UserAccountDoc | null) => void,
): Unsubscribe {
  const uid = sanitizeId(uidRaw);
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserAccountDoc) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export function subscribeUserExperiments(
  uidRaw: string,
  onData: (items: readonly CloudExperimentDoc[]) => void,
): Unsubscribe {
  const uid = sanitizeId(uidRaw);
  const path = `users/${uid}/experiments`;
  const q = query(collection(db, "users", uid, "experiments"), where("ownerUid", "==", uid), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as CloudExperimentDoc)
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeUserBookmarks(
  uidRaw: string,
  onData: (items: readonly AtomicBookmarkDoc[]) => void,
): Unsubscribe {
  const uid = sanitizeId(uidRaw);
  const path = `users/${uid}/bookmarks`;
  const q = query(collection(db, "users", uid, "bookmarks"), where("ownerUid", "==", uid), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as AtomicBookmarkDoc)
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}
