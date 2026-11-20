#!/usr/bin/env python3
"""
Offline higher-accuracy pathway: non-relativistic restricted Hartree–Fock (RHF/ROHF)
with PySCF, exported as spherically averaged radial electron densities for the browser.

This does not run in the browser and is NOT part of the interactive path.  It is a
reproducible calculation whose output is validated and bundled:

    python3 science/hf_export.py

Output: src/data/hf/<Symbol>.json  (schema atoms.hf-radial.v1)

Scope and honesty:
  * Method: RHF (closed shell) / ROHF (open shell), point nucleus, non-relativistic.
  * Basis: aug-cc-pVTZ (basis-set error is reported against the numerical HF limit;
    these are NOT basis-set-limit values, and they are NOT experimental energies).
  * Density: ρ(r) = (1/4π)∮ρ(r,Ω)dΩ on a deterministic Fibonacci angular grid, on a
    logarithmic radial grid.  Integrated electron count is checked against Z.
  * Correlation: none.  Relativistic effects: none.  Fine structure: not computed.
"""
import json
import math
import os
from datetime import date

import numpy as np
import pyscf
from pyscf import gto, scf

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data", "hf")
BASIS = "aug-cc-pVTZ"
N_ANG = 96  # deterministic Fibonacci directions
N_RAD = 420
R_MIN, R_MAX = 1.0e-3, 48.0

# Non-relativistic numerical Hartree–Fock limits for comparison only.
HF_LIMIT = {
    "H": -0.5,
    "He": -2.8616799956,
    "C": -37.6886189594,
    "N": -54.4009342052,
    "O": -74.8093984657,
    "Ne": -128.5470981090,
}
ATOMS = [
    # symbol, Z, spin (2S), charge, term
    ("H", 1, 1, 0, "2S"),
    ("He", 2, 0, 0, "1S"),
    ("C", 6, 2, 0, "3P"),
    ("N", 7, 3, 0, "4S"),
    ("O", 8, 2, 0, "3P"),
    ("Ne", 10, 0, 0, "1S"),
]
CONFIG = {"H": "1s1", "He": "1s2", "C": "[He] 2s2 2p2", "N": "[He] 2s2 2p3", "O": "[He] 2s2 2p4", "Ne": "[He] 2s2 2p6"}


def fibonacci_sphere(n):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    theta = np.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(theta) * np.sin(phi), np.sin(theta) * np.sin(phi), np.cos(phi)], axis=1)


def radial_grid():
    # geometric grid, denser near the nucleus
    return np.geomspace(R_MIN, R_MAX, N_RAD)


def spherical_density(mol, dm, r):
    dirs = fibonacci_sphere(N_ANG)
    pts = dirs * r
    ao = mol.eval_gto("GTOval_sph", pts)
    if dm.ndim == 3:
        rho = sum(np.einsum("pi,ij,pj->p", ao, dm[s], ao) for s in range(dm.shape[0]))
    else:
        rho = np.einsum("pi,ij,pj->p", ao, dm, ao)
    return float(np.mean(rho))


def integrate_electrons(r, rho):
    return float(np.trapezoid(4 * np.pi * r * r * rho, r))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = []
    for sym, Z, spin, charge, term in ATOMS:
        mol = gto.M(atom=f"{sym} 0 0 0", basis=BASIS, unit="Bohr", charge=charge, spin=spin, verbose=0)
        mf = scf.RHF(mol) if spin == 0 else scf.ROHF(mol)
        energy = mf.kernel()
        if not mf.converged:
            raise RuntimeError(f"SCF did not converge for {sym}")
        dm = mf.make_rdm1()
        r = radial_grid()
        rho = np.array([spherical_density(mol, dm, ri) for ri in r])
        count = integrate_electrons(r, rho)
        # tail/extent expansion check
        expansions = 0
        while abs(count - Z) > 2e-3 and expansions < 4:
            global R_MAX
            R_MAX *= 1.4
            r = radial_grid()
            rho = np.array([spherical_density(mol, dm, ri) for ri in r])
            count = integrate_electrons(r, rho)
            expansions += 1
        if abs(count - Z) > 2e-3:
            raise RuntimeError(f"{sym}: integrated electron count {count:.5f} ≠ Z={Z}")
        ref = HF_LIMIT[sym]
        rec = {
            "schema": "atoms.hf-radial.v1",
            "generated": date.today().isoformat(),
            "engine": {"name": "PySCF", "version": pyscf.__version__, "license": "Apache-2.0", "url": "https://pyscf.org"},
            "method": "RHF" if spin == 0 else "ROHF",
            "hamiltonian": "non-relativistic Coulomb, point nucleus, Born–Oppenheimer (isolated atom)",
            "basis": BASIS,
            "correlation": "none (Hartree–Fock)",
            "relativistic": "none",
            "term": term,
            "spin2S": spin,
            "charge": charge,
            "atom": {"Z": Z, "symbol": sym, "configuration": CONFIG[sym]},
            "energy_hartree": float(energy),
            "energy_eV": float(energy * 27.211386245988),
            "reference": {
                "property": "total non-relativistic HF energy (basis-set limit)",
                "value_hartree": ref,
                "source": "Numerical HF limit (literature; e.g. Koga & Thakkar, Phys. Rev. A 71, 022502 (2005) and references therein)",
                "note": "Basis-set-limited value; difference vs limit quantifies basis error, not correlation.",
            },
            "basisError_hartree": float(energy - ref),
            "scf": {"converged": bool(mf.converged), "cycles": int(mf.cycles), "convergenceTol": 1e-9},
            "density": {
                "definition": "spherically averaged one-electron density of the HF determinant, electrons/bohr^3",
                "rBohr": [float(x) for x in r],
                "rhoElectronPerBohr3": [float(x) for x in rho],
                "anglePoints": N_ANG,
                "angleGrid": "deterministic Fibonacci sphere (equal solid angle)",
                "quadrature": "trapezoid on non-uniform log radial grid",
                "integratedElectrons": count,
                "electronCountTolerance": 2e-3,
                "extensions": expansions,
            },
            "knownLimitations": [
                "Hartree–Fock: no electron correlation",
                "Non-relativistic: unsuitable for quantitative heavy-atom densities",
                "Finite Gaussian basis: not the HF basis-set limit",
                "Spherical average of a scalar determinant density; spin density not exported",
                "No subshell-resolved radial functions are exported by this pipeline",
            ],
            "command": "python3 science/hf_export.py",
        }
        path = os.path.join(OUT_DIR, f"{sym}.json")
        with open(path, "w") as f:
            json.dump(rec, f, indent=1)
        summary.append((sym, energy, ref, count))
        print(f"{sym:>3}  E={energy: .8f} Ha  ref={ref: .8f}  Δ={energy-ref:+.5f} Ha  ∫ρ={count:.5f}e  -> {path}")
    print("done")


if __name__ == "__main__":
    main()
