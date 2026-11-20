import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { HF_ATOMS, PROVIDERS, graspProvider, hfDatasetFor, integrateDatasetElectrons, pyscfHFProvider, selectProvider, validateHFDataset } from "../providers";

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
      // variational: a finite-basis HF energy cannot be below the HF limit
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
    // every bundled file is validated at import time; re-read one to prove it is the same data
    const raw = JSON.parse(readFileSync(join(dir, "Ne.json"), "utf8"));
    expect(raw.atom.symbol).toBe("Ne");
  });
});

describe("provider selection policy", () => {
  it("selects PySCF HF for benchmark atoms at quantitative accuracy and validates it", () => {
    const sel = selectProvider({ Z: 10, observable: "electron-density", accuracy: "quantitative" });
    expect(sel.provider.id).toBe("pyscf-hf");
    expect(sel.result?.dataset?.atom.symbol).toBe("Ne");
    expect(sel.result?.validation.passed).toBe(true);
    expect(sel.result?.validation.checks.every((c) => c.passed)).toBe(true);
  });
  it("uses the browser Slater estimate for elements with no offline dataset", () => {
    const sel = selectProvider({ Z: 92, observable: "electron-density", accuracy: "quantitative" });
    expect(sel.provider.id).toBe("browser-slater");
    expect(sel.result).not.toBeNull();
    expect(sel.result?.dataset).toBeUndefined();
  });
  it("does not fabricate a heavy-atom total energy or fine structure", () => {
    expect(selectProvider({ Z: 92, observable: "total-energy", accuracy: "high" }).result).toBeNull();
    expect(selectProvider({ Z: 55, observable: "fine-structure", accuracy: "high" }).result).toBeNull();
  });
  it("GRASP/MCDHF is visibly unavailable with a concrete blocker, never silently substituted", () => {
    expect(graspProvider.availability.available).toBe(false);
    expect(graspProvider.availability.blocker).toMatch(/GRASP2018 is not installed/);
    expect(graspProvider.supports({ Z: 55, observable: "fine-structure", accuracy: "high" })).toBe(false);
    const sel = selectProvider({ Z: 55, observable: "fine-structure", accuracy: "high" });
    expect(sel.result).toBeNull();
    expect(sel.avoided.some((a) => a.id === "grasp-mcdhf" && /GRASP/.test(a.reason))).toBe(true);
  });
  it("registers all providers and marks PySCF available only where data exists", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(["pyscf-hf", "browser-slater", "grasp-mcdhf"]);
    expect(pyscfHFProvider.supports({ Z: 26, observable: "electron-density", accuracy: "quantitative" })).toBe(false);
    expect(pyscfHFProvider.supports({ Z: 6, observable: "electron-density", accuracy: "quantitative" })).toBe(true);
    expect(pyscfHFProvider.compute({ Z: 6, observable: "electron-density", accuracy: "quantitative" })?.metadata.method).toContain("ROHF");
    expect(pyscfHFProvider.compute({ Z: 26, observable: "electron-density", accuracy: "quantitative" })).toBeNull();
  });
});
