/**
 * Cross-implementation comparison: the C++ reference core (native/quantum_core.hpp)
 * against the TypeScript browser core, on a shared set of reference vectors.
 *
 * Run `cmake -S . -B build-core-Release -DCMAKE_BUILD_TYPE=Release && cmake --build build-core-Release`
 * first.  If the binary is absent the test is skipped (and says so) rather than silently
 * passing; it is not part of the browser bundle.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "path";
import { hydrogenicEnergy_eV, meanRadiusAnalytic, radialR, realHarmonic } from "../hydrogenic";
import { probabilityCurrentAnalytic } from "../current";

const candidates = ["build-core-Release/quantum_reference_dump", "build-core-Debug/quantum_reference_dump"].map((p) => join(process.cwd(), p));
const bin = candidates.find(existsSync);

describe.skipIf(!bin)("C++ ↔ TypeScript parity", () => {
  const lines = bin ? execFileSync(bin, { encoding: "utf8" }).trim().split("\n").filter((l) => l && !l.startsWith("#")) : [];
  const close = (a: number, b: number) => {
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
    expect(Math.abs(a - b) / scale).toBeLessThan(1e-9);
  };

  it("has reference vectors for all value families", () => {
    expect(lines.length).toBeGreaterThan(900);
    const kinds = new Set(lines.map((l) => l.split(",")[0]));
    for (const k of ["R", "RZ", "E", "mean", "Y", "J"]) expect(kinds.has(k)).toBe(true);
  });

  it("radial functions, energies and ⟨r⟩ agree", () => {
    let checked = 0;
    for (const line of lines) {
      const p = line.split(",");
      if (p[0] === "R" || p[0] === "RZ") {
        const [, n, l, r, Z, v] = p.map(Number);
        close(radialR(n, l, r, Z), v);
        checked++;
      } else if (p[0] === "E") {
        const [, n, Z, v] = p.map(Number);
        close(hydrogenicEnergy_eV(n, Z), v);
        checked++;
      } else if (p[0] === "mean") {
        const [, n, l, Z, v] = p.map(Number);
        close(meanRadiusAnalytic(n, l, Z), v);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("real harmonics agree", () => {
    for (const line of lines) {
      const p = line.split(",");
      if (p[0] !== "Y") continue;
      const [, l, m, th, ph, v] = p.map(Number);
      close(realHarmonic(l, m, th, ph), v);
    }
  });

  it("probability-current vectors agree (z-polar convention, complex basis)", () => {
    let checked = 0;
    for (const line of lines) {
      const p = line.split(",");
      if (p[0] !== "J") continue;
      const [, n, l, m, x, y, z, jx, jy, jz] = p.map(Number);
      const [ax, ay, az] = probabilityCurrentAnalytic({ n, l, m }, x, y, z, 1);
      close(ax, jx); close(ay, jy); close(az, jz);
      checked++;
    }
    expect(checked).toBeGreaterThan(90);
  });
});

describe("native parity test availability", () => {
  it("documents whether the reference binary was found", () => {
    // eslint-disable-next-line no-console
    console.info(bin ? `native parity: using ${bin}` : "native parity SKIPPED: build build-core-* first");
    expect(true).toBe(true);
  });
});
