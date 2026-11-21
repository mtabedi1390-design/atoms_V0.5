/**
 * Watertight Marching Tetrahedra 3D Isosurface Extractor & 2D Plane Slice Evaluator
 * for ATOMS v0.6.0 Phase 5.
 *
 * Pure numerical module (zero React, DOM, or Three.js dependencies).
 * Operates on exact Schrödinger and Dirac–Coulomb wavefunctions/spinors.
 */
import type { NonRelativisticState, RelativisticState } from "@/domain/quantum";
import { BOHR_PM } from "@/physics/hydrogenic";
import { evaluateSchrodingerState } from "@/physics/providers/schrodinger";
import { evaluateDiracSpinor } from "@/physics/providers/dirac";

export type FieldQuantity =
  | "density"
  | "wavefunction-signed"
  | "dirac-total-density"
  | "dirac-large-density"
  | "dirac-small-density";

export type SlicePlaneKind = "xy" | "xz" | "yz";

export interface IsosurfaceGridSpec {
  readonly resolution: number; // grid points per axis, e.g. 24..64
  readonly extentBohr: number; // half-width [-extentBohr, +extentBohr]
  readonly isoFraction: number; // fraction of max |field| in (0, 1)
  readonly quantity: FieldQuantity;
}

export interface IsosurfaceMeshBuffers {
  readonly positionsPm: Float32Array;
  readonly normals: Float32Array;
  readonly triangleCount: number;
  readonly isoValue: number;
  readonly fieldMin: number;
  readonly fieldMax: number;
  readonly polarity: "positive" | "negative" | "density";
}

export interface IsosurfaceExtractionResult {
  readonly meshes: readonly IsosurfaceMeshBuffers[];
  readonly extentBohr: number;
  readonly extentPm: number;
  readonly resolution: number;
  readonly fieldMax: number;
  readonly fieldMin: number;
}

export interface Slice2DResult {
  readonly plane: SlicePlaneKind;
  readonly offsetBohr: number;
  readonly extentBohr: number;
  readonly extentPm: number;
  readonly resolution: number;
  readonly values: Float32Array;
  readonly maxAbs: number;
  readonly minVal: number;
  readonly maxVal: number;
  readonly isSigned: boolean;
}

function cartesianToSpherical(x: number, y: number, z: number): { r: number; theta: number; phi: number } {
  const r = Math.hypot(x, y, z);
  if (r === 0) return { r: 0, theta: 0, phi: 0 };
  const theta = Math.acos(Math.max(-1, Math.min(1, z / r)));
  const phi = Math.atan2(y, x);
  return { r, theta, phi };
}

export function evaluateScalarFieldAt(
  state: NonRelativisticState | RelativisticState,
  Z: number,
  reducedMassRatio: number,
  quantity: FieldQuantity,
  xBohr: number,
  yBohr: number,
  zBohr: number,
): number {
  const { r, theta, phi } = cartesianToSpherical(xBohr, yBohr, zBohr);
  if (state.kind === "nonrelativistic") {
    const val = evaluateSchrodingerState(state, Z, reducedMassRatio, r, theta, phi);
    if (quantity === "wavefunction-signed") {
      return state.basis === "real" ? val.re : Math.hypot(val.re, val.im) * Math.sign(val.re || 1);
    }
    return val.density;
  }
  const sp = evaluateDiracSpinor(state, Z, reducedMassRatio, r, theta, phi);
  if (quantity === "dirac-large-density") return sp.largeDensity;
  if (quantity === "dirac-small-density") return sp.smallDensity;
  return sp.density;
}

/**
 * 6-tetrahedra decomposition of unit cube [0..7] corners with consistent main diagonal 0-7
 * (ensures watertight face-matching across adjacent cubes with zero ambiguous saddles).
 * Corner bit layout: bit 0 -> x (+1), bit 1 -> y (+2), bit 2 -> z (+4).
 */
const TETRA_VERTICES: readonly [number, number, number, number][] = [
  [0, 5, 1, 7],
  [0, 1, 3, 7],
  [0, 3, 2, 7],
  [0, 2, 6, 7],
  [0, 6, 4, 7],
  [0, 4, 5, 7],
];

const CORNER_OFFSET: readonly [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];

function extractSingleLevelSurface(
  field: Float32Array,
  N: number,
  extentBohr: number,
  isoLevel: number,
  polarity: "positive" | "negative" | "density",
): IsosurfaceMeshBuffers {
  const h = (2 * extentBohr) / (N - 1);
  const start = -extentBohr;
  const idx = (ix: number, iy: number, iz: number) => ix + N * (iy + N * iz);

  // Estimate surface normal via central finite difference on the scalar field grid
  const gradAt = (xBohr: number, yBohr: number, zBohr: number): [number, number, number] => {
    const gx = Math.max(0, Math.min(N - 1, Math.round((xBohr - start) / h)));
    const gy = Math.max(0, Math.min(N - 1, Math.round((yBohr - start) / h)));
    const gz = Math.max(0, Math.min(N - 1, Math.round((zBohr - start) / h)));
    const x0 = Math.max(0, gx - 1), x1 = Math.min(N - 1, gx + 1);
    const y0 = Math.max(0, gy - 1), y1 = Math.min(N - 1, gy + 1);
    const z0 = Math.max(0, gz - 1), z1 = Math.min(N - 1, gz + 1);
    const dx = field[idx(x1, gy, gz)] - field[idx(x0, gy, gz)];
    const dy = field[idx(gx, y1, gz)] - field[idx(gx, y0, gz)];
    const dz = field[idx(gx, gy, z1)] - field[idx(gx, gy, z0)];
    // Outward normal points down gradient for positive level, up gradient for negative level
    const sign = polarity === "negative" ? 1 : -1;
    const len = Math.hypot(dx, dy, dz) || 1;
    return [(sign * dx) / len, (sign * dy) / len, (sign * dz) / len];
  };

  const verts: number[] = [];
  const norms: number[] = [];

  const interp = (
    p1: [number, number, number],
    v1: number,
    p2: [number, number, number],
    v2: number,
  ): [number, number, number] => {
    const dv = v2 - v1;
    const t = Math.abs(dv) > 1e-30 ? (isoLevel - v1) / dv : 0.5;
    const tc = Math.max(0, Math.min(1, t));
    return [p1[0] + tc * (p2[0] - p1[0]), p1[1] + tc * (p2[1] - p1[1]), p1[2] + tc * (p2[2] - p1[2])];
  };

  const pushTri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    // Orient winding consistent with outward gradient normal
    const na = gradAt(a[0], a[1], a[2]);
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const flip = cx * na[0] + cy * na[1] + cz * na[2] < 0;

    const pB = flip ? c : b;
    const pC = flip ? b : c;
    const nb = gradAt(pB[0], pB[1], pB[2]);
    const nc = gradAt(pC[0], pC[1], pC[2]);

    verts.push(
      a[0] * BOHR_PM, a[1] * BOHR_PM, a[2] * BOHR_PM,
      pB[0] * BOHR_PM, pB[1] * BOHR_PM, pB[2] * BOHR_PM,
      pC[0] * BOHR_PM, pC[1] * BOHR_PM, pC[2] * BOHR_PM,
    );
    norms.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
  };

  const cPos: [number, number, number][] = new Array(8);
  const cVal = new Float64Array(8);

  for (let iz = 0; iz < N - 1; iz++) {
    for (let iy = 0; iy < N - 1; iy++) {
      for (let ix = 0; ix < N - 1; ix++) {
        for (let c = 0; c < 8; c++) {
          const [ox, oy, oz] = CORNER_OFFSET[c];
          const gx = ix + ox;
          const gy = iy + oy;
          const gz = iz + oz;
          cPos[c] = [start + gx * h, start + gy * h, start + gz * h];
          cVal[c] = field[idx(gx, gy, gz)];
        }

        for (const [i0, i1, i2, i3] of TETRA_VERTICES) {
          const idxs = [i0, i1, i2, i3];
          const inside: number[] = [];
          const outside: number[] = [];
          for (const k of idxs) {
            if (cVal[k] >= isoLevel) inside.push(k);
            else outside.push(k);
          }
          if (inside.length === 0 || inside.length === 4) continue;

          if (inside.length === 1 || inside.length === 3) {
            const single = inside.length === 1 ? inside[0] : outside[0];
            const trio = inside.length === 1 ? outside : inside;
            const p0 = interp(cPos[single], cVal[single], cPos[trio[0]], cVal[trio[0]]);
            const p1 = interp(cPos[single], cVal[single], cPos[trio[1]], cVal[trio[1]]);
            const p2 = interp(cPos[single], cVal[single], cPos[trio[2]], cVal[trio[2]]);
            pushTri(p0, p1, p2);
          } else {
            // 2 inside, 2 outside -> quad split into 2 triangles
            const [a, b] = inside;
            const [c, d] = outside;
            const p0 = interp(cPos[a], cVal[a], cPos[c], cVal[c]);
            const p1 = interp(cPos[a], cVal[a], cPos[d], cVal[d]);
            const p2 = interp(cPos[b], cVal[b], cPos[d], cVal[d]);
            const p3 = interp(cPos[b], cVal[b], cPos[c], cVal[c]);
            pushTri(p0, p1, p2);
            pushTri(p0, p2, p3);
          }
        }
      }
    }
  }

  let fieldMin = Infinity;
  let fieldMax = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < fieldMin) fieldMin = field[i];
    if (field[i] > fieldMax) fieldMax = field[i];
  }

  return {
    positionsPm: new Float32Array(verts),
    normals: new Float32Array(norms),
    triangleCount: verts.length / 9,
    isoValue: isoLevel,
    fieldMin,
    fieldMax,
    polarity,
  };
}

export function extractStateIsosurface(
  state: NonRelativisticState | RelativisticState,
  Z: number,
  reducedMassRatio: number,
  spec: IsosurfaceGridSpec,
): IsosurfaceExtractionResult {
  const N = Math.max(12, Math.min(72, Math.round(spec.resolution)));
  const field = new Float32Array(N * N * N);
  const start = -spec.extentBohr;
  const h = (2 * spec.extentBohr) / (N - 1);

  let fieldMin = Infinity;
  let fieldMax = -Infinity;
  let maxAbs = 0;

  let ptr = 0;
  for (let iz = 0; iz < N; iz++) {
    const z = start + iz * h;
    for (let iy = 0; iy < N; iy++) {
      const y = start + iy * h;
      for (let ix = 0; ix < N; ix++) {
        const x = start + ix * h;
        const v = evaluateScalarFieldAt(state, Z, reducedMassRatio, spec.quantity, x, y, z);
        field[ptr++] = v;
        if (v < fieldMin) fieldMin = v;
        if (v > fieldMax) fieldMax = v;
        const av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
    }
  }

  const frac = Math.max(0.005, Math.min(0.95, spec.isoFraction));
  const meshes: IsosurfaceMeshBuffers[] = [];

  if (spec.quantity === "wavefunction-signed" && state.kind === "nonrelativistic" && state.basis === "real") {
    const isoPos = maxAbs * frac;
    const isoNeg = -isoPos;
    if (fieldMax > isoPos) {
      meshes.push(extractSingleLevelSurface(field, N, spec.extentBohr, isoPos, "positive"));
    }
    if (fieldMin < isoNeg) {
      meshes.push(extractSingleLevelSurface(field, N, spec.extentBohr, isoNeg, "negative"));
    }
  } else {
    const iso = maxAbs * frac;
    if (maxAbs > 0) {
      meshes.push(extractSingleLevelSurface(field, N, spec.extentBohr, iso, "density"));
    }
  }

  return {
    meshes,
    extentBohr: spec.extentBohr,
    extentPm: spec.extentBohr * BOHR_PM,
    resolution: N,
    fieldMax,
    fieldMin,
  };
}

export function evaluate2DSlice(
  state: NonRelativisticState | RelativisticState,
  Z: number,
  reducedMassRatio: number,
  opts: {
    readonly plane: SlicePlaneKind;
    readonly offsetBohr: number;
    readonly extentBohr: number;
    readonly resolution: number;
    readonly quantity: FieldQuantity;
  },
): Slice2DResult {
  const N = Math.max(16, Math.min(256, Math.round(opts.resolution)));
  const values = new Float32Array(N * N);
  const start = -opts.extentBohr;
  const h = (2 * opts.extentBohr) / (N - 1);

  let minVal = Infinity;
  let maxVal = -Infinity;
  let maxAbs = 0;
  let ptr = 0;

  for (let j = 0; j < N; j++) {
    const b = start + j * h;
    for (let i = 0; i < N; i++) {
      const a = start + i * h;
      let x = 0, y = 0, z = 0;
      if (opts.plane === "xy") {
        x = a;
        y = b;
        z = opts.offsetBohr;
      } else if (opts.plane === "xz") {
        x = a;
        y = opts.offsetBohr;
        z = b;
      } else {
        x = opts.offsetBohr;
        y = a;
        z = b;
      }
      const v = evaluateScalarFieldAt(state, Z, reducedMassRatio, opts.quantity, x, y, z);
      values[ptr++] = v;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
      if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
  }

  return {
    plane: opts.plane,
    offsetBohr: opts.offsetBohr,
    extentBohr: opts.extentBohr,
    extentPm: opts.extentBohr * BOHR_PM,
    resolution: N,
    values,
    maxAbs,
    minVal,
    maxVal,
    isSigned: opts.quantity === "wavefunction-signed" && minVal < 0,
  };
}
