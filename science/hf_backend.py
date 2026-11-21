#!/usr/bin/env python3
"""
ATOMS v0.7.0 Local Multi-Electron Hartree-Fock Computational Backend.

Wraps genuine PySCF (Apache-2.0) + libcint (Apache-2.0) + Basis Set Exchange
(BSD-3-Clause) + NumPy/SciPy over a strict JSON stdin/stdout contract.

Supported methods (each exposed explicitly, never conflated):
  - rhf          : Restricted closed-shell Hartree-Fock (N even, 2S = 0)
  - uhf          : Unrestricted open-shell Hartree-Fock (alpha/beta spin orbitals)
  - rohf         : Restricted open-shell Hartree-Fock (Roothaan effective Fock)
  - atom-sph-avg : PySCF AtomSphAverageRHF (spherically averaged atomic RHF)

Non-relativistic fixed-nucleus Hamiltonian (infinite nuclear mass).
Does NOT compute finite-nucleus corrections, Dirac-Fock, QED, MP2, or CI.
"""
from __future__ import annotations

import json
import math
import sys
import time
import tracemalloc
from typing import Any

import basis_set_exchange as bse
import numpy as np
import pyscf
import scipy
from pyscf import gto, scf, symm
from pyscf.dft import gen_grid
from pyscf.scf import atom_hf

HARTREE_TO_EV = 27.211386245988  # CODATA 2018 (matches src/physics/constants.ts)

SUPPORTED_BASES = {
    "sto-3g": {"label": "STO-3G", "bseName": "sto-3g", "maxAllElectronZ": 54},
    "6-31g": {"label": "6-31G", "bseName": "6-31g", "maxAllElectronZ": 36},
    "cc-pvdz": {"label": "cc-pVDZ", "bseName": "cc-pvdz", "maxAllElectronZ": 36},
    "cc-pvtz": {"label": "cc-pVTZ", "bseName": "cc-pvtz", "maxAllElectronZ": 36},
    "aug-cc-pvtz": {"label": "aug-cc-pVTZ", "bseName": "aug-cc-pvtz", "maxAllElectronZ": 36},
    "def2-svp": {"label": "def2-SVP", "bseName": "def2-svp", "maxAllElectronZ": 36},
    "def2-tzvp": {"label": "def2-TZVP", "bseName": "def2-tzvp", "maxAllElectronZ": 36},
}

SUPPORTED_METHODS = ("rhf", "uhf", "rohf", "atom-sph-avg")
L_LETTERS = "spdfghi"


def lebedev_sphere(n: int = 110) -> tuple[np.ndarray, np.ndarray]:
    """Return PySCF Lebedev quadrature points (n, 3) and weights (n,) summing to 1.0."""
    grid = gen_grid.MakeAngularGrid(n)
    return grid[:, :3], grid[:, 3]


def _basis_element_coverage(basis_key: str) -> list[int]:
    cfg = SUPPORTED_BASES[basis_key]
    max_ae = int(cfg["maxAllElectronZ"])
    meta = bse.get_metadata().get(cfg["bseName"], {})
    latest = meta.get("latest_version")
    els = meta.get("versions", {}).get(latest, {}).get("elements", []) if latest else []
    return sorted(int(z) for z in els if int(z) <= max_ae)


def _load_basis_for_atom(basis_key: str, Z: int, sym: str) -> tuple[Any, str]:
    max_ae = int(SUPPORTED_BASES[basis_key]["maxAllElectronZ"])
    if Z > max_ae:
        raise ValueError(
            f"All-electron HF with basis '{basis_key}' is capped at Z <= {max_ae}; "
            f"Z={Z} ({sym}) in this family requires an Effective Core Potential (ECP), not supported in v0.7.0."
        )
    try:
        loaded = gto.basis.load(basis_key, sym)
        if loaded:
            return basis_key, f"PySCF bundled {basis_key}"
    except Exception:
        pass
    bse_name = SUPPORTED_BASES[basis_key]["bseName"]
    try:
        nwchem_txt = bse.get_basis(bse_name, elements=[Z], fmt="nwchem")
        parsed = gto.basis.parse(nwchem_txt)
        if parsed:
            return {sym: parsed}, f"Basis Set Exchange v{bse.__version__} ({bse_name})"
    except Exception as exc:
        raise ValueError(f"Basis '{basis_key}' does not cover Z={Z} ({sym}): {exc}") from exc
    raise ValueError(f"Basis '{basis_key}' does not cover Z={Z} ({sym}).")


def _irrep_nelec_from_subshells(
    mol: gto.Mole,
    subshells: list[dict[str, Any]],
) -> dict[str, tuple[int, int]]:
    # Group requested (n, l, alpha, beta) counts by l and distribute across m_l irreps (-l..+l)
    by_l: dict[int, tuple[int, int]] = {}
    for s in subshells:
        l = int(s["l"])
        a = int(s["alpha"])
        b = int(s["beta"])
        prev_a, prev_b = by_l.get(l, (0, 0))
        by_l[l] = (prev_a + a, prev_b + b)

    # Check available basis functions per SO3 irrep
    ao_sym_ids = mol.irrep_id
    irrep_names = mol.irrep_name
    id_to_name = {int(mol.irrep_id[i]): str(irrep_names[i]) for i in range(len(irrep_names))}

    # Count basis AOs per irrep name
    ao_counts: dict[str, int] = {name: 0 for name in irrep_names}
    for i, sym_arr in enumerate(mol.symm_orb):
        name = str(irrep_names[i])
        ao_counts[name] = int(sym_arr.shape[1])

    out: dict[str, tuple[int, int]] = {name: (0, 0) for name in irrep_names}
    for l, (alpha_l, beta_l) in by_l.items():
        if l >= len(L_LETTERS):
            raise ValueError(f"Angular momentum l={l} is outside supported SO3 atomic mapping.")
        ch = L_LETTERS[l]
        # Order m_l irreps deterministically: 0, +1, -1, +2, -2, ...
        m_order = [0]
        for m in range(1, l + 1):
            m_order.extend([m, -m])
        irrep_seq = [f"{ch}{'+' if m >= 0 else ''}{m}" for m in m_order]
        cap = sum(ao_counts.get(ir, 0) for ir in irrep_seq)
        if alpha_l > cap or beta_l > cap:
            raise ValueError(
                f"Basis has {cap} spatial functions for angular momentum l={l}, "
                f"insufficient for requested occupation (alpha={alpha_l}, beta={beta_l})."
            )
        # Check whether each single irrep can accommodate round-robin filling
        rem_a, rem_b = alpha_l, beta_l
        # Fill across m_l levels one electron at a time (Hund/sequential m filling)
        layer = 0
        while rem_a > 0 or rem_b > 0:
            progressed = False
            for ir in irrep_seq:
                max_ir = ao_counts.get(ir, 0)
                cur_a, cur_b = out.get(ir, (0, 0))
                if rem_a > 0 and cur_a == layer and cur_a < max_ir:
                    cur_a += 1
                    rem_a -= 1
                    progressed = True
                out[ir] = (cur_a, cur_b)
            for ir in irrep_seq:
                max_ir = ao_counts.get(ir, 0)
                cur_a, cur_b = out.get(ir, (0, 0))
                if rem_b > 0 and cur_b == layer and cur_b < max_ir:
                    cur_b += 1
                    rem_b -= 1
                    progressed = True
                out[ir] = (cur_a, cur_b)
            if not progressed:
                raise ValueError(f"Unable to map l={l} occupation ({alpha_l}, {beta_l}) into basis irreps.")
            layer += 1

    # Remove irreps not present in molecule basis
    return {k: v for k, v in out.items() if k in id_to_name.values()}


def _ao_labels_safe(mol: gto.Mole) -> list[str]:
    return [str(lbl) for lbl in mol.ao_labels(fmt=True)]


def _compute_energy_decomposition(mol: gto.Mole, mf: Any, method: str) -> dict[str, Any]:
    S = mol.intor("int1e_ovlp")
    T = mol.intor("int1e_kin")
    V = mol.intor("int1e_nuc")
    dm = mf.make_rdm1()
    vj, vk = mf.get_jk(mol, dm)

    if method == "uhf":
        dm_a = np.asarray(dm[0], dtype=np.float64)
        dm_b = np.asarray(dm[1], dtype=np.float64)
        dm_tot = dm_a + dm_b
        vj_tot = np.asarray(vj[0], dtype=np.float64) + np.asarray(vj[1], dtype=np.float64)
        e_kin = float(np.einsum("ij,ji->", T, dm_tot))
        e_nuc = float(np.einsum("ij,ji->", V, dm_tot))
        e_coul = 0.5 * float(np.einsum("ij,ji->", vj_tot, dm_tot))
        e_exch = -0.5 * (
            float(np.einsum("ij,ji->", vk[0], dm_a)) + float(np.einsum("ij,ji->", vk[1], dm_b))
        )
        nelec_trace = float(np.einsum("ij,ji->", S, dm_tot))
        nelec_a = float(np.einsum("ij,ji->", S, dm_a))
        nelec_b = float(np.einsum("ij,ji->", S, dm_b))
    elif method == "rohf":
        # For ROHF, dm may be tagged or 2-channel (alpha, beta) or total depending on PySCF call
        dm_arr = np.asarray(dm, dtype=np.float64)
        if dm_arr.ndim == 3:
            dm_a, dm_b = dm_arr[0], dm_arr[1]
            dm_tot = dm_a + dm_b
        else:
            dm_tot = dm_arr
            # Build alpha/beta from mo_coeff & mo_occ
            occ = np.asarray(mf.mo_occ, dtype=np.float64)
            C = np.asarray(mf.mo_coeff, dtype=np.float64)
            occ_a = np.where(occ > 1.0, 1.0, occ)
            occ_b = np.where(occ > 1.0, occ - 1.0, 0.0)
            dm_a = (C * occ_a) @ C.T
            dm_b = (C * occ_b) @ C.T
        vj_tot = mol.intor("int1e_ovlp")  # unused placeholder overwritten below
        vj_a, vk_a = mf.get_jk(mol, (dm_a, dm_b))
        vj_tot = np.asarray(vj_a[0], dtype=np.float64) + np.asarray(vj_a[1], dtype=np.float64)
        e_kin = float(np.einsum("ij,ji->", T, dm_tot))
        e_nuc = float(np.einsum("ij,ji->", V, dm_tot))
        e_coul = 0.5 * float(np.einsum("ij,ji->", vj_tot, dm_tot))
        e_exch = -0.5 * (
            float(np.einsum("ij,ji->", vk_a[0], dm_a)) + float(np.einsum("ij,ji->", vk_a[1], dm_b))
        )
        nelec_trace = float(np.einsum("ij,ji->", S, dm_tot))
        nelec_a = float(np.einsum("ij,ji->", S, dm_a))
        nelec_b = float(np.einsum("ij,ji->", S, dm_b))
    else:
        dm_tot = np.asarray(dm, dtype=np.float64)
        vj_arr = np.asarray(vj, dtype=np.float64)
        vk_arr = np.asarray(vk, dtype=np.float64)
        e_kin = float(np.einsum("ij,ji->", T, dm_tot))
        e_nuc = float(np.einsum("ij,ji->", V, dm_tot))
        e_coul = 0.5 * float(np.einsum("ij,ji->", vj_arr, dm_tot))
        e_exch = -0.25 * float(np.einsum("ij,ji->", vk_arr, dm_tot))
        nelec_trace = float(np.einsum("ij,ji->", S, dm_tot))
        nelec_a = 0.5 * nelec_trace
        nelec_b = 0.5 * nelec_trace

    e_one = e_kin + e_nuc
    e_two = e_coul + e_exch
    e_total = float(mf.e_tot)
    virial = -(e_nuc + e_two) / e_kin if abs(e_kin) > 1e-15 else None
    eigvals = np.linalg.eigvalsh(S)
    min_eig = float(eigvals[0])
    max_eig = float(eigvals[-1])
    cond_s = float(max_eig / min_eig) if min_eig > 0 else float("inf")

    return {
        "eTotal_Ha": e_total,
        "eTotal_eV": e_total * HARTREE_TO_EV,
        "eKinetic_Ha": e_kin,
        "eNuclear_Ha": e_nuc,
        "eOneElectron_Ha": e_one,
        "eCoulomb_Ha": e_coul,
        "eExchange_Ha": e_exch,
        "eTwoElectron_Ha": e_two,
        "energyConsistencyError_Ha": abs(e_total - (e_one + e_two)),
        "virialRatio": virial,
        "tracePS": nelec_trace,
        "traceAlpha": nelec_a,
        "traceBeta": nelec_b,
        "overlapMinEig": min_eig,
        "overlapConditionNumber": cond_s,
    }


def _extract_orbitals_and_densities(
    mol: gto.Mole,
    mf: Any,
    method: str,
    spin2S: int,
    include_radial: bool,
    volume_spec: dict[str, Any] | None,
) -> dict[str, Any]:
    S = mol.intor("int1e_ovlp")
    use_symm = mol.symmetry and hasattr(mol, "irrep_name")

    def irrep_for_mo(coeff_obj: Any, idx: int) -> str:
        orbsym = getattr(coeff_obj, "orbsym", None)
        if orbsym is not None and idx < len(orbsym) and use_symm:
            try:
                return str(symm.irrep_id2name(mol.groupname, int(orbsym[idx])))
            except Exception:
                return str(int(orbsym[idx]))
        return "A"

    orbitals: list[dict[str, Any]] = []
    max_ortho_err = 0.0

    if method == "uhf":
        C_a = np.asarray(mf.mo_coeff[0], dtype=np.float64)
        C_b = np.asarray(mf.mo_coeff[1], dtype=np.float64)
        e_a = np.asarray(mf.mo_energy[0], dtype=np.float64)
        e_b = np.asarray(mf.mo_energy[1], dtype=np.float64)
        occ_a = np.asarray(mf.mo_occ[0], dtype=np.float64)
        occ_b = np.asarray(mf.mo_occ[1], dtype=np.float64)

        err_a = float(np.max(np.abs(C_a.T @ S @ C_a - np.eye(C_a.shape[1]))))
        err_b = float(np.max(np.abs(C_b.T @ S @ C_b - np.eye(C_b.shape[1]))))
        max_ortho_err = max(err_a, err_b)

        for spin_lbl, C, E, Occ, coeff_tag in (
            ("alpha", C_a, e_a, occ_a, mf.mo_coeff[0]),
            ("beta", C_b, e_b, occ_b, mf.mo_coeff[1]),
        ):
            last_occ = max((idx for idx, val in enumerate(Occ) if val > 1e-8), default=-1)
            limit = min(len(E), max(last_occ + 5, 6))
            for i in range(limit):
                orbitals.append({
                    "index": i,
                    "spin": spin_lbl,
                    "irrep": irrep_for_mo(coeff_tag, i),
                    "occupation": float(Occ[i]),
                    "energy_Ha": float(E[i]),
                    "energy_eV": float(E[i]) * HARTREE_TO_EV,
                })
        dm_a = (C_a * occ_a) @ C_a.T
        dm_b = (C_b * occ_b) @ C_b.T
        dm_tot = dm_a + dm_b
        s2_obs, mult_obs = mf.spin_square()
        s_exact = 0.5 * spin2S
        s2_exact = s_exact * (s_exact + 1.0)
        spin_diag = {
            "sSquared": float(s2_obs),
            "sSquaredExact": float(s2_exact),
            "spinContamination": float(s2_obs - s2_exact),
            "multiplicity": float(mult_obs),
        }
    else:
        C = np.asarray(mf.mo_coeff, dtype=np.float64)
        E = np.asarray(mf.mo_energy, dtype=np.float64)
        Occ = np.asarray(mf.mo_occ, dtype=np.float64)
        max_ortho_err = float(np.max(np.abs(C.T @ S @ C - np.eye(C.shape[1]))))

        focka_diag = None
        fockb_diag = None
        if method == "rohf":
            fock_obj = mf.get_fock()
            fa = getattr(fock_obj, "focka", None)
            fb = getattr(fock_obj, "fockb", None)
            if fa is not None and fb is not None:
                focka_diag = np.diag(C.T @ np.asarray(fa, dtype=np.float64) @ C)
                fockb_diag = np.diag(C.T @ np.asarray(fb, dtype=np.float64) @ C)

        last_occ = max((idx for idx, val in enumerate(Occ) if val > 1e-8), default=-1)
        limit = min(len(E), max(last_occ + 5, 6))
        for i in range(limit):
            entry: dict[str, Any] = {
                "index": i,
                "spin": "spatial",
                "irrep": irrep_for_mo(mf.mo_coeff, i),
                "occupation": float(Occ[i]),
                "energy_Ha": float(E[i]),
                "energy_eV": float(E[i]) * HARTREE_TO_EV,
            }
            if focka_diag is not None and fockb_diag is not None:
                entry["fockAlpha_Ha"] = float(focka_diag[i])
                entry["fockBeta_Ha"] = float(fockb_diag[i])
            orbitals.append(entry)

        if method == "rohf":
            occ_a = np.where(Occ > 1.0, 1.0, Occ)
            occ_b = np.where(Occ > 1.0, Occ - 1.0, 0.0)
            dm_a = (C * occ_a) @ C.T
            dm_b = (C * occ_b) @ C.T
            dm_tot = dm_a + dm_b
            s_exact = 0.5 * spin2S
            s2_exact = s_exact * (s_exact + 1.0)
            spin_diag = {
                "sSquared": float(s2_exact),
                "sSquaredExact": float(s2_exact),
                "spinContamination": 0.0,
                "multiplicity": float(spin2S + 1),
            }
        else:
            dm_tot = np.asarray(mf.make_rdm1(), dtype=np.float64)
            dm_a = 0.5 * dm_tot
            dm_b = 0.5 * dm_tot
            spin_diag = {
                "sSquared": 0.0,
                "sSquaredExact": 0.0,
                "spinContamination": 0.0,
                "multiplicity": 1.0,
            }

    # Radial density profiles on deterministic Lebedev sphere x log grid
    radial_data = None
    if include_radial:
        n_ang = 110
        n_rad = 320
        dirs, ang_weights = lebedev_sphere(n_ang)
        r_min = 1.0e-4
        r_max = 36.0
        expected_n = float(mol.nelectron)

        for _ in range(3):
            r_grid = np.geomspace(r_min, r_max, n_rad)
            u_grid = np.log(r_grid)
            # Evaluate all points in one vectorized call: shape (n_rad * n_ang, 3)
            pts = (r_grid[:, None, None] * dirs[None, :, :]).reshape(-1, 3)
            ao = mol.eval_gto("GTOval_sph", pts)  # (P, nao)
            # Vectorized density evaluation across all radial shells with exact Lebedev weights
            rho_a_pts = np.einsum("pi,ij,pj->p", ao, dm_a, ao)
            rho_b_pts = np.einsum("pi,ij,pj->p", ao, dm_b, ao)
            rho_a = (rho_a_pts.reshape(n_rad, n_ang) @ ang_weights)
            rho_b = (rho_b_pts.reshape(n_rad, n_ang) @ ang_weights)
            rho_tot = rho_a + rho_b
            rho_spin = rho_a - rho_b
            pr_tot = 4.0 * math.pi * (r_grid ** 2) * rho_tot
            # Integrand in u = ln(r) is r * P_r(r) = 4*pi*r^3*rho(r), plus core [0, r_min]
            core_n = (4.0 * math.pi / 3.0) * (r_min ** 3) * float(rho_tot[0])
            int_n = float(np.trapezoid(r_grid * pr_tot, u_grid)) + core_n
            if abs(int_n - expected_n) <= 5e-4:
                break
            r_max *= 1.5

        pr_spin = 4.0 * math.pi * (r_grid ** 2) * rho_spin
        core_spin = (4.0 * math.pi / 3.0) * (r_min ** 3) * float(rho_spin[0])
        int_spin = float(np.trapezoid(r_grid * pr_spin, u_grid)) + core_spin
        mean_r = (float(np.trapezoid((r_grid ** 2) * pr_tot, u_grid)) + 0.75 * r_min * core_n) / max(int_n, 1e-12)

        # Also export sphericalized radial probability for occupied orbitals (up to 10)
        occ_radial = []
        if method == "uhf":
            C_use = np.asarray(mf.mo_coeff[0], dtype=np.float64)
            Occ_use = np.asarray(mf.mo_occ[0], dtype=np.float64)
            spin_tag = "alpha"
        else:
            C_use = np.asarray(mf.mo_coeff, dtype=np.float64)
            Occ_use = np.asarray(mf.mo_occ, dtype=np.float64)
            spin_tag = "spatial"

        occ_indices = [i for i in range(len(Occ_use)) if Occ_use[i] > 1e-8][:10]
        if occ_indices:
            mo_vals = ao @ C_use[:, occ_indices]  # (P, K)
            mo_sq = ((mo_vals ** 2).reshape(n_rad, n_ang, len(occ_indices)) * ang_weights[None, :, None]).sum(axis=1)
            for k, mo_idx in enumerate(occ_indices):
                prob_r = 4.0 * math.pi * (r_grid ** 2) * mo_sq[:, k]
                norm_k = float(np.trapezoid(r_grid * prob_r, u_grid)) + (4.0 * math.pi / 3.0) * (r_min ** 3) * float(mo_sq[0, k])
                occ_radial.append({
                    "index": int(mo_idx),
                    "spin": spin_tag,
                    "occupation": float(Occ_use[mo_idx]),
                    "integratedNorm": norm_k,
                    "radialProb": [float(x) for x in prob_r],
                })

        radial_data = {
            "rBohr": [float(x) for x in r_grid],
            "rhoTotal": [float(x) for x in rho_tot],
            "rhoAlpha": [float(x) for x in rho_a],
            "rhoBeta": [float(x) for x in rho_b],
            "rhoSpin": [float(x) for x in rho_spin],
            "radialProbTotal": [float(x) for x in pr_tot],
            "integratedElectrons": int_n,
            "integratedSpin": int_spin,
            "meanRadiusBohr": mean_r,
            "anglePoints": n_ang,
            "orbitalRadialProbs": occ_radial,
        }

    # Optional 3D volumetric scalar field for Marching Tetrahedra isosurfaces & 2D slices
    volume_data = None
    if volume_spec and volume_spec.get("enabled"):
        grid_n = max(16, min(40, int(volume_spec.get("gridN", 28))))
        extent_bohr = max(2.0, min(30.0, float(volume_spec.get("extentBohr", 8.0))))
        qty = str(volume_spec.get("quantity", "mo-signed"))
        orb_idx = int(volume_spec.get("orbitalIndex", 0))
        spin_ch = str(volume_spec.get("spinChannel", "alpha"))

        lin = np.linspace(-extent_bohr, extent_bohr, grid_n)
        # Match marchingTetrahedra.ts layout: idx = ix + N * (iy + N * iz)
        iz, iy, ix = np.meshgrid(lin, lin, lin, indexing="ij")
        coords = np.stack([ix.ravel(), iy.ravel(), iz.ravel()], axis=1)
        ao_grid = mol.eval_gto("GTOval_sph", coords)

        if qty in ("mo-signed", "mo-density"):
            if method == "uhf":
                C_ch = np.asarray(mf.mo_coeff[1 if spin_ch == "beta" else 0], dtype=np.float64)
            else:
                C_ch = np.asarray(mf.mo_coeff, dtype=np.float64)
            safe_idx = max(0, min(C_ch.shape[1] - 1, orb_idx))
            psi = ao_grid @ C_ch[:, safe_idx]
            vals = psi if qty == "mo-signed" else (psi ** 2)
        elif qty == "spin-density":
            rho_a_g = np.einsum("pi,ij,pj->p", ao_grid, dm_a, ao_grid)
            rho_b_g = np.einsum("pi,ij,pj->p", ao_grid, dm_b, ao_grid)
            vals = rho_a_g - rho_b_g
        else:  # total-density
            vals = np.einsum("pi,ij,pj->p", ao_grid, dm_tot, ao_grid)

        volume_data = {
            "gridN": grid_n,
            "extentBohr": extent_bohr,
            "quantity": qty,
            "orbitalIndex": orb_idx,
            "spinChannel": spin_ch,
            "signed": qty in ("mo-signed", "spin-density"),
            "fieldMin": float(np.min(vals)),
            "fieldMax": float(np.max(vals)),
            "values": [round(float(v), 7) for v in vals],
        }

    return {
        "orbitals": orbitals,
        "orthonormalityError": max_ortho_err,
        "spinDiagnostics": spin_diag,
        "radialProfiles": radial_data,
        "volumeGrid": volume_data,
        "aoCount": int(mol.nao_nr()),
        "aoLabels": _ao_labels_safe(mol),
    }


def handle_capabilities() -> dict[str, Any]:
    basis_coverage = {key: _basis_element_coverage(key) for key in SUPPORTED_BASES}
    return {
        "available": True,
        "engine": {
            "name": "PySCF",
            "version": pyscf.__version__,
            "license": "Apache-2.0",
            "libcintLib": str(getattr(gto.moleintor.libcgto, "_name", "bundled")),
            "numpyVersion": np.__version__,
            "scipyVersion": scipy.__version__,
            "bseVersion": bse.__version__,
            "bseLicense": "BSD-3-Clause",
        },
        "methods": list(SUPPORTED_METHODS),
        "bases": [
            {
                "id": key,
                "label": meta["label"],
                "bseName": meta["bseName"],
                "elements": basis_coverage[key],
            }
            for key, meta in SUPPORTED_BASES.items()
        ],
    }


def handle_calculate(payload: dict[str, Any]) -> dict[str, Any]:
    tracemalloc.start()
    t_start = time.perf_counter()

    Z = int(payload["Z"])
    N = int(payload["N"])
    spin2S = int(payload.get("spin2S", 0))
    method = str(payload.get("method", "uhf"))
    basis_key = str(payload.get("basis", "cc-pvdz")).lower()
    use_symmetry = bool(payload.get("useSymmetry", True))
    subshells = payload.get("subshellOccupations")
    scf_opts = payload.get("scfOptions") or {}

    if not (1 <= Z <= 118):
        raise ValueError(f"Atomic number Z must be in 1..118 (got {Z}).")
    if not (1 <= N <= Z + 4):
        raise ValueError(f"Electron count N must be in 1..{Z + 4} (got {N}).")
    if spin2S < 0 or spin2S > N or (N - spin2S) % 2 != 0:
        raise ValueError(f"Spin 2S={spin2S} is incompatible with N={N} electrons.")
    if method not in SUPPORTED_METHODS:
        raise ValueError(f"Unsupported HF method '{method}'.")
    if method == "rhf" and spin2S != 0:
        raise ValueError(f"RHF requires closed-shell singlet (2S=0); got 2S={spin2S}. Select UHF or ROHF.")
    if basis_key not in SUPPORTED_BASES:
        raise ValueError(f"Unsupported basis '{basis_key}'. Allowed: {', '.join(SUPPORTED_BASES)}")

    sym = gto.mole._symbol(Z)
    charge = Z - N
    basis_obj, basis_source = _load_basis_for_atom(basis_key, Z, sym)

    mol = gto.M(
        atom=f"{sym} 0 0 0",
        basis=basis_obj,
        charge=charge,
        spin=spin2S,
        symmetry=use_symmetry if method != "atom-sph-avg" else False,
        unit="Bohr",
        verbose=0,
    )

    t_setup = (time.perf_counter() - t_start) * 1000.0

    if method == "rhf":
        mf = scf.RHF(mol)
    elif method == "uhf":
        mf = scf.UHF(mol)
    elif method == "rohf":
        mf = scf.ROHF(mol)
    else:
        mf = atom_hf.AtomSphAverageRHF(mol)

    if subshells and use_symmetry and method in ("rhf", "uhf", "rohf"):
        irrep_occ = _irrep_nelec_from_subshells(mol, subshells)
        if method == "rhf":
            mf.irrep_nelec = {k: int(v[0] + v[1]) for k, v in irrep_occ.items()}
        else:
            mf.irrep_nelec = irrep_occ

    conv_tol = float(scf_opts.get("convTol", 1e-9))
    conv_tol_grad = float(scf_opts.get("convTolGrad", math.sqrt(conv_tol)))
    max_cycle = max(1, min(300, int(scf_opts.get("maxCycle", 80))))
    init_guess = str(scf_opts.get("initGuess", "minao"))
    diis_mode = str(scf_opts.get("diis", "cdiis"))
    damp = float(scf_opts.get("damp", 0.0))
    level_shift = float(scf_opts.get("levelShift", 0.0))
    run_stability = bool(scf_opts.get("runStability", False))

    mf.conv_tol = conv_tol
    mf.conv_tol_grad = conv_tol_grad
    mf.max_cycle = max_cycle
    if init_guess in ("minao", "1e", "atom"):
        mf.init_guess = init_guess
    if diis_mode == "none":
        mf.diis = None
    elif diis_mode == "ediis":
        mf.diis = scf.EDIIS()
    elif diis_mode == "adiis":
        mf.diis = scf.ADIIS()
    if damp > 0:
        mf.damp = damp
    if level_shift > 0:
        mf.level_shift = level_shift

    scf_history: list[dict[str, Any]] = []

    def scf_callback(envs: dict[str, Any]) -> None:
        cyc = int(envs.get("cycle", len(scf_history)))
        e_tot = float(envs.get("e_tot", 0.0))
        last_e = envs.get("last_hf_e")
        de = float(e_tot - float(last_e)) if last_e is not None else 0.0
        grad = envs.get("norm_gorb")
        scf_history.append({
            "cycle": cyc,
            "eTotal_Ha": e_tot,
            "dE_Ha": de,
            "gradNorm": float(grad) if grad is not None else 0.0,
        })

    mf.callback = scf_callback

    t_scf0 = time.perf_counter()
    mf.kernel()
    t_scf = (time.perf_counter() - t_scf0) * 1000.0

    if not scf_history:
        # e.g. 1-electron core Hamiltonian converges on cycle 0 before callback
        scf_history.append({
            "cycle": 0,
            "eTotal_Ha": float(mf.e_tot),
            "dE_Ha": 0.0,
            "gradNorm": 0.0,
        })

    stability_info = None
    if run_stability and mf.converged and method in ("rhf", "uhf", "rohf"):
        try:
            stab_res = mf.stability(external=False, return_status=True)
            stability_info = {
                "checked": True,
                "internalStable": bool(stab_res[2]) if len(stab_res) >= 3 else True,
            }
        except Exception as exc:
            stability_info = {"checked": False, "error": str(exc)}

    t_diag0 = time.perf_counter()
    energy_decomp = _compute_energy_decomposition(mol, mf, method)
    details = _extract_orbitals_and_densities(
        mol,
        mf,
        method,
        spin2S,
        include_radial=bool(payload.get("includeRadialGrid", True)),
        volume_spec=payload.get("volumeGrid"),
    )
    t_diag = (time.perf_counter() - t_diag0) * 1000.0

    t_total = (time.perf_counter() - t_start) * 1000.0
    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    return {
        "ok": bool(mf.converged),
        "system": {
            "Z": Z,
            "symbol": sym,
            "N": N,
            "charge": charge,
            "spin2S": spin2S,
        },
        "method": method,
        "basis": basis_key,
        "basisSource": basis_source,
        "symmetryGroup": str(mol.topgroup) if use_symmetry and method != "atom-sph-avg" else "C1",
        "rohfConvention": (
            "Roothaan effective Fock Fc=(Fa+Fb)/2; orbital diagonal spin-Fock expectations <i|Fa|i> and <i|Fb|i> also reported"
            if method == "rohf"
            else None
        ),
        "scf": {
            "converged": bool(mf.converged),
            "cycles": int(mf.cycles),
            "maxCycle": max_cycle,
            "convTol": conv_tol,
            "convTolGrad": conv_tol_grad,
            "initGuess": init_guess,
            "diis": diis_mode,
            "damp": damp,
            "levelShift": level_shift,
            "history": scf_history,
            "stability": stability_info,
        },
        "energy": energy_decomp,
        "orbitals": details["orbitals"],
        "orthonormalityError": details["orthonormalityError"],
        "spinDiagnostics": details["spinDiagnostics"],
        "radialProfiles": details["radialProfiles"],
        "volumeGrid": details["volumeGrid"],
        "aoCount": details["aoCount"],
        "aoLabels": details["aoLabels"],
        "runtime": {
            "engine": "PySCF",
            "engineVersion": pyscf.__version__,
            "bseVersion": bse.__version__,
            "setupMs": round(t_setup, 3),
            "scfMs": round(t_scf, 3),
            "diagnosticsMs": round(t_diag, 3),
            "totalMs": round(t_total, 3),
            "peakMemoryMB": round(peak_bytes / (1024 * 1024), 3),
        },
    }


def main() -> int:
    raw = sys.stdin.read()
    try:
        req = json.loads(raw) if raw.strip() else {}
        action = req.get("action", "calculate")
        if action == "capabilities":
            out = handle_capabilities()
        elif action == "calculate":
            out = handle_calculate(req)
        else:
            raise ValueError(f"Unknown backend action: {action}")
        sys.stdout.write(json.dumps(out))
        return 0
    except Exception as exc:
        err = {"ok": False, "error": str(exc), "errorType": type(exc).__name__}
        sys.stdout.write(json.dumps(err))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
