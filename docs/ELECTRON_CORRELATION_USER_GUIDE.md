# Electron Correlation User Guide — ATOMS v0.7.2

The **Electron Correlation** tab (`WorkspaceNav` tab #9) provides live post-Hartree–Fock dynamical and static correlation calculations powered by PySCF `2.15.1`, alongside a preflight resource estimator and a **Matched Cross-Method Comparison** table.

---

## 1. Workflow

1. **System & Basis (`1. Atomic System & Basis`)**:
   - Choose an element $Z = 1..54$, electron count $N$ (supporting neutral atoms, cations, and anions), spin excess $2S$, and pinned BSE Gaussian basis set (`STO-3G`, `6-31G`, `cc-pVDZ`, `cc-pVTZ`, `aug-cc-pVTZ`, `def2-SVP`, `def2-TZVP`).
   - Quick scientific presets at the top banner (`He RMP2`, `He FCI`, `Li ROMP2`, `Be RCISD`, `B FCI`, `Ne RMP2`) populate verified reference configurations in one click.
2. **HF Reference Determinant (`2. HF Reference Determinant`)**:
   - **`RHF (det)`**: Closed-shell singlets ($2S=0$).
   - **`UHF (det)`**: Spin-unrestricted determinants for any valid $2S$.
   - **`ROHF (det)`**: Spin-pure restricted open-shell determinants ($2S \ge 1$).
   - **`AtomSphAvg`**: Intentionally **disabled** because fractional spherical-average ensembles are not single determinants for MP2/CISD/FCI.
3. **Method & Active Space (`3. Correlation Method & Active Space`)**:
   - Incompatible methods are automatically gated (for example, `ROHF` disables `RCISD` and `UCISD` because PySCF silently converts `ROHF` into `UHF`/`UCISD`).
   - Toggle **Frozen Core** (`none` all-electron vs `noble-core`, which freezes inner noble-gas shells and uses `mcscf.CASCI` for `RHF`/`ROHF` FCI).
   - For `FCI`, configure multi-root `nRoots (1..5)` and `fix_spin_` (`RHF`/`ROHF`).
4. **Preflight Resource Bounds (`4. Preflight Resource Estimate`)**:
   - Computes exact spatial orbital counts, FCI determinant space size $N_{\text{det}}$, CISD excitation vector dimension, and estimated memory *before* execution.
   - Requests exceeding safe limits (such as `Ne / cc-pVDZ` FCI with $N_{\text{det}} = 4,008,004 > 200,000$) disable the Run button cleanly and explain why.
5. **Results & Matched Cross-Method Comparison**:
   - Displays $E_{\text{HF}}$, $E_{\text{corr}}$, $E_{\text{total}} = E_{\text{HF}} + E_{\text{corr}}$, spin diagnostics ($\langle S^2 \rangle$), MP2 denominator gaps, CISD reference weight $|c_0|^2$, FCI multi-root tables, and variational / size-extensivity badges.
   - Runs sharing the exact comparison key `(Z|N|2S|basis|frozenCoreMode)` automatically populate the **Matched Cross-Method Comparison** table with energy differences $\Delta E$ relative to matched `FCI` (or lowest variational reference) and are persisted in **Experiment History** (`IndexedDB`).

---

## 2. Full Local vs. Static Preview Mode

- **Full Local Scientific Mode (`npm run dev` / `npm start`)**: Express serves `/api/correlation/capabilities` and `/api/correlation/calculate` backed by local Python PySCF.
- **Static Preview / Offline**: When `/api/correlation/capabilities` returns non-JSON HTML or is unreachable, the banner clearly displays **`PySCF Correlation Offline`** and disables `Run` rather than fabricating correlation energies.
