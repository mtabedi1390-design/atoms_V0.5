import type { WorkspaceId } from "@/app/useAtomsLaboratory";

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
  { id: "analysis", label: "Analysis" },
  { id: "experiment-history", label: "Experiment History" },
];

interface WorkspaceNavProps {
  readonly active: WorkspaceId;
  readonly onSelect: (id: WorkspaceId) => void;
  readonly activeCount?: number;
}

export function WorkspaceNav({ active, onSelect, activeCount = 0 }: WorkspaceNavProps) {
  return (
    <nav
      aria-label="ATOMS Laboratory workspaces"
      className="flex h-8 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-950/95 px-2"
    >
      <div role="tablist" aria-label="Laboratory views" className="flex items-center gap-1 whitespace-nowrap">
        <span className="mr-1.5 font-mono text-[10px] font-semibold tracking-wider text-amber-300 uppercase">
          ATOMS Lab v0.7
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
      <span className="hidden shrink-0 font-mono text-[10px] text-zinc-500 xl:inline">
        CODATA-2018 · Client-Local Quantum Lab
      </span>
    </nav>
  );
}
