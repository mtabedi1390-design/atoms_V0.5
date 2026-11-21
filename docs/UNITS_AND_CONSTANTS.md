# ATOMS v0.6.0 — Physical Constants & Unit System

Modules:
- [`src/physics/constants.ts`](../src/physics/constants.ts)
- [`src/physics/units.ts`](../src/physics/units.ts)
- [`src/domain/observables/index.ts`](../src/domain/observables/index.ts)

---

## 1. Pinned Constants Registry (`CODATA-2018`)

Every experiment definition (`ExperimentDefinition`), calculation result (`CalculationResult`), and persisted record (`ExperimentResultRecord`) stores `constantsVersion: "CODATA-2018"` (`CONSTANTS_VERSION`), preserving bit-exact parity with the C++17 native core (`native/quantum_core.hpp`):

| Symbol | Quantity | Value | Unit | Notes |
|---|---|---|---|---|
| $a_0$ | Bohr radius | `5.29177210903e-11` | `m` (`52.9177210903 pm`) | CODATA 2018 |
| $E_h$ | Hartree energy | `27.211386245988` | `eV` | $2 R_\infty h c$ |
| $\alpha$ | Fine-structure constant | `7.2973525693e-3` | dimensionless | $1/\alpha \approx 137.035999084$ |
| $c$ | Speed of light | `299792458` | `m/s` | Exact SI (2019 redefinition) |
| $h$ | Planck constant | `6.62607015e-34` | `J·s` | Exact SI (2019 redefinition) |
| $e$ | Elementary charge | `1.602176634e-19` | `C` | Exact SI (2019 redefinition) |
| $m_e$ | Electron mass | `5.48579909065e-4` | `u` | `9.1093837015e-31 kg` |
| $m_e c^2$ | Electron rest energy | `510998.95000` | `eV` | $\approx 1/\alpha^2\; E_h$ |
| $m_p$ | Bare proton mass | `1.007276466621` | `u` | Used for $^1\text{H}$ reduced mass |
| $m_d$ | Bare deuteron mass | `2.013553212745` | `u` | Used for $^2\text{H}$ (D) reduced mass |
| $m_\alpha$ | Bare alpha particle mass | `4.001506179127` | `u` | Used for $^4\text{He}$ reduced mass |
| $u$ | Unified atomic mass unit | `1.66053906660e-27` | `kg` | $m({}^{12}\text{C})/12$ |
| $hc$ | Photon energy-wavelength product | `1239.8419843320028` | `eV·nm` | Exact from $h c / e$ |

---

## 2. Typed Units & Conversion Functions

`src/physics/units.ts` provides `TypedQuantity<U>` (`{ value, unit, constantsVersion }`) and deterministic exact conversions:
- **Length** (`LengthUnit`): `a0`, `m`, `angstrom`, `nm`, `pm`, `fm` (`convertLength`)
- **Energy** (`EnergyUnit`): `Ha`, `eV`, `J`, `cm-1` (`convertEnergy`)
- **Time** (`TimeUnit`): `s`, `au_t` ($\hbar/E_h = 2.4188843265857\times 10^{-17}\text{ s}$)
- **Frequency** (`FrequencyUnit`): `Hz`, `THz` (`convertFrequency`)
- **Mass** (`MassUnit`): `u`, `kg`, `me` (`convertMass`)
- **Charge** (`ChargeUnit`): `e`, `C` (`convertCharge`)
- **Spectroscopy conversions**: `energyEvToWavelengthNm(eV)` (vacuum!), `wavelengthNmToEnergyEv(nm)`, `energyEvToWavenumberCm1(eV)`, `energyEvToFrequencyHz(eV)`

---

## 3. Nuclear Mass vs Neutral Atomic Mass Convention

- Neutral atomic weight tables (`elements.ts` CIAAW `atomicMass_u` or AME `neutralAtomicMass_u`) include $Z$ electrons ($Z m_e$) and electronic binding energy.
- Reduced-mass physics strictly requires **bare nuclear mass** $M_{\text{nuc}}$:
  $$\frac{\mu}{m_e} = \frac{M_{\text{nuc}}}{m_e + M_{\text{nuc}}} = \frac{1}{1 + m_e / M_{\text{nuc}}}$$
- In `src/domain/atomic/index.ts`, isotope specifications store both `nuclearMass_u` and `neutralAtomicMass_u`. For $^1\text{H}$, $M_{\text{nuc}} = m_p = 1.007276466621\text{ u}$ ($\mu/m_e = 0.9994556794$) vs neutral $^1\text{H}$ mass $1.007825032\text{ u}$. For general isotopes without explicit CODATA bare-nuclear entries, `nuclearMass_u` subtracts $Z m_e$ from `neutralAtomicMass_u`.

---

## 4. Separation of Scientific Error Categories

`src/domain/observables/index.ts` separates four orthogonal uncertainty types on results:
1. `numericalError` — discretization, quadrature step residual, Monte Carlo sampling variance
2. `physicalUncertainty` — real physical/experimental measurement uncertainty (e.g., NIST IE standard error)
3. `modelApproximation` — omitted physics (e.g., omitted Lamb shift, omitted electron correlation)
4. `referenceUncertainty` — external dataset tolerance or basis-set truncation gap
