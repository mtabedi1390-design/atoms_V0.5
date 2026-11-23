/**
 * General Russell–Saunders LS Term Enumeration, Configuration Validation,
 * Parity Calculation, and Clebsch–Gordan / Wigner Coupling (ATOMS v0.7.1).
 *
 * Strictly zero hardcoded term-lookup tables: every term list is derived
 * mathematically from antisymmetric Slater microstate weight-peeling inside
 * each equivalent subshell, seniority recursion, and exact vector addition
 * across non-equivalent open subshells.
 *
 * Reuses `wigner3j` from `@/numerics/specialFunctions/wigner`.
 * Zero dependencies on React, Three.js, DOM, or Node-only built-ins.
 */
import { wigner3j } from "@/numerics/specialFunctions/wigner";
import { validationFromIssues, type ValidationIssue, type ValidationResult } from "@/domain/validation";
import { SUBSHELL_LETTERS } from "@/physics/hydrogenic";
import type {
  ConfigurationAnalysis,
  ConfigurationParity,
  LSTermCandidate,
  SubshellOccupancySpec,
} from "./types";

export const L_SPECTROSCOPIC_LETTERS = "SPDFGHIKLMNOQRTUVWXYZ";

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

const SUPERSCRIPT_TO_ASCII: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

const CORE_SHORTHANDS: Readonly<Record<string, readonly SubshellOccupancySpec[]>> = {
  "[He]": [{ n: 1, l: 0, q: 2 }],
  "[Ne]": [
    { n: 1, l: 0, q: 2 },
    { n: 2, l: 0, q: 2 },
    { n: 2, l: 1, q: 6 },
  ],
  "[Ar]": [
    { n: 1, l: 0, q: 2 },
    { n: 2, l: 0, q: 2 },
    { n: 2, l: 1, q: 6 },
    { n: 3, l: 0, q: 2 },
    { n: 3, l: 1, q: 6 },
  ],
};

function toSup(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUPERSCRIPT_DIGITS[c] ?? c)
    .join("");
}

export function lToSpectroscopicLetter(L: number): string {
  if (!Number.isInteger(L) || L < 0) {
    throw new RangeError(`Total orbital angular momentum L must be a non-negative integer (got ${L}).`);
  }
  return L_SPECTROSCOPIC_LETTERS[L] ?? `[L=${L}]`;
}

export function subshellCapacity(l: number): number {
  return 2 * (2 * l + 1);
}

export function computeConfigurationParity(subshells: readonly SubshellOccupancySpec[]): {
  readonly parity: ConfigurationParity;
  readonly parityValue: 1 | -1;
} {
  let sumQL = 0;
  for (const s of subshells) {
    sumQL += s.q * s.l;
  }
  const odd = Math.abs(sumQL) % 2 === 1;
  return {
    parity: odd ? "odd" : "even",
    parityValue: odd ? -1 : 1,
  };
}

export function formatTermSymbol(
  spin2S: number,
  L: number,
  parity: ConfigurationParity,
  ascii = false,
): string {
  const mult = spin2S + 1;
  const letter = lToSpectroscopicLetter(L);
  if (ascii) {
    return `${mult}${letter}${parity === "odd" ? "o" : ""}`;
  }
  return `${toSup(mult)}${letter}${parity === "odd" ? "°" : ""}`;
}

export function allowedJForTerm(L: number, S: number): readonly number[] {
  const twoL = Math.round(2 * L);
  const twoS = Math.round(2 * S);
  const twoMin = Math.abs(twoL - twoS);
  const twoMax = twoL + twoS;
  const out: number[] = [];
  for (let tj = twoMin; tj <= twoMax; tj += 2) {
    out.push(tj / 2);
  }
  return out;
}

export function formatJValue(j: number): string {
  const twoJ = Math.round(2 * j);
  return twoJ % 2 === 0 ? String(twoJ / 2) : `${twoJ}/2`;
}

/**
 * Exact Clebsch–Gordan coefficient <j1 m1; j2 m2 | J M> computed directly via
 * ATOMS's validated Wigner 3-j routine (`src/numerics/specialFunctions/wigner.ts`):
 *   <j1 m1; j2 m2 | J M> = (-1)^(j1 - j2 + M) sqrt(2J + 1) * ( j1  j2  J )
 *                                                             ( m1  m2 -M )
 */
export function clebschGordan(
  j1: number,
  m1: number,
  j2: number,
  m2: number,
  J: number,
  M: number,
): number {
  const w = wigner3j(j1, j2, J, m1, m2, -M);
  if (w === 0) return 0;
  const exp = Math.round(j1 - j2 + M);
  const sign = ((exp % 2) + 2) % 2 === 0 ? 1 : -1;
  return sign * Math.sqrt(2 * J + 1) * w;
}

export function normalizeConfigurationSpec(
  subshells: readonly SubshellOccupancySpec[],
): readonly SubshellOccupancySpec[] {
  return subshells
    .filter((s) => s.q > 0)
    .map((s) => ({ n: s.n, l: s.l, q: s.q }))
    .sort((a, b) => a.n - b.n || a.l - b.l);
}

export function formatConfigurationSpec(
  subshells: readonly SubshellOccupancySpec[],
  ascii = false,
): string {
  const norm = normalizeConfigurationSpec(subshells);
  return norm
    .map((s) => {
      const letter = SUBSHELL_LETTERS[s.l] ?? `[l=${s.l}]`;
      return ascii ? `${s.n}${letter}${s.q}` : `${s.n}${letter}${toSup(s.q)}`;
    })
    .join(" ");
}

export function parseConfigurationString(raw: string): {
  readonly ok: boolean;
  readonly subshells: readonly SubshellOccupancySpec[];
  readonly error?: string;
} {
  let normalized = raw.trim();
  if (!normalized) {
    return { ok: false, subshells: [], error: "Configuration string is empty." };
  }
  // Convert superscript digits back to ASCII
  normalized = normalized.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => SUPERSCRIPT_TO_ASCII[ch] ?? ch);
  // Replace separators `.` or `,` with spaces
  normalized = normalized.replace(/[.,;]+/g, " ");

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const acc = new Map<string, SubshellOccupancySpec>();

  for (const tok of tokens) {
    const core = CORE_SHORTHANDS[tok];
    if (core) {
      for (const s of core) {
        const key = `${s.n}:${s.l}`;
        if (acc.has(key)) {
          return { ok: false, subshells: [], error: `Duplicate subshell ${s.n}${SUBSHELL_LETTERS[s.l]} from core shorthand ${tok}.` };
        }
        acc.set(key, s);
      }
      continue;
    }

    const m = /^(\d+)([spdfghiklmnopqrtuvwxyz])\^?(\d+)?$/i.exec(tok);
    if (!m) {
      return {
        ok: false,
        subshells: [],
        error: `Cannot parse subshell token "${tok}". Expected format like 1s2, 2p2, 3d^5, or [He] 2s2 2p2.`,
      };
    }
    const n = Number.parseInt(m[1], 10);
    const lChar = m[2].toLowerCase();
    const l = (SUBSHELL_LETTERS as readonly string[]).indexOf(lChar);
    const q = m[3] !== undefined ? Number.parseInt(m[3], 10) : 1;
    if (l < 0) {
      return { ok: false, subshells: [], error: `Unsupported subshell letter "${m[2]}" in "${tok}".` };
    }
    const key = `${n}:${l}`;
    if (acc.has(key)) {
      return { ok: false, subshells: [], error: `Duplicate subshell "${n}${lChar}" in configuration.` };
    }
    acc.set(key, { n, l, q });
  }

  const subshells = [...acc.values()].sort((a, b) => a.n - b.n || a.l - b.l);
  const val = validateConfigurationSpec(subshells);
  if (!val.valid) {
    return {
      ok: false,
      subshells,
      error: val.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "),
    };
  }
  return { ok: true, subshells };
}

export function validateConfigurationSpec(
  subshells: readonly SubshellOccupancySpec[],
  expectedElectrons?: number,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  let totalQ = 0;

  if (subshells.length === 0) {
    issues.push({
      severity: "error",
      code: "LS_EMPTY_CONFIGURATION",
      field: "subshells",
      message: "Configuration must contain at least one occupied subshell.",
    });
  }

  for (let i = 0; i < subshells.length; i++) {
    const s = subshells[i];
    const key = `${s.n}:${s.l}`;
    if (seen.has(key)) {
      issues.push({
        severity: "error",
        code: "LS_DUPLICATE_SUBSHELL",
        field: `subshells[${i}]`,
        message: `Duplicate subshell (n=${s.n}, l=${s.l}).`,
      });
    }
    seen.add(key);

    if (!Number.isInteger(s.n) || s.n < 1 || s.n > 12) {
      issues.push({
        severity: "error",
        code: "LS_INVALID_N",
        field: `subshells[${i}].n`,
        message: `Principal quantum number n must be an integer in 1..12 (got ${s.n}).`,
      });
    }
    if (!Number.isInteger(s.l) || s.l < 0 || s.l >= s.n || s.l > 6) {
      issues.push({
        severity: "error",
        code: "LS_INVALID_L",
        field: `subshells[${i}].l`,
        message: `Subshell orbital angular momentum l=${s.l} must satisfy 0 <= l < n and l <= 6 (got n=${s.n}).`,
      });
    }
    const cap = subshellCapacity(Math.max(0, s.l));
    if (!Number.isInteger(s.q) || s.q < 0 || s.q > cap) {
      issues.push({
        severity: "error",
        code: "LS_INVALID_OCCUPANCY",
        field: `subshells[${i}].q`,
        message: `Subshell ${s.n}${SUBSHELL_LETTERS[s.l] ?? `l${s.l}`} occupancy q=${s.q} exceeds Pauli limit 0..${cap}.`,
      });
    }
    totalQ += s.q;
  }

  if (totalQ <= 0) {
    issues.push({
      severity: "error",
      code: "LS_ZERO_ELECTRONS",
      field: "subshells",
      message: "Configuration must have at least 1 electron.",
    });
  }

  if (expectedElectrons !== undefined && totalQ !== expectedElectrons) {
    issues.push({
      severity: "error",
      code: "LS_ELECTRON_COUNT_MISMATCH",
      field: "subshells",
      message: `Configuration occupies ${totalQ} electrons, expected N=${expectedElectrons}.`,
    });
  }

  return validationFromIssues(issues);
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= kk; i++) {
    res = (res * (n - kk + i)) / i;
  }
  return Math.round(res);
}

interface RawEquivalentTerm {
  readonly L: number;
  readonly spin2S: number;
  readonly count: number;
}

/**
 * Exact antisymmetric Slater-determinant (M_L, 2M_S) weight counting +
 * rectangular weight peeling for q equivalent electrons in subshell l.
 */
function equivalentSubshellTermsRaw(l: number, qInput: number): readonly RawEquivalentTerm[] {
  const cap = 2 * (2 * l + 1);
  if (qInput < 0 || qInput > cap) {
    throw new RangeError(`Occupancy q=${qInput} invalid for subshell l=${l} (capacity ${cap}).`);
  }
  if (qInput === 0 || qInput === cap) {
    return [{ L: 0, spin2S: 0, count: 1 }];
  }
  // Particle-hole symmetry preserves exact (L, S) term content & counts
  const q = Math.min(qInput, cap - qInput);
  if (q === 1) {
    return [{ L: l, spin2S: 1, count: 1 }];
  }

  // Dynamic programming over the K = 2*(2l+1) spin-orbitals (m_l, m_s)
  // dp[k] maps packed (ml, twoMs) -> determinant count
  const dp: Map<string, number>[] = Array.from({ length: q + 1 }, () => new Map<string, number>());
  dp[0].set("0,0", 1);

  for (let ml = -l; ml <= l; ml++) {
    for (const twoMs of [-1, 1]) {
      for (let k = q - 1; k >= 0; k--) {
        const src = dp[k];
        if (src.size === 0) continue;
        const dst = dp[k + 1];
        for (const [key, cnt] of src.entries()) {
          const comma = key.indexOf(",");
          const curMl = Number.parseInt(key.slice(0, comma), 10);
          const curS = Number.parseInt(key.slice(comma + 1), 10);
          const nextKey = `${curMl + ml},${curS + twoMs}`;
          dst.set(nextKey, (dst.get(nextKey) ?? 0) + cnt);
        }
      }
    }
  }

  const hist = new Map<string, number>(dp[q]);
  const expectedMicrostates = binomial(cap, q);
  let histTotal = 0;
  for (const cnt of hist.values()) histTotal += cnt;
  if (histTotal !== expectedMicrostates) {
    throw new Error(`Microstate DP mismatch for l=${l}, q=${q}: got ${histTotal}, expected ${expectedMicrostates}.`);
  }

  const results: RawEquivalentTerm[] = [];
  while (true) {
    let bestS = -1;
    let bestMl = -1;
    let bestCount = 0;
    for (const [key, cnt] of hist.entries()) {
      if (cnt <= 0) continue;
      const comma = key.indexOf(",");
      const ml = Number.parseInt(key.slice(0, comma), 10);
      const twoMs = Number.parseInt(key.slice(comma + 1), 10);
      if (twoMs > bestS || (twoMs === bestS && ml > bestMl)) {
        bestS = twoMs;
        bestMl = ml;
        bestCount = cnt;
      }
    }
    if (bestCount === 0) break;
    if (bestS < 0 || bestMl < 0) {
      throw new Error(`Invalid residual negative weight (M_L=${bestMl}, 2M_S=${bestS}) during term peeling.`);
    }

    const L = bestMl;
    const spin2S = bestS;
    results.push({ L, spin2S, count: bestCount });

    for (let m = -L; m <= L; m++) {
      for (let s2 = -spin2S; s2 <= spin2S; s2 += 2) {
        const k = `${m},${s2}`;
        const updated = (hist.get(k) ?? 0) - bestCount;
        if (updated < 0) {
          throw new Error(`Negative weight encountered peeling (${spin2S + 1}${lToSpectroscopicLetter(L)}) at (${m},${s2}).`);
        }
        if (updated === 0) {
          hist.delete(k);
        } else {
          hist.set(k, updated);
        }
      }
    }
  }

  // Verify exact microstate completeness
  const sumDims = results.reduce((acc, t) => acc + t.count * (2 * t.L + 1) * (t.spin2S + 1), 0);
  if (sumDims !== expectedMicrostates) {
    throw new Error(`Term dimension check failed for l=${l}, q=${q}: ${sumDims} != ${expectedMicrostates}.`);
  }

  return results;
}

interface EquivalentTermWithSeniority extends RawEquivalentTerm {
  readonly seniorities: readonly number[];
}

function equivalentSubshellTermsWithSeniority(l: number, qInput: number): readonly EquivalentTermWithSeniority[] {
  const cap = 2 * (2 * l + 1);
  const qEff = Math.min(qInput, cap - qInput);
  if (qEff === 0) {
    return [{ L: 0, spin2S: 0, count: 1, seniorities: [0] }];
  }

  // Recursively peel seniority v from qEff, qEff-2, ... down to qEff % 2
  const chain: { q: number; terms: readonly RawEquivalentTerm[] }[] = [];
  for (let qq = qEff % 2; qq <= qEff; qq += 2) {
    chain.push({ q: qq, terms: equivalentSubshellTermsRaw(l, qq) });
  }

  const seniorityMap = new Map<string, number[]>();
  const prevCounts = new Map<string, number>();

  for (const step of chain) {
    for (const t of step.terms) {
      const key = `${t.L},${t.spin2S}`;
      const prev = prevCounts.get(key) ?? 0;
      const added = t.count - prev;
      if (added > 0) {
        const list = seniorityMap.get(key) ?? [];
        for (let i = 0; i < added; i++) {
          list.push(step.q);
        }
        seniorityMap.set(key, list);
      }
      prevCounts.set(key, t.count);
    }
  }

  const top = chain[chain.length - 1].terms;
  return top.map((t) => ({
    ...t,
    seniorities: seniorityMap.get(`${t.L},${t.spin2S}`) ?? [qEff],
  }));
}

interface IntermediateCoupledTerm {
  readonly L: number;
  readonly spin2S: number;
  readonly count: number;
  readonly seniorities: readonly number[];
  readonly parentages: readonly string[];
}

function formatSubshellShort(s: SubshellOccupancySpec): string {
  return `${s.n}${SUBSHELL_LETTERS[s.l] ?? `l${s.l}`}${toSup(s.q)}`;
}

/**
 * Enumerates all Russell–Saunders LS terms for an explicit electronic configuration.
 */
export function enumerateLSTerms(subshells: readonly SubshellOccupancySpec[]): ConfigurationAnalysis {
  const val = validateConfigurationSpec(subshells);
  if (!val.valid) {
    throw new Error(val.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
  }

  const norm = normalizeConfigurationSpec(subshells);
  const totalElectrons = norm.reduce((acc, s) => acc + s.q, 0);
  const { parity, parityValue } = computeConfigurationParity(norm);

  const openShells = norm.filter((s) => s.q > 0 && s.q < subshellCapacity(s.l));
  const totalMicrostates = norm.reduce((acc, s) => acc * binomial(subshellCapacity(s.l), s.q), 1);

  let coupled: IntermediateCoupledTerm[] = [];

  if (openShells.length === 0) {
    coupled = [
      {
        L: 0,
        spin2S: 0,
        count: 1,
        seniorities: [0],
        parentages: [`Closed shells (${formatConfigurationSpec(norm)}) -> ¹S`],
      },
    ];
  } else {
    const first = openShells[0];
    const firstTerms = equivalentSubshellTermsWithSeniority(first.l, first.q);
    const firstParity: ConfigurationParity = (first.q * first.l) % 2 === 1 ? "odd" : "even";
    const firstLabel = formatSubshellShort(first);

    coupled = firstTerms.map((t) => {
      const sym = formatTermSymbol(t.spin2S, t.L, firstParity);
      const senNotes = t.seniorities.map((v) =>
        openShells.length === 1 && first.l >= 2
          ? `${firstLabel} (${sym}, v=${v})`
          : `${firstLabel} (${sym}${t.seniorities.length > 1 ? `, v=${v}` : ""})`,
      );
      return {
        L: t.L,
        spin2S: t.spin2S,
        count: t.count,
        seniorities: t.seniorities,
        parentages: senNotes,
      };
    });

    let runningParitySum = (first.q * first.l) % 2;

    for (let idx = 1; idx < openShells.length; idx++) {
      const sh = openShells[idx];
      const shTerms = equivalentSubshellTermsWithSeniority(sh.l, sh.q);
      const shParity: ConfigurationParity = (sh.q * sh.l) % 2 === 1 ? "odd" : "even";
      const shLabel = formatSubshellShort(sh);
      runningParitySum = (runningParitySum + sh.q * sh.l) % 2;
      const outParity: ConfigurationParity = runningParitySum === 1 ? "odd" : "even";

      const nextMap = new Map<
        string,
        { L: number; spin2S: number; count: number; seniorities: number[]; parentages: string[] }
      >();

      for (const left of coupled) {
        for (const right of shTerms) {
          const rightSym = formatTermSymbol(right.spin2S, right.L, shParity);
          const Lmin = Math.abs(left.L - right.L);
          const Lmax = left.L + right.L;
          const twoSmin = Math.abs(left.spin2S - right.spin2S);
          const twoSmax = left.spin2S + right.spin2S;

          const combinedCount = left.count * right.count;
          for (let L = Lmin; L <= Lmax; L++) {
            for (let twoS = twoSmin; twoS <= twoSmax; twoS += 2) {
              const outSym = formatTermSymbol(twoS, L, outParity);
              const key = `${twoS},${L}`;
              let entry = nextMap.get(key);
              if (!entry) {
                entry = { L, spin2S: twoS, count: 0, seniorities: [], parentages: [] };
                nextMap.set(key, entry);
              }
              entry.count += combinedCount;
              for (const lp of left.parentages) {
                for (const vR of right.seniorities) {
                  const rPart = right.seniorities.length > 1 ? `${shLabel} (${rightSym}, v=${vR})` : `${shLabel} (${rightSym})`;
                  entry.parentages.push(`(${lp}) ⊗ ${rPart} → ${outSym}`);
                }
              }
              for (const vR of right.seniorities) {
                entry.seniorities.push(vR);
              }
            }
          }
        }
      }
      coupled = [...nextMap.values()];
    }
  }

  // Verify exact total microstate invariant
  const coupledMicrostates = coupled.reduce((acc, t) => acc + t.count * (2 * t.L + 1) * (t.spin2S + 1), 0);
  if (coupledMicrostates !== totalMicrostates) {
    throw new Error(
      `Coupled LS microstate invariant failed for ${formatConfigurationSpec(norm)}: ${coupledMicrostates} != ${totalMicrostates}.`,
    );
  }

  // Sort deterministically by descending multiplicity (Hund order), descending L, then ascending L
  coupled.sort((a, b) => b.spin2S - a.spin2S || b.L - a.L);

  const terms: LSTermCandidate[] = coupled.map((t) => {
    const S = t.spin2S / 2;
    return {
      L: t.L,
      S,
      spin2S: t.spin2S,
      multiplicity: t.spin2S + 1,
      lLetter: lToSpectroscopicLetter(t.L),
      parity,
      parityValue,
      termSymbol: formatTermSymbol(t.spin2S, t.L, parity, false),
      asciiTermSymbol: formatTermSymbol(t.spin2S, t.L, parity, true),
      count: t.count,
      seniorities: t.seniorities,
      parentages: t.parentages.slice(0, 16),
      allowedJValues: allowedJForTerm(t.L, S),
    };
  });

  return {
    normalizedSubshells: norm,
    label: formatConfigurationSpec(norm, false),
    asciiLabel: formatConfigurationSpec(norm, true),
    totalElectrons,
    parity,
    parityValue,
    openShellCount: openShells.length,
    totalMicrostates,
    terms,
  };
}
