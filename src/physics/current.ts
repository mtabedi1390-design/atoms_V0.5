/**
 * Probability current density  j = (ħ/m) Im(ψ* ∇ψ).
 *
 * Expressed in Hartree atomic units (ħ = m_e = a0 = 1), so j is in units of
 * (1/a0³)·(ħ/(m_e a0)) = a0⁻³ · 2.1877e6 m/s.
 *
 * The upstream `calculateProbabilityFlow` returned a *velocity* ħm/(m_e r sinθ) φ̂,
 * i.e. j/|ψ|², with a clamped sinθ, and used y as the polar axis.  Here we return the
 * genuine current density (which vanishes smoothly on the z axis) via a numerical
 * central-difference gradient of the complex wavefunction, and provide the closed form
 * for pure complex harmonics for cross-validation:
 *     j = (m/(r sinθ)) |ψ|² φ̂.
 * Real tesseral orbitals are real stationary states ⇒ j ≡ 0; we never fake motion.
 */
import { psiComplex, type QuantumNumbers } from "./hydrogenic";

function cartToSph(x: number, y: number, z: number): [number, number, number] {
  const r = Math.hypot(x, y, z);
  const theta = r === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, z / r)));
  const phi = Math.atan2(y, x);
  return [r, theta, phi];
}

export function psiComplexCart(q: QuantumNumbers, x: number, y: number, z: number, Z = 1): [number, number] {
  const [r, t, p] = cartToSph(x, y, z);
  return psiComplex(q, r, t, p, Z);
}

/** Numerical current density at Cartesian point (Bohr units), returns [jx, jy, jz]. */
export function probabilityCurrentNumeric(q: QuantumNumbers, x: number, y: number, z: number, Z = 1, h = 1e-4): [number, number, number] {
  const [re, im] = psiComplexCart(q, x, y, z, Z);
  const out: [number, number, number] = [0, 0, 0];
  const pos = [x, y, z];
  for (let k = 0; k < 3; k++) {
    const pp = [...pos];
    const pm = [...pos];
    pp[k] += h;
    pm[k] -= h;
    const [rp, ip] = psiComplexCart(q, pp[0], pp[1], pp[2], Z);
    const [rm, im2] = psiComplexCart(q, pm[0], pm[1], pm[2], Z);
    const dRe = (rp - rm) / (2 * h);
    const dIm = (ip - im2) / (2 * h);
    // Im(ψ* ∂ψ) = re·dIm − im·dRe
    out[k] = re * dIm - im * dRe;
  }
  return out;
}

/** Closed-form current for ψ_nlm (complex basis): j = m|ψ|²/(r sinθ) φ̂. */
export function probabilityCurrentAnalytic(q: QuantumNumbers, x: number, y: number, z: number, Z = 1): [number, number, number] {
  const [r, t] = cartToSph(x, y, z);
  const rho = r * Math.sin(t); // cylindrical radius
  if (rho < 1e-12 || q.m === 0) return [0, 0, 0];
  const [re, im] = psiComplexCart(q, x, y, z, Z);
  const dens = re * re + im * im;
  const mag = (q.m * dens) / rho;
  // φ̂ = (−y, x, 0)/ρ
  return [(-y / rho) * mag, (x / rho) * mag, 0];
}
