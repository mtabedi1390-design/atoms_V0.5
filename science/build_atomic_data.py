#!/usr/bin/env python3
"""
Deterministic, offline atomic-data build and validation script for ATOMS v0.5.0.

Reads pinned source snapshots in data/sources/, verifies SHA-256 checksums against
data/sources/MANIFEST.json, parses:
  1. NIST ASD Ground Levels & Ionization Energies (Z = 1..108)
  2. Lobato et al. (2026) element-adaptive Dirac-Pade parameterization of
     all-electron relativistic B-spline Dirac-Fock densities (Z = 1..118, Apache-2.0)

Validates numerical positivity and charge conservation 4*pi*integral(r^2 * rho(r)) dr = Z
for all 118 elements using pure Python stdlib (no external runtime dependencies), and
writes normalized JSON datasets to:
  - src/data/nist/asd_ground_levels.json
  - src/data/df/lobato2026.json

Usage:
  python3 science/build_atomic_data.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_DIR = ROOT / "data" / "sources"
MANIFEST_PATH = SOURCES_DIR / "MANIFEST.json"

OUT_NIST = ROOT / "src" / "data" / "nist" / "asd_ground_levels.json"
OUT_DF = ROOT / "src" / "data" / "df" / "lobato2026.json"

# Exact conversion matching Lobato et al. (2026) scattering_factors.py (A_0 in Angstrom)
A_0_ANGSTROM = 0.52917721077817892
A_0_CUBED = A_0_ANGSTROM ** 3


def verify_manifest() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for entry in manifest["sources"]:
        p = ROOT / entry["file"]
        if not p.is_file():
            raise FileNotFoundError(f"Missing pinned source snapshot: {p}")
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        if digest != entry["sha256"]:
            raise ValueError(
                f"Checksum mismatch for {entry['file']}: expected {entry['sha256']}, got {digest}"
            )
    return manifest


def parse_j_from_level(level: str) -> str | None:
    level = level.strip()
    if not level:
        return None
    if "<" in level and level.endswith(">"):
        return level[level.rfind("<") + 1 : -1]
    # Single-character J suffix on standard LS terms like 1S0, 3P0, 4S*<3/2>
    if len(level) >= 3 and level[-1].isdigit():
        # e.g. 1S0, 3P0, 7F0
        return level[-1]
    return None


def build_nist_asd() -> dict:
    tsv_path = SOURCES_DIR / "nist_asd_ie.tsv"
    text = tsv_path.read_text(encoding="utf-8")
    rows = list(csv.reader(text.splitlines(), delimiter="\t"))
    records: list[dict] = []
    for row in rows[1:]:
        if len(row) < 13 or not row[0].strip().isdigit():
            continue
        z = int(row[0].strip())
        symbol = row[1].replace(" I", "").strip()
        name = row[3].strip()
        shells = row[5].strip()
        level = row[6].strip() or None
        prefix = row[8].strip()
        ie_raw = row[9].strip()
        suffix = row[10].strip()
        unc_raw = row[11].strip()
        refs = row[12].strip() or None

        ie_val = float(ie_raw) if ie_raw else None
        unc_val = float(unc_raw) if unc_raw else None
        if ie_val is None:
            ie_kind = "unavailable"
        elif prefix in ("(", "[") or suffix in (")", "]"):
            ie_kind = "theoretical-or-interpolated"
        else:
            ie_kind = "measured-or-evaluated"

        records.append(
            {
                "Z": z,
                "symbol": symbol,
                "name": name,
                "groundShells": shells,
                "groundLevel": level,
                "groundJ": parse_j_from_level(level) if level else None,
                "ie_eV": ie_val,
                "ieKind": ie_kind,
                "ieMarker": f"{prefix}{suffix}" if (prefix or suffix) else None,
                "uncertainty_eV": unc_val,
                "references": refs,
            }
        )

    if len(records) != 108 or [r["Z"] for r in records] != list(range(1, 109)):
        raise ValueError(f"Unexpected NIST ASD row count/ordering: {len(records)}")

    return {
        "schema": "atoms.nist-asd-ie.v1",
        "source": "NIST Atomic Spectra Database (https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html)",
        "sha256Source": hashlib.sha256(tsv_path.read_bytes()).hexdigest(),
        "coverage": "Z = 1..108 neutral atoms (Z = 109..118 absent from ASD IE table)",
        "records": records,
    }


def eval_dirac_pade_rho_bohr3(terms: list[dict], r_bohr: float) -> float:
    """Evaluate closed-form Lobato (2026) density in electrons / a0^3."""
    r_ang = r_bohr * A_0_ANGSTROM
    total_ang3 = 0.0
    for t in terms:
        a = t["a"]
        b = t["b"]
        decay = 2.0 * math.pi / math.sqrt(b)
        amp = 2.0 * (math.pi ** 4) * A_0_ANGSTROM * a / (b ** 2.5)
        x = r_ang * decay
        ex = math.exp(-x) if x < 700.0 else 0.0
        if t["type"] == "DP":
            total_ang3 += 0.25 * amp * (1.0 + x) * ex
        else:
            total_ang3 += amp * ex
    return total_ang3 * A_0_CUBED


def integrate_dirac_pade(terms: list[dict], r_min: float = 1e-6, r_max: float = 48.0, n_pts: int = 2400) -> tuple[float, float, float]:
    """
    Composite Simpson integration on a geometric (log-spaced) grid by integrating
    over u = ln(r):  4*pi * integral( r^3 * rho(r) ) du, plus <r> = (1/Z) * 4*pi * integral( r^4 * rho(r) ) du,
    and checks global non-negativity across all grid points.
    """
    if n_pts % 2 != 0:
        n_pts += 1
    u0 = math.log(r_min)
    u1 = math.log(r_max)
    du = (u1 - u0) / n_pts

    sum_n = 0.0
    sum_r = 0.0
    min_rho = float("inf")
    for i in range(n_pts + 1):
        u = u0 + i * du
        r = math.exp(u)
        rho = eval_dirac_pade_rho_bohr3(terms, r)
        if rho < min_rho:
            min_rho = rho
        w = 1.0 if (i == 0 or i == n_pts) else (4.0 if i % 2 == 1 else 2.0)
        integrand_n = 4.0 * math.pi * (r ** 3) * rho
        sum_n += w * integrand_n
        sum_r += w * integrand_n * r

    # analytic inner core contribution on [0, r_min] ~ 4*pi/3 * r_min^3 * rho(0)
    rho0 = eval_dirac_pade_rho_bohr3(terms, 0.0)
    core_n = (4.0 * math.pi / 3.0) * (r_min ** 3) * rho0
    total_e = core_n + sum_n * du / 3.0
    mean_r_bohr = (sum_r * du / 3.0) / total_e
    return total_e, mean_r_bohr, min(min_rho, rho0)


def build_lobato_df() -> dict:
    txt_path = SOURCES_DIR / "lobato2026_adaptive_dirac_pade.txt"
    cert_path = SOURCES_DIR / "lobato2026_positivity_certificate.json"
    cert = json.loads(cert_path.read_text(encoding="utf-8"))
    if cert["real_space"]["adaptive_dirac_pade"]["rho"]["certified_records"] != 118:
        raise ValueError("Positivity certificate does not cover 118 records")

    by_z: dict[int, dict] = {}
    for line in txt_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        parts = s.split()
        if len(parts) != 7:
            raise ValueError(f"Unexpected column count in Lobato table: {line}")
        z = int(parts[0])
        sym = parts[1]
        n_t = int(parts[2])
        term_idx = int(parts[3])
        ttype = parts[4]
        a_i = float(parts[5])
        b_i = float(parts[6])
        if ttype not in ("NR", "DP"):
            raise ValueError(f"Invalid term type {ttype}")
        rec = by_z.setdefault(z, {"Z": z, "symbol": sym, "n_t": n_t, "terms": []})
        rec["terms"].append({"index": term_idx, "type": ttype, "a": a_i, "b": b_i})

    if sorted(by_z.keys()) != list(range(1, 119)):
        raise ValueError("Lobato 2026 table must cover Z = 1..118")

    records = []
    max_rel_err = 0.0
    for z in range(1, 119):
        rec = by_z[z]
        terms = sorted(rec["terms"], key=lambda t: t["index"])
        if len(terms) != rec["n_t"]:
            raise ValueError(f"Z={z}: expected {rec['n_t']} terms, got {len(terms)}")
        if any(t["type"] != "NR" for t in terms[:-1]) or terms[-1]["type"] != "DP":
            raise ValueError(f"Z={z}: unexpected NR/DP layout")
        integrated_e, mean_r_bohr, min_rho = integrate_dirac_pade(terms)
        rel_err = abs(integrated_e - z) / z
        max_rel_err = max(max_rel_err, rel_err)
        if min_rho < 0.0:
            raise ValueError(f"Z={z}: negative density encountered ({min_rho})")
        if rel_err > 5e-4:
            raise ValueError(f"Z={z}: integrated electrons {integrated_e:.6f} deviates from {z} (rel_err={rel_err:.2e})")
        records.append(
            {
                "Z": z,
                "symbol": rec["symbol"],
                "n_t": rec["n_t"],
                "terms": [{"type": t["type"], "a": t["a"], "b": t["b"]} for t in terms],
                "validation": {
                    "integratedElectrons": round(integrated_e, 7),
                    "relativeChargeError": float(f"{rel_err:.3e}"),
                    "meanRadiusBohr": round(mean_r_bohr, 6),
                    "minDensityBohr3": float(f"{min_rho:.3e}"),
                },
            }
        )

    print(f"Lobato 2026 Dirac-Fock validated for all 118 elements (max relative charge error: {max_rel_err:.3e})")
    return {
        "schema": "atoms.df-dirac-pade.v1",
        "source": "Lobato, Zhang, Van Aert, Kirkland (2026), arXiv:2608.14934, Apache-2.0",
        "repo": "https://github.com/NeuralSoftX/scattering_factors_2026",
        "sha256Source": hashlib.sha256(txt_path.read_bytes()).hexdigest(),
        "a0_angstrom": A_0_ANGSTROM,
        "method": "Relativistic B-spline Dirac-Fock (atomx, Z=2..118) & exact Dirac 1s (Z=1), element-adaptive Dirac-Pade expansion",
        "hamiltonian": "Dirac-Coulomb (all-electron relativistic B-spline Dirac-Fock, finite nucleus, spherical average of open-shell occupations)",
        "nuclearModel": "finite nuclear charge distribution (atomx reference); point Dirac 1s for H",
        "knownLimitations": [
            "Spherically averaged total neutral-atom electron density only (no non-spherical open-shell multiplet orientation)",
            "Closed-form parameterization of total density; does NOT provide individual subshell orbitals R_nl(r), orbital energies, or wavefunction phases",
            "Fitted in float32 precision with positivity certificate across all 118 neutral elements",
        ],
        "records": records,
    }


def main() -> None:
    verify_manifest()
    OUT_NIST.parent.mkdir(parents=True, exist_ok=True)
    OUT_DF.parent.mkdir(parents=True, exist_ok=True)

    nist_data = build_nist_asd()
    OUT_NIST.write_text(json.dumps(nist_data, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_NIST.relative_to(ROOT)} ({len(nist_data['records'])} records)")

    df_data = build_lobato_df()
    OUT_DF.write_text(json.dumps(df_data, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_DF.relative_to(ROOT)} ({len(df_data['records'])} records, {OUT_DF.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
