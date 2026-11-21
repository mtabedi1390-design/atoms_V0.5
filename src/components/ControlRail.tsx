import type { Dispatch } from "react";
import type { ElementRecord } from "@/data/elements";
import { subshellLabel, SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import { MODELS, type ModelId } from "@/physics/models";
import { HF_ATOMS, hfDatasetFor } from "@/science/providers";
import type { Action, AppState, DensitySource } from "@/state/appState";
import type { LaboratoryConfig } from "@/app/useAtomsLaboratory";
import { PeriodicTable } from "./PeriodicTable";
import { Panel, Row, Seg, Slider, Toggle } from "./ui";

interface Props {
  state: AppState;
  element: ElementRecord;
  dispatch: Dispatch<Action>;
  extentPm: number;
  layerColors: Record<string, string>;
  onResetCamera: () => void;
  labConfig?: LaboratoryConfig;
  onPatchLab?: (patch: Partial<LaboratoryConfig>) => void;
  electronCount?: number;
}

const M_LABELS_REAL: Record<number, string[]> = {
  0: ["s"],
  1: ["p_y", "p_z", "p_x"],
  2: ["d_xy", "d_yz", "d_z²", "d_xz", "d_x²−y²"],
  3: ["f_y(3x²−y²)", "f_xyz", "f_yz²", "f_z³", "f_xz²", "f_z(x²−y²)", "f_x(x²−3y²)"],
};

export function ControlRail({
  state,
  element: e,
  dispatch,
  extentPm,
  layerColors,
  onResetCamera,
  labConfig,
  onPatchLab,
  electronCount,
}: Props) {
  const r = state.render;
  const maxN = Math.max(7, ...e.subshells.map((s) => s.n));
  const nOptions = Array.from({ length: maxN }, (_, i) => i + 1);
  const occupied = new Set(e.subshells.map((s) => s.label));
  const hf = hfDatasetFor(e.Z);
  const isTotalDensityOnly = state.mode === "atom" && state.densitySource !== "model";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Panel title="Element">
        <PeriodicTable selectedZ={state.Z} onSelect={(Z) => dispatch({ type: "selectElement", Z })} />
      </Panel>

      <Panel title="Mode">
        <Seg
          value={state.mode}
          onChange={(mode) => dispatch({ type: "set", patch: { mode } })}
          options={[
            { v: "single", label: "Single orbital ψₙₗₘ" },
            { v: "atom", label: "Full-atom density" },
          ]}
        />
        <div className="mt-2">
          <Seg
            value={state.model}
            onChange={(model) => dispatch({ type: "set", patch: { model: model as ModelId } })}
            options={[
              { v: "hydrogenic-exact", label: e.Z === 1 ? "A · exact H" : `A · exact ${e.symbol}${e.Z - 1}+ ion`, title: MODELS["hydrogenic-exact"].appliesTo },
              { v: "slater-screened-hydrogenic", label: "B · Slater-screened", disabled: e.Z === 1, title: MODELS["slater-screened-hydrogenic"].appliesTo },
            ]}
          />
        </div>
        {e.isOpenShell && (
          <p className="mt-1.5 rounded-sm border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] leading-snug text-zinc-400">
            <span className="font-semibold text-zinc-200">Open-shell ({e.groundTerm.value ?? "term n/a"})</span>:{" "}
            {state.mode === "atom"
              ? "Full-atom view shows a spherical / configuration average over open-shell occupations, not a unique oriented magnetic state."
              : "Single-orbital mode inspects an independent-electron basis orbital (n,l,m), not a correlated many-electron term."}
          </p>
        )}
      </Panel>

      <Panel title="Full-atom density source">
        <Seg
          value={state.densitySource}
          onChange={(densitySource) => dispatch({ type: "set", patch: { densitySource: densitySource as DensitySource } })}
          options={[
            {
              v: "dirac-fock",
              label: "Dirac–Fock (Z=1–118)",
              title: "Lobato et al. (2026) relativistic B-spline Dirac–Fock spherical density (all 118 elements, Apache-2.0)",
            },
            {
              v: "hf",
              label: "PySCF HF (offline)",
              disabled: !hf,
              title: hf ? "Bundled non-relativistic RHF/ROHF radial density" : `No HF dataset for ${e.symbol}. Available Z: ${HF_ATOMS.join(", ")}`,
            },
            {
              v: "model",
              label: "Slater subshells",
              title: "Qualitative configuration-average Σ Nᵢ|Rᵢ|²/4π using browser Slater screening",
            },
          ]}
        />
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">
          {state.densitySource === "dirac-fock"
            ? `Lobato et al. (2026) relativistic B-spline Dirac–Fock (atomx, finite nucleus, spherical average) for Z=${e.Z}. Total density ρ(r) only — no subshell R_nl(r) orbitals or wavefunction phase.`
            : state.densitySource === "hf" && hf
              ? `Bundled ${hf.method}/${hf.basis}: ${hf.term}, SCF converged in ${hf.scf.cycles} cycles. Basis-set-limited HF (ΔE = ${hf.basisError_hartree.toExponential(1)} Ha vs numerical HF limit); no correlation, non-relativistic.`
              : `Qualitative independent-electron configuration average Σ Nᵢ|Rᵢ|²/4π (${e.Z === 1 ? "exact 1s" : "Slater Z_eff"}). Not relativistic and not SCF. PySCF HF bundled only for Z=${HF_ATOMS.join(", ")}.`}
        </p>
      </Panel>

      <Panel title="Orbital / subshell">
        <div className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
          <span className="self-center text-zinc-500">n</span>
          <div className="flex flex-wrap gap-1">
            {nOptions.map((n) => (
              <button key={n} data-testid={`n-${n}`} aria-label={`principal quantum number ${n}`} onClick={() => dispatch({ type: "selectSubshell", n, l: Math.min(state.l, n - 1) })} className={`h-6 w-6 rounded-sm border font-mono ${state.n === n ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>{n}</button>
            ))}
          </div>
          <span className="self-center text-zinc-500">l</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: state.n }, (_, l) => l).map((l) => {
              const occ = occupied.has(subshellLabel(state.n, l));
              return (
                <button key={l} data-testid={`l-${l}`} aria-label={`angular momentum l=${l}`} disabled={!occ && !state.allowUnoccupied} onClick={() => dispatch({ type: "selectSubshell", n: state.n, l })} className={`h-6 min-w-6 rounded-sm border px-1 font-mono ${state.l === l ? "border-amber-400 bg-amber-400 text-black" : occ ? "border-zinc-600 text-zinc-200 hover:bg-zinc-800" : "border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}>
                  {SUBSHELL_LETTERS[l] ?? l}
                </button>
              );
            })}
          </div>
          <span className="self-center text-zinc-500">m</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 2 * state.l + 1 }, (_, i) => i - state.l).map((m) => (
              <button key={m} data-testid={"m-" + m} aria-label={"magnetic quantum number m=" + m} title={state.basis === "real" ? M_LABELS_REAL[state.l]?.[m + state.l] : `m = ${m}`} onClick={() => dispatch({ type: "setM", m })} className={`h-6 min-w-6 rounded-sm border px-1 font-mono ${state.m === m ? "border-amber-400 bg-amber-400 text-black" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
                {m > 0 ? `+${m}` : m}
              </button>
            ))}
          </div>
        </div>
        {state.basis === "real" && state.l <= 3 && <p className="mb-1 font-mono text-[10px] text-zinc-500">real orbital: {M_LABELS_REAL[state.l][state.m + state.l]}</p>}
        <Seg
          value={state.basis}
          onChange={(basis) => dispatch({ type: "set", patch: { basis } })}
          options={[
            { v: "real", label: "Real (tesseral)" },
            { v: "complex", label: "Complex Y_l^m" },
          ]}
        />
        <Toggle label="Allow unoccupied (n,l) in single mode" checked={state.allowUnoccupied} onChange={(v) => dispatch({ type: "set", patch: { allowUnoccupied: v } })} />
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Occupied subshells {state.mode === "atom" && state.densitySource === "model" ? "(visibility · opacity)" : "(click to inspect orbital)"}
          </div>
          {isTotalDensityOnly && (
            <p className="mb-1 text-[10px] text-zinc-500">
              Total-density providers do not resolve individual subshells. Switch source to <span className="text-zinc-300">Slater subshells</span> to toggle per-subshell layers.
            </p>
          )}
          <div className="grid grid-cols-1 gap-0.5">
            {e.subshells.map((s) => {
              const L = state.layers[s.label] ?? { visible: true, opacity: 1 };
              const active = s.n === state.n && s.l === state.l;
              return (
                <div key={s.label} data-testid="layer-row" data-layer={s.label} className="flex items-center gap-2 text-xs">
                  <i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: layerColors[s.label] ?? "#888" }} />
                  <button onClick={() => dispatch({ type: "selectSubshell", n: s.n, l: s.l })} className={`w-10 text-left font-mono ${active ? "text-amber-300" : "text-zinc-200"}`}>{s.label}</button>
                  <span className="w-8 font-mono text-zinc-500">{s.occupancy}e⁻</span>
                  {state.mode === "atom" && state.densitySource === "model" && (
                    <>
                      <input type="checkbox" aria-label={`visibility ${s.label}`} checked={L.visible} onChange={(ev) => dispatch({ type: "layer", key: s.label, patch: { visible: ev.target.checked } })} className="accent-amber-400" />
                      <input type="range" aria-label={`opacity ${s.label}`} min={0.05} max={1} step={0.05} value={L.opacity} onChange={(ev) => dispatch({ type: "layer", key: s.label, patch: { opacity: Number(ev.target.value) } })} className="h-1 flex-1 accent-zinc-400" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="Sampling">
        <Slider label="Samples" value={state.count} min={25000} max={300000} step={5000} onChange={(count) => dispatch({ type: "set", patch: { count, adaptiveQuality: false } })} format={(v) => v.toLocaleString()} />
        <Row label="Seed"><button onClick={() => dispatch({ type: "reseed" })} className="underline decoration-dotted">{state.seed}</button></Row>
        <Toggle label="Adaptive quality (reduce samples if FPS < 30)" checked={state.adaptiveQuality} onChange={(v) => dispatch({ type: "set", patch: { adaptiveQuality: v } })} />
      </Panel>

      <Panel title="Rendering">
        <Seg
          value={isTotalDensityOnly && r.colorMode !== "density" ? "density" : r.colorMode}
          onChange={(colorMode) => dispatch({ type: "render", patch: { colorMode } })}
          options={[
            { v: "density", label: "|ψ|² / ρ" },
            { v: "phase-real", label: "sign ψ", disabled: state.basis !== "real" || state.mode === "atom", title: "Single-orbital real basis only: orange = ψ>0, blue = ψ<0" },
            { v: "phase-complex", label: "arg ψ", disabled: state.basis !== "complex" || state.mode === "atom", title: "Single-orbital complex basis only: hue = phase angle" },
            { v: "layer", label: "subshell", disabled: state.mode !== "atom" || state.densitySource !== "model", title: "Available in Full-atom Slater subshells mode" },
          ]}
        />
        <Slider label="Point size" value={r.pointSize} min={0.5} max={6} step={0.1} onChange={(pointSize) => dispatch({ type: "render", patch: { pointSize } })} />
        <Slider label="Brightness" value={r.brightness} min={0.1} max={3} step={0.05} onChange={(brightness) => dispatch({ type: "render", patch: { brightness } })} />
        <Slider label="Density cutoff (log-rel.)" value={r.cutoff} min={0} max={0.95} step={0.01} onChange={(cutoff) => dispatch({ type: "render", patch: { cutoff } })} />
        <Toggle label="Axes & grid" checked={r.showAxes} onChange={(showAxes) => dispatch({ type: "render", patch: { showAxes } })} />
        <Toggle label="Nucleus marker (not to scale)" checked={r.showNucleus} onChange={(showNucleus) => dispatch({ type: "render", patch: { showNucleus } })} />
        <Toggle label="Probability current j (complex, m≠0)" checked={state.showCurrent} onChange={(showCurrent) => dispatch({ type: "set", patch: { showCurrent } })} />
        <button onClick={onResetCamera} className="mt-1 w-full rounded-sm border border-zinc-700 py-1 text-xs text-zinc-300 hover:bg-zinc-800">Reset camera</button>
      </Panel>

      <Panel title="Cross-section slice">
        <Seg
          value={r.sliceAxis}
          onChange={(sliceAxis) => dispatch({ type: "render", patch: { sliceAxis } })}
          options={[
            { v: "none", label: "Off" },
            { v: "z", label: "XY (z=c)" },
            { v: "y", label: "XZ (y=c)" },
            { v: "x", label: "YZ (x=c)" },
          ]}
        />
        <Slider label="Plane position" value={r.slicePosPm} min={-extentPm} max={extentPm} step={extentPm / 200} onChange={(slicePosPm) => dispatch({ type: "render", patch: { slicePosPm } })} format={(v) => `${v.toFixed(1)} pm`} />
        <Slider label="Slab thickness" value={r.sliceThicknessPm} min={extentPm / 200} max={extentPm / 2} step={extentPm / 400} onChange={(sliceThicknessPm) => dispatch({ type: "render", patch: { sliceThicknessPm } })} format={(v) => `${v.toFixed(1)} pm`} />
        <p className="text-[10px] text-zinc-500">Slicing is a display filter on the GPU; the sampled distribution is unchanged.</p>
      </Panel>

      {labConfig && onPatchLab && (
        <Panel title="v0.6 Quantum Engine & 3D Isosurface">
          <Seg
            value={labConfig.theoryMode}
            onChange={(theoryMode) => onPatchLab({ theoryMode })}
            options={[
              { v: "schrodinger", label: "Schrödinger (NR)" },
              {
                v: "dirac",
                label: "Dirac 4-spinor",
                disabled: state.mode !== "single" || (electronCount !== undefined && electronCount !== 1 && e.Z > 1 && state.model !== "hydrogenic-exact"),
                title: "One-electron point-Coulomb Dirac spinor visualization (single-state N=1 ion/H)",
              },
            ]}
          />
          {labConfig.theoryMode === "dirac" && state.mode === "single" && (
            <div className="mt-2 space-y-1.5">
              <Seg
                value={labConfig.diracComponentView}
                onChange={(diracComponentView) => onPatchLab({ diracComponentView })}
                options={[
                  { v: "total", label: "Total |Ψ|²" },
                  { v: "large", label: "Large P" },
                  { v: "small", label: "Small Q" },
                ]}
              />
              <p className="text-[10px] text-amber-300/90">
                P and Q are coupled 4-spinor components of one eigenstate (use Quantum States workspace to edit κ, j, m_j).
              </p>
            </div>
          )}
          <div className="mt-2">
            <Toggle
              label="3D Isosurface (Marching Tetrahedra)"
              checked={labConfig.showIsosurface}
              onChange={(showIsosurface) => onPatchLab({ showIsosurface })}
            />
            {labConfig.showIsosurface && (
              <div className="mt-1.5 space-y-1">
                <Slider
                  label="Isovalue (fraction of max)"
                  value={labConfig.isoFraction}
                  min={0.05}
                  max={0.75}
                  step={0.05}
                  onChange={(isoFraction) => onPatchLab({ isoFraction })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <Seg
                  value={String(labConfig.isoResolution)}
                  onChange={(res) => onPatchLab({ isoResolution: Number(res) as 24 | 32 | 40 })}
                  options={[
                    { v: "24", label: "24³ fast" },
                    { v: "32", label: "32³ std" },
                    { v: "40", label: "40³ fine" },
                  ]}
                />
                <Toggle
                  label="Wireframe isosurface"
                  checked={labConfig.isoWireframe}
                  onChange={(isoWireframe) => onPatchLab({ isoWireframe })}
                />
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
