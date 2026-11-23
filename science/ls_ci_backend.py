#!/usr/bin/env python3
"""
ATOMS v0.7.1 Local Fixed-Orbital LS-Coupled Multiconfiguration CI Backend.

Architecture (validated in docs/ATOMIC_LS_SOLVER_AUDIT.md):
  1. Radial orbitals (n, l) are generated using PySCF AtomSphAverageRHF (Apache-2.0)
     so every shell is strictly SO(3)-symmetric (zero cross-l mixing, degenerate 2l+1
     real-harmonic partners) and aligned to Condon-Shortley complex spherical orbitals
     |n, l, m_l> via pyscf.symm.sph.sph_pure2real(l, reorder_p=True).
  2. Active-space 1e core-Fock and 2e electron repulsion integrals are transformed into
     the complex spherical MO basis (verified real & L_z-conserving).
  3. Within each configuration gamma matching target parity pi = (-1)^(sum q_i l_i),
     exact antisymmetrized LS-CSFs are projected in (M_L=L, M_S=S) as the joint
     highest-weight nullspace ker(L_+) cap ker(S_+) via eigh(L_+^T L_+ + S_+^T S_+),
     with subshell parentage resolution where multiple CSFs arise.
  4. The Hamiltonian matrix H_IJ is built inside the single (L, S, pi) CSF block via
     sparse bucketed Slater-Condon evaluation, verified Hermitian, diagonalized with
     scipy.linalg.eigh (dense) or scipy.sparse.linalg.eigsh (Lanczos, large blocks),
     and every root has <L^2>, Var(L^2), <S^2>, and Var(S^2) directly evaluated.

Honesty contract:
  - Radial orbitals are FIXED from AtomSphAverageRHF ("fixed-orbital-ls-ci").
  - MCHF radial orbital optimization is NOT implemented in v0.7.1.
"""
from __future__ import annotations

import itertools
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
import scipy.linalg
import scipy.sparse
import scipy.sparse.linalg
from pyscf import ao2mo, fci, gto
from pyscf.data import elements as pyscf_elements
from pyscf.scf import atom_hf
from pyscf.symm import sph

HARTREE_TO_EV = 27.211386245988  # CODATA 2018
HARTREE_TO_CM1 = 219474.63136320  # CODATA 2018
L_LETTERS_SUBSHELL = "spdfghi"
L_LETTERS_TERM = "SPDFGHIKLMNOQRTUVWXYZ"

SUPPORTED_Z_MIN = 1
SUPPORTED_Z_MAX = 30
MAX_DETERMINANTS = 12000
MAX_CSFS = 2500
DENSE_DIAG_THRESHOLD = 450
MAX_DENSE_MEMORY_MB = 256.0

SUPPORTED_BASES = {
    "sto-3g": {"label": "STO-3G", "bseName": "sto-3g", "maxAllElectronZ": 54},
    "6-31g": {"label": "6-31G", "bseName": "6-31g", "maxAllElectronZ": 36},
    "cc-pvdz": {"label": "cc-pVDZ", "bseName": "cc-pvdz", "maxAllElectronZ": 36},
    "cc-pvtz": {"label": "cc-pVTZ", "bseName": "cc-pvtz", "maxAllElectronZ": 36},
    "aug-cc-pvtz": {"label": "aug-cc-pVTZ", "bseName": "aug-cc-pvtz", "maxAllElectronZ": 36},
    "def2-svp": {"label": "def2-SVP", "bseName": "def2-svp", "maxAllElectronZ": 36},
    "def2-tzvp": {"label": "def2-TZVP", "bseName": "def2-tzvp", "maxAllElectronZ": 36},
}

SUP_DIGITS = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def to_sup(n: int) -> str:
    return str(n).translate(SUP_DIGITS)


def format_term_symbol(spin_2s: int, L: int, parity: str, ascii_mode: bool = False) -> str:
    mult = spin_2s + 1
    letter = L_LETTERS_TERM[L] if L < len(L_LETTERS_TERM) else f"[L={L}]"
    if ascii_mode:
        return f"{mult}{letter}{'o' if parity == 'odd' else ''}"
    return f"{to_sup(mult)}{letter}{'°' if parity == 'odd' else ''}"


def format_config_label(occs: list[tuple[int, int, int]]) -> str:
    parts = []
    for n, l, q in sorted(occs, key=lambda x: (x[0], x[1])):
        if q > 0:
            ch = L_LETTERS_SUBSHELL[l] if l < len(L_LETTERS_SUBSHELL) else f"l{l}"
            parts.append(f"{n}{ch}{to_sup(q)}")
    return " ".join(parts)


def allowed_j_values(L: int, S: float) -> list[float]:
    two_l = round(2 * L)
    two_s = round(2 * S)
    return [tj / 2.0 for tj in range(abs(two_l - two_s), two_l + two_s + 1, 2)]


def _load_basis_for_atom(basis_key: str, Z: int, sym: str) -> tuple[Any, str]:
    if basis_key not in SUPPORTED_BASES:
        raise ValueError(f"Unsupported basis '{basis_key}'.")
    max_ae = int(SUPPORTED_BASES[basis_key]["maxAllElectronZ"])
    if Z > max_ae:
        raise ValueError(f"All-electron basis '{basis_key}' is capped at Z <= {max_ae} (got Z={Z}).")
    try:
        loaded = gto.basis.load(basis_key, sym)
        if loaded:
            return basis_key, f"PySCF bundled {basis_key}"
    except Exception:
        pass
    bse_name = SUPPORTED_BASES[basis_key]["bseName"]
    nwchem_txt = bse.get_basis(bse_name, elements=[Z], fmt="nwchem")
    parsed = gto.basis.parse(nwchem_txt)
    if parsed:
        return {sym: parsed}, f"Basis Set Exchange v{bse.__version__} ({bse_name})"
    raise ValueError(f"Basis '{basis_key}' does not cover Z={Z} ({sym}).")


def build_so3_complex_shells(
    Z: int,
    N: int,
    basis_key: str,
    ref_config: list[dict[str, int]],
) -> tuple[gto.Mole, Any, str, list[dict[str, Any]], float, float, float]:
    sym = pyscf_elements.ELEMENTS[Z]
    basis_obj, basis_source = _load_basis_for_atom(basis_key, Z, sym)
    charge = Z - N

    mol = gto.M(
        atom=f"{sym} 0.0 0.0 0.0",
        basis=basis_obj,
        charge=charge,
        spin=N % 2,
        symmetry=False,
        verbose=0,
        parse_arg=False,
    )

    # Set explicit [s, p, d, f] electron counts for AtomSphAverageRHF
    shell_l_totals = [0, 0, 0, 0]
    for item in ref_config:
        l = int(item["l"])
        q = int(item["q"])
        if 0 <= l <= 3:
            shell_l_totals[l] += q

    mf = atom_hf.AtomSphAverageRHF(mol)
    mf.atomic_configuration = {Z: shell_l_totals, sym: shell_l_totals}
    mf.conv_tol = 1e-11
    mf.max_cycle = 120
    mf.verbose = 0
    e_sph = float(mf.kernel())
    if not mf.converged:
        # Retry with level shift / larger max_cycle if excited configuration oscillates
        mf2 = atom_hf.AtomSphAverageRHF(mol)
        mf2.atomic_configuration = {Z: shell_l_totals, sym: shell_l_totals}
        mf2.conv_tol = 1e-10
        mf2.max_cycle = 200
        mf2.level_shift = 0.2
        mf2.verbose = 0
        e_sph = float(mf2.kernel())
        if mf2.converged:
            mf = mf2
        else:
            raise RuntimeError(
                f"Reference AtomSphAverageRHF failed to converge for {sym} (Z={Z}, N={N}, basis={basis_key})."
            )

    S = mol.intor("int1e_ovlp")
    C = np.asarray(mf.mo_coeff, dtype=np.float64)
    E = np.asarray(mf.mo_energy, dtype=np.float64)
    occ = np.asarray(mf.mo_occ, dtype=np.float64)

    ao_loc = mol.ao_loc_nr()
    ao_l = np.zeros(mol.nao, dtype=int)
    l_blocks: dict[int, list[slice]] = {}
    for sh in range(mol.nbas):
        l = int(mol.bas_angular(sh))
        nctr = int(mol.bas_nctr(sh))
        dim = 2 * l + 1
        s0 = int(ao_loc[sh])
        for c in range(nctr):
            l_blocks.setdefault(l, []).append(slice(s0 + c * dim, s0 + (c + 1) * dim))
            ao_l[s0 + c * dim : s0 + (c + 1) * dim] = l

    SC = S @ C
    shells: list[dict[str, Any]] = []
    max_ang_mix = 0.0
    max_align_err = 0.0

    for l in sorted(set(ao_l.tolist())):
        mask = ao_l == l
        idxs: list[int] = []
        for i in range(mol.nao):
            w_l = float(np.sum(C[mask, i] * SC[mask, i]))
            if w_l > 0.5:
                mix = abs(1.0 - w_l)
                max_ang_mix = max(max_ang_mix, mix)
                if mix > 1e-7:
                    raise RuntimeError(f"SO(3) angular-momentum mixing {mix:.2e} detected in orbital {i}.")
                idxs.append(i)
        idxs.sort(key=lambda i: E[i])
        dim = 2 * l + 1
        if len(idxs) % dim != 0:
            raise RuntimeError(f"Orbital count {len(idxs)} for l={l} is not a multiple of 2l+1={dim}.")
        blocks = l_blocks[l]
        for k_n in range(len(idxs) // dim):
            n_q = l + 1 + k_n
            grp = idxs[k_n * dim : (k_n + 1) * dim]
            e_grp = E[grp]
            split = float(np.max(e_grp) - np.min(e_grp))
            if split > 1e-6:
                raise RuntimeError(f"Shell {n_q}{L_LETTERS_SUBSHELL[l]} degeneracy split {split:.2e} Ha exceeds 1e-6.")
            C_sub = C[:, grp]
            tensor = np.stack([C_sub[sl, :] for sl in blocks], axis=0)
            b_best = int(np.argmax(np.sum(tensor ** 2, axis=(1, 2))))
            u_p, _, vt_p = np.linalg.svd(tensor[b_best])
            Q_align = vt_p.T @ u_p.T
            C_real = C_sub @ Q_align
            tensor_aligned = np.stack([C_real[sl, :] for sl in blocks], axis=0)
            for b in range(len(blocks)):
                diag_mean = float(np.mean(np.diag(tensor_aligned[b])))
                off_err = float(np.max(np.abs(tensor_aligned[b] - diag_mean * np.eye(dim))))
                max_align_err = max(max_align_err, off_err)
            U_c = sph.sph_pure2real(l, reorder_p=True).conj().T
            shells.append(
                {
                    "n": n_q,
                    "l": l,
                    "label": f"{n_q}{L_LETTERS_SUBSHELL[l] if l < len(L_LETTERS_SUBSHELL) else f'l{l}'}",
                    "energy": float(np.mean(e_grp)),
                    "avgOcc": float(np.sum(occ[grp])),
                    "split": split,
                    "maxMix": max_ang_mix,
                    "C_real": C_real,
                    "U_c": U_c,
                    "C_complex": C_real @ U_c,
                }
            )

    shells.sort(key=lambda s: (s["energy"], s["n"], s["l"]))
    C_all = np.hstack([s["C_complex"] for s in shells])
    complex_ortho_err = float(np.max(np.abs(C_all.conj().T @ S @ C_all - np.eye(mol.nao))))
    return mol, mf, basis_source, shells, e_sph, complex_ortho_err, max_ang_mix, max_align_err


def _canonical_core_nl(Z: int) -> set[tuple[int, int]]:
    if Z <= 2:
        return set()
    if Z <= 10:
        return {(1, 0)}
    if Z <= 18:
        return {(1, 0), (2, 0), (2, 1)}
    return {(1, 0), (2, 0), (2, 1), (3, 0), (3, 1)}


def _select_active_space(
    Z: int,
    N: int,
    shells: list[dict[str, Any]],
    ref_config: list[dict[str, int]],
    mode: str,
    target_L: int,
    target_spin2S: int,
    target_parity: str,
    custom_core: list[dict[str, int]] | None,
    custom_active_shells: list[dict[str, int]] | None,
    custom_configs: list[list[dict[str, int]]] | None,
    max_excitation_rank: int | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[tuple[int, ...]]]:
    shell_by_nl = {(s["n"], s["l"]): s for s in shells}
    ref_occ_map = {(int(r["n"]), int(r["l"])): int(r["q"]) for r in ref_config if int(r["q"]) > 0}

    for nl in ref_occ_map:
        if nl not in shell_by_nl:
            raise ValueError(
                f"Requested subshell ({nl[0]}, l={nl[1]}) is not spanned by basis '{len(shells)} shells'."
            )

    # Determine frozen core shells
    core_nls: set[tuple[int, int]] = set()
    if custom_core is not None:
        for item in custom_core:
            nl = (int(item["n"]), int(item["l"]))
            q = int(item["q"])
            cap = 2 * (2 * nl[1] + 1)
            if q != cap:
                raise ValueError(f"Frozen core subshell {nl} must be closed ({cap} e, got {q}).")
            core_nls.add(nl)
    elif mode == "single-config":
        # Freeze all closed shells unless ALL shells are closed (then keep outermost occupied shell active)
        open_nls = {nl for nl, q in ref_occ_map.items() if q < 2 * (2 * nl[1] + 1)}
        if open_nls:
            core_nls = {nl for nl, q in ref_occ_map.items() if q == 2 * (2 * nl[1] + 1)}
        else:
            sorted_occ = sorted(ref_occ_map.keys(), key=lambda nl: shell_by_nl[nl]["energy"])
            core_nls = set(sorted_occ[:-1])
    else:
        cand_core = _canonical_core_nl(Z)
        for nl in cand_core:
            cap = 2 * (2 * nl[1] + 1)
            if ref_occ_map.get(nl, 0) == cap:
                core_nls.add(nl)

    # Determine active shells
    if custom_active_shells is not None and len(custom_active_shells) > 0:
        act_nls = [(int(s["n"]), int(s["l"])) for s in custom_active_shells]
    elif custom_configs is not None and len(custom_configs) > 0:
        act_set: set[tuple[int, int]] = set()
        for cfg in custom_configs:
            for s in cfg:
                nl = (int(s["n"]), int(s["l"]))
                if nl not in core_nls and int(s["q"]) > 0:
                    act_set.add(nl)
        act_nls = sorted(act_set, key=lambda nl: shell_by_nl[nl]["energy"])
    elif mode == "single-config":
        act_nls = sorted([nl for nl in ref_occ_map if nl not in core_nls], key=lambda nl: shell_by_nl[nl]["energy"])
    elif mode == "valence-cas":
        # Occupied non-core shells + same-valence-n s/p (and 3d for transition series) shells if available
        act_set = {nl for nl in ref_occ_map if nl not in core_nls}
        max_n_occ = max((nl[0] for nl in act_set), default=1)
        for s in shells:
            nl = (s["n"], s["l"])
            if nl in core_nls:
                continue
            if Z <= 2 and s["n"] <= 2 and s["l"] <= 1:
                act_set.add(nl)
            elif 3 <= Z <= 10 and s["n"] == 2 and s["l"] <= 1:
                act_set.add(nl)
            elif 11 <= Z <= 18 and s["n"] == 3 and s["l"] <= 1:
                act_set.add(nl)
            elif 19 <= Z <= 30 and ((s["n"] == 3 and s["l"] == 2) or (s["n"] == 4 and s["l"] <= 1)):
                act_set.add(nl)
            elif s["n"] <= max_n_occ and s["l"] <= 1 and nl not in core_nls:
                act_set.add(nl)
        act_nls = sorted(act_set, key=lambda nl: shell_by_nl[nl]["energy"])
    else:
        # valence-plus-virtuals: include valence + next lowest virtual shell(s) up to cap (l <= 2)
        act_set = {nl for nl in ref_occ_map if nl not in core_nls}
        non_core = [s for s in shells if (s["n"], s["l"]) not in core_nls and s["l"] <= 2]
        # Take up to 5 lowest non-core shells (gives e.g. 2s,2p,3s,3p,3d for Z=2..10!)
        for s in non_core[:5]:
            act_set.add((s["n"], s["l"]))
        act_nls = sorted(act_set, key=lambda nl: shell_by_nl[nl]["energy"])

    for nl in act_nls:
        if nl not in shell_by_nl:
            raise ValueError(f"Active shell {nl} is not present in the chosen Gaussian basis.")
        if nl in core_nls:
            raise ValueError(f"Shell {nl} cannot be both frozen core and active.")

    core_shells = [shell_by_nl[nl] for nl in sorted(core_nls, key=lambda x: shell_by_nl[x]["energy"])]
    act_shells = [shell_by_nl[nl] for nl in act_nls]

    n_core_elec = sum(2 * (2 * s["l"] + 1) for s in core_shells)
    n_act_elec = N - n_core_elec
    if n_act_elec <= 0:
        raise ValueError(f"Active electron count must be >= 1 (N={N}, frozen core={n_core_elec}).")

    # Build reference occupation vector across act_shells
    ref_vec = tuple(ref_occ_map.get((s["n"], s["l"]), 0) for s in act_shells)
    if sum(ref_vec) != n_act_elec:
        raise ValueError(
            f"Reference configuration places {sum(ref_vec)} electrons in active shells, expected {n_act_elec}."
        )

    target_par_val = 1 if target_parity == "odd" else 0
    # Note core parity is always even because every core shell is closed (2*(2l+1)*l is even)

    if mode == "custom-configs" and custom_configs:
        configs_out: list[tuple[int, ...]] = []
        seen_cfg: set[tuple[int, ...]] = set()
        act_index = {(s["n"], s["l"]): idx for idx, s in enumerate(act_shells)}
        for cfg in custom_configs:
            vec = [0] * len(act_shells)
            for item in cfg:
                nl = (int(item["n"]), int(item["l"]))
                q = int(item["q"])
                if nl in core_nls:
                    continue
                vec[act_index[nl]] = q
            tvec = tuple(vec)
            if sum(tvec) != n_act_elec:
                raise ValueError("Custom configuration active electron count mismatch.")
            par = sum(q * act_shells[i]["l"] for i, q in enumerate(tvec)) % 2
            if par != target_par_val:
                continue
            if tvec not in seen_cfg:
                seen_cfg.add(tvec)
                configs_out.append(tvec)
        if not configs_out:
            raise ValueError(
                f"None of the custom configurations match target parity '{target_parity}'."
            )
        return core_shells, act_shells, configs_out

    if mode == "single-config":
        par = sum(q * act_shells[i]["l"] for i, q in enumerate(ref_vec)) % 2
        if par != target_par_val:
            raise ValueError(
                f"Configuration {format_config_label([(act_shells[i]['n'], act_shells[i]['l'], ref_vec[i]) for i in range(len(act_shells))])} "
                f"has {'odd' if par else 'even'} parity, incompatible with target '{target_parity}'."
            )
        return core_shells, act_shells, [ref_vec]

    # Enumerate valid distributions of n_act_elec across act_shells matching target parity & excitation rank
    caps = [2 * (2 * s["l"] + 1) for s in act_shells]
    ls = [s["l"] for s in act_shells]
    configs_out = []

    def backtrack(idx: int, rem: int, cur: list[int], par_sum: int, max_l_sum: int, max_s2: int) -> None:
        if idx == len(act_shells):
            if rem != 0:
                return
            if par_sum % 2 != target_par_val:
                return
            if max_l_sum < target_L or max_s2 < target_spin2S:
                return
            tvec = tuple(cur)
            if max_excitation_rank is not None and max_excitation_rank > 0:
                # Excitation rank = 0.5 * sum |q_i - q_ref_i|
                rank = sum(abs(tvec[i] - ref_vec[i]) for i in range(len(tvec))) // 2
                if rank > max_excitation_rank:
                    return
            configs_out.append(tvec)
            return
        cap = caps[idx]
        l_i = ls[idx]
        half_cap = 2 * l_i + 1
        rem_cap_after = sum(caps[idx + 1 :])
        q_min = max(0, rem - rem_cap_after)
        q_max = min(cap, rem)
        for q in range(q_max, q_min - 1, -1):
            cur.append(q)
            s2_sh = min(q, cap - q)
            backtrack(idx + 1, rem - q, cur, par_sum + q * l_i, max_l_sum + q * l_i, max_s2 + s2_sh)
            cur.pop()

    backtrack(0, n_act_elec, [], 0, 0, 0)
    if not configs_out:
        raise ValueError(
            f"No configuration in the active space matches L={target_L}, 2S={target_spin2S}, parity={target_parity}."
        )
    # Sort deterministically by excitation rank from ref_vec, then orbital occupation order
    configs_out.sort(key=lambda v: (sum(abs(v[i] - ref_vec[i]) for i in range(len(v))) // 2, [-x for x in v]))
    return core_shells, act_shells, configs_out


def _bit_sign(det: int, pos: int) -> float:
    return -1.0 if ((det & ((1 << pos) - 1)).bit_count() & 1) else 1.0


def _sgn_pair(det: int, i: int, j: int) -> float:
    return _bit_sign(det, i) * _bit_sign(det ^ (1 << i), j)


def _apply_excite(det: int, i_from: int, j_to: int) -> tuple[int, float] | None:
    if i_from == j_to:
        return (det, 1.0) if ((det >> i_from) & 1) else None
    if not ((det >> i_from) & 1) or ((det >> j_to) & 1):
        return None
    s1 = _bit_sign(det, i_from)
    d1 = det ^ (1 << i_from)
    return d1 ^ (1 << j_to), s1 * _bit_sign(d1, j_to)


def _enumerate_config_dets(
    cfg_vec: tuple[int, ...],
    act_shells: list[dict[str, Any]],
    shell_orb_offsets: list[int],
    target_ml: int,
    target_two_ms: int,
) -> list[int]:
    """Enumerate all Slater determinants of ONE configuration with fixed (M_L, 2M_S)."""
    # Build spin-orbital lists per shell
    shell_choices: list[list[tuple[int, int, int]]] = []  # (bitmask, ml_sum, two_ms_sum)
    for sh_idx, q in enumerate(cfg_vec):
        if q == 0:
            shell_choices.append([(0, 0, 0)])
            continue
        l = act_shells[sh_idx]["l"]
        off = shell_orb_offsets[sh_idx]
        dim = 2 * l + 1
        sos = []
        for m_idx, m_l in enumerate(range(-l, l + 1)):
            orb = off + m_idx
            sos.append((2 * orb, m_l, 1))
            sos.append((2 * orb + 1, m_l, -1))
        choices = []
        for comb in itertools.combinations(sos, q):
            mask = 0
            ml_sum = 0
            ms_sum = 0
            for so, ml, ms2 in comb:
                mask |= 1 << so
                ml_sum += ml
                ms_sum += ms2
            choices.append((mask, ml_sum, ms_sum))
        shell_choices.append(choices)

    # Suffix min/max pruning across shells for fast exact determinant enumeration
    n_sh = len(shell_choices)
    suffix_ml_min = [0] * (n_sh + 1)
    suffix_ml_max = [0] * (n_sh + 1)
    suffix_ms_min = [0] * (n_sh + 1)
    suffix_ms_max = [0] * (n_sh + 1)
    for i in range(n_sh - 1, -1, -1):
        mls = [c[1] for c in shell_choices[i]]
        mss = [c[2] for c in shell_choices[i]]
        suffix_ml_min[i] = suffix_ml_min[i + 1] + min(mls)
        suffix_ml_max[i] = suffix_ml_max[i + 1] + max(mls)
        suffix_ms_min[i] = suffix_ms_min[i + 1] + min(mss)
        suffix_ms_max[i] = suffix_ms_max[i + 1] + max(mss)

    dets: list[int] = []

    def dfs(idx: int, mask: int, ml_cur: int, ms_cur: int) -> None:
        if ml_cur + suffix_ml_min[idx] > target_ml or ml_cur + suffix_ml_max[idx] < target_ml:
            return
        if ms_cur + suffix_ms_min[idx] > target_two_ms or ms_cur + suffix_ms_max[idx] < target_two_ms:
            return
        if idx == n_sh:
            if ml_cur == target_ml and ms_cur == target_two_ms:
                dets.append(mask)
            return
        for c_mask, c_ml, c_ms in shell_choices[idx]:
            dfs(idx + 1, mask | c_mask, ml_cur + c_ml, ms_cur + c_ms)

    dfs(0, 0, 0, 0)
    return dets


def _build_ladder_operators(
    dets: list[int],
    orb_meta: list[tuple[int, int, int]],
    orb_map: dict[tuple[int, int, int], int],
    shell_filter: set[int] | None = None,
) -> tuple[scipy.sparse.csr_matrix, scipy.sparse.csr_matrix]:
    """Build sparse L_+ and S_+ operators acting on `dets` (optionally restricted to subset of spatial orbitals)."""
    norb = len(orb_meta)
    lp_rows, lp_cols, lp_vals = [], [], []
    sp_rows, sp_cols, sp_vals = [], [], []
    lp_map: dict[int, int] = {}
    sp_map: dict[int, int] = {}

    for col_idx, d in enumerate(dets):
        for p in range(norb):
            if shell_filter is not None and p not in shell_filter:
                continue
            n, l, m = orb_meta[p]
            # L_+ on alpha & beta
            if m < l:
                q = orb_map[(n, l, m + 1)]
                factor = math.sqrt((l - m) * (l + m + 1))
                for sp in (0, 1):
                    p_so = (p << 1) | sp
                    if (d >> p_so) & 1:
                        res = _apply_excite(d, p_so, (q << 1) | sp)
                        if res is not None:
                            r_idx = lp_map.setdefault(res[0], len(lp_map))
                            lp_rows.append(r_idx)
                            lp_cols.append(col_idx)
                            lp_vals.append(res[1] * factor)
            # S_+ (beta -> alpha)
            p_beta = (p << 1) | 1
            if (d >> p_beta) & 1:
                res = _apply_excite(d, p_beta, p << 1)
                if res is not None:
                    r_idx = sp_map.setdefault(res[0], len(sp_map))
                    sp_rows.append(r_idx)
                    sp_cols.append(col_idx)
                    sp_vals.append(res[1])

    Lp = scipy.sparse.csr_matrix((lp_vals, (lp_rows, lp_cols)), shape=(max(1, len(lp_map)), len(dets)))
    Sp = scipy.sparse.csr_matrix((sp_vals, (sp_rows, sp_cols)), shape=(max(1, len(sp_map)), len(dets)))
    return Lp, Sp


def _build_l2_s2_operators_same_ml_ms(
    dets: list[int],
    orb_meta: list[tuple[int, int, int]],
    orb_map: dict[tuple[int, int, int], int],
    shell_filter: set[int] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute exact L^2 and S^2 matrices inside a subset-preserving space (e.g. a subshell inside dets)."""
    n_det = len(dets)
    det_to_idx = {d: i for i, d in enumerate(dets)}
    # L^2 = L_- L_+ + L_z(L_z + 1) on dets; S^2 = S_- S_+ + S_z(S_z + 1) on dets!
    # Wait: even when restricted to a subshell A, M_L(A) can vary across dets in V_cfg!
    # So we compute L_z(A) and S_z(A) per determinant directly!
    Lp_A, Sp_A = _build_ladder_operators(dets, orb_meta, orb_map, shell_filter=shell_filter)
    L2 = (Lp_A.T @ Lp_A).toarray()
    S2 = (Sp_A.T @ Sp_A).toarray()
    norb = len(orb_meta)
    for i, d in enumerate(dets):
        ml_a = 0.0
        ms_a = 0.0
        for p in range(norb):
            if shell_filter is not None and p not in shell_filter:
                continue
            _, _, m = orb_meta[p]
            has_a = (d >> (2 * p)) & 1
            has_b = (d >> (2 * p + 1)) & 1
            ml_a += (has_a + has_b) * m
            ms_a += 0.5 * (has_a - has_b)
        L2[i, i] += ml_a * (ml_a + 1.0)
        S2[i, i] += ms_a * (ms_a + 1.0)
    return L2, S2


def _nearest_int_eigenvalue(val: float) -> int:
    # Given x = J(J+1), solve J = (-1 + sqrt(1 + 4x)) / 2
    j_val = 0.5 * (-1.0 + math.sqrt(max(0.0, 1.0 + 4.0 * val)))
    return round(j_val)


def _nearest_half_int_2s(val: float) -> int:
    s_val = 0.5 * (-1.0 + math.sqrt(max(0.0, 1.0 + 4.0 * val)))
    return round(2.0 * s_val)


def _slater_condon_sparse_hamiltonian(
    dets: list[int],
    h1: np.ndarray,
    eri: np.ndarray,
    norb: int,
) -> scipy.sparse.csr_matrix:
    """Build exact sparse Hermitian Hamiltonian matrix in determinant basis."""
    n_det = len(dets)
    occs = [[k for k in range(2 * norb) if (d >> k) & 1] for d in dets]
    h1_buckets: dict[int, list[tuple[int, int, float]]] = {}
    h2_buckets: dict[int, list[tuple[int, int, int, float]]] = {}

    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []

    for i_d, (d, occ) in enumerate(zip(dets, occs)):
        e0 = sum(float(h1[p >> 1, p >> 1]) for p in occ)
        for u in range(len(occ)):
            p, sp = occ[u] >> 1, occ[u] & 1
            for v in range(u + 1, len(occ)):
                q, sq = occ[v] >> 1, occ[v] & 1
                e0 += float(eri[p, p, q, q])
                if sp == sq:
                    e0 -= float(eri[p, q, q, p])
        rows.append(i_d)
        cols.append(i_d)
        vals.append(e0)

        for u in range(len(occ)):
            p_so = occ[u]
            h1_buckets.setdefault(d ^ (1 << p_so), []).append((i_d, p_so, _bit_sign(d, p_so)))
            for v in range(u + 1, len(occ)):
                q_so = occ[v]
                h2_buckets.setdefault(d ^ (1 << p_so) ^ (1 << q_so), []).append(
                    (i_d, p_so, q_so, _sgn_pair(d, p_so, q_so))
                )

    for items in h1_buckets.values():
        m = len(items)
        if m < 2:
            continue
        for idx1 in range(m):
            i_d, p_so, sp_sgn = items[idx1]
            p, sp = p_so >> 1, p_so & 1
            occ_i = occs[i_d]
            for idx2 in range(idx1 + 1, m):
                j_d, a_so, sa_sgn = items[idx2]
                a, sa = a_so >> 1, a_so & 1
                if sp != sa:
                    continue
                val = float(h1[a, p])
                for q_so in occ_i:
                    if q_so == p_so:
                        continue
                    q, sq = q_so >> 1, q_so & 1
                    val += float(eri[a, p, q, q])
                    if sq == sp:
                        val -= float(eri[a, q, q, p])
                el = sp_sgn * sa_sgn * val
                if abs(el) > 1e-16:
                    rows.extend((i_d, j_d))
                    cols.extend((j_d, i_d))
                    vals.extend((el, el))

    for items in h2_buckets.values():
        m = len(items)
        if m < 2:
            continue
        for idx1 in range(m):
            i_d, p_so, q_so, spq = items[idx1]
            p, sp = p_so >> 1, p_so & 1
            q, sq = q_so >> 1, q_so & 1
            for idx2 in range(idx1 + 1, m):
                j_d, a_so, b_so, sab = items[idx2]
                if p_so == a_so or p_so == b_so or q_so == a_so or q_so == b_so:
                    continue
                a, sa = a_so >> 1, a_so & 1
                b, sb = b_so >> 1, b_so & 1
                if sp + sq != sa + sb:
                    continue
                val = 0.0
                if sa == sp and sb == sq:
                    val += float(eri[a, p, b, q])
                if sa == sq and sb == sp:
                    val -= float(eri[a, q, b, p])
                el = spq * sab * val
                if abs(el) > 1e-16:
                    rows.extend((i_d, j_d))
                    cols.extend((j_d, i_d))
                    vals.extend((el, el))

    return scipy.sparse.csr_matrix((vals, (rows, cols)), shape=(n_det, n_det))


def handle_capabilities() -> dict[str, Any]:
    return {
        "available": True,
        "method": "fixed-orbital-ls-ci",
        "orbitalSource": "atom-sph-avg-hf",
        "orbitalOptimizationSupported": False,
        "orbitalOptimizationNote": (
            "Fixed-orbital LS-CI uses SO(3)-symmetric radial orbitals from PySCF AtomSphAverageRHF. "
            "Self-consistent MCHF radial orbital optimization is not implemented in v0.7.1."
        ),
        "engine": {
            "name": "ATOMS Exact (L^2, S^2, Pi) LS-CSF CI + PySCF/libcint",
            "version": "0.7.1",
            "pyscfVersion": pyscf.__version__,
            "pyscfLicense": "Apache-2.0 (PySCF & libcint)",
            "bseVersion": bse.__version__,
            "numpyVersion": np.__version__,
            "scipyVersion": scipy.__version__,
        },
        "supportedZRange": [SUPPORTED_Z_MIN, SUPPORTED_Z_MAX],
        "limits": {
            "maxDeterminants": MAX_DETERMINANTS,
            "maxCsfs": MAX_CSFS,
            "denseDiagonalizationThreshold": DENSE_DIAG_THRESHOLD,
            "maxDenseMemoryMB": MAX_DENSE_MEMORY_MB,
        },
    }


def handle_calculate(payload: dict[str, Any]) -> dict[str, Any]:
    tracemalloc.start()
    t_start = time.perf_counter()

    Z = int(payload["Z"])
    N = int(payload["N"])
    basis_key = str(payload["basis"])
    ref_config = list(payload["referenceConfiguration"])
    target_L = int(payload["targetL"])
    target_spin2S = int(payload["targetSpin2S"])
    target_parity = str(payload["targetParity"])
    mode = str(payload.get("activeSpaceMode", "valence-cas"))
    custom_core = payload.get("frozenCoreSubshells")
    custom_active_shells = payload.get("activeShells")
    custom_configs = payload.get("customConfigurations")
    max_ex_rank = payload.get("maxExcitationRank")
    if max_ex_rank is not None:
        max_ex_rank = int(max_ex_rank)
    n_roots_req = max(1, min(12, int(payload.get("nRoots", 4))))
    cross_check_fci = bool(payload.get("crossCheckPyscfFci", False))

    if Z < SUPPORTED_Z_MIN or Z > SUPPORTED_Z_MAX:
        raise ValueError(f"LS-CI is supported for Z={SUPPORTED_Z_MIN}..{SUPPORTED_Z_MAX} (got Z={Z}).")
    if N < 2 or N > Z + 2:
        raise ValueError(f"LS-CI requires 2 <= N <= Z+2 (got Z={Z}, N={N}).")
    if target_L < 0 or target_spin2S < 0:
        raise ValueError(f"Invalid target quantum numbers L={target_L}, 2S={target_spin2S}.")
    if (N - target_spin2S) % 2 != 0 or target_spin2S > N:
        raise ValueError(f"Target spin 2S={target_spin2S} is incompatible with N={N} electrons.")
    if target_parity not in ("even", "odd"):
        raise ValueError(f"Invalid targetParity '{target_parity}'.")

    t0 = time.perf_counter()
    mol, mf, basis_source, shells, e_sph, ortho_err, max_mix, max_align = build_so3_complex_shells(
        Z, N, basis_key, ref_config
    )
    core_shells, act_shells, active_configs = _select_active_space(
        Z=Z,
        N=N,
        shells=shells,
        ref_config=ref_config,
        mode=mode,
        target_L=target_L,
        target_spin2S=target_spin2S,
        target_parity=target_parity,
        custom_core=custom_core,
        custom_active_shells=custom_active_shells,
        custom_configs=custom_configs,
        max_excitation_rank=max_ex_rank,
    )

    core_nls = {(s["n"], s["l"]) for s in core_shells}
    act_nls = {(s["n"], s["l"]) for s in act_shells}
    n_core_elec = sum(2 * (2 * s["l"] + 1) for s in core_shells)
    n_act_elec = N - n_core_elec
    n_alpha_act = (n_act_elec + target_spin2S) // 2
    n_beta_act = n_act_elec - n_alpha_act

    # Compute frozen-core effective Hamiltonian & active-space complex spherical integrals
    h_ao = mf.get_hcore()
    if core_shells:
        C_core_real = np.hstack([s["C_real"] for s in core_shells])
        D_core = 2.0 * (C_core_real @ C_core_real.T)
        vj_c, vk_c = mf.get_jk(mol, D_core)
        F_core = h_ao + vj_c - 0.5 * vk_c
        e_core = float(np.einsum("ij,ji->", 0.5 * (h_ao + F_core), D_core))
    else:
        F_core = h_ao
        e_core = 0.0

    C_act_real = np.hstack([s["C_real"] for s in act_shells])
    norb = C_act_real.shape[1]
    U_big = np.zeros((norb, norb), dtype=np.complex128)
    orb_meta: list[tuple[int, int, int]] = []
    shell_orb_offsets: list[int] = []
    off = 0
    for s in act_shells:
        d = 2 * s["l"] + 1
        shell_orb_offsets.append(off)
        U_big[off : off + d, off : off + d] = s["U_c"]
        for m in range(-s["l"], s["l"] + 1):
            orb_meta.append((s["n"], s["l"], m))
        off += d
    orb_map = {meta: idx for idx, meta in enumerate(orb_meta)}

    h1_real = C_act_real.T @ F_core @ C_act_real
    eri_real = ao2mo.kernel(mol, C_act_real, compact=False).reshape(norb, norb, norb, norb)
    h1_c_complex = U_big.conj().T @ h1_real @ U_big
    eri_c_complex = np.einsum(
        "abcd,ap,bq,cr,ds->pqrs",
        eri_real,
        U_big.conj(),
        U_big,
        U_big.conj(),
        U_big,
        optimize=True,
    )
    max_imag = float(max(np.max(np.abs(h1_c_complex.imag)), np.max(np.abs(eri_c_complex.imag))))
    if max_imag > 1e-8:
        raise RuntimeError(f"Complex spherical integrals unexpectedly non-real (max |Im|={max_imag:.2e}).")
    h1_c = h1_c_complex.real
    eri_c = eri_c_complex.real

    t_setup_ms = (time.perf_counter() - t0) * 1000.0

    # Phase 3: Configuration-by-configuration exact CSF projection
    t_csf_start = time.perf_counter()
    all_dets: list[int] = []
    csf_blocks: list[tuple[int, int, np.ndarray, str, str]] = []  # (det_start, det_end, C_cfg, cfg_label, parentage)
    csf_descriptors: list[dict[str, Any]] = []
    max_null_res = 0.0
    min_nonzero_gap: float | None = None

    for cfg_vec in active_configs:
        cfg_dets = _enumerate_config_dets(cfg_vec, act_shells, shell_orb_offsets, target_L, target_spin2S)
        if not cfg_dets:
            continue
        if len(all_dets) + len(cfg_dets) > MAX_DETERMINANTS:
            raise ValueError(
                f"Active space determinant count exceeds safety limit {MAX_DETERMINANTS} "
                f"(exceeded while adding configuration with {len(cfg_dets)} determinants; narrow active shells or use CISD)."
            )

        Lp_cfg, Sp_cfg = _build_ladder_operators(cfg_dets, orb_meta, orb_map)
        K_cfg = (Lp_cfg.T @ Lp_cfg + Sp_cfg.T @ Sp_cfg).toarray()
        keig, kvec = np.linalg.eigh(K_cfg)
        null_mask = keig < 1e-8
        n_csf_cfg = int(np.sum(null_mask))
        if n_csf_cfg == 0:
            continue
        max_null_res = max(max_null_res, float(np.max(np.abs(keig[null_mask]))))
        nonzero = keig[~null_mask]
        if len(nonzero) > 0:
            gap = float(np.min(nonzero))
            min_nonzero_gap = gap if min_nonzero_gap is None else min(min_nonzero_gap, gap)

        C_cfg = kvec[:, null_mask]  # (len(cfg_dets), n_csf_cfg)
        cfg_label = format_config_label(
            [(act_shells[i]["n"], act_shells[i]["l"], cfg_vec[i]) for i in range(len(act_shells)) if cfg_vec[i] > 0]
        )

        # Parentage labeling inside configuration
        open_sh_indices = [
            i for i, q in enumerate(cfg_vec) if 0 < q < 2 * (2 * act_shells[i]["l"] + 1)
        ]
        parentages = [f"{cfg_label} ({format_term_symbol(target_spin2S, target_L, target_parity)})"] * n_csf_cfg
        if len(open_sh_indices) >= 2 and n_csf_cfg > 1:
            sh0 = open_sh_indices[0]
            l0 = act_shells[sh0]["l"]
            off0 = shell_orb_offsets[sh0]
            sh0_orbs = set(range(off0, off0 + 2 * l0 + 1))
            L2_sub, S2_sub = _build_l2_s2_operators_same_ml_ms(cfg_dets, orb_meta, orb_map, shell_filter=sh0_orbs)
            L2_proj = C_cfg.T @ L2_sub @ C_cfg
            S2_proj = C_cfg.T @ S2_sub @ C_cfg
            # Simultaneous diagonalization in nullspace
            M_par = L2_proj + 0.37123 * S2_proj
            _, U_par = np.linalg.eigh(0.5 * (M_par + M_par.T))
            C_cfg = C_cfg @ U_par
            if n_csf_cfg > 1 and np.max(np.abs(C_cfg.T @ C_cfg - np.eye(n_csf_cfg))) > 1e-12:
                C_cfg, _ = np.linalg.qr(C_cfg, mode="reduced")
            par0_label = f"{act_shells[sh0]['label']}{to_sup(cfg_vec[sh0])}"
            par0_odd = (cfg_vec[sh0] * l0) % 2 == 1
            par0_str = "odd" if par0_odd else "even"
            new_parents: list[str] = []
            for j in range(n_csf_cfg):
                u = U_par[:, j]
                l1 = _nearest_int_eigenvalue(float(u @ (L2_proj @ u)))
                s2_1 = _nearest_half_int_2s(float(u @ (S2_proj @ u)))
                p_sym = format_term_symbol(s2_1, l1, par0_str)
                new_parents.append(f"{cfg_label} [parent {par0_label}({p_sym})]")
            parentages = new_parents

        # Enforce deterministic sign: largest-magnitude determinant amplitude > 0
        for j in range(n_csf_cfg):
            imax = int(np.argmax(np.abs(C_cfg[:, j])))
            if C_cfg[imax, j] < 0:
                C_cfg[:, j] *= -1.0

        det_start = len(all_dets)
        all_dets.extend(cfg_dets)
        det_end = len(all_dets)
        csf_blocks.append((det_start, det_end, C_cfg, cfg_label, parentages))
        for j in range(n_csf_cfg):
            csf_idx = len(csf_descriptors)
            dom_amp = float(C_cfg[int(np.argmax(np.abs(C_cfg[:, j]))), j])
            csf_descriptors.append(
                {
                    "index": csf_idx,
                    "configuration": cfg_label,
                    "parentage": parentages[j],
                    "determinantCount": len(cfg_dets),
                    "dominantDeterminantAmplitude": dom_amp,
                }
            )

    n_dets = len(all_dets)
    n_csfs = len(csf_descriptors)
    if n_csfs == 0:
        raise ValueError(
            f"No LS-CSF exists with L={target_L}, 2S={target_spin2S}, parity={target_parity} in the chosen configuration set."
        )
    if n_csfs > MAX_CSFS:
        raise ValueError(
            f"LS-CSF dimension {n_csfs} exceeds safety limit {MAX_CSFS}. Narrow active space or set maxExcitationRank=2."
        )

    est_dense_mb = (n_csfs * n_csfs * 8.0) / (1024.0 * 1024.0)
    if est_dense_mb > MAX_DENSE_MEMORY_MB:
        raise ValueError(
            f"Estimated CSF Hamiltonian memory ({est_dense_mb:.1f} MB) exceeds {MAX_DENSE_MEMORY_MB} MB cap."
        )

    # Assemble global (n_dets, n_csfs) transformation matrix C_csf (sparse-friendly construction)
    c_rows, c_cols, c_vals = [], [], []
    col_cursor = 0
    for d0, d1, C_cfg, _, _ in csf_blocks:
        nr, nc = C_cfg.shape
        nz_r, nz_c = np.nonzero(np.abs(C_cfg) > 1e-15)
        for r_loc, c_loc in zip(nz_r.tolist(), nz_c.tolist()):
            c_rows.append(d0 + r_loc)
            c_cols.append(col_cursor + c_loc)
            c_vals.append(float(C_cfg[r_loc, c_loc]))
        col_cursor += nc
    C_csf_sparse = scipy.sparse.csr_matrix((c_vals, (c_rows, c_cols)), shape=(n_dets, n_csfs))
    gram = (C_csf_sparse.T @ C_csf_sparse).toarray()
    csf_ortho_err = float(np.max(np.abs(gram - np.eye(n_csfs))))
    if csf_ortho_err > 1e-8:
        raise RuntimeError(f"CSF basis lost orthonormality (max |C^T C - I| = {csf_ortho_err:.2e}).")

    t_csf_ms = (time.perf_counter() - t_csf_start) * 1000.0

    # Phase 4: Build Hamiltonian in determinant space & project to CSF block
    t_ci_start = time.perf_counter()
    H_det_sparse = _slater_condon_sparse_hamiltonian(all_dets, h1_c, eri_c, norb)
    H_csf = (C_csf_sparse.T @ (H_det_sparse @ C_csf_sparse)).toarray()
    herm_err = float(np.max(np.abs(H_csf - H_csf.T)))
    H_csf = 0.5 * (H_csf + H_csf.T)

    n_roots = min(n_roots_req, n_csfs)
    if n_csfs <= DENSE_DIAG_THRESHOLD:
        solver_alg = "scipy-linalg-eigh"
        evals_all, evecs_all = np.linalg.eigh(H_csf)
        evals = evals_all[:n_roots]
        evecs = evecs_all[:, :n_roots]
    elif n_roots <= n_csfs - 2:
        solver_alg = "scipy-sparse-eigsh-lanczos"
        evals, evecs = scipy.sparse.linalg.eigsh(H_csf, k=n_roots, which="SA", tol=1e-11)
        order = np.argsort(evals)
        evals = evals[order]
        evecs = evecs[:, order]
    else:
        solver_alg = "scipy-linalg-eigh"
        evals_all, evecs_all = np.linalg.eigh(H_csf)
        evals = evals_all[:n_roots]
        evecs = evecs_all[:, :n_roots]

    # Build global L_+ and S_+ on all_dets for direct root operator diagnostics
    Lp_all, Sp_all = _build_ladder_operators(all_dets, orb_meta, orb_map)
    S_val = target_spin2S / 2.0
    l2_exact = float(target_L * (target_L + 1))
    s2_exact = float(S_val * (S_val + 1.0))
    term_sym = format_term_symbol(target_spin2S, target_L, target_parity, False)
    ascii_sym = format_term_symbol(target_spin2S, target_L, target_parity, True)
    j_vals = allowed_j_values(target_L, S_val)
    ref_cfg_label = format_config_label(
        [(int(r["n"]), int(r["l"]), int(r["q"])) for r in ref_config if int(r["q"]) > 0 and (int(r["n"]), int(r["l"])) not in core_nls]
    )

    e0_total = e_core + float(evals[0])
    roots_out: list[dict[str, Any]] = []
    for k in range(n_roots):
        ck = evecs[:, k]
        # Deterministic eigenvector sign
        imax = int(np.argmax(np.abs(ck)))
        if ck[imax] < 0:
            ck = -ck
        dk = C_csf_sparse @ ck
        res_norm = float(np.linalg.norm(H_csf @ ck - evals[k] * ck))

        # Direct <L^2>, Var(L^2), <S^2>, Var(S^2) on determinant vector dk
        L2_dk = Lp_all.T @ (Lp_all @ dk) + l2_exact * dk
        l2_exp = float(np.dot(dk, L2_dk))
        l2_var = max(0.0, float(np.dot(L2_dk, L2_dk)) - l2_exp * l2_exp)

        S2_dk = Sp_all.T @ (Sp_all @ dk) + s2_exact * dk
        s2_exp = float(np.dot(dk, S2_dk))
        s2_var = max(0.0, float(np.dot(S2_dk, S2_dk)) - s2_exp * s2_exp)

        l2_err = abs(l2_exp - l2_exact)
        s2_err = abs(s2_exp - s2_exact)

        # CSF weights & configuration mixing
        weights = ck * ck
        order_csf = np.argsort(-weights)
        top_csfs = []
        ref_weight = 0.0
        cfg_weights: dict[str, float] = {}
        for idx_c in range(n_csfs):
            desc = csf_descriptors[idx_c]
            w = float(weights[idx_c])
            cfg_weights[desc["configuration"]] = cfg_weights.get(desc["configuration"], 0.0) + w
            if desc["configuration"] == ref_cfg_label:
                ref_weight += w
        for idx_c in order_csf[:6]:
            idx_int = int(idx_c)
            desc = csf_descriptors[idx_int]
            w = float(weights[idx_int])
            if w < 1e-6 and len(top_csfs) >= 1:
                continue
            top_csfs.append(
                {
                    "csfIndex": idx_int,
                    "configuration": desc["configuration"],
                    "parentage": desc["parentage"],
                    "coefficient": float(ck[idx_int]),
                    "weight": w,
                }
            )

        dom_cfg = max(cfg_weights.items(), key=lambda kv: kv[1])[0]
        dom_parent = csf_descriptors[int(order_csf[0])]["parentage"]
        sorted_cfgs = sorted(cfg_weights.items(), key=lambda kv: -kv[1])
        mix_str = " + ".join(f"{100.0 * w:.1f}% {c}" for c, w in sorted_cfgs[:3] if w >= 0.005)

        near_deg_gap = None
        if k > 0 and abs(float(evals[k] - evals[k - 1])) < 1e-4:
            near_deg_gap = float(evals[k] - evals[k - 1])
        if k + 1 < n_roots and abs(float(evals[k + 1] - evals[k])) < 1e-4:
            near_deg_gap = float(evals[k + 1] - evals[k])

        ambiguity = None
        if l2_err > 1e-7 or l2_var > 1e-7 or s2_err > 1e-7 or s2_var > 1e-7:
            purity = "symmetry-warning"
            ambiguity = f"Operator residual exceeded 1e-7 (|dL^2|={l2_err:.2e}, Var(L^2)={l2_var:.2e})."
        elif near_deg_gap is not None:
            purity = "near-degenerate-mixed"
            ambiguity = f"Near-degenerate adjacent root within {near_deg_gap:.2e} Ha; track by state overlap."
        elif float(weights[int(order_csf[0])]) < 0.60:
            purity = "pure-ls-eigenstate"
            ambiguity = (
                f"Strong multireference mixing (leading CSF weight {100.0 * float(weights[int(order_csf[0])]):.1f}%); "
                f"no single configuration accounts for >60%."
            )
        else:
            purity = "pure-ls-eigenstate"

        e_tot = e_core + float(evals[k])
        rel_ha = e_tot - e0_total
        roots_out.append(
            {
                "rootIndex": k,
                "termSymbol": term_sym,
                "asciiTermSymbol": ascii_sym,
                "L": target_L,
                "S": S_val,
                "spin2S": target_spin2S,
                "multiplicity": target_spin2S + 1,
                "parity": target_parity,
                "allowedJValues": j_vals,
                "fineStructureNote": (
                    "Allowed LS-coupling J values only; spin-orbit energy splittings are not computed in v0.7.1."
                ),
                "energy_Ha": e_tot,
                "energy_eV": e_tot * HARTREE_TO_EV,
                "relativeToLowest_Ha": rel_ha,
                "relativeToLowest_eV": rel_ha * HARTREE_TO_EV,
                "relativeToLowest_cm1": rel_ha * HARTREE_TO_CM1,
                "referenceConfigurationWeight": float(ref_weight),
                "dominantConfiguration": dom_cfg,
                "dominantParentage": dom_parent,
                "mixingSummary": mix_str or dom_cfg,
                "topCSFs": top_csfs,
                "operatorDiagnostics": {
                    "lSquared": l2_exp,
                    "lSquaredExact": l2_exact,
                    "lSquaredError": l2_err,
                    "lSquaredVariance": l2_var,
                    "sSquared": s2_exp,
                    "sSquaredExact": s2_exact,
                    "sSquaredError": s2_err,
                    "sSquaredVariance": s2_var,
                    "parity": target_parity,
                    "parityValue": -1 if target_parity == "odd" else 1,
                    "purityStatus": purity,
                    "ambiguityNote": ambiguity,
                },
                "solverResidualNorm": res_norm,
            }
        )

    # Independent PySCF FCI active-space cross-check (only valid for full-CAS in active shells!)
    cross_check: dict[str, Any] = {
        "performed": False,
        "oracle": "pyscf.fci.direct_spin1",
        "matchedEigenvalue_Ha": None,
        "energyDifference_Ha": None,
        "passed": True,
        "note": "Cross-check skipped (not requested or configuration space is a restricted subset of full active CAS).",
    }
    if cross_check_fci:
        if mode == "single-config" and len(act_shells) == 1:
            can_fci = True
        elif mode in ("valence-cas", "valence-plus-virtuals") and (max_ex_rank is None or max_ex_rank == 0):
            can_fci = True
        else:
            can_fci = False
        fci_dim_est = math.comb(norb, n_alpha_act) * math.comb(norb, n_beta_act)
        if can_fci and fci_dim_est <= 25000:
            cisolver = fci.direct_spin1.FCI(mol)
            e_fci_vals, _ = cisolver.kernel(h1_real, eri_real, norb, (n_alpha_act, n_beta_act), nroots=min(12, fci_dim_est))
            e_fci_vals = np.atleast_1d(e_fci_vals) + e_core
            e_ls0 = roots_out[0]["energy_Ha"]
            diffs = np.abs(e_fci_vals - e_ls0)
            best_idx = int(np.argmin(diffs))
            best_diff = float(diffs[best_idx])
            matched = float(e_fci_vals[best_idx])
            cross_check = {
                "performed": True,
                "oracle": "pyscf.fci.direct_spin1 (same MO space)",
                "matchedEigenvalue_Ha": matched,
                "energyDifference_Ha": best_diff,
                "passed": best_diff < 1e-8,
                "note": (
                    f"Matched PySCF determinant FCI eigenvalue {matched:.10f} Ha within {best_diff:.2e} Ha."
                    if best_diff < 1e-8
                    else f"PySCF FCI lowest {min(12, fci_dim_est)} roots did not capture this higher {term_sym} root (min |dE|={best_diff:.2e} Ha)."
                ),
            }
        else:
            cross_check["note"] = (
                f"Active-space PySCF FCI cross-check skipped (restricted configuration set or determinant dim {fci_dim_est} > 25000)."
            )

    t_ci_ms = (time.perf_counter() - t_ci_start) * 1000.0
    t_total_ms = (time.perf_counter() - t_start) * 1000.0
    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    sym = pyscf_elements.ELEMENTS[Z]
    frozen_label = format_config_label([(s["n"], s["l"], 2 * (2 * s["l"] + 1)) for s in core_shells]) or "none (all electrons active)"
    active_shells_label = ", ".join(s["label"] for s in act_shells)
    cfg_labels = [
        format_config_label([(act_shells[i]["n"], act_shells[i]["l"], v[i]) for i in range(len(act_shells)) if v[i] > 0])
        for v in active_configs
    ]

    shells_info = []
    for s in shells:
        nl = (s["n"], s["l"])
        role = "frozen-core" if nl in core_nls else ("active" if nl in act_nls else "virtual-unused")
        shells_info.append(
            {
                "n": s["n"],
                "l": s["l"],
                "label": s["label"],
                "energy_Ha": s["energy"],
                "avgOccupation": s["avgOcc"],
                "role": role,
                "shellDegeneracySplit_Ha": s["split"],
                "maxAngularMixing": s["maxMix"],
            }
        )

    return {
        "ok": True,
        "method": "fixed-orbital-ls-ci",
        "methodLabel": "Fixed-Orbital LS-Coupled CI (nonrelativistic; MCHF orbital optimization not performed)",
        "orbitalOptimizationPerformed": False,
        "orbitalSource": {
            "kind": "atom-sph-avg-hf",
            "description": "SO(3)-symmetric radial orbitals from PySCF AtomSphAverageRHF transformed to complex Condon-Shortley spherical harmonics",
            "converged": True,
            "sphAvgEnergy_Ha": e_sph,
            "complexOrthonormalityError": ortho_err,
            "maxAngularMixingError": max_mix,
            "maxShellAlignmentError": max_align,
            "shells": shells_info,
        },
        "system": {
            "Z": Z,
            "symbol": sym,
            "N": N,
            "charge": Z - N,
        },
        "basis": basis_key,
        "basisSource": basis_source,
        "symmetryBlock": {
            "L": target_L,
            "S": S_val,
            "spin2S": target_spin2S,
            "multiplicity": target_spin2S + 1,
            "parity": target_parity,
            "parityValue": -1 if target_parity == "odd" else 1,
            "termSymbol": term_sym,
            "asciiTermSymbol": ascii_sym,
            "allowedJValues": j_vals,
        },
        "activeSpace": {
            "mode": mode,
            "frozenCore": frozen_label,
            "activeShellsLabel": active_shells_label,
            "configurations": cfg_labels,
            "configurationCount": len(cfg_labels),
            "frozenCoreEnergy_Ha": e_core,
            "effectiveIntegralMaxImag": max_imag,
        },
        "csfDiagnostics": {
            "determinantCount": n_dets,
            "csfCount": n_csfs,
            "csfOrthonormalityError": csf_ortho_err,
            "csfMaxLSNullspaceResidual": max_null_res,
            "csfMinNonZeroGap": min_nonzero_gap,
            "hamiltonianHermiticityError": herm_err,
            "csfs": csf_descriptors[:120],
        },
        "resources": {
            "activeElectrons": n_act_elec,
            "activeSpatialOrbitals": norb,
            "determinantCount": n_dets,
            "csfCount": n_csfs,
            "configurationCount": len(cfg_labels),
            "estimatedDenseMemoryMB": est_dense_mb,
            "solverAlgorithm": solver_alg,
        },
        "roots": roots_out,
        "pyscfFciCrossCheck": cross_check,
        "rootTrackingNote": (
            f"Root indices 0..{n_roots - 1} are ordered by energy strictly within the local ({term_sym}, {mode}) symmetry block. "
            "Do not match roots across different active spaces by energy index alone."
        ),
        "runtime": {
            "engine": "ATOMS Exact (L^2, S^2, Pi) LS-CSF CI + PySCF/libcint",
            "engineVersion": f"0.7.1 (PySCF {pyscf.__version__})",
            "setupMs": t_setup_ms,
            "csfMs": t_csf_ms,
            "ciMs": t_ci_ms,
            "totalMs": t_total_ms,
            "peakMemoryMB": peak_bytes / (1024.0 * 1024.0),
        },
    }


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {"action": "capabilities"}
        action = payload.get("action", "calculate")
        if action == "capabilities":
            out = handle_capabilities()
        elif action == "calculate":
            out = handle_calculate(payload)
        else:
            out = {"ok": False, "error": f"Unknown action '{action}'."}
        sys.stdout.write(json.dumps(out))
    except Exception as exc:
        if tracemalloc.is_tracing():
            tracemalloc.stop()
        sys.stdout.write(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "errorType": type(exc).__name__,
                }
            )
        )


if __name__ == "__main__":
    main()
