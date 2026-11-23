import type { WorkspaceId } from "@/app/useAtomsLaboratory";
import { useFirebase } from "@/firebase/FirebaseProvider";

export interface WorkspaceDescriptor {
  readonly id: WorkspaceId;
  readonly label: string;
}

export const WORKSPACES: readonly WorkspaceDescriptor[] = [
  { id: "workbench", label: "Workbench" },
  { id: "atomic-systems", label: "Atomic Systems" },
  { id: "quantum-states", label: "Quantum States" },
  { id: "energy-structure", label: "Energy Structure" },
  { id: "transitions", label: "Transitions" },
  { id: "spectroscopy", label: "Spectroscopy" },
  { id: "hartree-fock", label: "Hartree–Fock" },
  { id: "atomic-terms", label: "Atomic Terms & CI" },
  { id: "analysis", label: "Analysis" },
  { id: "experiment-history", label: "Experiment History" },
];

interface WorkspaceNavProps {
  readonly active: WorkspaceId;
  readonly onSelect: (id: WorkspaceId) => void;
  readonly activeCount?: number;
}

export function WorkspaceNav({ active, onSelect, activeCount = 0 }: WorkspaceNavProps) {
  const { user, authReady, signingIn, syncingId, userAccount, signInWithGoogle, signOutUser } =
    useFirebase();

  const researcherLabel =
    userAccount?.displayName ?? user?.displayName ?? user?.email?.split("@")[0] ?? "Researcher";

  return (
    <nav
      aria-label="ATOMS Laboratory workspaces"
      className="flex h-8 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-950/95 px-2"
    >
      <div role="tablist" aria-label="Laboratory views" className="flex items-center gap-1 whitespace-nowrap">
        <span className="mr-1.5 font-mono text-[10px] font-semibold tracking-wider text-amber-300 uppercase">
          ATOMS Lab v0.7.1
        </span>
        {WORKSPACES.map((w) => {
          const isActive = w.id === active;
          return (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`ws-${w.id}`}
              onClick={() => onSelect(w.id)}
              className={`rounded-sm px-2 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-amber-400 text-black"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              {w.label}
              {w.id === "experiment-history" && activeCount > 0 && (
                <span className="ml-1 font-mono text-[9px] text-amber-300">({activeCount})</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <span className="hidden font-mono text-[10px] text-zinc-500 2xl:inline">
          CODATA-2018 · Client-Local Quantum Lab
        </span>
        {!authReady ? (
          <span className="font-mono text-[10px] text-zinc-500">Auth…</span>
        ) : user ? (
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-sm border border-emerald-800/80 bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
              title={user.email ?? undefined}
            >
              {syncingId ? "Syncing…" : `Cloud: ${researcherLabel}`}
            </span>
            <button
              type="button"
              data-testid="firebase-signout-btn"
              onClick={() => void signOutUser()}
              className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid="firebase-signin-btn"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            className="rounded-sm border border-amber-500/50 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-200 hover:bg-amber-900/40 disabled:opacity-50"
          >
            {signingIn ? "Signing in…" : "Sign in with Google"}
          </button>
        )}
      </div>
    </nav>
  );
}
