# ATOMS v0.6.1 — Dynamic Spectroscopy & NIST Comparison

Modules:
- [`src/physics/spectroscopy/index.ts`](../src/physics/spectroscopy/index.ts)
- [`src/data/references/nistHydrogen.ts`](../src/data/references/nistHydrogen.ts)
- [`src/data/references/nistHydrogenLines.json`](../src/data/references/nistHydrogenLines.json)

---

## 1. Governing Equations

Every spectral line in `generateHydrogenLikeSpectrum()` is synthesized ab initio from calculated E1 transition pairs $(u \leftrightarrow l)$ between `schrodinger-coulomb` or `dirac-coulomb` eigenstates of the chosen `AtomicSystem`:
$$\lambda_{\text{vac}} = \frac{h c}{\Delta E}, \qquad \tilde{\nu} = \frac{\Delta E}{h c}\; [\text{cm}^{-1}], \qquad \nu = \frac{\Delta E}{h}\; [\text{Hz}]$$
where $\Delta E = E_{\text{upper}} - E_{\text{lower}} > 0$.
- **Emission stick strength**: proportional to upper-state Einstein spontaneous transition rate $A_{u\to l}$ ($\text{s}^{-1}$) weighted by degeneracy factor in discrete transition lists.
- **Absorption stick strength**: proportional to absorption oscillator strength $f_{l\to u}$.

---

## 2. Definitions

- **Supported series**:
  - `"lyman"`: lower shell $n_{\text{lower}} = 1$, upper $2 \le n \le n_{\max}$
  - `"balmer"`: lower shell $n_{\text{lower}} = 2$, upper $3 \le n \le n_{\max}$
  - `"paschen"`: lower shell $n_{\text{lower}} = 3$, upper $4 \le n \le n_{\max}$
  - `"custom"`: user-selectable lower shell $n_{\text{lower}}$ (`customLowerN`, e.g., $n_{\text{lower}} = 4$ Brackett series) with dipole-allowed upper $n_u \le n_{\max}$ filtered by optional $[\lambda_{\min}, \lambda_{\max}]\text{ nm}$
- **`wavelengthConvention: "vacuum"`**: All computed and reference wavelengths are **vacuum wavelengths**, NOT standard air ($n_{\text{air}} \approx 1.00027$) wavelengths. (For example, Balmer-α in vacuum is `656.46 nm` vs `656.28 nm` in air.)

---

## 3. Units

Wavelengths in $\text{nm}$ (vacuum), transition energies in $\text{eV}$, wavenumbers in $\text{cm}^{-1}$, frequencies in $\text{Hz}$, $f$ dimensionless, Einstein $A$ in $\text{s}^{-1}$.

---

## 4. Assumptions & Zero-Broadening Disclosure

**ATOMS v0.6.1 computes ideal discrete stick spectra strictly from E1 transition matrix elements.**
- No natural Lorentzian radiative linewidths $\Gamma_u + \Gamma_l$, thermal Doppler profiles, Stark/collisional pressure broadening, or instrumental Gaussian slit functions are synthesized.
- No thermodynamic LTE Boltzmann populations $g_u e^{-E_u/k_B T}$ or collisional-radiative NLTE populations are applied—relativity of stick heights reflects intrinsic $A_{u\to l}$ or $f_{l\to u}$ atomic transition probabilities alone.

---

## 5. Numerical Method

Enumerates all valid nonrelativistic $(n,l,m_l)$ or relativistic $(n,\kappa,j,m_j)$ E1 transition channels using parity and angular triangle pre-screening followed by exact `calculateNonRelativisticE1Transition` / `calculateRelativisticE1Transition`, degeneracy aggregation by multiplet level, and vacuum wavelength filtering.

---

## 6. Validity Domain

Strictly one-electron systems ($N = 1$, $1 \le Z \le 118$ NR; $1 \le Z \le 137$ Dirac) with point-nucleus models.

---

## 7. Known Limitations

- Multi-electron atomic line spectra (`Z > 1`, `N > 1`) are not supported until a multi-electron atomic structure/CI transition solver is integrated.
- Empirical NIST reference overlay (`NIST_HYDROGEN_LINES`) is restricted to $^1\text{H}$ Lyman, Balmer, and Paschen vacuum centroids derived transparently from the pinned NIST ASD `nist_asd_ie.tsv` ionization energy (`13.598434599702(12) eV`); full hyperfine/Lamb-shifted `lines.pl` tables are not bundled offline.

---

## 8. Reference Sources

- Pinned `data/sources/nist_asd_ie.tsv` (`H I` ionization limit `13.598434599702 eV`, `HDEL` NIST ASD 2020/2023).
- Exact SI definitions (`hc = 1239.8419843320028 eV*nm`).

---

## 9. Validation Procedures

Verified in `src/physics/__tests__/transitionsSpectroscopy.test.ts` and `tests/browser/laboratory.spec.ts`:
- Calculated $^1\text{H}$ Dirac Lyman-α (`~121.566 nm`), Balmer-α (`~656.466 nm`), Balmer-β (`~486.27 nm`), and Paschen-α (`~1875.63 nm`) match empirical $^1\text{H}$ vacuum wavelengths within $< 0.05\text{ nm}$ (the residual `~0.005 nm` on Balmer-α reflects omitted $2s_{1/2}$ Lamb shift and hyperfine corrections!).
- Multi-electron system (`He`, $Z=2, N=2$) submitted as a `spectroscopy-series` experiment fails honestly with `status: "unsupported"`.
