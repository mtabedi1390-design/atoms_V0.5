import type { ElementRecord, Subshell } from "@/data/elements";
import { elementByZ } from "@/data/elements";
import type { AngularBasis } from "@/physics/hydrogenic";
import { subshellLabel } from "@/physics/hydrogenic";
import type { ModelId } from "@/physics/models";
import type { RenderSettings } from "@/render/OrbitalScene";

export type ViewMode = "single" | "atom";
export type DensitySource = "dirac-fock" | "hf" | "model";

export interface LayerUI {
  visible: boolean;
  opacity: number;
}

export interface AppState {
  Z: number;
  mode: ViewMode;
  /** Active subshell + m for single-orbital mode / highlighting. */
  n: number;
  l: number;
  m: number;
  /** Allow any (n,l) up to this n in single mode, not only occupied subshells. */
  allowUnoccupied: boolean;
  basis: AngularBasis;
  model: ModelId;
  /** Full-atom density source: relativistic Dirac-Fock (Z=1..118), PySCF HF (6 atoms), or Slater subshell average. */
  densitySource: DensitySource;
  count: number;
  seed: number;
  showCurrent: boolean;
  render: RenderSettings;
  layers: Record<string, LayerUI>;
  adaptiveQuality: boolean;
}

export type Action =
  | { type: "selectElement"; Z: number }
  | { type: "selectSubshell"; n: number; l: number }
  | { type: "setM"; m: number }
  | { type: "set"; patch: Partial<AppState> }
  | { type: "render"; patch: Partial<RenderSettings> }
  | { type: "layer"; key: string; patch: Partial<LayerUI> }
  | { type: "reseed" };

export const DEFAULT_RENDER: RenderSettings = {
  pointSize: 2.2,
  brightness: 1.0,
  cutoff: 0,
  colorMode: "density",
  sliceAxis: "none",
  slicePosPm: 0,
  sliceThicknessPm: 20,
  showAxes: true,
  showNucleus: true,
  nucleusRadiusPm: 2,
};

export function defaultLayers(e: ElementRecord): Record<string, LayerUI> {
  const out: Record<string, LayerUI> = {};
  for (const s of e.subshells) out[s.label] = { visible: true, opacity: 1 };
  return out;
}

export function initialState(): AppState {
  // Optional, validated deep-link parameters used by benchmarks and browser tests.
  const qp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const qz = Number(qp.get("z"));
  const Z = Number.isInteger(qz) && qz >= 1 && qz <= 118 ? qz : 1;
  const qs = Number(qp.get("samples"));
  const count = Number.isFinite(qs) && qs >= 25000 && qs <= 300000 ? Math.round(qs / 5000) * 5000 : 120000;
  const qmode = qp.get("mode") === "atom" ? ("atom" as const) : ("single" as const);
  const qsrc = qp.get("source");
  const densitySource: DensitySource =
    qsrc === "model" || qsrc === "hf" || qsrc === "dirac-fock" ? qsrc : "dirac-fock";
  const e = elementByZ(Z);
  const v = valenceSubshell(e);
  return {
    ...initialCommon(Z, v.n, v.l, count, qmode, densitySource, qp.get("adaptive") !== "0"),
  };
}

function initialCommon(
  Z: number,
  n: number,
  l: number,
  count: number,
  mode: "single" | "atom",
  densitySource: DensitySource,
  adaptiveQuality: boolean,
): AppState {
  const e = elementByZ(Z);
  return {
    Z,
    mode,
    n,
    l,
    m: 0,
    allowUnoccupied: true,
    basis: "real",
    model: Z === 1 ? "hydrogenic-exact" : "slater-screened-hydrogenic",
    densitySource,
    count,
    seed: 1337,
    showCurrent: false,
    render: DEFAULT_RENDER,
    layers: defaultLayers(e),
    adaptiveQuality,
  };
}

/** The outermost (highest-energy by Madelung order) occupied subshell — default active orbital. */
export function valenceSubshell(e: ElementRecord): Subshell {
  return e.subshells.reduce((best, s) => (s.n + s.l > best.n + best.l || (s.n + s.l === best.n + best.l && s.n > best.n) ? s : best));
}

export function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case "selectElement": {
      const e = elementByZ(a.Z);
      const v = valenceSubshell(e);
      // H → exact model. Leaving H → default to Slater estimate (the exact model then means a one-electron ion).
      const model: ModelId = a.Z === 1 ? "hydrogenic-exact" : state.Z === 1 ? "slater-screened-hydrogenic" : state.model;
      return { ...state, Z: a.Z, n: v.n, l: v.l, m: 0, layers: defaultLayers(e), model };
    }
    case "selectSubshell":
      return { ...state, n: a.n, l: a.l, m: Math.max(-a.l, Math.min(a.l, state.m)) };
    case "setM":
      return { ...state, m: Math.max(-state.l, Math.min(state.l, a.m)) };
    case "set":
      return { ...state, ...a.patch };
    case "render":
      return { ...state, render: { ...state.render, ...a.patch } };
    case "layer":
      return { ...state, layers: { ...state.layers, [a.key]: { ...(state.layers[a.key] ?? { visible: true, opacity: 1 }), ...a.patch } } };
    case "reseed":
      return { ...state, seed: (Math.random() * 2 ** 31) >>> 0 };
  }
}

/** Subshell object for the active (n,l), whether or not occupied. */
export function activeSubshell(state: AppState, e: ElementRecord): Subshell {
  return e.subshells.find((s) => s.n === state.n && s.l === state.l) ?? { n: state.n, l: state.l, occupancy: 0, label: subshellLabel(state.n, state.l) };
}
