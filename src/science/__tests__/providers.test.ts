import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  HF_ATOMS,
  PROVIDERS,
  datatomsProvider,
  graspProvider,
  hfDatasetFor,
  integrateDatasetElectrons,
  lobatoDFProvider,
  pyscfHFProvider,
  selectProvider,
  validateHFDataset,
} from "../providers";
import { COVERAGE_MATRIX, coverageForZ } from "../coverageMatrix";

const dir = join(process.cwd(), "src/data/hf");

describe("offline HF datasets (real PySCF output)", () => {
  it("bundles exactly the six computed benchmark atoms with the expected schema", () => {
    expect(HF_ATOMS).toEqual([1, 2, 6, 7, 8, 10]);
    for (const z of HF_ATOMS) {
      const d = hfDatasetFor(z)!;
      expect(d.schema).toBe("atoms.hf-radial.v1");
      expect(d.engine.name).toBe("PySCF");
      expect(d.engine.version).toMatch(/^2\./);
      expect(d.engine.license).toBe("Apache-2.0");
      expect(d.scf.converged).toBe(true);
      expect(d.density.rBohr.length).toBeGreaterThan(100);
      expect(d.density.rBohr.length).toBe(d.density.rhoElectronPerBohr3.length);
    }
  });
  it("rejects corrupted datasets instead of coercing them", () => {
    const d = hfDatasetFor(10)!;
    expect(() => validateHFDataset({ ...d, schema: "nope" })).toThrow();
    expect(() => validateHFDataset({ ...d, density: { ...d.density, rBohr: [...d.density.rBohr].reverse() } })).toThrow();
    expect(() => validateHFDataset({ ...d, density: { ...d.density, rhoElectronPerBohr3: d.density.rhoElectronPerBohr3.map((v, i) => (i === 0 ? -1 : v)) } })).toThrow();
    expect(() => validateHFDataset({ ...d, density: { ...d.density, integratedElectrons: 3 } })).toThrow();
  });
  it("independent integration of every dataset returns the correct electron count", () => {
    for (const z of HF_ATOMS) {
      const d = hfDatasetFor(z)!;
      expect(Math.abs(integrateDatasetElectrons(d) - z)).toBeLessThan(2e-3);
    }
  });
  it("HF energies sit below the variational limit tolerance and above/below HF-numerical limits within basis error", () => {
    for (const z of HF_ATOMS) {
      const d = hfDatasetFor(z)!;
      expect(Math.abs(d.energy_hartree - d.reference.value_hartree)).toBeLessThan(0.02);
      expect(d.energy_hartree).toBeGreaterThanOrEqual(d.reference.value_hartree - 2e-4);
      expect(d.basisError_hartree).toBeCloseTo(d.energy_hartree - d.reference.value_hartree, 10);
    }
  });
  it("provenance fields are present and limitations are explicit", () => {
    for (const z of HF_ATOMS) {
      const d = hfDatasetFor(z)!;
      expect(d.reference.source.length).toBeGreaterThan(20);
      expect(d.command).toContain("hf_export.py");
      expect(d.knownLimitations.join(" ")).toMatch(/correlation/);
      expect(d.hamiltonian).toMatch(/non-relativistic/);
    }
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.sort()).toEqual(["C.json", "H.json", "He.json", "N.json", "Ne.json", "O.json"]);
    const raw = JSON.parse(readFileSync(join(dir, "Ne.json"), "utf8"));
    expect(raw.atom.symbol).toBe("Ne");
  });
});

describe("provider selection policy (v0.5.0)", () => {
  it("selects Lobato 2026 Dirac-Fock for quantitative & relativistic total density across Z = 1..118", () => {
    for (const Z of [1, 6, 10, 26, 47, 64, 79, 92, 118]) {
      const sel = selectProvider({ Z, observable: "electron-density", accuracy: "quantitative" });
      expect(sel.provider.id).toBe("lobato2026-df");
      expect(sel.result?.evidenceClass).toBe("computed-and-validated");
      expect(sel.result?.densityTable).toBeDefined();
      expect(sel.result?.validation.passed).toBe(true);
      expect(Math.abs(sel.result!.densityTable!.integratedElectrons - Z) / Z).toBeLessThan(1e-3);
    }
    const rel = selectProvider({ Z: 79, observable: "relativistic-density", accuracy: "high" });
    expect(rel.provider.id).toBe("lobato2026-df");
    expect(rel.result?.metadata.relativistic).toMatch(/Dirac[-–]Fock/i);
  });

  it("keeps PySCF HF available for bundled benchmark atoms and unavailable elsewhere", () => {
    expect(pyscfHFProvider.supports({ Z: 10, observable: "electron-density", accuracy: "quantitative" })).toBe(true);
    const neHF = pyscfHFProvider.compute({ Z: 10, observable: "electron-density", accuracy: "quantitative" });
    expect(neHF?.dataset?.atom.symbol).toBe("Ne");
    expect(neHF?.evidenceClass).toBe("computed-basis-limited");

    expect(pyscfHFProvider.supports({ Z: 26, observable: "electron-density", accuracy: "quantitative" })).toBe(false);
    expect(pyscfHFProvider.compute({ Z: 26, observable: "electron-density", accuracy: "quantitative" })).toBeNull();
    expect(pyscfHFProvider.compute({ Z: 6, observable: "electron-density", accuracy: "quantitative" })?.metadata.method).toContain("ROHF");
  });

  it("uses total-energy only where HF is bundled and refuses fine-structure / ab-initio subshells", () => {
    const neE = selectProvider({ Z: 10, observable: "total-energy", accuracy: "quantitative" });
    expect(neE.provider.id).toBe("pyscf-hf");
    expect(neE.result?.dataset?.energy_hartree).toBeLessThan(-128);

    expect(selectProvider({ Z: 92, observable: "total-energy", accuracy: "high" }).result).toBeNull();
    expect(selectProvider({ Z: 55, observable: "fine-structure", accuracy: "high" }).result).toBeNull();
    expect(selectProvider({ Z: 79, observable: "subshell-orbitals-ab-initio", accuracy: "high" }).result).toBeNull();
  });

  it("Datatoms and GRASP/MCDHF are visibly scope-limited / unavailable with concrete blockers", () => {
    expect(datatomsProvider.availability.available).toBe(false);
    expect(datatomsProvider.availability.blocker).toMatch(/1 <= N <= 10/);
    expect(graspProvider.availability.available).toBe(false);
    expect(graspProvider.availability.blocker).toMatch(/GRASP2018 is not installed/);
    const sel = selectProvider({ Z: 55, observable: "fine-structure", accuracy: "high" });
    expect(sel.result).toBeNull();
    expect(sel.avoided.some((a) => a.id === "grasp-mcdhf" && /GRASP/.test(a.reason))).toBe(true);
    expect(sel.avoided.some((a) => a.id === "datatoms-2026-mcdf" && /1 <= N <= 10/.test(a.reason))).toBe(true);
  });

  it("registers all 5 providers in priority order", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual([
      "lobato2026-df",
      "pyscf-hf",
      "browser-slater",
      "datatoms-2026-mcdf",
      "grasp-mcdhf",
    ]);
    expect(lobatoDFProvider.availability.available).toBe(true);
  });
});

describe("118-element coverage matrix", () => {
  it("provides a complete row for every Z = 1..118 with honest statuses", () => {
    expect(COVERAGE_MATRIX).toHaveLength(118);
    expect(coverageForZ(1).subshellOrbitals.status).toBe("validated/computed");
    expect(coverageForZ(26).subshellOrbitals.status).toBe("approximate");
    expect(coverageForZ(10).totalDensityHF.status).toBe("validated/computed");
    expect(coverageForZ(26).totalDensityHF.status).toBe("not-available");
    expect(coverageForZ(104).ionizationEnergy.status).toBe("predicted");
    expect(coverageForZ(118).ionizationEnergy.status).toBe("not-available");
    expect(coverageForZ(118).totalDensityDF.status).toBe("validated/computed");
  });
});
