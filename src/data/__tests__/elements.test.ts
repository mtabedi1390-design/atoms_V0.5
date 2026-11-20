import { describe, expect, it } from "vitest";
import { ELEMENTS, electronCount, elementByZ } from "../elements";
import { slaterZeff } from "@/physics/models";

describe("118-element database", () => {
  it("has exactly 118 elements with unique Z, symbol, name", () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(new Set(ELEMENTS.map((e) => e.Z)).size).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.name)).size).toBe(118);
    ELEMENTS.forEach((e, i) => expect(e.Z).toBe(i + 1));
  });
  it("neutral-atom electron count equals Z", () => {
    for (const e of ELEMENTS) expect(electronCount(e)).toBe(e.Z);
  });
  it("subshell occupancies respect Pauli capacity", () => {
    for (const e of ELEMENTS) for (const s of e.subshells) expect(s.occupancy).toBeLessThanOrEqual(2 * (2 * s.l + 1));
  });
  it("validated configuration exceptions", () => {
    expect(elementByZ(24).configuration.value).toBe("[Ar] 3d5 4s1");
    expect(elementByZ(29).configuration.value).toBe("[Ar] 3d10 4s1");
    expect(elementByZ(46).configuration.value).toBe("[Kr] 4d10");
    expect(elementByZ(57).configuration.value).toBe("[Xe] 5d1 6s2");
    expect(elementByZ(58).configuration.value).toBe("[Xe] 4f1 5d1 6s2");
    expect(elementByZ(64).configuration.value).toBe("[Xe] 4f7 5d1 6s2");
    expect(elementByZ(79).configuration.value).toBe("[Xe] 4f14 5d10 6s1");
    expect(elementByZ(92).configuration.value).toBe("[Rn] 5f3 6d1 7s2");
    expect(elementByZ(103).configuration.value).toBe("[Rn] 5f14 7s2 7p1");
    expect(elementByZ(1).configuration.value).toBe("1s1");
    expect(elementByZ(26).configuration.value).toBe("[Ar] 3d6 4s2");
    expect(elementByZ(118).configuration.value).toBe("[Rn] 5f14 6d10 7s2 7p6");
  });
  it("group/period/block metadata valid", () => {
    for (const e of ELEMENTS) {
      expect(e.period).toBeGreaterThanOrEqual(1);
      expect(e.period).toBeLessThanOrEqual(7);
      if (e.group !== null) { expect(e.group).toBeGreaterThanOrEqual(1); expect(e.group).toBeLessThanOrEqual(18); }
      expect(["s", "p", "d", "f"]).toContain(e.block);
    }
    expect(elementByZ(2).block).toBe("s");
    expect(elementByZ(26).block).toBe("d");
    expect(elementByZ(60).block).toBe("f");
    expect(elementByZ(16).block).toBe("p");
  });
  it("provenance: predicted vs evaluated; missing values are null + flagged", () => {
    for (const e of ELEMENTS) {
      expect(e.configuration.evidence).toBe(e.Z >= 104 ? "predicted" : "evaluated");
      if (e.ionizationEnergy_eV.value === null) expect(e.ionizationEnergy_eV.evidence).toBe("unavailable");
      else expect(e.ionizationEnergy_eV.value).toBeGreaterThan(3);
      expect(e.mass.source.length).toBeGreaterThan(10);
      expect(e.mass.value).toBeGreaterThan(0);
    }
    expect(elementByZ(1).ionizationEnergy_eV.value).toBeCloseTo(13.598, 3);
    expect(elementByZ(2).ionizationEnergy_eV.value).toBeCloseTo(24.587, 3);
    expect(elementByZ(118).ionizationEnergy_eV.value).toBeNull();
    expect(elementByZ(43).massKind).toBe("mass number of longest-lived isotope");
  });
});

describe("Slater's rules (textbook checks)", () => {
  it("N 2p: Z_eff = 3.90; Zn 4s: 4.35; Zn 3d: 8.85; K 4s: 2.20", () => {
    const n = elementByZ(7);
    expect(slaterZeff(n, n.subshells.find((s) => s.label === "2p")!).zeff).toBeCloseTo(3.9, 2);
    const zn = elementByZ(30);
    expect(slaterZeff(zn, zn.subshells.find((s) => s.label === "4s")!).zeff).toBeCloseTo(4.35, 2);
    expect(slaterZeff(zn, zn.subshells.find((s) => s.label === "3d")!).zeff).toBeCloseTo(8.85, 2);
    const k = elementByZ(19);
    expect(slaterZeff(k, k.subshells.find((s) => s.label === "4s")!).zeff).toBeCloseTo(2.2, 2);
    const h = elementByZ(1);
    expect(slaterZeff(h, h.subshells[0]).zeff).toBe(1);
  });
});
