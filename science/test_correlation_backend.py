#!/usr/bin/env python3
"""
Scientific validation & regression test suite for ATOMS v0.7.2
Local Post-Hartree-Fock Electron Correlation Backend (`science/correlation_backend.py`).
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import unittest
from pathlib import Path

import numpy as np
from pyscf import ao2mo, ci, fci, gto, mcscf, mp, scf

ROOT = Path(__file__).resolve().parent.parent
SCIENCE_DIR = Path(__file__).resolve().parent
if str(SCIENCE_DIR) not in sys.path:
    sys.path.insert(0, str(SCIENCE_DIR))

from correlation_backend import (  # noqa: E402
    DomainValidationError,
    ResourceLimitError,
    handle_calculate,
    handle_capabilities,
    handle_estimate,
)
from hf_backend import _load_basis_for_atom  # noqa: E402


class TestCorrelationBackend(unittest.TestCase):
    def test_capabilities_reports_live_pyscf_methods(self) -> None:
        cap = handle_capabilities()
        self.assertTrue(cap["available"])
        self.assertEqual(cap["engine"]["name"], "PySCF")
        for method in ("rmp2", "ump2", "romp2", "rcisd", "ucisd", "fci"):
            self.assertIn(method, cap["methods"])
            self.assertTrue(cap["methods"][method]["available"], f"{method} should be available")
        self.assertFalse(cap["referenceCompatibility"]["atom-sph-avg"]["supported"])
        self.assertIn("ucisd", cap["referenceCompatibility"]["rohf"]["disabledMethods"])

    def test_he_ccpvdz_rmp2_rcisd_fci_exact_two_electron_limit(self) -> None:
        rmp2 = handle_calculate({"Z": 2, "N": 2, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "rmp2"})
        rcisd = handle_calculate({"Z": 2, "N": 2, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "rcisd"})
        rfci = handle_calculate({"Z": 2, "N": 2, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "fci"})

        for res in (rmp2, rcisd, rfci):
            self.assertTrue(res["ok"])
            c = res["correlation"]
            self.assertLess(c["energyIdentityError_Ha"], 1e-12)
            self.assertFalse(c["isLsTermResolved"])

        # Direct PySCF reference check
        bobj, _ = _load_basis_for_atom("cc-pvdz", 2, "He")
        mol = gto.M(atom="He 0 0 0", basis=bobj, spin=0, symmetry=False, unit="Bohr", verbose=0)
        mf = scf.RHF(mol).run(conv_tol=1e-10)
        ref_mp2 = mp.MP2(mf).run()
        self.assertAlmostEqual(rmp2["correlation"]["eCorr_Ha"], float(ref_mp2.e_corr), places=10)
        self.assertAlmostEqual(rmp2["correlation"]["eTotal_Ha"], float(ref_mp2.e_tot), places=10)

        # For 2 electrons, RCISD == FCI to machine / solver tolerance
        self.assertAlmostEqual(rcisd["correlation"]["eTotal_Ha"], rfci["correlation"]["eTotal_Ha"], places=9)
        self.assertLess(rfci["correlation"]["eCorr_Ha"], -0.03)
        self.assertTrue(rcisd["correlation"]["isVariational"])
        self.assertFalse(rcisd["correlation"]["isSizeExtensive"])
        self.assertFalse(rmp2["correlation"]["isVariational"])
        self.assertTrue(rmp2["correlation"]["isSizeExtensive"])

    def test_he_sto3g_zero_virtuals_and_h_one_electron_boundaries(self) -> None:
        he_sto = handle_calculate({"Z": 2, "N": 2, "spin2S": 0, "basis": "sto-3g", "referenceMethod": "rhf", "correlationMethod": "rmp2"})
        self.assertEqual(he_sto["correlation"]["eCorr_Ha"], 0.0)
        self.assertEqual(he_sto["correlation"]["eTotal_Ha"], he_sto["correlation"]["eHf_Ha"])
        self.assertFalse(he_sto["correlation"]["denominatorDiagnostics"]["available"])
        self.assertTrue(any("Zero virtual" in w for w in he_sto["warnings"]))

        h_ump2 = handle_calculate({"Z": 1, "N": 1, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "uhf", "correlationMethod": "ump2"})
        self.assertAlmostEqual(h_ump2["correlation"]["eCorr_Ha"], 0.0, places=12)
        self.assertTrue(any("Fewer than 2 active" in w for w in h_ump2["warnings"]))

    def test_he_631g_fci_matches_independent_explicit_determinant_hamiltonian(self) -> None:
        """Build 4x4 Slater determinant H matrix from AO/MO integrals independently of pyscf.fci."""
        res = handle_calculate({"Z": 2, "N": 2, "spin2S": 0, "basis": "6-31g", "referenceMethod": "rhf", "correlationMethod": "fci", "nRoots": 3})
        self.assertTrue(res["ok"])
        roots = res["correlation"]["roots"]
        self.assertEqual(len(roots), 3)

        bobj, _ = _load_basis_for_atom("6-31g", 2, "He")
        mol = gto.M(atom="He 0 0 0", basis=bobj, spin=0, symmetry=False, unit="Bohr", verbose=0)
        mf = scf.RHF(mol).run(conv_tol=1e-10)
        C = mf.mo_coeff
        h1 = C.T @ mf.get_hcore() @ C
        eri = ao2mo.restore(1, ao2mo.kernel(mol, C), C.shape[1])

        # Closed-shell Ms=0 determinants for 2 orbitals: |0a 0b>, |0a 1b>, |1a 0b>, |1a 1b>
        basis_dets = [(0, 0), (0, 1), (1, 0), (1, 1)]
        H = np.zeros((4, 4), dtype=np.float64)
        for p, (ia, ib) in enumerate(basis_dets):
            for q, (ja, jb) in enumerate(basis_dets):
                val = 0.0
                if ib == jb:
                    val += h1[ia, ja]
                if ia == ja:
                    val += h1[ib, jb]
                val += eri[ia, ja, ib, jb]
                H[p, q] = val
        evals = np.linalg.eigvalsh(H)
        # Lowest Ms=0 singlet ground root matches exact lowest FCI root
        self.assertAlmostEqual(roots[0]["eTotal_Ha"], float(evals[0]), places=11)

    def test_li_ccpvdz_open_shell_ump2_romp2_ucisd_fci(self) -> None:
        ump2 = handle_calculate({"Z": 3, "N": 3, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "uhf", "correlationMethod": "ump2"})
        romp2 = handle_calculate({"Z": 3, "N": 3, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "rohf", "correlationMethod": "romp2"})
        ucisd = handle_calculate({"Z": 3, "N": 3, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "uhf", "correlationMethod": "ucisd"})
        rfci = handle_calculate({"Z": 3, "N": 3, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "rohf", "correlationMethod": "fci", "fixSpin": True})

        self.assertIsNotNone(romp2["correlation"]["eCorrSingles_Ha"])
        self.assertLess(ump2["correlation"]["eCorr_Ha"], 0.0)
        self.assertLess(romp2["correlation"]["eCorr_Ha"], 0.0)
        self.assertGreater(ucisd["correlation"]["referenceWeightSq"], 0.99)
        self.assertLess(ucisd["correlation"]["eCorr_Ha"], 0.0)
        # Variational ordering on same UHF reference vs exact FCI
        self.assertLessEqual(rfci["correlation"]["eTotal_Ha"], ucisd["correlation"]["eTotal_Ha"] + 1e-8)
        self.assertAlmostEqual(rfci["correlation"]["spinDiagnostics"]["sSquared"], 0.75, places=7)
        self.assertTrue(rfci["correlation"]["spinDiagnostics"]["spinPure"])

    def test_be_and_b_frozen_core_and_multiroot_fci(self) -> None:
        be_all = handle_calculate({"Z": 4, "N": 4, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "fci", "frozenCoreMode": "none"})
        be_fc = handle_calculate({"Z": 4, "N": 4, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "fci", "frozenCoreMode": "noble-core"})
        be_cisd = handle_calculate({"Z": 4, "N": 4, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "rcisd", "frozenCoreMode": "none"})

        self.assertEqual(be_fc["orbitals"]["frozenOrbitals"], 1)
        self.assertEqual(be_fc["orbitals"]["correlatedElectrons"], 2)
        self.assertLessEqual(be_all["correlation"]["eTotal_Ha"], be_fc["correlation"]["eTotal_Ha"] + 1e-10)
        self.assertLessEqual(be_all["correlation"]["eTotal_Ha"], be_cisd["correlation"]["eTotal_Ha"] + 1e-10)
        self.assertLessEqual(be_cisd["correlation"]["eTotal_Ha"], be_cisd["correlation"]["eHf_Ha"])

        b_fc = handle_calculate({"Z": 5, "N": 5, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "rohf", "correlationMethod": "fci", "frozenCoreMode": "noble-core", "nRoots": 3, "fixSpin": True})
        roots = b_fc["correlation"]["roots"]
        self.assertEqual(len(roots), 3)
        self.assertLessEqual(roots[0]["eTotal_Ha"], roots[1]["eTotal_Ha"] + 1e-12)
        self.assertLessEqual(roots[1]["eTotal_Ha"], roots[2]["eTotal_Ha"] + 1e-12)
        for r in roots:
            self.assertAlmostEqual(r["sSquared"], 0.75, places=6)

        b_uhf_fci = handle_calculate({"Z": 5, "N": 5, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "uhf", "correlationMethod": "fci", "frozenCoreMode": "none"})
        self.assertAlmostEqual(b_uhf_fci["correlation"]["spinDiagnostics"]["sSquared"], 0.75, places=6)
        self.assertFalse(b_uhf_fci["correlation"]["fixSpinApplied"])

    def test_ne_ccpvdz_nonvariational_mp2_and_fci_preflight_guard(self) -> None:
        ne_mp2 = handle_calculate({"Z": 10, "N": 10, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "rmp2"})
        ne_cisd = handle_calculate({"Z": 10, "N": 10, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "rcisd"})
        self.assertTrue(ne_mp2["ok"] and ne_cisd["ok"])
        self.assertLess(ne_mp2["correlation"]["eTotal_Ha"], ne_cisd["correlation"]["eTotal_Ha"])

        est = handle_estimate({"Z": 10, "N": 10, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "fci"})
        self.assertFalse(est["withinLimits"])
        self.assertEqual(est["estimate"]["fciDeterminantCount"], 4008004)
        with self.assertRaises(ResourceLimitError) as ctx:
            handle_calculate({"Z": 10, "N": 10, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "fci"})
        self.assertEqual(ctx.exception.code, "RESOURCE_LIMIT_EXCEEDED")

    def test_cisd_non_size_extensivity_vs_mp2_and_fci(self) -> None:
        """
        Physical theorem test using PySCF:
        For two non-interacting He atoms at 100 Bohr in 6-31G, MP2 and FCI are
        size-extensive (E_corr(He2) == 2 * E_corr(He)), whereas RCISD is strictly
        NOT size-extensive (E_corr(He2) > 2 * E_corr(He)).
        """
        mol_1 = gto.M(atom="He 0 0 0", basis="6-31g", spin=0, symmetry=False, unit="Bohr", verbose=0)
        mf_1 = scf.RHF(mol_1).run(conv_tol=1e-11)
        mp2_1 = mp.MP2(mf_1).run().e_corr
        cisd_1 = ci.CISD(mf_1).run().e_corr
        fci_1, _ = fci.FCI(mf_1).kernel()
        fci_corr_1 = fci_1 - mf_1.e_tot

        mol_2 = gto.M(atom="He 0 0 0; He 0 0 100", basis="6-31g", spin=0, symmetry=False, unit="Bohr", verbose=0)
        mf_2 = scf.RHF(mol_2).run(conv_tol=1e-11)
        mp2_2 = mp.MP2(mf_2).run().e_corr
        cisd_2 = ci.CISD(mf_2).run().e_corr
        fci_2, _ = fci.FCI(mf_2).kernel()
        fci_corr_2 = fci_2 - mf_2.e_tot

        self.assertAlmostEqual(float(mp2_2), 2.0 * float(mp2_1), places=9)
        self.assertAlmostEqual(float(fci_corr_2), 2.0 * float(fci_corr_1), places=9)
        # RCISD misses disconnected quadruple excitations (He1 double + He2 double):
        # exact measured defect in He2/6-31G is ~1.2885e-4 Ha, whereas MP2 and FCI errors are < 1e-10 Ha.
        size_ext_err = float(cisd_2 - 2.0 * cisd_1)
        self.assertGreater(size_ext_err, 5e-5)

    def test_guardrail_rejections(self) -> None:
        # 1. AtomSphAverageRHF rejected
        with self.assertRaises(DomainValidationError) as ctx1:
            handle_calculate({"Z": 2, "N": 2, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "atom-sph-avg", "correlationMethod": "rmp2"})
        self.assertEqual(ctx1.exception.code, "UNSUPPORTED_REFERENCE_METHOD")

        # 2. ROHF + CISD rejected rather than silently converted to UCISD
        with self.assertRaises(DomainValidationError) as ctx2:
            handle_calculate({"Z": 3, "N": 3, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "rohf", "correlationMethod": "ucisd"})
        self.assertEqual(ctx2.exception.code, "ROHF_CISD_UNSUPPORTED")

        # 3. UHF + frozen-core FCI rejected cleanly
        with self.assertRaises(DomainValidationError) as ctx3:
            handle_calculate({"Z": 5, "N": 5, "spin2S": 1, "basis": "cc-pvdz", "referenceMethod": "uhf", "correlationMethod": "fci", "frozenCoreMode": "noble-core"})
        self.assertEqual(ctx3.exception.code, "UHF_FROZEN_FCI_UNSUPPORTED")

        # 4. Unconverged SCF aborts before correlation
        with self.assertRaises(DomainValidationError) as ctx4:
            handle_calculate({"Z": 4, "N": 4, "spin2S": 0, "basis": "cc-pvdz", "referenceMethod": "rhf", "correlationMethod": "rmp2", "scfOptions": {"maxCycle": 1}})
        self.assertEqual(ctx4.exception.code, "SCF_NOT_CONVERGED")

    def test_cli_subprocess_respects_env_determinant_cap_and_valid_json(self) -> None:
        env = dict(os.environ)
        env["ATOMS_MAX_FCI_DETERMINANTS"] = "100"
        proc = subprocess.run(
            [sys.executable, str(SCIENCE_DIR / "correlation_backend.py")],
            input=json.dumps({
                "action": "calculate",
                "Z": 2,
                "N": 2,
                "spin2S": 0,
                "basis": "cc-pvdz",
                "referenceMethod": "rhf",
                "correlationMethod": "fci",
            }),
            text=True,
            capture_output=True,
            env=env,
            cwd=str(ROOT),
        )
        # He/cc-pvdz has 5 orbitals -> N_det = 25 (passes 100 cap)
        self.assertEqual(proc.returncode, 0)
        parsed = json.loads(proc.stdout)
        self.assertTrue(parsed["ok"])

        # Li/cc-pvdz has 14 orbitals -> N_det = 1274 (rejected pre-allocation when cap is 100)
        proc2 = subprocess.run(
            [sys.executable, str(SCIENCE_DIR / "correlation_backend.py")],
            input=json.dumps({
                "action": "calculate",
                "Z": 3,
                "N": 3,
                "spin2S": 1,
                "basis": "cc-pvdz",
                "referenceMethod": "rohf",
                "correlationMethod": "fci",
            }),
            text=True,
            capture_output=True,
            env=env,
            cwd=str(ROOT),
        )
        self.assertNotEqual(proc2.returncode, 0)
        err = json.loads(proc2.stdout)
        self.assertFalse(err["ok"])
        self.assertEqual(err["code"], "RESOURCE_LIMIT_EXCEEDED")


if __name__ == "__main__":
    unittest.main()
