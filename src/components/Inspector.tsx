import type { ElementRecord, Subshell } from "@/data/elements";
import { SOURCES } from "@/data/sources";
import { CONSTANTS } from "@/physics/constants";
import { MODELS, slaterZeff, type ModelId } from "@/physics/models";
import { coverageForZ } from "@/science/coverageMatrix";
import type { HFDataset, Selection } from "@/science/providers";
import { PROVIDERS, datatomsProvider, graspProvider, selectProvider } from "@/science/providers";
import { Badge, Row } from "./ui";

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
  const cov = coverageForZ(e.Z);
  const totalESel = selectProvider({ Z: e.Z, observable: "total-energy", accuracy: "quantitative" });

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
        <Row label="Ground term / J" hint={e.groundTerm.source}>
          <span className="font-mono text-zinc-100">{e.groundTerm.value ?? "unavailable"}</span>
          {e.groundJ ? ` (J=${e.groundJ})` : ""} <Badge kind={e.groundTerm.evidence}>{e.groundTerm.evidence}</Badge>
        </Row>
        <Row label="1st ionisation energy" hint={ie.source + (ie.note ? " — " + ie.note : "")}>
          {ie.value === null ? "unavailable" : `${ie.value.toFixed(3)}${e.ionizationUncertainty_eV !== null ? ` ± ${e.ionizationUncertainty_eV}` : ""} eV`}{" "}
          <Badge kind={ie.evidence}>{ie.evidence}</Badge>
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
        <Row label="Shell symmetry">{e.isOpenShell ? "open-shell (spherical average in full-atom)" : "closed-shell"}</Row>
        {sl && (
          <>
            <Row label="Slater screening S">{sl.screening.toFixed(2)}</Row>
            <Row label="Z_eff = Z − S">{sl.zeff.toFixed(3)} <Badge kind="estimate">estimate</Badge></Row>
            <Row label="n* (Slater)">{sl.nStar}{sub.n >= 7 ? " (extrapolated)" : ""}</Row>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Orbital / single-electron model</h3>
        <Row label="Model">{M.name}</Row>
        <p className="py-0.5 text-[11px] text-zinc-300">{M.hamiltonian}</p>
        <Row label="Kind"><Badge kind={M.kind === "exact analytical" ? "exact" : "estimate"}>{M.kind}</Badge></Row>
        <Row label="Relativistic">{M.relativistic}</Row>
        <Row label="Correlation">{M.correlation}</Row>
        <Row label="Nuclear model">{M.nuclearModel}</Row>
        <Row label="Engine / version">ATOMS TS core v0.6.1</Row>
        <Row label="Constants">{CONSTANTS.name}</Row>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Method selection (observable-dependent)</h3>
        <Row label="quantitative total ρ(r)">
          <span className="text-right">{providerSelection.result ? providerSelection.result.metadata.method : "no validated provider"}</span>
        </Row>
        <Row label="engine / version">
          {providerSelection.result ? `${providerSelection.result.metadata.name} (${providerSelection.result.metadata.version})` : "—"}
        </Row>
        {providerSelection.result && (
          <>
            <Row label="evidence class"><Badge kind={providerSelection.result.evidenceClass === "computed-and-validated" ? "evaluated" : "estimate"}>{providerSelection.result.evidenceClass}</Badge></Row>
            <Row label="relativistic">{providerSelection.result.metadata.relativistic}</Row>
            <Row label="nuclear model">{providerSelection.result.metadata.nuclearModel}</Row>
            <Row label="open-shell convention"><span className="text-right">{providerSelection.result.metadata.openShellConvention}</span></Row>
            <Row label="∫ρ dV (this scene)">{electrons === null ? "not sampled yet" : `${electrons.toFixed(4)} e / ${e.Z} e expected`}</Row>
          </>
        )}
        {hfDataset && (
          <div className="mt-1 rounded-sm border border-zinc-800 bg-zinc-900/50 p-1.5 text-[10px] text-zinc-400">
            <div className="font-semibold text-sky-300">Bundled PySCF {hfDataset.method}/{hfDataset.basis}</div>
            <div>E_HF = {hfDataset.energy_hartree.toFixed(8)} Ha · limit ref {hfDataset.reference.value_hartree.toFixed(8)} Ha (ΔE = {hfDataset.basisError_hartree.toExponential(3)} Ha)</div>
            <div>SCF converged in {hfDataset.scf.cycles} cycles (non-relativistic, no correlation).</div>
          </div>
        )}
        <div className="mt-1 space-y-0.5">
          {providerSelection.result?.validation.checks.map((c) => (
            <div key={c.name} className="flex items-start gap-1 text-[10px]">
              <span className={c.passed ? "text-emerald-400" : "text-red-400"}>{c.passed ? "✓" : "✗"}</span>
              <span className="text-zinc-400">{c.name}: <span className="text-zinc-300">{c.detail}</span></span>
            </div>
          ))}
        </div>
        {providerSelection.result?.metadata.limitations.map((l) => <p key={l} className="mt-0.5 text-[10px] text-zinc-500">• {l}</p>)}
        <p className="mt-1 text-[10px] text-zinc-500">
          Total HF energy: {totalESel.result ? "available (PySCF aug-cc-pVTZ)" : "unavailable for this Z"} · Fine structure / subshell R_nlj: unavailable.
        </p>
        <p className="mt-1 text-[10px] text-amber-300/80">
          External scope notes: {datatomsProvider.availability.blocker} {graspProvider.availability.blocker}
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">
          Providers registered: {PROVIDERS.map((p) => `${p.id}${p.availability.available ? "" : " (unavailable)"}`).join(", ")}.
        </p>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Element × Observable Coverage ({e.symbol})</h3>
        <div className="space-y-0.5 text-[10px]">
          <Row label="Configuration">{cov.configuration.method} <Badge kind={cov.configuration.status === "predicted" ? "predicted" : "evaluated"}>{cov.configuration.status}</Badge></Row>
          <Row label="Ground term">{cov.groundTerm.method} <Badge kind={cov.groundTerm.status === "not-available" ? "unavailable" : cov.groundTerm.status === "predicted" ? "predicted" : "evaluated"}>{cov.groundTerm.status}</Badge></Row>
          <Row label="Total ρ(r) (Dirac–Fock)">{cov.totalDensityDF.method} <Badge kind="evaluated">{cov.totalDensityDF.status}</Badge></Row>
          <Row label="Total ρ(r) (PySCF HF)">{cov.totalDensityHF.method} <Badge kind={cov.totalDensityHF.status === "not-available" ? "unavailable" : "evaluated"}>{cov.totalDensityHF.status}</Badge></Row>
          <Row label="Subshell orbitals">{cov.subshellOrbitals.method} <Badge kind={cov.subshellOrbitals.status === "approximate" ? "estimate" : "exact"}>{cov.subshellOrbitals.status}</Badge></Row>
          <Row label="Spin–orbit / MCDHF">{cov.relativisticTreatment.method} <Badge kind="unavailable">partial</Badge></Row>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Known limitations</h3>
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-zinc-400">
          {M.limitations.map((l) => <li key={l}>{l}</li>)}
          {e.Z > 1 && model === "hydrogenic-exact" && <li className="text-amber-300">You are viewing the one-electron ion {e.symbol}<sup>{e.Z - 1}+</sup>, not the neutral atom.</li>}
          {e.Z >= 50 && <li className="text-amber-300">Z ≥ 50: Slater subshell orbitals omit relativistic s/p contraction, d/f expansion, and spin–orbit splitting. Use Full-atom Dirac–Fock for relativistic total ρ(r).</li>}
          <li>Nucleus marker is not to scale (true nuclear radius ≈ 1.2·A^(1/3) fm ≈ 10⁻⁵ of a0).</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Data provenance</h3>
        <ul className="space-y-0.5 text-[10px] text-zinc-500">
          <li>{SOURCES.nistAsd.citation}</li>
          <li>{SOURCES.iupacCiaaw.citation}</li>
          <li>{SOURCES.cordero2008.citation}</li>
          <li>{SOURCES.lobato2026.citation}</li>
          <li>{SOURCES.pyscf2026.citation}</li>
          <li>{SOURCES.datatoms2026.citation}</li>
          <li>{CONSTANTS.name}: {CONSTANTS.url}</li>
        </ul>
      </div>
    </div>
  );
}
