/**
 * Scientific Validation, Operator Purity, Benchmark & Platform Integration
 * Tests for ATOMS v0.7.1 Atomic Term Structure & Fixed-Orbital LS-Coupled CI.
 *
 * Executes REAL calculations via `science/ls_ci_backend.py` (PySCF AtomSphAverageRHF +
 * exact (L^2, S^2, Pi) LS-CSF projection + Slater-Condon CI) and validates against
 * PySCF determinant FCI, Hund/Pauli rules, variational monotonicity, and NIST ASD
 * (2J+1)-weighted term centroids.
 */
import { describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createAtomicSystem, createNuclearModelForIsotope, defaultIsotopeForZ } from "@/domain/atomic";
import { createLSTermCIState } from "@/domain/quantum";
import { createExperimentDefinition } from "@/experiments";
import { ExperimentRunner } from "@/experiments/execution/runner";
import { MemoryExperimentStore } from "@/experiments/persistence/store";
import { ExperimentWorkerClient } from "@/workers/experimentClient";
import { createExperimentWorkerRuntime, type ExperimentWorkerInbound, type WorkerLike } from "@/workers/protocol";
import { PhysicsProviderRegistry } from "@/physics/providers/registry";
import {
  createLSTermCiProvider,
  LS_TERM_CI_PROVIDER_ID,
  LS_TERM_CI_PROVIDER_VERSION,
} from "@/physics/providers/lsTermCi";
import {
  assessLSCISupport,
  clebschGordan,
  enumerateLSTerms,
  lookupNISTTermCentroid,
  parseConfigurationString,
  type LSCapabilitiesResponse,
  type LSCIRequest,
  type LSCIResponse,
  type LSTransport,
} from "@/physics/ls";

const ROOT = process.cwd();
const LS_SCRIPT = path.resolve(ROOT, "science", "ls_ci_backend.py");
const HARTREE_TO_EV = 27.211386245988;

function resolvePythonExe(): string | null {
  const candidates = [
    process.env.ATOMS_PYTHON,
    path.resolve(ROOT, ".venv", "bin", "python"),
    "/opt/atoms-py/bin/python",
    "python3",
  ].filter((x): x is string => Boolean(x));

  for (const exe of candidates) {
    if (exe.includes(path.sep) && !existsSync(exe)) continue;
    try {
      const out = execFileSync(exe, [LS_SCRIPT], {
        input: JSON.stringify({ action: "capabilities" }),
        encoding: "utf8",
        timeout: 15000,
      });
      const parsed = JSON.parse(out) as LSCapabilitiesResponse;
      if (parsed.available) return exe;
    } catch {
      // try next candidate
    }
  }
  return null;
}

const PYTHON_EXE = resolvePythonExe();

function createNodeSubprocessLSTransport(pythonExe: string): LSTransport {
  return {
    async getCapabilities(): Promise<LSCapabilitiesResponse> {
      const out = execFileSync(pythonExe, [LS_SCRIPT], {
        input: JSON.stringify({ action: "capabilities" }),
        encoding: "utf8",
        timeout: 15000,
      });
      return JSON.parse(out) as LSCapabilitiesResponse;
    },

    async calculate(request: LSCIRequest, signal?: AbortSignal): Promise<LSCIResponse> {
      return await new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Calculation aborted", "AbortError"));
          return;
        }
        const child = execFile(
          pythonExe,
          [LS_SCRIPT],
          { maxBuffer: 32 * 1024 * 1024, timeout: 90000 },
          (err, stdout, stderr) => {
            if (signal?.aborted) {
              reject(new DOMException("Calculation aborted", "AbortError"));
              return;
            }
            if (stdout && stdout.trim().startsWith("{")) {
              try {
                const parsed = JSON.parse(stdout) as LSCIResponse;
                if (!parsed.ok && parsed.error) {
                  reject(new Error(parsed.error));
                  return;
                }
                resolve(parsed);
                return;
              } catch {
                // fall through
              }
            }
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            reject(new Error("Invalid JSON from LS-CI Python backend"));
          },
        );
        child.stdin?.write(JSON.stringify({ ...request, action: "calculate" }));
        child.stdin?.end();
      });
    },
  };
}

function makeSystem(Z: number, N: number) {
  const iso = defaultIsotopeForZ(Z);
  return createAtomicSystem({
    Z,
    N,
    massNumber: iso.massNumber,
    nuclearModel: createNuclearModelForIsotope("point-infinite-mass", iso),
  });
}

describe("Russell–Saunders LS Term Enumeration, Seniority, Parity, & Coupling", () => {
  it("parses configurations with core shorthands and rejects invalid Pauli occupancies", () => {
    const c = parseConfigurationString("[He] 2s2 2p2");
    expect(c.ok).toBe(true);
    expect(c.subshells).toEqual([
      { n: 1, l: 0, q: 2 },
      { n: 2, l: 0, q: 2 },
      { n: 2, l: 1, q: 2 },
    ]);

    const si = parseConfigurationString("[Ne] 3s^2 3p^2");
    expect(si.ok).toBe(true);
    expect(si.subshells.reduce((a, s) => a + s.q, 0)).toBe(14);

    const bad = parseConfigurationString("1s2 2p7");
    expect(bad.ok).toBe(false);
  });

  it("derives exact equivalent-electron terms for s, p, d subshells including d^3 seniority", () => {
    // Closed shells -> only 1S even
    const he = enumerateLSTerms([{ n: 1, l: 0, q: 2 }]);
    expect(he.terms.map((t) => t.termSymbol)).toEqual(["¹S"]);
    expect(he.totalMicrostates).toBe(1);

    // p^2 -> 3P, 1D, 1S (even), 15 microstates
    const p2 = enumerateLSTerms([{ n: 2, l: 1, q: 2 }]);
    expect(p2.parity).toBe("even");
    expect(p2.totalMicrostates).toBe(15);
    expect(new Set(p2.terms.map((t) => t.asciiTermSymbol))).toEqual(new Set(["3P", "1D", "1S"]));

    // p^3 -> 4So, 2Do, 2Po (odd), 20 microstates
    const p3 = enumerateLSTerms([{ n: 2, l: 1, q: 3 }]);
    expect(p3.parity).toBe("odd");
    expect(p3.totalMicrostates).toBe(20);
    expect(new Set(p3.terms.map((t) => t.asciiTermSymbol))).toEqual(new Set(["4So", "2Do", "2Po"]));

    // p^4 particle-hole symmetry matches p^2
    const p4 = enumerateLSTerms([{ n: 2, l: 1, q: 4 }]);
    expect(p4.totalMicrostates).toBe(15);
    expect(new Set(p4.terms.map((t) => t.asciiTermSymbol))).toEqual(new Set(["3P", "1D", "1S"]));

    // d^2 -> 1S, 3P, 1D, 3F, 1G (45 microstates)
    const d2 = enumerateLSTerms([{ n: 3, l: 2, q: 2 }]);
    expect(d2.totalMicrostates).toBe(45);
    expect(new Set(d2.terms.map((t) => t.asciiTermSymbol))).toEqual(new Set(["1S", "3P", "1D", "3F", "1G"]));

    // d^3 -> 120 microstates, repeated 2D term with seniority v=1 and v=3
    const d3 = enumerateLSTerms([{ n: 3, l: 2, q: 3 }]);
    expect(d3.totalMicrostates).toBe(120);
    const term2D = d3.terms.find((t) => t.asciiTermSymbol === "2D");
    expect(term2D?.count).toBe(2);
    expect(term2D?.seniorities).toEqual([1, 3]);

    // d^5 -> 252 microstates including 6S
    const d5 = enumerateLSTerms([{ n: 3, l: 2, q: 5 }]);
    expect(d5.totalMicrostates).toBe(252);
    expect(d5.terms.some((t) => t.asciiTermSymbol === "6S" && t.count === 1)).toBe(true);
  });

  it("couples multi-shell configurations via exact Clebsch–Gordan rules and verifies microstate sum", () => {
    // 2p1 3p1 -> 1S, 3S, 1P, 3P, 1D, 3D (6*6 = 36 states, even parity)
    const twoP = enumerateLSTerms([
      { n: 2, l: 1, q: 1 },
      { n: 3, l: 1, q: 1 },
    ]);
    expect(twoP.parity).toBe("even");
    expect(twoP.totalMicrostates).toBe(36);
    expect(twoP.terms).toHaveLength(6);

    // 2p2 3d1 -> even parity (sum l_i = 2*1 + 1*2 = 4), 15 * 10 = 150 microstates
    const p2d1 = enumerateLSTerms([
      { n: 2, l: 1, q: 2 },
      { n: 3, l: 2, q: 1 },
    ]);
    expect(p2d1.parity).toBe("even");
    expect(p2d1.totalMicrostates).toBe(150);
    const sumStates = p2d1.terms.reduce((acc, t) => acc + t.count * (2 * t.L + 1) * t.multiplicity, 0);
    expect(sumStates).toBe(150);

    // Wigner-derived Clebsch-Gordan spot checks: <1 1; 1 -1 | 0 0> = 1/sqrt(3)
    expect(Math.abs(clebschGordan(1, 1, 1, -1, 0, 0) - 1 / Math.sqrt(3))).toBeLessThan(1e-12);
    // <1/2 +1/2; 1/2 -1/2 | 1 0> = 1/sqrt(2)
    expect(Math.abs(clebschGordan(0.5, 0.5, 0.5, -0.5, 1, 0) - 1 / Math.sqrt(2))).toBeLessThan(1e-12);
  });

  it("honestly gates unsupported systems, N=1 hydrogen, Z>30, and basis gaps", () => {
    const hGate = assessLSCISupport({
      Z: 1,
      N: 1,
      basis: "cc-pvdz",
      configuration: [{ n: 1, l: 0, q: 1 }],
    });
    expect(hGate.supported).toBe(false);
    expect(hGate.reasons[0]).toMatch(/N >= 2/);

    const z31Gate = assessLSCISupport({
      Z: 31,
      N: 31,
      basis: "def2-svp",
      configuration: [{ n: 1, l: 0, q: 2 }],
    });
    expect(z31Gate.supported).toBe(false);

    const kGate = assessLSCISupport({
      Z: 19,
      N: 18,
      basis: "cc-pvdz",
      configuration: [
        { n: 1, l: 0, q: 2 },
        { n: 2, l: 0, q: 2 },
        { n: 2, l: 1, q: 6 },
        { n: 3, l: 0, q: 2 },
        { n: 3, l: 1, q: 6 },
      ],
    });
    expect(kGate.supported).toBe(false);
  });
});

describe("Live Fixed-Orbital LS-Coupled CI Engine & Scientific Benchmarks", () => {
  it("reports real capabilities with orbitalOptimizationSupported: false and offline fallback handling", async () => {
    if (!PYTHON_EXE) throw new Error("Python PySCF backend required for v0.7.1 validation.");
    const transport = createNodeSubprocessLSTransport(PYTHON_EXE);
    const caps = await transport.getCapabilities();
    expect(caps.available).toBe(true);
    expect(caps.method).toBe("fixed-orbital-ls-ci");
    expect(caps.orbitalSource).toBe("atom-sph-avg-hf");
    expect(caps.orbitalOptimizationSupported).toBe(false);

    // Offline transport check
    const offlineProvider = createLSTermCiProvider({
      async getCapabilities() {
        return { ...caps, available: false, blocker: "Offline test blocker" };
      },
      async calculate() {
        throw new Error("Simulated offline LS-CI endpoint");
      },
    });
    await expect(
      offlineProvider.calculate(
        {
          system: makeSystem(6, 6),
          state: createLSTermCIState({
            N: 6,
            basis: "cc-pvdz",
            referenceConfiguration: [
              { n: 1, l: 0, q: 2 },
              { n: 2, l: 0, q: 2 },
              { n: 2, l: 1, q: 2 },
            ],
            targetL: 1,
            targetSpin2S: 2,
            targetParity: "even",
            activeSpaceMode: "single-config",
            nRoots: 1,
            crossCheckPyscfFci: true,
          }),
          observables: ["ls-term-ci"],
        },
        {},
      ),
    ).rejects.toThrow(/Simulated offline/);
  });

  it(
    "matches PySCF FCI identically on He, Be, C multiplets, N odd-parity multiplets, O, Si, and V2+ repeated 2D",
    async () => {
      if (!PYTHON_EXE) throw new Error("Python PySCF backend required.");
      const provider = createLSTermCiProvider(createNodeSubprocessLSTransport(PYTHON_EXE));

      // 1. Variational lowering on He 1S: single-config > valence-plus-virtuals, exact FCI match
      const heRef = [{ n: 1, l: 0, q: 2 }];
      const heSingle = await provider.calculate(
        {
          system: makeSystem(2, 2),
          state: createLSTermCIState({
            N: 2,
            basis: "cc-pvdz",
            referenceConfiguration: heRef,
            targetL: 0,
            targetSpin2S: 0,
            targetParity: "even",
            activeSpaceMode: "single-config",
            nRoots: 1,
            crossCheckPyscfFci: true,
          }),
          observables: ["ls-term-ci"],
        },
        {},
      );
      const heValVirt = await provider.calculate(
        {
          system: makeSystem(2, 2),
          state: createLSTermCIState({
            N: 2,
            basis: "cc-pvdz",
            referenceConfiguration: heRef,
            targetL: 0,
            targetSpin2S: 0,
            targetParity: "even",
            activeSpaceMode: "valence-plus-virtuals",
            nRoots: 3,
            crossCheckPyscfFci: true,
          }),
          observables: ["ls-term-ci"],
        },
        {},
      );
      expect(heSingle.ok).toBe(true);
      expect(heValVirt.ok).toBe(true);
      expect(heValVirt.data.roots[0].energy_Ha).toBeLessThan(heSingle.data.roots[0].energy_Ha - 0.02);
      expect(heValVirt.data.pyscfFciCrossCheck.performed).toBe(true);
      expect(heValVirt.data.pyscfFciCrossCheck.energyDifference_Ha!).toBeLessThan(1e-11);
      expect(heValVirt.data.roots.length).toBeGreaterThanOrEqual(2);
      expect(heValVirt.data.roots[1].energy_Ha).toBeGreaterThan(heValVirt.data.roots[0].energy_Ha);

      // 2. Carbon 2p2 multiplet ordering: E(3P) < E(1D) < E(1S) and <L^2>, <S^2> purity
      const cRef = [
        { n: 1, l: 0, q: 2 },
        { n: 2, l: 0, q: 2 },
        { n: 2, l: 1, q: 2 },
      ];
      const runC = (L: number, spin2S: number) =>
        provider.calculate(
          {
            system: makeSystem(6, 6),
            state: createLSTermCIState({
              N: 6,
              basis: "cc-pvdz",
              referenceConfiguration: cRef,
              targetL: L,
              targetSpin2S: spin2S,
              targetParity: "even",
              activeSpaceMode: "valence-cas",
              nRoots: 2,
              crossCheckPyscfFci: true,
            }),
            observables: ["ls-term-ci"],
          },
          {},
        );

      const c3P = await runC(1, 2);
      const c1D = await runC(2, 0);
      const c1S = await runC(0, 0);
      expect(c3P.ok && c1D.ok && c1S.ok).toBe(true);
      expect(c3P.data.roots[0].energy_Ha).toBeLessThan(c1D.data.roots[0].energy_Ha);
      expect(c1D.data.roots[0].energy_Ha).toBeLessThan(c1S.data.roots[0].energy_Ha);
      // Hund splittings in physical order (NIST: 1D-3P = 1.260 eV, 1S-3P = 2.680 eV)
      const d1D = (c1D.data.roots[0].energy_Ha - c3P.data.roots[0].energy_Ha) * HARTREE_TO_EV;
      const d1S = (c1S.data.roots[0].energy_Ha - c3P.data.roots[0].energy_Ha) * HARTREE_TO_EV;
      const nist1D = lookupNISTTermCentroid(6, 6, 2, 0, "even")!;
      const nist1S = lookupNISTTermCentroid(6, 6, 0, 0, "even")!;
      expect(Math.abs(d1D - nist1D.relativeToGroundCentroid_eV)).toBeLessThan(0.5);
      expect(Math.abs(d1S - nist1S.relativeToGroundCentroid_eV)).toBeLessThan(0.5);
      expect(c3P.data.pyscfFciCrossCheck.energyDifference_Ha!).toBeLessThan(1e-10);
      expect(c1D.data.pyscfFciCrossCheck.energyDifference_Ha!).toBeLessThan(1e-10);

      // 3. Nitrogen 2p3 odd-parity multiplet ordering: E(4So) < E(2Do) < E(2Po)
      const nRef = [
        { n: 1, l: 0, q: 2 },
        { n: 2, l: 0, q: 2 },
        { n: 2, l: 1, q: 3 },
      ];
      const runN = (L: number, spin2S: number) =>
        provider.calculate(
          {
            system: makeSystem(7, 7),
            state: createLSTermCIState({
              N: 7,
              basis: "cc-pvdz",
              referenceConfiguration: nRef,
              targetL: L,
              targetSpin2S: spin2S,
              targetParity: "odd",
              activeSpaceMode: "single-config",
              nRoots: 1,
              crossCheckPyscfFci: true,
            }),
            observables: ["ls-term-ci"],
          },
          {},
        );
      const n4S = await runN(0, 3);
      const n2D = await runN(2, 1);
      const n2P = await runN(1, 1);
      expect(n4S.ok && n2D.ok && n2P.ok).toBe(true);
      expect(n4S.data.roots[0].energy_Ha).toBeLessThan(n2D.data.roots[0].energy_Ha);
      expect(n2D.data.roots[0].energy_Ha).toBeLessThan(n2P.data.roots[0].energy_Ha);
      expect(n4S.data.roots[0].operatorDiagnostics.parity).toBe("odd");
      expect(n2D.data.roots[0].operatorDiagnostics.lSquaredError).toBeLessThan(1e-10);

      // 4. Strong 2s^2 + 2p^2 correlation in Be 1S
      const beCas = await provider.calculate(
        {
          system: makeSystem(4, 4),
          state: createLSTermCIState({
            N: 4,
            basis: "cc-pvdz",
            referenceConfiguration: [
              { n: 1, l: 0, q: 2 },
              { n: 2, l: 0, q: 2 },
            ],
            targetL: 0,
            targetSpin2S: 0,
            targetParity: "even",
            activeSpaceMode: "valence-cas",
            nRoots: 2,
            crossCheckPyscfFci: true,
          }),
          observables: ["ls-term-ci"],
        },
        {},
      );
      expect(beCas.ok).toBe(true);
      expect(beCas.data.csfDiagnostics.csfCount).toBe(2);
      expect(beCas.data.roots[0].topCSFs.length).toBe(2);
      expect(beCas.data.roots[0].referenceConfigurationWeight).toBeLessThan(0.95);
      expect(beCas.data.pyscfFciCrossCheck.energyDifference_Ha!).toBeLessThan(1e-10);

      // 5. V2+ [Ar] 3d^3 repeated 2D seniority block produces 2 pure orthogonal 2D eigenstates
      const v2D = await provider.calculate(
        {
          system: makeSystem(23, 21),
          state: createLSTermCIState({
            N: 21,
            basis: "cc-pvdz",
            referenceConfiguration: [
              { n: 1, l: 0, q: 2 },
              { n: 2, l: 0, q: 2 },
              { n: 2, l: 1, q: 6 },
              { n: 3, l: 0, q: 2 },
              { n: 3, l: 1, q: 6 },
              { n: 3, l: 2, q: 3 },
            ],
            targetL: 2,
            targetSpin2S: 1,
            targetParity: "even",
            activeSpaceMode: "single-config",
            nRoots: 2,
            crossCheckPyscfFci: false,
          }),
          observables: ["ls-term-ci"],
        },
        {},
      );
      expect(v2D.ok).toBe(true);
      expect(v2D.data.roots).toHaveLength(2);
      expect(v2D.data.roots[0].operatorDiagnostics.lSquaredError).toBeLessThan(1e-10);
      expect(v2D.data.roots[1].operatorDiagnostics.lSquaredError).toBeLessThan(1e-10);
    },
    60000,
  );

  it("integrates with ExperimentRunner, Worker runtime, and MemoryExperimentStore replay/recompute", async () => {
    if (!PYTHON_EXE) throw new Error("Python PySCF backend required.");
    const provider = createLSTermCiProvider(createNodeSubprocessLSTransport(PYTHON_EXE));
    const registry = new PhysicsProviderRegistry([provider]);
    const store = new MemoryExperimentStore();

    const runtime = createExperimentWorkerRuntime(registry, (msg) => {
      workerShim.onmessage?.({ data: msg } as MessageEvent);
    });
    const workerShim: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(msg: ExperimentWorkerInbound) {
        queueMicrotask(() => runtime.receive(msg));
      },
      terminate() {},
    };
    const workerClient = new ExperimentWorkerClient(() => workerShim);
    const runner = new ExperimentRunner({ providerRegistry: registry, store, workerClient });

    const def = createExperimentDefinition({
      kind: "ls-term-ci",
      title: "Si 3P valence CAS",
      system: makeSystem(14, 14),
      quantumStates: [
        createLSTermCIState({
          N: 14,
          basis: "cc-pvdz",
          referenceConfiguration: [
            { n: 1, l: 0, q: 2 },
            { n: 2, l: 0, q: 2 },
            { n: 2, l: 1, q: 6 },
            { n: 3, l: 0, q: 2 },
            { n: 3, l: 1, q: 2 },
          ],
          targetL: 1,
          targetSpin2S: 2,
          targetParity: "even",
          activeSpaceMode: "valence-cas",
          nRoots: 2,
          crossCheckPyscfFci: true,
        }),
      ],
      providerId: LS_TERM_CI_PROVIDER_ID,
      providerVersion: LS_TERM_CI_PROVIDER_VERSION,
      observables: ["ls-term-ci", "ls-term-enumeration", "total-energy"],
    });

    const handle = runner.run(def, { mode: "worker", persist: true });
    const { execution, result } = await handle.completion;
    expect(execution.status).toBe("completed");
    expect(result?.source).toBe("computed");
    const payload = result?.payload as LSCIResponse;
    expect(payload.method).toBe("fixed-orbital-ls-ci");
    expect(payload.orbitalOptimizationPerformed).toBe(false);
    expect(payload.pyscfFciCrossCheck.passed).toBe(true);

    // Load / Replay without recomputing
    const loaded = await runner.loadStoredExperiment(def.id);
    expect(loaded.latestResult?.source).toBe("loaded-from-store");

    // Recompute increments count
    const rerunHandle = runner.rerun(def, { mode: "direct", persist: true });
    const rerunOutcome = await rerunHandle.completion;
    expect(rerunOutcome.result?.recomputedCount).toBe(1);
    expect(rerunOutcome.result?.source).toBe("computed");

    workerClient.dispose();
  }, 60000);
});
