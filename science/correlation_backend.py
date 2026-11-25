#!/usr/bin/env python3
"""
ATOMS v0.7.2 Local Post-Hartree-Fock Electron Correlation Backend.

Wraps genuine PySCF (Apache-2.0) + libcint (Apache-2.0) + Basis Set Exchange
(BSD-3-Clause) over a strict JSON stdin/stdout contract.

Supported methods (explicitly gated by reference compatibility & resource limits):
  - rmp2  : Restricted MP2 (pyscf.mp.mp2.RMP2) on closed-shell RHF (2S = 0)
  - ump2  : Unrestricted MP2 (pyscf.mp.ump2.UMP2) on UHF
  - romp2 : Semi-canonicalized ROHF-MP2 (pyscf.mp.romp2.ROMP2) on ROHF (2S >= 1)
  - rcisd : Restricted CISD (pyscf.ci.cisd.RCISD) on closed-shell RHF (2S = 0)
  - ucisd : Unrestricted CISD (pyscf.ci.ucisd.UCISD) on UHF
  - fci   : Direct iterative Full CI (pyscf.fci / mcscf.CASCI for frozen-core RHF/ROHF)

Strict scientific guardrails:
  - AtomSphAverageRHF fractional ensembles are explicitly rejected for correlation.
  - ROHF -> CISD is explicitly rejected (PySCF converts ROHF to UCISD internally).
  - Pre-allocation determinant (N_det) & CISD excitation-vector dimension caps are
    enforced before allocating integral tensors or CI vectors.
  - C1 orbital symmetry is used in post-HF integral/solver steps to avoid PySCF SO3
    UCISD Davidson root-jumping, while preserving exact E_total = E_HF + E_corr.
  - Determinant FCI/CISD results are NEVER labeled as LS-coupled CSF states or L^2 eigenstates.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
import tracemalloc
import warnings
from pathlib import Path
from typing import Any

# Allow running both as `python science/correlation_backend.py` and imported module
_HERE = str(Path(__file__).resolve().parent)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import basis_set_exchange as bse
import numpy as np
import pyscf
import scipy
from pyscf import ci, fci, gto, mcscf, mp, scf

from hf_backend import (
    HARTREE_TO_EV,
    SUPPORTED_BASES,
    _basis_element_coverage,
    _load_basis_for_atom,
)

# Configurable production resource safeguards (can be tuned via env for tests/containers)
MAX_FCI_DETERMINANTS = int(os.environ.get("ATOMS_MAX_FCI_DETERMINANTS", "200000"))
MAX_CISD_AMPLITUDES = int(os.environ.get("ATOMS_MAX_CISD_AMPLITUDES", "2000000"))
MAX_FCI_NROOTS = int(os.environ.get("ATOMS_MAX_FCI_NROOTS", "5"))
MAX_CORR_ORBITALS = int(os.environ.get("ATOMS_MAX_CORR_ORBITALS", "120"))

MP2_SMALL_DENOM_THRESHOLD_HA = 0.05
SPIN_CONTAMINATION_WARN_THRESHOLD = 0.02
FCI_SPIN_PURITY_TOL = 1e-4
CISD_MIN_REF_WEIGHT_SQ = 0.25

SUPPORTED_REFERENCES = ("rhf", "uhf", "rohf")
SUPPORTED_METHODS = ("rmp2", "ump2", "romp2", "rcisd", "ucisd", "fci")
SUPPORTED_FROZEN_MODES = ("none", "noble-core")


class ResourceLimitError(ValueError):
    """Raised before expensive allocation when a calculation exceeds configured limits."""

    def __init__(self, code: str, message: str, estimate: dict[str, Any]):
        super().__init__(message)
        self.code = code
        self.estimate = estimate


class DomainValidationError(ValueError):
    """Raised when scientific/domain validation fails."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _is_finite(val: Any) -> bool:
    try:
        return math.isfinite(float(val))
    except (TypeError, ValueError):
        return False


def _require_finite(val: Any, label: str) -> float:
    f = float(val)
    if not math.isfinite(f):
        raise DomainValidationError("NON_FINITE_RESULT", f"Computed {label} is non-finite ({val}).")
    return f


def _noble_core_frozen_count(Z: int) -> int:
    """Standard closed-shell noble-gas core spatial orbital count."""
    if Z <= 2:
        return 0
    if Z <= 10:
        return 1  # [He] 1s
    if Z <= 18:
        return 5  # [Ne] 1s 2s 2p
    if Z <= 36:
        return 9  # [Ar] 1s 2s 2p 3s 3p
    if Z <= 54:
        return 18  # [Kr] [Ar] 3d 4s 4p
    return 27  # [Xe]


def _resolve_frozen_orbitals(
    Z: int,
    n_orb: int,
    n_alpha: int,
    n_beta: int,
    frozen_core_mode: str,
) -> int:
    if frozen_core_mode not in SUPPORTED_FROZEN_MODES:
        raise DomainValidationError(
            "INVALID_FROZEN_CORE",
            f"Unsupported frozenCoreMode '{frozen_core_mode}'. Allowed: {', '.join(SUPPORTED_FROZEN_MODES)}.",
        )
    if frozen_core_mode == "none":
        return 0
    core = _noble_core_frozen_count(Z)
    if core == 0:
        return 0
    if n_alpha <= core or n_beta < core or n_orb <= core:
        raise DomainValidationError(
            "FROZEN_CORE_EXCEEDS_ELECTRONS",
            f"Noble-core freezing ({core} spatial orbitals) is invalid for Z={Z} with N_alpha={n_alpha}, N_beta={n_beta}, n_orb={n_orb}. Use frozenCoreMode='none'.",
        )
    return core


def _estimate_dimensions(
    n_orb: int,
    n_alpha: int,
    n_beta: int,
    frozen: int,
    corr_method: str,
    ref_method: str,
    nroots: int,
) -> dict[str, Any]:
    n_act_orb = n_orb - frozen
    n_act_a = n_alpha - frozen
    n_act_b = n_beta - frozen
    n_vir_a = n_orb - n_alpha
    n_vir_b = n_orb - n_beta

    # FCI full active-space determinant count N_det = C(n_act_orb, n_act_a) * C(n_act_orb, n_act_b)
    if n_act_a < 0 or n_act_b < 0 or n_act_a > n_act_orb or n_act_b > n_act_orb:
        fci_n_det = 0
    else:
        fci_n_det = math.comb(n_act_orb, n_act_a) * math.comb(n_act_orb, n_act_b)

    # CISD vector dimension matching PySCF RCISD.vector_size() and UCISD.vector_size()
    if corr_method == "rcisd":
        n_occ = n_act_a
        n_vir = n_vir_a
        cisd_dim = 1 + n_occ * n_vir + (n_occ * n_vir) ** 2
    elif corr_method == "ucisd":
        nooa = n_act_a * max(0, n_act_a - 1) // 2
        nvva = n_vir_a * max(0, n_vir_a - 1) // 2
        noob = n_act_b * max(0, n_act_b - 1) // 2
        nvvb = n_vir_b * max(0, n_vir_b - 1) // 2
        cisd_dim = (
            1
            + n_act_a * n_vir_a
            + n_act_b * n_vir_b
            + n_act_a * n_act_b * n_vir_a * n_vir_b
            + nooa * nvva
            + noob * nvvb
        )
    else:
        cisd_dim = None

    # Approximate peak memory estimate in MB
    if corr_method == "fci":
        # Direct FCI holds several vectors of length N_det plus Davidson subspace (~16 vectors) + AO/MO 4-index integrals
        civec_mb = (fci_n_det * 8.0 * max(12, 4 * nroots)) / (1024.0 * 1024.0)
        eri_mb = ((n_act_orb ** 4) * 8.0) / (1024.0 * 1024.0)
        est_mem_mb = round(civec_mb + eri_mb + 20.0, 2)
    elif corr_method in ("rcisd", "ucisd"):
        vec_mb = ((cisd_dim or 0) * 8.0 * 16.0) / (1024.0 * 1024.0)
        eri_mb = ((n_orb ** 4) * 8.0) / (1024.0 * 1024.0)
        est_mem_mb = round(vec_mb + eri_mb + 20.0, 2)
    else:
        ovov_mb = ((max(1, n_act_a) ** 2) * (max(1, n_vir_a) ** 2) * 8.0 * 4.0) / (1024.0 * 1024.0)
        est_mem_mb = round(ovov_mb + 16.0, 2)

    return {
        "nSpatialOrbitals": n_orb,
        "frozenOrbitals": frozen,
        "activeSpatialOrbitals": n_act_orb,
        "nAlphaTotal": n_alpha,
        "nBetaTotal": n_beta,
        "nAlphaActive": n_act_a,
        "nBetaActive": n_act_b,
        "nVirtualAlpha": n_vir_a,
        "nVirtualBeta": n_vir_b,
        "fciDeterminantCount": int(fci_n_det),
        "fciDeterminantLimit": MAX_FCI_DETERMINANTS,
        "cisdAmplitudeDimension": int(cisd_dim) if cisd_dim is not None else None,
        "cisdAmplitudeLimit": MAX_CISD_AMPLITUDES,
        "nRoots": nroots,
        "nRootsLimit": MAX_FCI_NROOTS,
        "estimatedMemoryMB": est_mem_mb,
        "referenceMethod": ref_method,
        "correlationMethod": corr_method,
    }


def _validate_method_reference_pair(
    ref_method: str,
    corr_method: str,
    spin2S: int,
    frozen: int,
) -> None:
    if ref_method == "atom-sph-avg":
        raise DomainValidationError(
            "UNSUPPORTED_REFERENCE_METHOD",
            "AtomSphAverageRHF is a spin-unpolarized fractional-occupation spherical ensemble, not a canonical single Slater determinant; it is disabled as an MP2/CISD/FCI reference in v0.7.2.",
        )
    if ref_method not in SUPPORTED_REFERENCES:
        raise DomainValidationError(
            "UNSUPPORTED_REFERENCE_METHOD",
            f"Unsupported reference method '{ref_method}'. Allowed: {', '.join(SUPPORTED_REFERENCES)}.",
        )
    if corr_method not in SUPPORTED_METHODS:
        raise DomainValidationError(
            "UNSUPPORTED_CORRELATION_METHOD",
            f"Unsupported correlation method '{corr_method}'. Allowed: {', '.join(SUPPORTED_METHODS)}.",
        )
    if ref_method == "rhf" and spin2S != 0:
        raise DomainValidationError(
            "RHF_REQUIRES_SINGLET",
            f"Closed-shell RHF reference requires 2S = 0 (got 2S={spin2S}). Select UHF or ROHF.",
        )
    if ref_method == "rohf" and spin2S == 0:
        raise DomainValidationError(
            "ROHF_REQUIRES_OPEN_SHELL",
            "For closed-shell singlet (2S=0), use the RHF reference instead of ROHF.",
        )

    if corr_method == "rmp2" and ref_method != "rhf":
        raise DomainValidationError(
            "INCOMPATIBLE_REFERENCE_METHOD",
            f"RMP2 requires an RHF closed-shell reference (got '{ref_method}'). Select RHF for RMP2, UHF for UMP2, or ROHF for ROMP2.",
        )
    if corr_method == "ump2" and ref_method != "uhf":
        raise DomainValidationError(
            "INCOMPATIBLE_REFERENCE_METHOD",
            f"UMP2 requires a UHF reference (got '{ref_method}'). Select UHF for UMP2 or ROHF for ROMP2.",
        )
    if corr_method == "romp2" and ref_method != "rohf":
        raise DomainValidationError(
            "INCOMPATIBLE_REFERENCE_METHOD",
            f"ROMP2 requires an open-shell ROHF reference (got '{ref_method}').",
        )
    if corr_method == "rcisd" and ref_method != "rhf":
        raise DomainValidationError(
            "INCOMPATIBLE_REFERENCE_METHOD",
            f"RCISD requires a closed-shell RHF reference (got '{ref_method}'). PySCF has no spin-restricted open-shell ROCISD.",
        )
    if corr_method == "ucisd" and ref_method != "uhf":
        if ref_method == "rohf":
            raise DomainValidationError(
                "ROHF_CISD_UNSUPPORTED",
                "PySCF does not implement spin-restricted open-shell ROCISD (ci.CISD(rohf) silently converts ROHF to UHF/UCISD). Select UHF for UCISD or ROHF+FCI.",
            )
        raise DomainValidationError(
            "INCOMPATIBLE_REFERENCE_METHOD",
            f"UCISD requires a UHF reference (got '{ref_method}').",
        )
    if corr_method == "fci" and ref_method == "uhf" and frozen > 0:
        raise DomainValidationError(
            "UHF_FROZEN_FCI_UNSUPPORTED",
            "Frozen-core FCI requires a shared spatial-orbital reference (RHF or ROHF via CASCI) because UHF uses distinct alpha/beta spatial orbitals.",
        )


def _compute_mp2_denominator_diagnostics(
    mo_energy_a: np.ndarray,
    mo_energy_b: np.ndarray | None,
    n_occ_a: int,
    n_occ_b: int,
    frozen: int,
    is_restricted: bool,
) -> dict[str, Any]:
    """Compute smallest 1p-1h and 2p-2h orbital energy denominators over active orbitals."""
    warnings_list: list[str] = []
    if is_restricted:
        occ = np.asarray(mo_energy_a[frozen:n_occ_a], dtype=np.float64)
        vir = np.asarray(mo_energy_a[n_occ_a:], dtype=np.float64)
        if occ.size == 0 or vir.size == 0:
            return {
                "available": False,
                "minSingleGap_Ha": None,
                "minDoubleGap_Ha": None,
                "nearDegenerate": False,
                "reason": "Zero active occupied or virtual orbitals.",
                "warnings": warnings_list,
            }
        min_ia = float(np.min(vir) - np.max(occ))
        min_ijab = 2.0 * min_ia
        if min_ijab < MP2_SMALL_DENOM_THRESHOLD_HA:
            warnings_list.append(
                f"Small MP2 energy denominator detected: min(e_a + e_b - e_i - e_j) = {min_ijab:.4f} Ha (< {MP2_SMALL_DENOM_THRESHOLD_HA} Ha), indicating near-degeneracy where perturbative MP2 may lose accuracy."
            )
        return {
            "available": True,
            "minSingleGap_Ha": min_ia,
            "minDoubleGap_Ha": min_ijab,
            "nearDegenerate": min_ijab < MP2_SMALL_DENOM_THRESHOLD_HA,
            "warnings": warnings_list,
        }

    assert mo_energy_b is not None
    occ_a = np.asarray(mo_energy_a[frozen:n_occ_a], dtype=np.float64)
    vir_a = np.asarray(mo_energy_a[n_occ_a:], dtype=np.float64)
    occ_b = np.asarray(mo_energy_b[frozen:n_occ_b], dtype=np.float64)
    vir_b = np.asarray(mo_energy_b[n_occ_b:], dtype=np.float64)

    gaps_1: list[float] = []
    gaps_2: list[float] = []
    gap_a = float(np.min(vir_a) - np.max(occ_a)) if (occ_a.size > 0 and vir_a.size > 0) else None
    gap_b = float(np.min(vir_b) - np.max(occ_b)) if (occ_b.size > 0 and vir_b.size > 0) else None
    if gap_a is not None:
        gaps_1.append(gap_a)
        if occ_a.size >= 2 and vir_a.size >= 2:
            gaps_2.append(2.0 * gap_a)
    if gap_b is not None:
        gaps_1.append(gap_b)
        if occ_b.size >= 2 and vir_b.size >= 2:
            gaps_2.append(2.0 * gap_b)
    if gap_a is not None and gap_b is not None:
        gaps_2.append(gap_a + gap_b)

    if not gaps_2:
        return {
            "available": False,
            "minSingleGap_Ha": min(gaps_1) if gaps_1 else None,
            "minDoubleGap_Ha": None,
            "nearDegenerate": False,
            "reason": "No active two-electron excitation pairs remain.",
            "warnings": warnings_list,
        }

    min_1 = float(min(gaps_1))
    min_2 = float(min(gaps_2))
    if min_2 < MP2_SMALL_DENOM_THRESHOLD_HA:
        warnings_list.append(
            f"Small MP2 orbital-energy denominator detected: min(e_a + e_b - e_i - e_j) = {min_2:.4f} Ha (< {MP2_SMALL_DENOM_THRESHOLD_HA} Ha)."
        )
    return {
        "available": True,
        "minSingleGap_Ha": min_1,
        "minDoubleGap_Ha": min_2,
        "nearDegenerate": min_2 < MP2_SMALL_DENOM_THRESHOLD_HA,
        "warnings": warnings_list,
    }


def _build_and_run_scf(
    Z: int,
    N: int,
    spin2S: int,
    basis_key: str,
    ref_method: str,
    scf_opts: dict[str, Any],
) -> tuple[gto.Mole, Any, str]:
    sym = gto.mole._symbol(Z)
    charge = Z - N
    basis_obj, basis_source = _load_basis_for_atom(basis_key, Z, sym)

    # C1 symmetry avoids PySCF SO3 irrep lock-in / Davidson excited-root jumping in UCISD/MP2.
    mol = gto.M(
        atom=f"{sym} 0 0 0",
        basis=basis_obj,
        charge=charge,
        spin=spin2S,
        symmetry=False,
        unit="Bohr",
        verbose=0,
        parse_arg=False,
    )

    if ref_method == "rhf":
        mf = scf.RHF(mol)
    elif ref_method == "uhf":
        mf = scf.UHF(mol)
    elif ref_method == "rohf":
        mf = scf.ROHF(mol)
    else:
        raise DomainValidationError("UNSUPPORTED_REFERENCE_METHOD", f"Unsupported reference '{ref_method}'.")

    conv_tol = float(scf_opts.get("convTol", 1e-10))
    conv_tol = max(1e-12, min(1e-5, conv_tol))
    conv_tol_grad = float(scf_opts.get("convTolGrad", math.sqrt(conv_tol)))
    max_cycle = max(1, min(300, int(scf_opts.get("maxCycle", 100))))
    init_guess = str(scf_opts.get("initGuess", "minao"))
    diis_mode = str(scf_opts.get("diis", "cdiis"))
    damp = float(scf_opts.get("damp", 0.0))
    level_shift = float(scf_opts.get("levelShift", 0.0))

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
        mf.damp = min(0.95, damp)
    if level_shift > 0:
        mf.level_shift = min(5.0, level_shift)

    mf.kernel()
    return mol, mf, basis_source


def _reference_spin_diagnostics(mf: Any, ref_method: str, spin2S: int) -> tuple[dict[str, Any], list[str]]:
    S = 0.5 * spin2S
    s2_exact = S * (S + 1.0)
    warns: list[str] = []
    if ref_method == "rhf":
        return {
            "available": True,
            "sSquared": 0.0,
            "sSquaredExact": 0.0,
            "spinContamination": 0.0,
            "multiplicity": 1.0,
            "spinPure": True,
        }, warns
    if ref_method == "rohf":
        return {
            "available": True,
            "sSquared": float(s2_exact),
            "sSquaredExact": float(s2_exact),
            "spinContamination": 0.0,
            "multiplicity": float(spin2S + 1),
            "spinPure": True,
        }, warns
    # UHF
    s2_val, mult_val = mf.spin_square()
    s2_f = _require_finite(s2_val, "UHF <S^2>")
    mult_f = _require_finite(mult_val, "UHF multiplicity")
    contam = abs(s2_f - s2_exact)
    if contam > SPIN_CONTAMINATION_WARN_THRESHOLD:
        warns.append(
            f"UHF reference exhibits spin contamination: <S^2> = {s2_f:.5f} vs exact S(S+1) = {s2_exact:.5f} (|<S^2> - S(S+1)| = {contam:.5f})."
        )
    return {
        "available": True,
        "sSquared": s2_f,
        "sSquaredExact": float(s2_exact),
        "spinContamination": contam,
        "multiplicity": mult_f,
        "spinPure": contam <= 1e-4,
    }, warns


def _run_smoke_probe() -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Run fast, real PySCF 2.15.1 smoke tests on tiny systems before advertising availability."""
    method_status: dict[str, dict[str, Any]] = {}
    notes: list[str] = []

    try:
        mol_he = gto.M(atom="He 0 0 0", basis="6-31g", spin=0, symmetry=False, unit="Bohr", verbose=0, parse_arg=False)
        mf_he = scf.RHF(mol_he).run()
        assert mf_he.converged and _is_finite(mf_he.e_tot)
    except Exception as exc:
        err = f"He/6-31G RHF smoke failed: {exc}"
        for m in ("rmp2", "rcisd", "fci"):
            method_status[m] = {"available": False, "reason": err}
        mf_he = None

    if mf_he is not None:
        # RMP2 smoke
        try:
            mp_he = mp.MP2(mf_he).run()
            assert _is_finite(mp_he.e_corr) and _is_finite(mp_he.e_tot) and mp_he.e_corr < 0.0
            method_status["rmp2"] = {
                "available": True,
                "pyscfClass": f"{type(mp_he).__module__}.{type(mp_he).__name__}",
                "supportedReferences": ["rhf"],
                "smokeBenchmark": "He/6-31G",
            }
        except Exception as exc:
            method_status["rmp2"] = {"available": False, "reason": str(exc)}

        # RCISD smoke
        try:
            ci_he = ci.CISD(mf_he).run()
            assert ci_he.converged and _is_finite(ci_he.e_corr) and _is_finite(ci_he.e_tot)
            method_status["rcisd"] = {
                "available": True,
                "pyscfClass": f"{type(ci_he).__module__}.{type(ci_he).__name__}",
                "supportedReferences": ["rhf"],
                "smokeBenchmark": "He/6-31G",
            }
        except Exception as exc:
            method_status["rcisd"] = {"available": False, "reason": str(exc)}

        # FCI closed-shell smoke
        try:
            fc_he = fci.FCI(mf_he)
            e_fci, c_fci = fc_he.kernel()
            s2_fci, _ = fc_he.spin_square(c_fci, mol_he.nao_nr(), mol_he.nelec)
            assert fc_he.converged and _is_finite(e_fci) and abs(float(s2_fci)) < 1e-6
            fci_ok = True
        except Exception as exc:
            fci_ok = False
            notes.append(f"Closed-shell FCI smoke failed: {exc}")
    else:
        fci_ok = False

    # Open-shell smoke: Li/6-31G
    try:
        mol_li = gto.M(atom="Li 0 0 0", basis="6-31g", spin=1, symmetry=False, unit="Bohr", verbose=0, parse_arg=False)
        mf_li_u = scf.UHF(mol_li).run()
        mf_li_ro = scf.ROHF(mol_li).run()
        assert mf_li_u.converged and mf_li_ro.converged
    except Exception as exc:
        err = f"Li/6-31G open-shell SCF smoke failed: {exc}"
        method_status["ump2"] = {"available": False, "reason": err}
        method_status["romp2"] = {"available": False, "reason": err}
        method_status["ucisd"] = {"available": False, "reason": err}
        method_status["fci"] = {"available": False, "reason": err}
        return method_status, notes

    # UMP2 smoke
    try:
        mp_li_u = mp.MP2(mf_li_u).run()
        assert _is_finite(mp_li_u.e_corr) and _is_finite(mp_li_u.e_tot)
        method_status["ump2"] = {
            "available": True,
            "pyscfClass": f"{type(mp_li_u).__module__}.{type(mp_li_u).__name__}",
            "supportedReferences": ["uhf"],
            "smokeBenchmark": "Li/6-31G",
        }
    except Exception as exc:
        method_status["ump2"] = {"available": False, "reason": str(exc)}

    # ROMP2 smoke
    try:
        mp_li_ro = mp.MP2(mf_li_ro).run()
        assert _is_finite(mp_li_ro.e_corr) and _is_finite(mp_li_ro.e_tot)
        method_status["romp2"] = {
            "available": True,
            "pyscfClass": f"{type(mp_li_ro).__module__}.{type(mp_li_ro).__name__}",
            "supportedReferences": ["rohf"],
            "smokeBenchmark": "Li/6-31G",
        }
    except Exception as exc:
        method_status["romp2"] = {"available": False, "reason": str(exc)}

    # UCISD smoke
    try:
        ci_li_u = ci.CISD(mf_li_u).run()
        assert ci_li_u.converged and _is_finite(ci_li_u.e_corr) and abs(float(ci_li_u.ci[0])) ** 2 > 0.5
        method_status["ucisd"] = {
            "available": True,
            "pyscfClass": f"{type(ci_li_u).__module__}.{type(ci_li_u).__name__}",
            "supportedReferences": ["uhf"],
            "smokeBenchmark": "Li/6-31G",
        }
    except Exception as exc:
        method_status["ucisd"] = {"available": False, "reason": str(exc)}

    # Open-shell FCI + fix_spin_ smoke
    try:
        fc_li = fci.addons.fix_spin_(fci.FCI(mf_li_ro), ss=0.75, shift=0.5)
        e_fci_li, c_fci_li = fc_li.kernel()
        s2_li, _ = fc_li.spin_square(c_fci_li, mol_li.nao_nr(), mol_li.nelec)
        assert fc_li.converged and _is_finite(e_fci_li) and abs(float(s2_li) - 0.75) < 1e-6
        method_status["fci"] = {
            "available": fci_ok,
            "pyscfClass": "pyscf.fci.direct_spin1 / pyscf.fci.direct_uhf / pyscf.mcscf.casci.CASCI",
            "supportedReferences": ["rhf", "rohf", "uhf"],
            "fixSpinReferences": ["rhf", "rohf"],
            "smokeBenchmark": "He/6-31G & Li/6-31G",
        }
    except Exception as exc:
        method_status["fci"] = {"available": False, "reason": str(exc)}

    return method_status, notes


def handle_capabilities() -> dict[str, Any]:
    basis_coverage = {key: _basis_element_coverage(key) for key in SUPPORTED_BASES}
    method_status, smoke_notes = _run_smoke_probe()
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
        "methods": method_status,
        "referenceCompatibility": {
            "rhf": {
                "supported": True,
                "allowedMethods": ["rmp2", "rcisd", "fci"],
                "requiresSinglet": True,
                "spinPure": True,
                "fractionalOccupation": False,
                "fciFixSpinSupported": True,
                "fciFrozenCoreSupported": True,
            },
            "uhf": {
                "supported": True,
                "allowedMethods": ["ump2", "ucisd", "fci"],
                "requiresSinglet": False,
                "spinPure": False,
                "fractionalOccupation": False,
                "fciFixSpinSupported": False,
                "fciFrozenCoreSupported": False,
                "note": "UHF may break spin symmetry (<S^2> reported). FCI(UHF) uses direct_uhf without fix_spin_ and requires frozenCoreMode='none'.",
            },
            "rohf": {
                "supported": True,
                "allowedMethods": ["romp2", "fci"],
                "requiresSinglet": False,
                "requiresOpenShell": True,
                "spinPure": True,
                "fractionalOccupation": False,
                "fciFixSpinSupported": True,
                "fciFrozenCoreSupported": True,
                "disabledMethods": {
                    "rcisd": "Closed-shell RCISD requires RHF.",
                    "ucisd": "PySCF has no spin-restricted ROCISD; ci.CISD(rohf) silently converts ROHF to UHF/UCISD, so select UHF for UCISD.",
                },
            },
            "atom-sph-avg": {
                "supported": False,
                "allowedMethods": [],
                "fractionalOccupation": True,
                "reason": "AtomSphAverageRHF is a spin-unpolarized fractional-occupation spherical ensemble, not a valid canonical single-determinant MP2/CISD/FCI reference.",
            },
        },
        "resourceLimits": {
            "maxFciDeterminants": MAX_FCI_DETERMINANTS,
            "maxCisdAmplitudes": MAX_CISD_AMPLITUDES,
            "maxFciNroots": MAX_FCI_NROOTS,
            "maxCorrelationOrbitals": MAX_CORR_ORBITALS,
        },
        "bases": [
            {
                "id": key,
                "label": meta["label"],
                "bseName": meta["bseName"],
                "elements": basis_coverage[key],
            }
            for key, meta in SUPPORTED_BASES.items()
        ],
        "smokeNotes": smoke_notes,
    }


def _check_resource_limits(estimate: dict[str, Any], corr_method: str, nroots: int) -> None:
    if estimate["nSpatialOrbitals"] > MAX_CORR_ORBITALS:
        raise ResourceLimitError(
            "RESOURCE_LIMIT_EXCEEDED",
            f"Basis spatial orbital count ({estimate['nSpatialOrbitals']}) exceeds configured limit ({MAX_CORR_ORBITALS}).",
            estimate,
        )
    if corr_method == "fci":
        if nroots > MAX_FCI_NROOTS:
            raise ResourceLimitError(
                "RESOURCE_LIMIT_EXCEEDED",
                f"Requested FCI nroots={nroots} exceeds configured limit ({MAX_FCI_NROOTS}).",
                estimate,
            )
        n_det = int(estimate["fciDeterminantCount"])
        if n_det > MAX_FCI_DETERMINANTS:
            raise ResourceLimitError(
                "RESOURCE_LIMIT_EXCEEDED",
                f"Calculation exceeds configured resource limit: FCI determinant space N_det = {n_det:,} exceeds limit {MAX_FCI_DETERMINANTS:,}. Use MP2/CISD, enable noble-core freezing, or pick a smaller basis.",
                estimate,
            )
    if corr_method in ("rcisd", "ucisd"):
        dim = int(estimate["cisdAmplitudeDimension"] or 0)
        if dim > MAX_CISD_AMPLITUDES:
            raise ResourceLimitError(
                "RESOURCE_LIMIT_EXCEEDED",
                f"Calculation exceeds configured resource limit: CISD vector dimension ({dim:,}) exceeds limit {MAX_CISD_AMPLITUDES:,}.",
                estimate,
            )


def _solve_mp2(
    mol: gto.Mole,
    mf: Any,
    ref_method: str,
    corr_method: str,
    frozen: int,
    n_orb: int,
    n_alpha: int,
    n_beta: int,
    corr_opts: dict[str, Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    notes: list[str] = [
        "MP2 is a single-reference, second-order Rayleigh–Schrödinger perturbative correction; it is NOT variational and cannot be bound-checked by E_FCI <= E_MP2.",
    ]
    warns: list[str] = []

    is_restricted = ref_method == "rhf"
    n_act_elec = (n_alpha - frozen) + (n_beta - frozen)
    n_vir_a = n_orb - n_alpha
    n_vir_b = n_orb - n_beta
    has_zero_vir = (n_vir_a <= 0) if is_restricted else (n_vir_a <= 0 and n_vir_b <= 0)

    if is_restricted:
        denom_diag = _compute_mp2_denominator_diagnostics(
            mf.mo_energy, None, n_alpha, n_beta, frozen, is_restricted=True
        )
    elif ref_method == "uhf":
        denom_diag = _compute_mp2_denominator_diagnostics(
            mf.mo_energy[0], mf.mo_energy[1], n_alpha, n_beta, frozen, is_restricted=False
        )
    else:
        # ROMP2 semi-canonicalizes orbitals; compute MP2 object first to obtain semi-canonical orbital energies
        denom_diag = None

    if has_zero_vir or n_act_elec < 2:
        if has_zero_vir:
            warns.append(
                "Zero virtual orbitals exist in this minimal basis; correlation energy is identically 0.0 Ha. Choose a larger basis (e.g. 6-31G or cc-pVDZ) for nontrivial correlation."
            )
        if n_act_elec < 2:
            warns.append(
                "Fewer than 2 active correlated electrons exist in the active space (1-electron system or frozen core leaves <= 1 electron); electron correlation energy is identically 0.0 Ha."
            )

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        mp_obj = mp.MP2(mf, frozen=frozen if frozen > 0 else None)
        if ref_method == "rohf":
            denom_diag = _compute_mp2_denominator_diagnostics(
                mp_obj.mo_energy[0], mp_obj.mo_energy[1], n_alpha, n_beta, frozen, is_restricted=False
            )
        mp_obj.kernel()

    for w in caught:
        msg = str(w.message).strip()
        if msg:
            warns.append(f"PySCF warning: {msg}")

    if denom_diag and denom_diag.get("warnings"):
        warns.extend(denom_diag["warnings"])

    e_hf = _require_finite(mf.e_tot, "E_HF")
    e_corr = _require_finite(mp_obj.e_corr, "E_corr(MP2)")
    e_tot = _require_finite(e_hf + e_corr, "E_total(MP2)")
    pyscf_e_tot = _require_finite(mp_obj.e_tot, "PySCF mp.e_tot")
    if abs(e_tot - pyscf_e_tot) > 1e-8:
        raise DomainValidationError(
            "ENERGY_IDENTITY_MISMATCH",
            f"Energy identity E_HF + E_corr ({e_tot:.12f}) differs from PySCF e_tot ({pyscf_e_tot:.12f}).",
        )

    if e_corr > 1e-12:
        warns.append(
            f"Positive MP2 correlation energy observed ({e_corr:+.6e} Ha); reported honestly without clamping."
        )

    e_corr_ss = float(mp_obj.e_corr_ss) if getattr(mp_obj, "e_corr_ss", None) is not None and _is_finite(mp_obj.e_corr_ss) else None
    e_corr_os = float(mp_obj.e_corr_os) if getattr(mp_obj, "e_corr_os", None) is not None and _is_finite(mp_obj.e_corr_os) else None
    e_corr_singles = (
        float(mp_obj.e_corr_singles)
        if getattr(mp_obj, "e_corr_singles", None) is not None and _is_finite(mp_obj.e_corr_singles)
        else None
    )

    solver_class = f"{type(mp_obj).__module__}.{type(mp_obj).__name__}"
    if ref_method == "rohf":
        notes.append(
            "ROMP2 uses PySCF semi-canonicalized ROHF orbitals and includes the second-order singles contribution (e_corr_singles) from non-vanishing F_ia."
        )

    result = {
        "pyscfClass": solver_class,
        "converged": True,
        "iterations": None,
        "eCorr_Ha": e_corr,
        "eTotal_Ha": e_tot,
        "eCorrSameSpin_Ha": e_corr_ss,
        "eCorrOppositeSpin_Ha": e_corr_os,
        "eCorrSingles_Ha": e_corr_singles,
        "denominatorDiagnostics": denom_diag,
        "roots": None,
        "spinDiagnostics": None,
    }
    void_opts = corr_opts
    del void_opts
    return result, warns, notes


def _solve_cisd(
    mol: gto.Mole,
    mf: Any,
    ref_method: str,
    corr_method: str,
    frozen: int,
    n_orb: int,
    n_alpha: int,
    n_beta: int,
    corr_opts: dict[str, Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    notes: list[str] = [
        "CISD includes all single and double excitations from the reference determinant; it is variational for the same reference/basis/spin sector, but is NOT size-extensive.",
        "Determinant-based PySCF CISD (RCISD/UCISD) does NOT compute LS-coupled CSF states or <L^2>.",
    ]
    warns: list[str] = []
    if corr_method == "ucisd":
        warns.append(
            "Unrestricted CISD (UCISD) eigenvectors are NOT guaranteed to be pure S^2 eigenstates, and PySCF UCISD does not expose a built-in <S^2> method."
        )

    conv_tol = max(1e-11, min(1e-5, float(corr_opts.get("convTol", 1e-8))))
    max_cycle = max(10, min(200, int(corr_opts.get("maxCycle", 60))))

    is_restricted = ref_method == "rhf"
    n_act_elec = (n_alpha - frozen) + (n_beta - frozen)
    n_vir_a = n_orb - n_alpha
    n_vir_b = n_orb - n_beta
    has_zero_vir = (n_vir_a <= 0) if is_restricted else (n_vir_a <= 0 and n_vir_b <= 0)

    if has_zero_vir or n_act_elec < 2:
        if has_zero_vir:
            warns.append("Zero virtual orbitals exist in this minimal basis; CISD correlation energy is 0.0 Ha.")
        if n_act_elec < 2:
            warns.append("Fewer than 2 active electrons exist; CISD single/double electron correlation is ~0.0 Ha.")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        ci_obj = ci.CISD(mf, frozen=frozen if frozen > 0 else None)
        ci_obj.conv_tol = conv_tol
        ci_obj.max_cycle = max_cycle
        ci_obj.kernel()

    for w in caught:
        msg = str(w.message).strip()
        if msg:
            warns.append(f"PySCF warning: {msg}")

    if not bool(ci_obj.converged):
        raise DomainValidationError(
            "SOLVER_NOT_CONVERGED",
            f"{type(ci_obj).__name__} failed to converge within max_cycle={max_cycle} (conv_tol={conv_tol:.1e}).",
        )

    e_hf = _require_finite(mf.e_tot, "E_HF")
    e_corr = _require_finite(ci_obj.e_corr, "E_corr(CISD)")
    c0 = float(np.real(ci_obj.ci[0])) if getattr(ci_obj, "ci", None) is not None and len(ci_obj.ci) > 0 else None
    c0_sq = float(c0 * c0) if c0 is not None and _is_finite(c0) else None

    # PySCF UCISD default Davidson guess can occasionally converge onto an excited state
    # orthogonal to the HF determinant (c0 ~ 0, positive E_corr). Retry anchored on [1, 0, ...].
    if (c0_sq is not None and c0_sq < CISD_MIN_REF_WEIGHT_SQ) or e_corr > 1e-10:
        try:
            ci_retry = ci.CISD(mf, frozen=frozen if frozen > 0 else None)
            ci_retry.conv_tol = conv_tol
            ci_retry.max_cycle = max_cycle
            v0 = np.zeros(ci_retry.vector_size(), dtype=np.float64)
            v0[0] = 1.0
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                e_retry, vec_retry = ci_retry.kernel(ci0=v0)
            c0_retry = float(np.real(vec_retry[0])) if vec_retry is not None and len(vec_retry) > 0 else 0.0
            c0_retry_sq = c0_retry * c0_retry
            if bool(ci_retry.converged) and _is_finite(e_retry) and c0_retry_sq >= CISD_MIN_REF_WEIGHT_SQ:
                ci_obj = ci_retry
                e_corr = float(e_retry)
                c0_sq = float(c0_retry_sq)
        except Exception:
            pass

    e_tot = _require_finite(e_hf + e_corr, "E_total(CISD)")
    pyscf_e_tot = _require_finite(ci_obj.e_tot, "PySCF cisd.e_tot")
    if abs(e_tot - pyscf_e_tot) > 1e-8:
        raise DomainValidationError(
            "ENERGY_IDENTITY_MISMATCH",
            f"Energy identity E_HF + E_corr ({e_tot:.12f}) differs from PySCF e_tot ({pyscf_e_tot:.12f}).",
        )

    if c0_sq is not None and c0_sq < CISD_MIN_REF_WEIGHT_SQ:
        warns.append(
            f"Reference determinant weight |c0|^2 = {c0_sq:.4f} is below {CISD_MIN_REF_WEIGHT_SQ:.2f}; CISD Davidson solver may have collapsed onto a multireference or excited intruder state."
        )
    if e_corr > 1e-10:
        warns.append(
            f"CISD correlation energy is positive ({e_corr:+.6e} Ha), indicating the Davidson root does not improve variationally upon the HF reference."
        )

    # For closed-shell RCISD on RHF, singlet spin symmetry S^2=0 is enforced by spin-adapted equations
    if corr_method == "rcisd":
        ci_spin_diag = {
            "available": True,
            "sSquared": 0.0,
            "sSquaredExact": 0.0,
            "spinContamination": 0.0,
            "multiplicity": 1.0,
            "spinPure": True,
            "note": "Closed-shell RCISD uses spin-adapted singlet configurations (S=0).",
        }
    else:
        ci_spin_diag = {
            "available": False,
            "sSquared": None,
            "sSquaredExact": None,
            "spinContamination": None,
            "multiplicity": None,
            "spinPure": False,
            "unavailableReason": "PySCF UCISD does not compute <S^2> of the unrestricted CI vector; eigenvectors may contain spin contamination.",
        }

    result = {
        "pyscfClass": f"{type(ci_obj).__module__}.{type(ci_obj).__name__}",
        "converged": True,
        "iterations": None,
        "eCorr_Ha": e_corr,
        "eTotal_Ha": e_tot,
        "referenceWeightSq": c0_sq,
        "convTol": conv_tol,
        "maxCycle": max_cycle,
        "denominatorDiagnostics": None,
        "roots": None,
        "spinDiagnostics": ci_spin_diag,
    }
    return result, warns, notes


def _solve_fci(
    mol: gto.Mole,
    mf: Any,
    ref_method: str,
    spin2S: int,
    frozen: int,
    n_orb: int,
    n_alpha: int,
    n_beta: int,
    nroots_req: int,
    fix_spin: bool,
    corr_opts: dict[str, Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    notes: list[str] = [
        "FCI is exact ONLY within the selected finite Gaussian orbital basis and active electron/spin space, not the complete-basis-set physical atom.",
        "Determinant-space PySCF FCI does NOT enforce SO(3) rotational symmetry or compute <L^2>; an <S^2> diagnostic is NOT an <L^2> term assignment.",
    ]
    warns: list[str] = []

    conv_tol = max(1e-11, min(1e-6, float(corr_opts.get("convTol", 1e-9))))
    max_cycle = max(20, min(300, int(corr_opts.get("maxCycle", 100))))
    spin_shift = max(0.05, min(5.0, float(corr_opts.get("spinShift", 0.5))))

    n_act_orb = n_orb - frozen
    n_act_a = n_alpha - frozen
    n_act_b = n_beta - frozen
    n_det = math.comb(n_act_orb, n_act_a) * math.comb(n_act_orb, n_act_b)

    effective_nroots = min(nroots_req, max(1, n_det))
    if effective_nroots < nroots_req:
        warns.append(
            f"Requested nroots={nroots_req} reduced to {effective_nroots} because determinant space dimension is {n_det}."
        )

    S = 0.5 * spin2S
    s2_exact = S * (S + 1.0)
    fix_spin_applied = False

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        if frozen > 0:
            # Shared spatial orbitals (RHF or ROHF) via documented mcscf.CASCI
            mc = mcscf.CASCI(mf, ncas=n_act_orb, nelecas=(n_act_a, n_act_b))
            mc.fcisolver.conv_tol = conv_tol
            mc.fcisolver.max_cycle = max_cycle
            mc.fcisolver.nroots = effective_nroots
            if fix_spin:
                mc.fix_spin_(ss=s2_exact, shift=spin_shift)
                fix_spin_applied = True
            e_res, _, ci_res, _, _ = mc.kernel()
            fcisolver = mc.fcisolver
            solver_class = f"{type(mc).__module__}.{type(mc).__name__}({type(fcisolver).__name__})"
            use_uhf_spin = False
        else:
            fcisolver = fci.FCI(mf)
            fcisolver.conv_tol = conv_tol
            fcisolver.max_cycle = max_cycle
            if ref_method == "uhf":
                use_uhf_spin = True
                if fix_spin:
                    warns.append(
                        "PySCF UHFCISolver (FCI on UHF) does not implement fci.addons.fix_spin_; spin contamination is diagnosed directly via overlap-corrected <S^2>. Use ROHF or RHF for fix_spin_ spin projection."
                    )
            else:
                use_uhf_spin = False
                if fix_spin:
                    fcisolver = fci.addons.fix_spin_(fcisolver, ss=s2_exact, shift=spin_shift)
                    fix_spin_applied = True
            e_res, ci_res = fcisolver.kernel(nroots=effective_nroots)
            solver_class = f"{type(fcisolver).__module__}.{type(fcisolver).__name__}"

    for w in caught:
        msg = str(w.message).strip()
        if msg:
            warns.append(f"PySCF warning: {msg}")

    conv_attr = getattr(fcisolver, "converged", True)
    fci_converged = bool(np.all(conv_attr)) if isinstance(conv_attr, (list, tuple, np.ndarray)) else bool(conv_attr)
    if not fci_converged:
        raise DomainValidationError(
            "SOLVER_NOT_CONVERGED",
            f"FCI Davidson solver did not converge within max_cycle={max_cycle} (conv_tol={conv_tol:.1e}).",
        )

    e_hf = _require_finite(mf.e_tot, "E_HF")
    if effective_nroots == 1:
        energies = [_require_finite(e_res, "FCI root 0 energy")]
        ci_vecs = [ci_res]
    else:
        energies = [_require_finite(x, f"FCI root {idx} energy") for idx, x in enumerate(e_res)]
        ci_vecs = list(ci_res)

    roots_out: list[dict[str, Any]] = []
    any_spin_contaminated = False
    for idx, (e_val, c_vec) in enumerate(zip(energies, ci_vecs)):
        if use_uhf_spin:
            s2_val, mult_val = fci.direct_uhf.spin_square(
                c_vec,
                n_act_orb,
                (n_act_a, n_act_b),
                mo_coeff=mf.mo_coeff,
                ovlp=mf.get_ovlp(),
                fcisolver=fcisolver,
            )
        else:
            s2_val, mult_val = fcisolver.spin_square(c_vec, n_act_orb, (n_act_a, n_act_b))
        s2_f = _require_finite(s2_val, f"FCI root {idx} <S^2>")
        mult_f = _require_finite(mult_val, f"FCI root {idx} multiplicity")
        spin_err = abs(s2_f - s2_exact)
        spin_pure = spin_err <= FCI_SPIN_PURITY_TOL
        if not spin_pure:
            any_spin_contaminated = True
        e_corr_i = e_val - e_hf
        roots_out.append({
            "rootIndex": idx,
            "eTotal_Ha": e_val,
            "eTotal_eV": e_val * HARTREE_TO_EV,
            "eCorr_Ha": e_corr_i,
            "excitation_Ha": e_val - energies[0],
            "excitation_eV": (e_val - energies[0]) * HARTREE_TO_EV,
            "sSquared": s2_f,
            "sSquaredExact": float(s2_exact),
            "spinError": spin_err,
            "multiplicity": mult_f,
            "spinPure": spin_pure,
            "spinStatus": "spin-pure" if spin_pure else "unresolved-or-contaminated",
        })

    if any_spin_contaminated:
        warns.append(
            f"One or more FCI roots deviate from target S(S+1)={s2_exact:.4f} beyond {FCI_SPIN_PURITY_TOL:.1e}; marked as unresolved-or-contaminated rather than pure spin multiplicity {spin2S + 1}."
        )

    root0 = roots_out[0]
    e_corr0 = float(root0["eCorr_Ha"])
    e_tot0 = _require_finite(e_hf + e_corr0, "E_total(FCI)")

    fci_spin_diag = {
        "available": True,
        "sSquared": root0["sSquared"],
        "sSquaredExact": root0["sSquaredExact"],
        "spinContamination": root0["spinError"],
        "multiplicity": root0["multiplicity"],
        "spinPure": root0["spinPure"],
        "spinStatus": root0["spinStatus"],
        "fixSpinApplied": fix_spin_applied,
        "spinShift": spin_shift if fix_spin_applied else None,
        "lSquaredAvailable": False,
        "lSquared": None,
        "lSquaredUnavailableReason": "Determinant FCI operates in finite C1 orbital space, not SO(3) LS-CSF eigenstates; <L^2> is not computed here.",
    }

    result = {
        "pyscfClass": solver_class,
        "converged": True,
        "iterations": None,
        "eCorr_Ha": e_corr0,
        "eTotal_Ha": e_tot0,
        "convTol": conv_tol,
        "maxCycle": max_cycle,
        "fixSpinApplied": fix_spin_applied,
        "denominatorDiagnostics": None,
        "roots": roots_out,
        "spinDiagnostics": fci_spin_diag,
    }
    return result, warns, notes


def handle_estimate(payload: dict[str, Any]) -> dict[str, Any]:
    Z = int(payload["Z"])
    N = int(payload["N"])
    spin2S = int(payload.get("spin2S", 0))
    ref_method = str(payload.get("referenceMethod", "rhf" if spin2S == 0 else "uhf")).lower()
    corr_method = str(payload.get("correlationMethod", "rmp2" if spin2S == 0 else "ump2")).lower()
    basis_key = str(payload.get("basis", "cc-pvdz")).lower()
    frozen_mode = str(payload.get("frozenCoreMode", "none")).lower()
    nroots = int(payload.get("nRoots", 1))

    if not (1 <= Z <= 54):
        raise DomainValidationError("INVALID_Z", f"Atomic number Z must be in 1..54 (got {Z}).")
    if not (1 <= N <= Z + 4):
        raise DomainValidationError("INVALID_N", f"Electron count N must be in 1..{Z + 4} (got {N}).")
    if spin2S < 0 or spin2S > N or (N - spin2S) % 2 != 0:
        raise DomainValidationError("INVALID_SPIN", f"Spin 2S={spin2S} is incompatible with N={N} electrons.")
    if basis_key not in SUPPORTED_BASES:
        raise DomainValidationError("UNSUPPORTED_BASIS", f"Unsupported basis '{basis_key}'.")

    n_alpha = (N + spin2S) // 2
    n_beta = (N - spin2S) // 2

    sym = gto.mole._symbol(Z)
    basis_obj, basis_source = _load_basis_for_atom(basis_key, Z, sym)
    mol = gto.M(
        atom=f"{sym} 0 0 0",
        basis=basis_obj,
        charge=Z - N,
        spin=spin2S,
        symmetry=False,
        unit="Bohr",
        verbose=0,
        parse_arg=False,
    )
    n_orb = int(mol.nao_nr())
    frozen = _resolve_frozen_orbitals(Z, n_orb, n_alpha, n_beta, frozen_mode)
    _validate_method_reference_pair(ref_method, corr_method, spin2S, frozen)
    est = _estimate_dimensions(n_orb, n_alpha, n_beta, frozen, corr_method, ref_method, nroots)
    within_limits = True
    limit_reason = None
    try:
        _check_resource_limits(est, corr_method, nroots)
    except ResourceLimitError as exc:
        within_limits = False
        limit_reason = str(exc)

    return {
        "ok": True,
        "basisSource": basis_source,
        "withinLimits": within_limits,
        "limitReason": limit_reason,
        "estimate": est,
    }


def handle_calculate(payload: dict[str, Any]) -> dict[str, Any]:
    tracemalloc.start()
    t0 = time.perf_counter()

    try:
        Z = int(payload["Z"])
        N = int(payload["N"])
        spin2S = int(payload.get("spin2S", 0))
        ref_method = str(payload.get("referenceMethod", "rhf" if spin2S == 0 else "uhf")).lower()
        corr_method = str(payload.get("correlationMethod", "rmp2" if spin2S == 0 else "ump2")).lower()
        basis_key = str(payload.get("basis", "cc-pvdz")).lower()
        frozen_mode = str(payload.get("frozenCoreMode", "none")).lower()
        nroots = int(payload.get("nRoots", 1))
        fix_spin = bool(payload.get("fixSpin", True))
        scf_opts = payload.get("scfOptions") or {}
        corr_opts = payload.get("correlationOptions") or {}

        if not (1 <= Z <= 54):
            raise DomainValidationError("INVALID_Z", f"Atomic number Z must be in 1..54 (got {Z}).")
        if not (1 <= N <= Z + 4):
            raise DomainValidationError("INVALID_N", f"Electron count N must be in 1..{Z + 4} (got {N}).")
        if spin2S < 0 or spin2S > N or (N - spin2S) % 2 != 0:
            raise DomainValidationError("INVALID_SPIN", f"Spin 2S={spin2S} is incompatible with N={N} electrons.")
        if basis_key not in SUPPORTED_BASES:
            raise DomainValidationError("UNSUPPORTED_BASIS", f"Unsupported basis '{basis_key}'.")
        if nroots < 1 or nroots > 20:
            raise DomainValidationError("INVALID_NROOTS", f"nRoots must be a positive integer <= 20 (got {nroots}).")

        n_alpha = (N + spin2S) // 2
        n_beta = (N - spin2S) // 2
        sym = gto.mole._symbol(Z)
        basis_obj, basis_source = _load_basis_for_atom(basis_key, Z, sym)

        # Build Mole first (cheap!) to get exact basis function count n_orb and enforce limits BEFORE SCF/post-HF
        probe_mol = gto.M(
            atom=f"{sym} 0 0 0",
            basis=basis_obj,
            charge=Z - N,
            spin=spin2S,
            symmetry=False,
            unit="Bohr",
            verbose=0,
            parse_arg=False,
        )
        n_orb = int(probe_mol.nao_nr())
        frozen = _resolve_frozen_orbitals(Z, n_orb, n_alpha, n_beta, frozen_mode)
        _validate_method_reference_pair(ref_method, corr_method, spin2S, frozen)

        estimate = _estimate_dimensions(n_orb, n_alpha, n_beta, frozen, corr_method, ref_method, nroots)
        _check_resource_limits(estimate, corr_method, nroots)

        # Now run SCF reference
        t_scf0 = time.perf_counter()
        mol, mf, basis_source = _build_and_run_scf(Z, N, spin2S, basis_key, ref_method, scf_opts)
        t_scf_ms = (time.perf_counter() - t_scf0) * 1000.0

        if not bool(mf.converged):
            raise DomainValidationError(
                "SCF_NOT_CONVERGED",
                f"Reference {ref_method.upper()}/{basis_key} failed to converge within max_cycle={mf.max_cycle}; post-HF correlation aborted rather than running on an unconverged reference.",
            )

        e_hf = _require_finite(mf.e_tot, "E_HF")
        ref_spin, scf_warns = _reference_spin_diagnostics(mf, ref_method, spin2S)

        t_corr0 = time.perf_counter()
        if corr_method in ("rmp2", "ump2", "romp2"):
            corr_res, corr_warns, corr_notes = _solve_mp2(
                mol, mf, ref_method, corr_method, frozen, n_orb, n_alpha, n_beta, corr_opts
            )
        elif corr_method in ("rcisd", "ucisd"):
            corr_res, corr_warns, corr_notes = _solve_cisd(
                mol, mf, ref_method, corr_method, frozen, n_orb, n_alpha, n_beta, corr_opts
            )
        elif corr_method == "fci":
            corr_res, corr_warns, corr_notes = _solve_fci(
                mol, mf, ref_method, spin2S, frozen, n_orb, n_alpha, n_beta, nroots, fix_spin, corr_opts
            )
        else:
            raise DomainValidationError("UNSUPPORTED_CORRELATION_METHOD", f"Unsupported method '{corr_method}'.")
        t_corr_ms = (time.perf_counter() - t_corr0) * 1000.0

        all_warnings = scf_warns + corr_warns
        all_warnings.append(
            "Finite-basis non-relativistic fixed point-nucleus calculation; determinant correlation results are NOT Russell–Saunders LS-coupled CSF eigenstates."
        )

        # Open-shell p/d/f warning note when degenerate partially-filled shells likely exist
        if spin2S > 0 and Z >= 5 and N >= 5:
            all_warnings.append(
                "Open-shell p/d/f atomic determinant may break spherical symmetry in C1 and possess near-degenerate states; interpret single-reference correlation cautiously."
            )

        e_corr = float(corr_res["eCorr_Ha"])
        e_tot = float(corr_res["eTotal_Ha"])
        identity_err = abs(e_tot - (e_hf + e_corr))

        _, peak_bytes = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        t_total_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "ok": True,
            "system": {
                "Z": Z,
                "symbol": sym,
                "N": N,
                "charge": Z - N,
                "multiplicity": spin2S + 1,
                "spin2S": spin2S,
                "spinConvention": f"2S = {spin2S} (N_alpha={n_alpha}, N_beta={n_beta}, M_S={spin2S / 2:+.1f})",
            },
            "basis": basis_key,
            "basisSource": basis_source,
            "basisFunctionCount": n_orb,
            "symmetryGroup": "C1",
            "nuclearRepulsion_Ha": 0.0,
            "densityFittingActive": False,
            "reference": {
                "method": ref_method,
                "pyscfClass": f"{type(mf).__module__}.{type(mf).__name__}",
                "converged": bool(mf.converged),
                "cycles": int(mf.cycles),
                "maxCycle": int(mf.max_cycle),
                "convTol": float(mf.conv_tol),
                "energy_Ha": e_hf,
                "energy_eV": e_hf * HARTREE_TO_EV,
                "spinDiagnostics": ref_spin,
            },
            "orbitals": {
                "nSpatialOrbitals": n_orb,
                "nAlphaTotal": n_alpha,
                "nBetaTotal": n_beta,
                "frozenCoreMode": frozen_mode,
                "frozenOrbitals": frozen,
                "frozenElectrons": 2 * frozen,
                "correlatedElectrons": N - 2 * frozen,
                "activeSpatialOrbitals": n_orb - frozen,
                "activeAlphaElectrons": n_alpha - frozen,
                "activeBetaElectrons": n_beta - frozen,
            },
            "correlation": {
                "requestedMethod": corr_method,
                "actualPyscfClass": corr_res["pyscfClass"],
                "converged": bool(corr_res["converged"]),
                "eHf_Ha": e_hf,
                "eHf_eV": e_hf * HARTREE_TO_EV,
                "eCorr_Ha": e_corr,
                "eCorr_eV": e_corr * HARTREE_TO_EV,
                "eTotal_Ha": e_tot,
                "eTotal_eV": e_tot * HARTREE_TO_EV,
                "energyIdentityError_Ha": identity_err,
                "isVariational": corr_method in ("rcisd", "ucisd", "fci"),
                "isSizeExtensive": corr_method in ("rmp2", "ump2", "romp2", "fci"),
                "isLsTermResolved": False,
                "eCorrSameSpin_Ha": corr_res.get("eCorrSameSpin_Ha"),
                "eCorrOppositeSpin_Ha": corr_res.get("eCorrOppositeSpin_Ha"),
                "eCorrSingles_Ha": corr_res.get("eCorrSingles_Ha"),
                "referenceWeightSq": corr_res.get("referenceWeightSq"),
                "fixSpinApplied": corr_res.get("fixSpinApplied"),
                "denominatorDiagnostics": corr_res.get("denominatorDiagnostics"),
                "spinDiagnostics": corr_res.get("spinDiagnostics"),
                "roots": corr_res.get("roots"),
            },
            "resourceEstimate": estimate,
            "warnings": all_warnings,
            "methodNotes": corr_notes,
            "runtime": {
                "engine": "PySCF",
                "engineVersion": pyscf.__version__,
                "bseVersion": bse.__version__,
                "scfMs": round(t_scf_ms, 3),
                "correlationMs": round(t_corr_ms, 3),
                "totalMs": round(t_total_ms, 3),
                "peakMemoryMB": round(peak_bytes / (1024.0 * 1024.0), 3),
            },
        }
    except Exception:
        if tracemalloc.is_tracing():
            tracemalloc.stop()
        raise


def main() -> int:
    raw = sys.stdin.read()
    try:
        req = json.loads(raw) if raw.strip() else {}
        action = req.get("action", "calculate")
        if action == "capabilities":
            out = handle_capabilities()
        elif action == "estimate":
            out = handle_estimate(req)
        elif action == "calculate":
            out = handle_calculate(req)
        else:
            raise DomainValidationError("UNKNOWN_ACTION", f"Unknown correlation backend action: {action}")
        sys.stdout.write(json.dumps(out, allow_nan=False))
        return 0
    except ResourceLimitError as exc:
        err = {
            "ok": False,
            "code": exc.code,
            "error": str(exc),
            "errorType": type(exc).__name__,
            "resourceEstimate": exc.estimate,
        }
        sys.stdout.write(json.dumps(err, allow_nan=False))
        return 1
    except DomainValidationError as exc:
        err = {
            "ok": False,
            "code": exc.code,
            "error": str(exc),
            "errorType": type(exc).__name__,
        }
        sys.stdout.write(json.dumps(err, allow_nan=False))
        return 1
    except Exception as exc:
        err = {
            "ok": False,
            "code": "CORRELATION_BACKEND_ERROR",
            "error": str(exc),
            "errorType": type(exc).__name__,
        }
        sys.stdout.write(json.dumps(err, allow_nan=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
