import { describe, expect, it } from "vitest";
import {
  createNonRelativisticState,
  createRelativisticState,
  formatQuantumStateLabel,
  jFromKappa,
  kappaFromLJ,
  lFromKappa,
  lSmallFromKappa,
  parityFromKappa,
  validateQuantumState,
} from "../quantum";

describe("QuantumState domain & Dirac quantum numbers (Phase 1)", () => {
  it("implements exact kappa <-> (l, j) bijection and parity", () => {
    const expected: [number, number, number, 1 | -1, number][] = [
      [-1, 0, 0.5, 1, 1],  // s_1/2: large l=0 (+ parity), small l'=1
      [1, 1, 0.5, -1, 0],  // p_1/2: large l=1 (- parity), small l'=0
      [-2, 1, 1.5, -1, 2], // p_3/2: large l=1 (- parity), small l'=2
      [2, 2, 1.5, 1, 1],   // d_3/2: large l=2 (+ parity), small l'=1
      [-3, 2, 2.5, 1, 3],  // d_5/2: large l=2 (+ parity), small l'=3
    ];
    for (const [kappa, l, j, parity, lSmall] of expected) {
      expect(lFromKappa(kappa)).toBe(l);
      expect(jFromKappa(kappa)).toBe(j);
      expect(parityFromKappa(kappa)).toBe(parity);
      expect(lSmallFromKappa(kappa)).toBe(lSmall);
      expect(kappaFromLJ(l, j)).toBe(kappa);
    }
    expect(() => kappaFromLJ(0, -0.5)).toThrow();
    expect(() => lFromKappa(0)).toThrow();
  });

  it("validates nonrelativistic (n, l, m_l, m_s) and relativistic (n, kappa, j, m_j) states strictly", () => {
    const nr = createNonRelativisticState({ n: 2, l: 1, m_l: -1, m_s: -0.5, basis: "complex" });
    expect(formatQuantumStateLabel(nr)).toContain("2p");
    expect(() => createNonRelativisticState({ n: 2, l: 2, m_l: 0 })).toThrow();
    expect(() => createNonRelativisticState({ n: 2, l: 1, m_l: 2 })).toThrow();

    const dirac2p32 = createRelativisticState({ n: 2, kappa: -2, m_j: 1.5 });
    expect(dirac2p32.j).toBe(1.5);
    expect(formatQuantumStateLabel(dirac2p32)).toContain("2p_3/2");

    // n=1, kappa=+1 corresponds to 1p_1/2 (l=1 >= n=1), which does NOT exist
    expect(() => createRelativisticState({ n: 1, kappa: 1, m_j: 0.5 })).toThrow();
    // Integer m_j or |m_j| > j invalid
    expect(() => createRelativisticState({ n: 2, kappa: -1, m_j: 0 })).toThrow();
    expect(() => createRelativisticState({ n: 2, kappa: -1, m_j: 1.5 })).toThrow();
    // j mismatch caught explicitly
    expect(validateQuantumState({ kind: "relativistic", n: 2, kappa: -2, j: 0.5, m_j: 0.5 }).valid).toBe(false);
  });

  it("validates superpositions and prevents mixing NR and relativistic basis terms", () => {
    const s1 = createNonRelativisticState({ n: 1, l: 0, m_l: 0, m_s: 0.5 });
    const s2 = createNonRelativisticState({ n: 2, l: 0, m_l: 0, m_s: 0.5 });
    const validSup = validateQuantumState({
      kind: "superposition",
      basisKind: "nonrelativistic",
      terms: [
        { state: s1, amplitude: { re: Math.SQRT1_2, im: 0 } },
        { state: s2, amplitude: { re: 0, im: Math.SQRT1_2 } },
      ],
    });
    expect(validSup.valid).toBe(true);
    expect(validSup.issues).toHaveLength(0);

    const dirac = createRelativisticState({ n: 1, kappa: -1, m_j: 0.5 });
    const mixed = validateQuantumState({
      kind: "superposition",
      basisKind: "nonrelativistic",
      terms: [{ state: dirac, amplitude: { re: 1, im: 0 } }],
    });
    expect(mixed.valid).toBe(false);
    expect(mixed.issues.some((i) => i.code === "MIXED_SUPERPOSITION_BASIS")).toBe(true);
  });
});
