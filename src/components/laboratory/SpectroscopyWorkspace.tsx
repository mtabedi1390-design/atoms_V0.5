import { useMemo } from "react";
import type { AtomicSystem } from "@/domain/atomic";
import { checkDiracCoulombDomain } from "@/physics/providers/dirac";
import {
  compareNonRelativisticAndDiracSpectra,
  type SpectralSeriesKind,
  type SpectrumMode,
} from "@/physics/spectroscopy";
import { NIST_HYDROGEN_LINES } from "@/data/references/nistHydrogen";
import type { LaboratoryConfig } from "@/app/useAtomsLaboratory";
import { Badge, Panel, Seg } from "@/components/ui";

interface Props {
  readonly system: AtomicSystem;
  readonly config: LaboratoryConfig;
  readonly onPatchConfig: (patch: Partial<LaboratoryConfig>) => void;
  readonly onRunSpectroscopyExperiment: (model: "schrodinger-coulomb" | "dirac-coulomb") => void;
}

export function SpectroscopyWorkspace({
  system,
  config,
  onPatchConfig,
  onRunSpectroscopyExperiment,
}: Props) {
  const eligible =
    system.N === 1 &&
    (system.nuclearModel.kind === "point-infinite-mass" || system.nuclearModel.kind === "point-finite-mass") &&
    checkDiracCoulombDomain(system.Z, -1).valid;

  const comparison = useMemo(() => {
    if (!eligible) return null;
    return compareNonRelativisticAndDiracSpectra(system, {
      mode: config.spectroscopyMode,
      series: config.spectroscopySeries,
      maxUpperN: config.spectroscopyMaxUpperN,
      minWavelength_nm: config.spectroscopyMinNm,
      maxWavelength_nm: config.spectroscopyMaxNm,
      quadratureIntervals: 1600,
    });
  }, [
    eligible,
    system,
    config.spectroscopyMode,
    config.spectroscopySeries,
    config.spectroscopyMaxUpperN,
    config.spectroscopyMinNm,
    config.spectroscopyMaxNm,
  ]);

  const activeSpectrum = comparison?.relativistic ?? null;
  const nrSpectrum = comparison?.nonrelativistic ?? null;

  // Compute SVG stick-spectrum coordinates
  const svgGeom = useMemo(() => {
    if (!activeSpectrum || activeSpectrum.lines.length === 0) return null;
    const allWaves = activeSpectrum.lines.map((l) => l.wavelength_nm);
    const minW = config.spectroscopyMinNm ?? Math.min(...allWaves) * 0.96;
    const maxW = config.spectroscopyMaxNm ?? Math.max(...allWaves) * 1.04;
    const span = Math.max(maxW - minW, 1e-3);
    const maxStrength = Math.max(...activeSpectrum.lines.map((l) => l.idealLineStrength), 1e-12);
    return { minW, maxW, span, maxStrength };
  }, [activeSpectrum, config.spectroscopyMinNm, config.spectroscopyMaxNm]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto bg-zinc-950 p-4 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-3">
        <Panel title="Spectroscopy Generator Controls">
          <div className="flex flex-col gap-2.5 text-xs">
            <div>
              <span className="mb-1 block text-[10px] uppercase text-zinc-500">Spectral Series</span>
              <Seg
                value={config.spectroscopySeries}
                onChange={(s) => onPatchConfig({ spectroscopySeries: s as SpectralSeriesKind })}
                options={[
                  { v: "lyman", label: "Lyman" },
                  { v: "balmer", label: "Balmer" },
                  { v: "paschen", label: "Paschen" },
                  { v: "custom", label: "Custom" },
                ]}
              />
            </div>

            <div>
              <span className="mb-1 block text-[10px] uppercase text-zinc-500">Spectrum Mode</span>
              <Seg
                value={config.spectroscopyMode}
                onChange={(m) => onPatchConfig({ spectroscopyMode: m as SpectrumMode })}
                options={[
                  { v: "emission", label: "Emission (Einstein A)" },
                  { v: "absorption", label: "Absorption (f_if)" },
                ]}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500">Max upper n</span>
                <input
                  type="number"
                  min={2}
                  max={7}
                  value={config.spectroscopyMaxUpperN}
                  onChange={(e) => onPatchConfig({ spectroscopyMaxUpperN: Math.max(2, Math.min(7, Number(e.target.value) || 5)) })}
                  className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500">Min λ (nm)</span>
                <input
                  type="number"
                  placeholder="auto"
                  value={config.spectroscopyMinNm ?? ""}
                  onChange={(e) => onPatchConfig({ spectroscopyMinNm: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500">Max λ (nm)</span>
                <input
                  type="number"
                  placeholder="auto"
                  value={config.spectroscopyMaxNm ?? ""}
                  onChange={(e) => onPatchConfig({ spectroscopyMaxNm: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-2 font-mono text-zinc-100"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-zinc-300">
              <input
                type="checkbox"
                checked={config.spectroscopyCompareModels}
                onChange={(e) => onPatchConfig({ spectroscopyCompareModels: e.target.checked })}
                className="accent-amber-400"
              />
              Overlay Nonrelativistic Schrödinger vs Dirac lines
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                data-testid="run-spec-exp"
                onClick={() => onRunSpectroscopyExperiment("dirac-coulomb")}
                className="flex-1 rounded-sm bg-amber-400 px-2.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
              >
                Save Dirac Spectrum Run
              </button>
              <button
                type="button"
                onClick={() => onRunSpectroscopyExperiment("schrodinger-coulomb")}
                className="rounded-sm border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Save NR Run
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Scientific Scope & Broadening Disclosure">
          <p className="text-[11px] leading-relaxed text-zinc-400">
            Every line is computed directly from ab initio one-electron radial &amp; spin-angular E1 transition matrix elements.
            Lines are <strong className="text-zinc-200">ideal discrete vacuum transitions</strong> (no natural Lorentzian, thermal Doppler, or collisional broadening, and no empirical Boltzmann/NLTE populations).
          </p>
          <p className="mt-1.5 text-[10px] text-zinc-500">
            NIST ¹H benchmark note: {NIST_HYDROGEN_LINES.provenanceNote}
          </p>
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <Panel title={`Calculated Vacuum Stick Spectrum — ${system.isotope.label}${system.q > 0 ? `${system.q}+` : ""} (${config.spectroscopySeries} · ${config.spectroscopyMode})`}>
          {!eligible || !activeSpectrum ? (
            <p className="text-xs text-amber-300">
              Hydrogen-like spectroscopy requires N = 1 and a point nucleus (currently N={system.N}, {system.nuclearModel.kind}).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge kind="exact">Dirac: {activeSpectrum.lines.length} lines</Badge>
                  {config.spectroscopyCompareModels && nrSpectrum && (
                    <Badge kind="evaluated">Schrödinger: {nrSpectrum.lines.length} lines</Badge>
                  )}
                </div>
                <span className="font-mono text-[10px] text-zinc-500">vacuum wavelengths (nm)</span>
              </div>

              {svgGeom ? (
                <svg viewBox="0 0 640 180" className="w-full rounded-sm border border-zinc-800 bg-black" role="img" aria-label="Calculated atomic stick spectrum">
                  {config.spectroscopyCompareModels &&
                    nrSpectrum?.lines.map((line) => {
                      const x = 36 + ((line.wavelength_nm - svgGeom.minW) / svgGeom.span) * 580;
                      const h = Math.max(8, (line.idealLineStrength / svgGeom.maxStrength) * 120);
                      return (
                        <line
                          key={line.id}
                          x1={x}
                          x2={x}
                          y1={150}
                          y2={150 - h}
                          stroke="#38bdf8"
                          strokeDasharray="3 2"
                          strokeWidth={1.5}
                          opacity={0.75}
                        />
                      );
                    })}
                  {activeSpectrum.lines.map((line) => {
                    const x = 36 + ((line.wavelength_nm - svgGeom.minW) / svgGeom.span) * 580;
                    const h = Math.max(8, (line.idealLineStrength / svgGeom.maxStrength) * 120);
                    return (
                      <line
                        key={line.id}
                        x1={x}
                        x2={x}
                        y1={150}
                        y2={150 - h}
                        stroke={config.spectroscopyMode === "emission" ? "#fbbf24" : "#fb7185"}
                        strokeWidth={1.5}
                      />
                    );
                  })}
                  <line x1={30} x2={620} y1={150} y2={150} stroke="#52525b" strokeWidth={1} />
                  <text x={36} y={168} fill="#a1a1aa" fontSize={10} fontFamily="monospace">{svgGeom.minW.toFixed(1)} nm</text>
                  <text x={555} y={168} fill="#a1a1aa" fontSize={10} fontFamily="monospace">{svgGeom.maxW.toFixed(1)} nm</text>
                  <text x={36} y={16} fill="#fbbf24" fontSize={9}>Solid: Dirac E1</text>
                  {config.spectroscopyCompareModels && <text x={140} y={16} fill="#38bdf8" fontSize={9}>Dashed: Schrödinger E1</text>}
                </svg>
              ) : (
                <p className="text-xs text-zinc-500">No transitions inside the specified wavelength filter.</p>
              )}

              {activeSpectrum.nistComparisons.length > 0 && (
                <div>
                  <h4 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                    NIST ¹H Vacuum Reference Comparison
                  </h4>
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left text-zinc-500">
                        <th className="py-1">Line</th>
                        <th className="py-1 text-right">NIST λ_vac (nm)</th>
                        <th className="py-1 text-right">Dirac λ_vac (nm)</th>
                        <th className="py-1 text-right">Δλ (nm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSpectrum.nistComparisons.map((c) => (
                        <tr key={c.referenceId} className="border-b border-zinc-900 text-zinc-200">
                          <td className="py-1">{c.referenceLabel}</td>
                          <td className="py-1 text-right tabular-nums">{c.nistVacuumWavelength_nm.toFixed(4)}</td>
                          <td className="py-1 text-right tabular-nums text-amber-300">
                            {c.calculatedWavelength_nm !== null ? c.calculatedWavelength_nm.toFixed(4) : "filtered"}
                          </td>
                          <td className="py-1 text-right tabular-nums text-emerald-300">
                            {c.deltaWavelength_nm !== null ? `${c.deltaWavelength_nm >= 0 ? "+" : ""}${c.deltaWavelength_nm.toFixed(5)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <h4 className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
                  Calculated Transition Lines ({activeSpectrum.lines.length})
                </h4>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full border-collapse font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left text-zinc-500">
                        <th className="py-1">Transition</th>
                        <th className="py-1 text-right">λ_vac (nm)</th>
                        <th className="py-1 text-right">ΔE (eV)</th>
                        <th className="py-1 text-right">f_osc</th>
                        <th className="py-1 text-right">A (s⁻¹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSpectrum.lines.map((l) => (
                        <tr key={l.id} className="border-b border-zinc-900 text-zinc-200">
                          <td className="py-1">{l.label}</td>
                          <td className="py-1 text-right tabular-nums text-amber-300">{l.wavelength_nm.toFixed(5)}</td>
                          <td className="py-1 text-right tabular-nums">{l.transitionEnergy_eV.toFixed(5)}</td>
                          <td className="py-1 text-right tabular-nums">{l.oscillatorStrength.toExponential(3)}</td>
                          <td className="py-1 text-right tabular-nums">{l.einsteinA_s1.toExponential(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
