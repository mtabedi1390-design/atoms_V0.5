import type { ElementRecord, Subshell } from "@/data/elements";
import { CONSTANTS } from "@/physics/constants";
import { MODELS, slaterZeff, type ModelId } from "@/physics/models";
import { Badge, Row } from "./ui";
import type { HFDataset, Selection } from "@/science/providers";
import { PROVIDERS, graspProvider, selectProvider } from "@/science/providers";

interface Props {
  element: ElementRecord;
  model: ModelId;
  sub: Subshell;
  m: number;
  basis: "real" | "complex";
  providerSelection: Selection;
  hfDataset: HFDataset | null;
  electrons: number | null;
}

export function Inspector({ element: e, model, sub, m, basis, providerSelection, hfDataset, electrons }: Props) {
  const M = MODELS[model];
  const sl = model === "slater-screened-hydrogenic" ? slaterZeff(e, sub) : null;
  const ie = e.ionizationEnergy_eV;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Element</h3>
        <Row label="Name / symbol / Z">{e.name} · {e.symbol} · {e.Z}</Row>
        <Row label={e.massKind === "standard atomic weight" ? "Std. atomic weight" : "Mass number (longest-lived)"} hint={e.mass.source}>
          {e.massKind === "standard atomic weight" ? e.mass.value.toFixed(3) : `[${e.mass.value}]`} u <Badge kind={e.mass.evidence}>{e.mass.evidence}</Badge>
        </Row>
        <Row label="Category / block">{e.category} · {e.block}</Row>
        <Row label="Group / period">{e.group ?? "—"} / {e.period}</Row>
        <Row label="Configuration" hint={e.configuration.source}>
          <span className="text-zinc-100">{e.configuration.value}</span> <Badge kind={e.configuration.evidence}>{e.configuration.evidence}</Badge>
        </Row>
        {e.configuration.note && <p className="text-[10px] text-amber-300/80">{e.configuration.note}</p>}
        <Row label="1st ionisation energy" hint={ie.source + (ie.note ? " — " + ie.note : "")}>
          {ie.value === null ? "unavailable" : `${ie.value.toFixed(3)} eV`} <Badge kind={ie.evidence}>{ie.evidence}</Badge>
        </Row>
        <Row label="Covalent radius" hint={e.covalentRadius_pm.source}>
          {e.covalentRadius_pm.value === null ? "unavailable" : `${e.covalentRadius_pm.value} pm`} <Badge kind={e.covalentRadius_pm.evidence}>{e.covalentRadius_pm.evidence}</Badge>
        </Row>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Active state</h3>
        <Row label="Subshell / occupancy">{sub.label} · {sub.occupancy} e⁻{sub.occupancy === 0 ? " (unoccupied)" : ""}</Row>
        <Row label="(n, l, m)">({sub.n}, {sub.l}, {m})</Row>
        <Row label="Angular basis">{basis === "real" ? `real tesseral (m${m > 0 ? "₊" : m < 0 ? "₋" : "₀"})` : "complex Y_l^m"}</Row>
        {sl && (
          <>
            <Row label="Slater screening S">{sl.screening.toFixed(2)}</Row>
            <Row label="Z_eff = Z − S">{sl.zeff.toFixed(3)} <Badge kind="estimate">estimate</Badge></Row>
            <Row label="n* (Slater)">{sl.nStar}{sub.n >= 7 ? " (extrapolated)" : ""}</Row>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Physics model</h3>
        <Row label="Model">{M.name}</Row>
        <p className="py-0.5 text-[11px] text-zinc-300">{M.hamiltonian}</p>
        <Row label="Kind"><Badge kind={M.kind === "exact analytical" ? "exact" : "estimate"}>{M.kind}</Badge></Row>
        <Row label="Relativistic">{M.relativistic}</Row>
        <Row label="Correlation">{M.correlation}</Row>
        <Row label="Nuclear model">{M.nuclearModel}</Row>
        <Row label="Engine / version">TypeScript core {M.version}</Row>
        <Row label="Constants">{CONSTANTS.name}</Row>
        <Row label="Numerics">trapezoid CDF 8192×2048 pts, Lanczos lnΓ, 3-term recurrences</Row>
        <Row label="Validation">37 vitest cases (analytic, KS α=0.001, data)</Row>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Known limitations</h3>
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-zinc-400">
          {M.limitations.map((l) => <li key={l}>{l}</li>)}
          {e.Z > 1 && model === "hydrogenic-exact" && <li className="text-amber-300">You are viewing the one-electron ion {e.symbol}<sup>{e.Z - 1}+</sup>, not the neutral atom.</li>}
          {e.Z >= 50 && <li className="text-amber-300">Z ≥ 50: relativistic effects (s/p contraction, d/f expansion, spin–orbit) are significant and NOT included. Dirac–Fock / MCDHF results are not available in this build.</li>}
          <li>Nucleus marker is not to scale (true nuclear radius ≈ 1.2·A^(1/3) fm ≈ 10⁻⁵ of a0).</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Method selection (observable-dependent)</h3>
        <Row label="electron density @ quantitative">
          <span className="text-right">{providerSelection.result ? providerSelection.result.metadata.method : "no validated provider"}</span>
        </Row>
        <Row label="engine / version">
          {providerSelection.result ? `${providerSelection.result.metadata.name} ${providerSelection.result.metadata.version}` : "—"}
        </Row>
        {providerSelection.result?.dataset && (
          <>
            <Row label="basis">{providerSelection.result.metadata.basis}</Row>
            <Row label="convergence">{providerSelection.result.metadata.convergence}</Row>
            <Row label="energy (HF)">{(providerSelection.result.dataset.energy_hartree).toFixed(8)} Ha · {providerSelection.result.dataset.energy_eV.toFixed(3)} eV</Row>
            <Row label="HF-limit reference">{providerSelection.result.dataset.reference.value_hartree.toFixed(8)} Ha</Row>
            <Row label="basis error">ΔE = {providerSelection.result.dataset.basisError_hartree.toExponential(3)} Ha</Row>
            <Row label="∫ρ dV (this scene)">{electrons === null ? "not sampled yet" : `${electrons.toFixed(4)} e / ${e.Z} e expected`}</Row>
          </>
        )}
        <div className="mt-1 space-y-0.5">
          {providerSelection.result?.validation.checks.map((c) => (
            <div key={c.name} className="flex items-start gap-1 text-[10px]">
              <span className={c.passed ? "text-emerald-400" : "text-red-400"}>{c.passed ? "✓" : "✗"}</span>
              <span className="text-zinc-400">{c.name}: <span className="text-zinc-300">{c.detail}</span></span>
            </div>
          ))}
        </div>
        {providerSelection.result?.metadata.limitations.slice(0, 4).map((l) => <p key={l} className="mt-0.5 text-[10px] text-zinc-500">• {l}</p>)}
        {e.Z > 10 && (
          <p className="mt-1 text-[10px] text-amber-300/80">
            No HF dataset for Z={e.Z}: only the Slater estimate is available. {graspProvider.availability.blocker}
          </p>
        )}
        <p className="mt-1 text-[10px] text-zinc-600">
          Providers registered: {PROVIDERS.map((p) => `${p.id}${p.availability.available ? "" : " (unavailable)"}`).join(", ")}. Selection for total energy / fine structure is separate from density:
          {" "}{selectProvider({ Z: e.Z, observable: "total-energy", accuracy: "quantitative" }).result ? "HF total energy available" : "not available for this element"}.
        </p>
        {hfDataset && <p className="mt-1 text-[10px] text-zinc-600">Bundled dataset: {hfDataset.schema}, generated {hfDataset.generated}, command <code>{hfDataset.command}</code>.</p>}
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Data provenance</h3>
        <ul className="space-y-0.5 text-[10px] text-zinc-500">
          <li>{e.configuration.source}</li>
          <li>{e.mass.source}</li>
          <li>{e.covalentRadius_pm.source}</li>
          <li>{CONSTANTS.name}: {CONSTANTS.url}</li>
          <li>Mathematics ported and corrected from kavan010/Atoms (atom_realtime.cpp, schrodinger.py).</li>
          <li>Offline HF: PySCF 2.15.1 (Apache-2.0), aug-cc-pVTZ, RHF/ROHF; commands and references in science/hf_export.py.</li>
        </ul>
      </div>
    </div>
  );
}
