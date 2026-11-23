import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import type {
  ExperimentDefinition,
  ExperimentExecution,
  ExperimentResultRecord,
} from "@/experiments/schema";
import { auth, googleProvider } from "./client";
import {
  deleteAtomicBookmarkFromCloud,
  deleteCloudExperiment,
  ensureUserAccountAndPrivateInfo,
  saveAtomicBookmarkToCloud,
  subscribeUserAccount,
  subscribeUserBookmarks,
  subscribeUserExperiments,
  syncExperimentToCloud,
  updateUserPreferencesInCloud,
} from "./service";
import type { AtomicBookmarkDoc, CloudExperimentDoc, UserAccountDoc } from "./validation";

export interface FirebaseContextValue {
  readonly user: User | null;
  readonly authReady: boolean;
  readonly signingIn: boolean;
  readonly authError: string | null;
  readonly syncingId: string | null;
  readonly userAccount: UserAccountDoc | null;
  readonly cloudExperiments: readonly CloudExperimentDoc[];
  readonly bookmarks: readonly AtomicBookmarkDoc[];
  readonly signInWithGoogle: () => Promise<void>;
  readonly signOutUser: () => Promise<void>;
  readonly savePreferences: (patch: {
    displayName: string;
    preferredZ: number;
    preferredTheoryMode: string;
    preferredBasis: string;
  }) => Promise<void>;
  readonly syncExperiment: (entry: {
    readonly definition: ExperimentDefinition;
    readonly executions: readonly ExperimentExecution[];
    readonly latestResult?: ExperimentResultRecord;
  }) => Promise<void>;
  readonly removeCloudExperiment: (experimentId: string) => Promise<void>;
  readonly saveBookmark: (input: {
    bookmarkId?: string;
    label: string;
    Z: number;
    N: number;
    workspace: string;
    theoryMode: string;
    notes: string;
  }) => Promise<void>;
  readonly removeBookmark: (bookmarkId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccountDoc | null>(null);
  const [cloudExperiments, setCloudExperiments] = useState<readonly CloudExperimentDoc[]>([]);
  const [bookmarks, setBookmarks] = useState<readonly AtomicBookmarkDoc[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setUserAccount(null);
        setCloudExperiments([]);
        setBookmarks([]);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    if (!user.emailVerified) {
      setAuthError("Signed-in Google account email must be verified for cloud Firestore sync.");
      return;
    }

    let cancelled = false;
    let unsubAccount: (() => void) | undefined;
    let unsubExps: (() => void) | undefined;
    let unsubBookmarks: (() => void) | undefined;

    void ensureUserAccountAndPrivateInfo(user)
      .then((initialAccount) => {
        if (cancelled) return;
        setUserAccount(initialAccount);
        setAuthError(null);
        unsubAccount = subscribeUserAccount(user.uid, (acc) => {
          if (!cancelled) setUserAccount(acc);
        });
        unsubExps = subscribeUserExperiments(user.uid, (items) => {
          if (!cancelled) setCloudExperiments(items);
        });
        unsubBookmarks = subscribeUserBookmarks(user.uid, (items) => {
          if (!cancelled) setBookmarks(items);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setAuthError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      unsubAccount?.();
      unsubExps?.();
      unsubBookmarks?.();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("auth/popup-closed-by-user") && !msg.includes("auth/cancelled-popup-request")) {
        setAuthError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const savePreferences = useCallback(
    async (patch: {
      displayName: string;
      preferredZ: number;
      preferredTheoryMode: string;
      preferredBasis: string;
    }) => {
      if (!user || !user.emailVerified) return;
      await updateUserPreferencesInCloud(user.uid, patch);
    },
    [user],
  );

  const syncExperiment = useCallback(
    async (entry: {
      readonly definition: ExperimentDefinition;
      readonly executions: readonly ExperimentExecution[];
      readonly latestResult?: ExperimentResultRecord;
    }) => {
      if (!user || !user.emailVerified) return;
      setSyncingId(entry.definition.id);
      try {
        await syncExperimentToCloud(user.uid, entry);
      } finally {
        setSyncingId((cur) => (cur === entry.definition.id ? null : cur));
      }
    },
    [user],
  );

  const removeCloudExperiment = useCallback(
    async (experimentId: string) => {
      if (!user || !user.emailVerified) return;
      await deleteCloudExperiment(user.uid, experimentId);
    },
    [user],
  );

  const saveBookmark = useCallback(
    async (input: {
      bookmarkId?: string;
      label: string;
      Z: number;
      N: number;
      workspace: string;
      theoryMode: string;
      notes: string;
    }) => {
      if (!user || !user.emailVerified) return;
      const bookmarkId = input.bookmarkId ?? `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await saveAtomicBookmarkToCloud(user.uid, { ...input, bookmarkId });
    },
    [user],
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!user || !user.emailVerified) return;
      await deleteAtomicBookmarkFromCloud(user.uid, bookmarkId);
    },
    [user],
  );

  const value = useMemo<FirebaseContextValue>(
    () => ({
      user,
      authReady,
      signingIn,
      authError,
      syncingId,
      userAccount,
      cloudExperiments,
      bookmarks,
      signInWithGoogle,
      signOutUser,
      savePreferences,
      syncExperiment,
      removeCloudExperiment,
      saveBookmark,
      removeBookmark,
    }),
    [
      user,
      authReady,
      signingIn,
      authError,
      syncingId,
      userAccount,
      cloudExperiments,
      bookmarks,
      signInWithGoogle,
      signOutUser,
      savePreferences,
      syncExperiment,
      removeCloudExperiment,
      saveBookmark,
      removeBookmark,
    ],
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error("useFirebase must be used inside a FirebaseProvider");
  }
  return ctx;
}
