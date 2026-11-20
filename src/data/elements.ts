/**
 * 118-element atomic database with per-field provenance.
 *
 * Sources (transcribed at implementation time; see src/data/sources.ts):
 *  - Standard atomic weights: IUPAC/CIAAW abridged standard atomic weights (2021 table),
 *    https://ciaaw.org/atomic-weights.htm . For elements without a standard atomic weight
 *    the mass number of the longest-lived known isotope is given and flagged.
 *  - Ground-state configurations & first ionization energies: NIST Atomic Spectra Database,
 *    Ground Levels and Ionization Energies for the Neutral Atoms,
 *    https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html .  Z ≥ 104 configurations are
 *    theoretical predictions (relativistic calculations) and flagged `predicted`.
 *  - Covalent radii: Cordero et al., Dalton Trans. 2008, 2832 (single-bond covalent radii,
 *    Z ≤ 96; Mn/Fe/Co low-spin values; C sp³).  Elements without a value are `null`.
 */
import { subshellLabel } from "@/physics/hydrogenic";

export type ElementCategory =
  | "alkali metal"
  | "alkaline earth metal"
  | "transition metal"
  | "post-transition metal"
  | "metalloid"
  | "reactive nonmetal"
  | "noble gas"
  | "lanthanide"
  | "actinide"
  | "unknown properties";

export type Block = "s" | "p" | "d" | "f";
export type Evidence = "measured" | "evaluated" | "predicted" | "unavailable";

export interface Provenanced<T> {
  readonly value: T;
  readonly evidence: Evidence;
  readonly source: string;
  readonly note?: string;
}

export interface Subshell {
  readonly n: number;
  readonly l: number;
  readonly occupancy: number; // electrons in this subshell (0 … 2(2l+1))
  readonly label: string;
}

export interface ElementRecord {
  readonly Z: number;
  readonly symbol: string;
  readonly name: string;
  readonly mass: Provenanced<number>; // u
  readonly massKind: "standard atomic weight" | "mass number of longest-lived isotope";
  readonly category: ElementCategory;
  readonly group: number | null; // null for inner-transition rows
  readonly period: number;
  readonly block: Block;
  readonly configuration: Provenanced<string>; // noble-gas shorthand
  readonly subshells: readonly Subshell[]; // full, ordered by (n+l, n)
  readonly ionizationEnergy_eV: Provenanced<number | null>;
  readonly covalentRadius_pm: Provenanced<number | null>;
}

// Z, symbol, name, mass, massIsStandard, category, group, period, IE eV|null, covalent radius pm|null
type Row = [number, string, string, number, boolean, ElementCategory, number | null, number, number | null, number | null];

const R: Row[] = [
  [1, "H", "Hydrogen", 1.008, true, "reactive nonmetal", 1, 1, 13.598, 31],
  [2, "He", "Helium", 4.0026, true, "noble gas", 18, 1, 24.587, 28],
  [3, "Li", "Lithium", 6.94, true, "alkali metal", 1, 2, 5.392, 128],
  [4, "Be", "Beryllium", 9.0122, true, "alkaline earth metal", 2, 2, 9.323, 96],
  [5, "B", "Boron", 10.81, true, "metalloid", 13, 2, 8.298, 84],
  [6, "C", "Carbon", 12.011, true, "reactive nonmetal", 14, 2, 11.26, 76],
  [7, "N", "Nitrogen", 14.007, true, "reactive nonmetal", 15, 2, 14.534, 71],
  [8, "O", "Oxygen", 15.999, true, "reactive nonmetal", 16, 2, 13.618, 66],
  [9, "F", "Fluorine", 18.998, true, "reactive nonmetal", 17, 2, 17.423, 57],
  [10, "Ne", "Neon", 20.18, true, "noble gas", 18, 2, 21.565, 58],
  [11, "Na", "Sodium", 22.99, true, "alkali metal", 1, 3, 5.139, 166],
  [12, "Mg", "Magnesium", 24.305, true, "alkaline earth metal", 2, 3, 7.646, 141],
  [13, "Al", "Aluminium", 26.982, true, "post-transition metal", 13, 3, 5.986, 121],
  [14, "Si", "Silicon", 28.085, true, "metalloid", 14, 3, 8.152, 111],
  [15, "P", "Phosphorus", 30.974, true, "reactive nonmetal", 15, 3, 10.487, 107],
  [16, "S", "Sulfur", 32.06, true, "reactive nonmetal", 16, 3, 10.36, 105],
  [17, "Cl", "Chlorine", 35.45, true, "reactive nonmetal", 17, 3, 12.968, 102],
  [18, "Ar", "Argon", 39.95, true, "noble gas", 18, 3, 15.76, 106],
  [19, "K", "Potassium", 39.098, true, "alkali metal", 1, 4, 4.341, 203],
  [20, "Ca", "Calcium", 40.078, true, "alkaline earth metal", 2, 4, 6.113, 176],
  [21, "Sc", "Scandium", 44.956, true, "transition metal", 3, 4, 6.561, 170],
  [22, "Ti", "Titanium", 47.867, true, "transition metal", 4, 4, 6.828, 160],
  [23, "V", "Vanadium", 50.942, true, "transition metal", 5, 4, 6.746, 153],
  [24, "Cr", "Chromium", 51.996, true, "transition metal", 6, 4, 6.767, 139],
  [25, "Mn", "Manganese", 54.938, true, "transition metal", 7, 4, 7.434, 139],
  [26, "Fe", "Iron", 55.845, true, "transition metal", 8, 4, 7.902, 132],
  [27, "Co", "Cobalt", 58.933, true, "transition metal", 9, 4, 7.881, 126],
  [28, "Ni", "Nickel", 58.693, true, "transition metal", 10, 4, 7.64, 124],
  [29, "Cu", "Copper", 63.546, true, "transition metal", 11, 4, 7.726, 132],
  [30, "Zn", "Zinc", 65.38, true, "transition metal", 12, 4, 9.394, 122],
  [31, "Ga", "Gallium", 69.723, true, "post-transition metal", 13, 4, 5.999, 122],
  [32, "Ge", "Germanium", 72.63, true, "metalloid", 14, 4, 7.9, 120],
  [33, "As", "Arsenic", 74.922, true, "metalloid", 15, 4, 9.789, 119],
  [34, "Se", "Selenium", 78.971, true, "reactive nonmetal", 16, 4, 9.752, 120],
  [35, "Br", "Bromine", 79.904, true, "reactive nonmetal", 17, 4, 11.814, 120],
  [36, "Kr", "Krypton", 83.798, true, "noble gas", 18, 4, 14.0, 116],
  [37, "Rb", "Rubidium", 85.468, true, "alkali metal", 1, 5, 4.177, 220],
  [38, "Sr", "Strontium", 87.62, true, "alkaline earth metal", 2, 5, 5.695, 195],
  [39, "Y", "Yttrium", 88.906, true, "transition metal", 3, 5, 6.217, 190],
  [40, "Zr", "Zirconium", 91.224, true, "transition metal", 4, 5, 6.634, 175],
  [41, "Nb", "Niobium", 92.906, true, "transition metal", 5, 5, 6.759, 164],
  [42, "Mo", "Molybdenum", 95.95, true, "transition metal", 6, 5, 7.092, 154],
  [43, "Tc", "Technetium", 97, false, "transition metal", 7, 5, 7.119, 147],
  [44, "Ru", "Ruthenium", 101.07, true, "transition metal", 8, 5, 7.361, 146],
  [45, "Rh", "Rhodium", 102.91, true, "transition metal", 9, 5, 7.459, 142],
  [46, "Pd", "Palladium", 106.42, true, "transition metal", 10, 5, 8.337, 139],
  [47, "Ag", "Silver", 107.87, true, "transition metal", 11, 5, 7.576, 145],
  [48, "Cd", "Cadmium", 112.41, true, "transition metal", 12, 5, 8.994, 144],
  [49, "In", "Indium", 114.82, true, "post-transition metal", 13, 5, 5.786, 142],
  [50, "Sn", "Tin", 118.71, true, "post-transition metal", 14, 5, 7.344, 139],
  [51, "Sb", "Antimony", 121.76, true, "metalloid", 15, 5, 8.608, 139],
  [52, "Te", "Tellurium", 127.6, true, "metalloid", 16, 5, 9.01, 138],
  [53, "I", "Iodine", 126.9, true, "reactive nonmetal", 17, 5, 10.451, 139],
  [54, "Xe", "Xenon", 131.29, true, "noble gas", 18, 5, 12.13, 140],
  [55, "Cs", "Caesium", 132.91, true, "alkali metal", 1, 6, 3.894, 244],
  [56, "Ba", "Barium", 137.33, true, "alkaline earth metal", 2, 6, 5.212, 215],
  [57, "La", "Lanthanum", 138.91, true, "lanthanide", 3, 6, 5.577, 207],
  [58, "Ce", "Cerium", 140.12, true, "lanthanide", null, 6, 5.539, 204],
  [59, "Pr", "Praseodymium", 140.91, true, "lanthanide", null, 6, 5.473, 203],
  [60, "Nd", "Neodymium", 144.24, true, "lanthanide", null, 6, 5.525, 201],
  [61, "Pm", "Promethium", 145, false, "lanthanide", null, 6, 5.582, 199],
  [62, "Sm", "Samarium", 150.36, true, "lanthanide", null, 6, 5.644, 198],
  [63, "Eu", "Europium", 151.96, true, "lanthanide", null, 6, 5.67, 198],
  [64, "Gd", "Gadolinium", 157.25, true, "lanthanide", null, 6, 6.15, 196],
  [65, "Tb", "Terbium", 158.93, true, "lanthanide", null, 6, 5.864, 194],
  [66, "Dy", "Dysprosium", 162.5, true, "lanthanide", null, 6, 5.939, 192],
  [67, "Ho", "Holmium", 164.93, true, "lanthanide", null, 6, 6.022, 192],
  [68, "Er", "Erbium", 167.26, true, "lanthanide", null, 6, 6.108, 189],
  [69, "Tm", "Thulium", 168.93, true, "lanthanide", null, 6, 6.184, 190],
  [70, "Yb", "Ytterbium", 173.05, true, "lanthanide", null, 6, 6.254, 187],
  [71, "Lu", "Lutetium", 174.97, true, "lanthanide", null, 6, 5.426, 187],
  [72, "Hf", "Hafnium", 178.49, true, "transition metal", 4, 6, 6.825, 175],
  [73, "Ta", "Tantalum", 180.95, true, "transition metal", 5, 6, 7.55, 170],
  [74, "W", "Tungsten", 183.84, true, "transition metal", 6, 6, 7.864, 162],
  [75, "Re", "Rhenium", 186.21, true, "transition metal", 7, 6, 7.834, 151],
  [76, "Os", "Osmium", 190.23, true, "transition metal", 8, 6, 8.438, 144],
  [77, "Ir", "Iridium", 192.22, true, "transition metal", 9, 6, 8.967, 141],
  [78, "Pt", "Platinum", 195.08, true, "transition metal", 10, 6, 8.959, 136],
  [79, "Au", "Gold", 196.97, true, "transition metal", 11, 6, 9.226, 136],
  [80, "Hg", "Mercury", 200.59, true, "transition metal", 12, 6, 10.438, 132],
  [81, "Tl", "Thallium", 204.38, true, "post-transition metal", 13, 6, 6.108, 145],
  [82, "Pb", "Lead", 207.2, true, "post-transition metal", 14, 6, 7.417, 146],
  [83, "Bi", "Bismuth", 208.98, true, "post-transition metal", 15, 6, 7.286, 148],
  [84, "Po", "Polonium", 209, false, "post-transition metal", 16, 6, 8.414, 140],
  [85, "At", "Astatine", 210, false, "metalloid", 17, 6, 9.318, 150],
  [86, "Rn", "Radon", 222, false, "noble gas", 18, 6, 10.749, 150],
  [87, "Fr", "Francium", 223, false, "alkali metal", 1, 7, 4.073, 260],
  [88, "Ra", "Radium", 226, false, "alkaline earth metal", 2, 7, 5.278, 221],
  [89, "Ac", "Actinium", 227, false, "actinide", 3, 7, 5.38, 215],
  [90, "Th", "Thorium", 232.04, true, "actinide", null, 7, 6.307, 206],
  [91, "Pa", "Protactinium", 231.04, true, "actinide", null, 7, 5.89, 200],
  [92, "U", "Uranium", 238.03, true, "actinide", null, 7, 6.194, 196],
  [93, "Np", "Neptunium", 237, false, "actinide", null, 7, 6.266, 190],
  [94, "Pu", "Plutonium", 244, false, "actinide", null, 7, 6.026, 187],
  [95, "Am", "Americium", 243, false, "actinide", null, 7, 5.974, 180],
  [96, "Cm", "Curium", 247, false, "actinide", null, 7, 5.991, 169],
  [97, "Bk", "Berkelium", 247, false, "actinide", null, 7, 6.198, null],
  [98, "Cf", "Californium", 251, false, "actinide", null, 7, 6.282, null],
  [99, "Es", "Einsteinium", 252, false, "actinide", null, 7, 6.368, null],
  [100, "Fm", "Fermium", 257, false, "actinide", null, 7, 6.5, null],
  [101, "Md", "Mendelevium", 258, false, "actinide", null, 7, 6.58, null],
  [102, "No", "Nobelium", 259, false, "actinide", null, 7, 6.626, null],
  [103, "Lr", "Lawrencium", 266, false, "actinide", null, 7, 4.96, null],
  [104, "Rf", "Rutherfordium", 267, false, "transition metal", 4, 7, 6.02, null],
  [105, "Db", "Dubnium", 268, false, "transition metal", 5, 7, null, null],
  [106, "Sg", "Seaborgium", 269, false, "transition metal", 6, 7, null, null],
  [107, "Bh", "Bohrium", 270, false, "transition metal", 7, 7, null, null],
  [108, "Hs", "Hassium", 269, false, "transition metal", 8, 7, null, null],
  [109, "Mt", "Meitnerium", 278, false, "unknown properties", 9, 7, null, null],
  [110, "Ds", "Darmstadtium", 281, false, "unknown properties", 10, 7, null, null],
  [111, "Rg", "Roentgenium", 282, false, "unknown properties", 11, 7, null, null],
  [112, "Cn", "Copernicium", 285, false, "transition metal", 12, 7, null, null],
  [113, "Nh", "Nihonium", 286, false, "unknown properties", 13, 7, null, null],
  [114, "Fl", "Flerovium", 289, false, "post-transition metal", 14, 7, null, null],
  [115, "Mc", "Moscovium", 290, false, "unknown properties", 15, 7, null, null],
  [116, "Lv", "Livermorium", 293, false, "unknown properties", 16, 7, null, null],
  [117, "Ts", "Tennessine", 294, false, "unknown properties", 17, 7, null, null],
  [118, "Og", "Oganesson", 294, false, "unknown properties", 18, 7, null, null],
];

/** Madelung (n+l, n) filling order. */
const AUFBAU_ORDER: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2], [5, 1], [6, 0],
  [4, 3], [5, 2], [6, 1], [7, 0], [5, 3], [6, 2], [7, 1],
];

/**
 * Validated ground-state exceptions to naive Aufbau (NIST ASD ground levels).
 * Format: delta map `"n l": occupancy override`.
 */
const EXCEPTIONS: Record<number, Record<string, number>> = {
  24: { "3 2": 5, "4 0": 1 }, // Cr 3d5 4s1
  29: { "3 2": 10, "4 0": 1 }, // Cu 3d10 4s1
  41: { "4 2": 4, "5 0": 1 }, // Nb 4d4 5s1
  42: { "4 2": 5, "5 0": 1 }, // Mo 4d5 5s1
  44: { "4 2": 7, "5 0": 1 }, // Ru
  45: { "4 2": 8, "5 0": 1 }, // Rh
  46: { "4 2": 10, "5 0": 0 }, // Pd 4d10
  47: { "4 2": 10, "5 0": 1 }, // Ag
  57: { "4 3": 0, "5 2": 1 }, // La 5d1 6s2
  58: { "4 3": 1, "5 2": 1 }, // Ce 4f1 5d1 6s2
  64: { "4 3": 7, "5 2": 1 }, // Gd 4f7 5d1 6s2
  78: { "5 2": 9, "6 0": 1 }, // Pt 5d9 6s1
  79: { "5 2": 10, "6 0": 1 }, // Au 5d10 6s1
  89: { "5 3": 0, "6 2": 1 }, // Ac 6d1 7s2
  90: { "5 3": 0, "6 2": 2 }, // Th 6d2 7s2
  91: { "5 3": 2, "6 2": 1 }, // Pa 5f2 6d1 7s2
  92: { "5 3": 3, "6 2": 1 }, // U 5f3 6d1 7s2
  93: { "5 3": 4, "6 2": 1 }, // Np 5f4 6d1 7s2
  96: { "5 3": 7, "6 2": 1 }, // Cm 5f7 6d1 7s2
  103: { "6 2": 0, "7 1": 1 }, // Lr 7s2 7p1 (relativistic; NIST ground level 2P°1/2)
};

const NOBLE = [2, 10, 18, 36, 54, 86];

function buildSubshells(Z: number): Subshell[] {
  const occ = new Map<string, number>();
  let left = Z;
  for (const [n, l] of AUFBAU_ORDER) {
    if (left <= 0) break;
    const cap = 2 * (2 * l + 1);
    const take = Math.min(cap, left);
    occ.set(`${n} ${l}`, take);
    left -= take;
  }
  const ex = EXCEPTIONS[Z];
  if (ex) for (const [k, v] of Object.entries(ex)) occ.set(k, v);
  const out: Subshell[] = [];
  for (const [n, l] of AUFBAU_ORDER) {
    const o = occ.get(`${n} ${l}`) ?? 0;
    if (o > 0) out.push({ n, l, occupancy: o, label: subshellLabel(n, l) });
  }
  // sort by n then l for display consistency with spectroscopic notation
  out.sort((a, b) => a.n - b.n || a.l - b.l);
  return out;
}

function configString(Z: number, subs: readonly Subshell[]): string {
  const core = [...NOBLE].reverse().find((g) => g < Z);
  if (!core) return subs.map((s) => `${s.label}${s.occupancy}`).join(" ");
  const coreSubs = buildSubshells(core);
  const coreKey = new Map(coreSubs.map((s) => [`${s.n}${s.l}`, s.occupancy]));
  const coreSym = R[core - 1][1];
  const rest = subs
    .filter((s) => (coreKey.get(`${s.n}${s.l}`) ?? 0) !== s.occupancy)
    .map((s) => `${s.label}${s.occupancy}`);
  return `[${coreSym}] ${rest.join(" ")}`;
}

function blockOf(Z: number, subs: readonly Subshell[]): Block {
  if (Z === 2) return "s";
  const r = R[Z - 1];
  // Block = periodic-table position (IUPAC layout): La/Ac/Lu/Lr occupy d-block-adjacent cells
  if (r[5] === "lanthanide" || r[5] === "actinide") return Z === 57 || Z === 89 || Z === 71 || Z === 103 ? "d" : "f";
  if (r[6] !== null && r[6] >= 3 && r[6] <= 12) return "d";
  if (r[6] !== null && r[6] <= 2) return "s";
  void subs;
  return "p";
}

const SRC_NIST = "NIST ASD, Ground Levels and Ionization Energies for the Neutral Atoms (physics.nist.gov/PhysRefData/ASD/ionEnergy.html)";
const SRC_IUPAC = "IUPAC/CIAAW Standard Atomic Weights 2021 (ciaaw.org/atomic-weights.htm), abridged to 5 significant figures";
const SRC_CORDERO = "Cordero et al., Dalton Trans. 2008, 2832–2838 (covalent radii)";

export const ELEMENTS: readonly ElementRecord[] = R.map((row) => {
  const [Z, symbol, name, mass, stdMass, category, group, period, ie, rcov] = row;
  const subshells = buildSubshells(Z);
  const predicted = Z >= 104;
  return {
    Z,
    symbol,
    name,
    mass: {
      value: mass,
      evidence: stdMass ? "evaluated" : "measured",
      source: stdMass ? SRC_IUPAC : "Mass number of longest-lived isotope (IUPAC/CIAAW, no standard weight defined)",
    },
    massKind: stdMass ? "standard atomic weight" : "mass number of longest-lived isotope",
    category,
    group,
    period,
    block: blockOf(Z, subshells),
    configuration: {
      value: configString(Z, subshells),
      evidence: predicted ? "predicted" : "evaluated",
      source: predicted ? "Theoretical prediction (relativistic calculations summarised in NIST ASD / literature); not spectroscopically confirmed" : SRC_NIST,
      note: EXCEPTIONS[Z] ? "Non-Aufbau ground state (validated exception)" : undefined,
    },
    subshells,
    ionizationEnergy_eV: {
      value: ie,
      evidence: ie === null ? "unavailable" : Z >= 100 ? "measured" : "evaluated",
      source: ie === null ? "No evaluated experimental value" : SRC_NIST,
      note: Z === 103 ? "Sato et al., Nature 520, 209 (2015)" : Z === 104 ? "NIST ASD; large uncertainty" : undefined,
    },
    covalentRadius_pm: {
      value: rcov,
      evidence: rcov === null ? "unavailable" : "evaluated",
      source: rcov === null ? "Not tabulated by Cordero et al." : SRC_CORDERO,
    },
  };
});

export function elementByZ(Z: number): ElementRecord {
  const e = ELEMENTS[Z - 1];
  if (!e || e.Z !== Z) throw new RangeError(`No element with Z=${Z}`);
  return e;
}

export function electronCount(e: ElementRecord): number {
  return e.subshells.reduce((s, x) => s + x.occupancy, 0);
}

export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  "alkali metal": "#e4572e",
  "alkaline earth metal": "#f3a712",
  "transition metal": "#5b8def",
  "post-transition metal": "#6bc5a0",
  metalloid: "#a1c349",
  "reactive nonmetal": "#f2d16b",
  "noble gas": "#c77dff",
  lanthanide: "#ff85a1",
  actinide: "#ff6b6b",
  "unknown properties": "#6b7280",
};

export const BLOCK_COLORS: Record<Block, string> = { s: "#e4572e", p: "#f3a712", d: "#5b8def", f: "#ff85a1" };
