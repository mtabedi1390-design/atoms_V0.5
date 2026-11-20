// ATOMS shared quantum mathematics — platform-independent C++ reference core.
//
// This is an independent reference implementation of the same model as
// src/physics/*.ts (Model A: exact non-relativistic hydrogenic atom).  It exists so
// the browser mathematics can be cross-checked against a second implementation and
// so the native viewers (when their optional GLFW/GLEW dependencies are present) can
// share one code path instead of duplicating recurrences.
//
// COORDINATE CONVENTION (documented, single convention across this repository):
//   right-handed Cartesian, z is the polar axis, θ ∈ [0,π] from +z, φ ∈ [0,2π) from +x
//   in the xy-plane.  The historical upstream atom_realtime.cpp used +y as polar axis;
//   it is not reused here, and no file in this tree mixes the two.
// UNITS: lengths in Bohr radii a0, energies in eV (converted at the boundary),
//   probability current in atomic units (e a0 / t) = a0²·(Hartree/ħ).
// NORMALISATION: ∫|R|²r²dr = 1, ∫|Y|²dΩ = 1 ⇒ P_r(r) = r²|R|².
#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace atoms {

constexpr double kPi = 3.14159265358979323846;
constexpr double kRydbergEV = 13.605693122994;   // CODATA 2018
constexpr double kHartreeEV = 27.211386245988;   // CODATA 2018
constexpr double kBohrPm = 52.9177210903;        // CODATA 2018

inline double lnGamma(double x) {
  if (x < 0.5) return std::log(kPi / std::fabs(std::sin(kPi * x))) - lnGamma(1.0 - x);
  static const double c[9] = {0.99999999999980993,   676.5203681218851, -1259.1392167224028,
                              771.32342877765313,   -176.61502916214059, 12.507343278686905,
                              -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7};
  const int g = 7;
  x -= 1.0;
  double a = c[0];
  const double t = x + g + 0.5;
  for (int i = 1; i < g + 2; ++i) a += c[i] / (x + i);
  return 0.5 * std::log(2.0 * kPi) + (x + 0.5) * std::log(t) - t + std::log(a);
}

inline void validateQN(int n, int l, int m) {
  if (n < 1) throw std::invalid_argument("n must be >= 1");
  if (l < 0 || l > n - 1) throw std::invalid_argument("l must satisfy 0 <= l <= n-1");
  if (std::abs(m) > l) throw std::invalid_argument("m must satisfy |m| <= l");
}

// Generalized Laguerre L_k^{(alpha)}(x), 3-term recurrence (same formula as the TS core).
inline double laguerre(int k, double alpha, double x) {
  if (k < 0) throw std::invalid_argument("laguerre: k < 0");
  if (k == 0) return 1.0;
  double lm2 = 1.0, lm1 = 1.0 + alpha - x;
  if (k == 1) return lm1;
  double L = lm1;
  for (int j = 2; j <= k; ++j) {
    L = ((2.0 * j - 1.0 + alpha - x) * lm1 - (j - 1.0 + alpha) * lm2) / j;
    lm2 = lm1;
    lm1 = L;
  }
  return L;
}

// Associated Legendre P_l^m(x), negative m supported, Condon–Shortley phase included.
inline double legendreP(int l, int m, double x) {
  if (l < 0 || std::abs(m) > l) throw std::invalid_argument("legendreP: invalid l,m");
  if (x < -1.0 || x > 1.0) throw std::invalid_argument("legendreP: |x| > 1");
  const int am = std::abs(m);
  double pmm = 1.0;
  if (am > 0) {
    const double somx2 = std::sqrt((1.0 - x) * (1.0 + x));
    double fact = 1.0;
    for (int i = 1; i <= am; ++i) {
      pmm *= -fact * somx2;
      fact += 2.0;
    }
  }
  double res;
  if (l == am) {
    res = pmm;
  } else {
    double pmmp1 = x * (2.0 * am + 1.0) * pmm;
    if (l == am + 1) {
      res = pmmp1;
    } else {
      double pll = 0.0;
      for (int ll = am + 2; ll <= l; ++ll) {
        pll = ((2.0 * ll - 1.0) * x * pmmp1 - (ll + am - 1.0) * pmm) / (ll - am);
        pmm = pmmp1;
        pmmp1 = pll;
      }
      res = pll;
    }
  }
  if (m < 0) res *= (am % 2 == 0 ? 1.0 : -1.0) * std::exp(lnGamma(l - am + 1.0) - lnGamma(l + am + 1.0));
  return res;
}

inline double sphNorm(int l, int m) {
  const int am = std::abs(m);
  return std::sqrt((2.0 * l + 1.0) / (4.0 * kPi) *
                   std::exp(lnGamma(l - am + 1.0) - lnGamma(l + am + 1.0)));
}

inline double radialNorm(int n, int l, double Z = 1.0, double a = 1.0) {
  const double pref = std::pow(2.0 * Z / (n * a), 3);
  return std::sqrt(pref * std::exp(lnGamma(n - l) - lnGamma(n + l + 1)) / (2.0 * n));
}

inline double radialR(int n, int l, double r, double Z = 1.0, double a = 1.0) {
  const double rho = 2.0 * Z * r / (n * a);
  return radialNorm(n, l, Z, a) * std::exp(-rho / 2.0) * std::pow(rho, l) *
         laguerre(n - l - 1, 2.0 * l + 1.0, rho);
}

inline double radialPDF(int n, int l, double r, double Z = 1.0, double a = 1.0) {
  const double R = radialR(n, l, r, Z, a);
  return r * r * R * R;
}

inline double realHarmonic(int l, int m, double theta, double phi) {
  const int am = std::abs(m);
  const double base = sphNorm(l, am) * legendreP(l, am, std::cos(theta));
  if (m == 0) return base;
  const double sign = (am % 2 == 0) ? 1.0 : -1.0;
  const double s = std::sqrt(2.0) * sign * base;
  return m > 0 ? s * std::cos(am * phi) : s * std::sin(am * phi);
}

// Complex ψ_nlm → (re, im).
inline void psiComplex(int n, int l, int m, double r, double theta, double phi, double Z,
                       double& re, double& im) {
  validateQN(n, l, m);
  const int am = std::abs(m);
  const double R = radialR(n, l, r, Z);
  double y = sphNorm(l, am) * legendreP(l, am, std::cos(theta));
  if (m < 0 && am % 2 == 1) y = -y;
  // y already carries the (-1)^m factor of Y_l^{-m} = (-1)^m conj(Y_l^m);
  // the azimuthal phase must use the *signed* m (the previous draft used |m|,
  // which reversed the probability current for negative-m states).
  re = R * y * std::cos(m * phi);
  im = R * y * std::sin(m * phi);
}

inline double hydrogenicEnergyEV(int n, double Z) { return -kRydbergEV * Z * Z / (n * n); }
inline double meanRadiusAnalytic(int n, int l, double Z = 1.0) {
  return (3.0 * n * n - l * (l + 1)) / (2.0 * Z);
}

// ⟨r⟩ + 7σ domain; tail mass beyond it is < 1e-7 in all tested cases.
inline double radialExtent(int n, int l, double Z = 1.0) {
  const double m = meanRadiusAnalytic(n, l, Z);
  const double r2 = n * n * (5.0 * n * n + 1.0 - 3.0 * l * (l + 1)) / (2.0 * Z * Z);
  const double sd = std::sqrt(std::max(r2 - m * m, 0.0));
  return std::max(m + 7.0 * sd, 6.0 * n / Z);
}

inline double integrateRadialMass(int n, int l, double Z, double rMax, int intervals = 20000) {
  const double h = rMax / intervals;
  double s = 0.0;
  for (int i = 0; i <= intervals; ++i) {
    const double r = i * h;
    const double w = (i == 0 || i == intervals) ? 1.0 : (i % 2 ? 4.0 : 2.0);
    s += w * radialPDF(n, l, r, Z);
  }
  return s * h / 3.0;
}

/**
 * Radial domain for a requested included mass.  Expands until
 * ∫_0^R P_r dr ≥ 1 − tol, or throws with a diagnostic.  The caller must not
 * silently renormalise a truncated distribution.
 */
struct RadialDomain {
  double rMax;
  double includedMass;
  double tailMass;
  int expansions;
};

inline RadialDomain radialDomainForMass(int n, int l, double Z, double tol = 1e-8,
                                        int maxExpansions = 24) {
  validateQN(n, l, 0);
  double rMax = radialExtent(n, l, Z);
  for (int k = 0; k <= maxExpansions; ++k) {
    const double mass = integrateRadialMass(n, l, Z, rMax, 20000);
    // Quadrature may overshoot 1.0 by ~1e-9; the physical tail is never negative.
    if (mass >= 1.0 - tol) return {rMax, mass, std::max(0.0, 1.0 - mass), k};
    rMax *= 1.5;
  }
  throw std::runtime_error("radialDomainForMass: tail tolerance not reached for n=" +
                           std::to_string(n) + " l=" + std::to_string(l));
}

// j = Im(ψ* ∇ψ), atomic units.  Closed form for a pure complex harmonic:
//   j = m |ψ|² / (r sinθ) φ̂ ;  exactly zero for m = 0 or on the z axis (no clamping).
inline void currentAnalytic(int n, int l, int m, double x, double y, double z, double Z,
                            double& jx, double& jy, double& jz) {
  jx = jy = jz = 0.0;
  const double r = std::sqrt(x * x + y * y + z * z);
  if (r < 1e-12) return;
  const double rho = std::sqrt(x * x + y * y);  // cylindrical radius
  if (rho < 1e-12 || m == 0) return;
  const double theta = std::acos(std::max(-1.0, std::min(1.0, z / r)));
  const double phi = std::atan2(y, x);
  double re, im;
  psiComplex(n, l, m, r, theta, phi, Z, re, im);
  const double dens = re * re + im * im;
  const double mag = m * dens / rho;
  jx = -y / rho * mag;
  jy = x / rho * mag;
}

// Numerical gradient form used to validate the closed form (derivatives in atomic units).
inline void currentNumeric(int n, int l, int m, double x, double y, double z, double Z,
                           double& jx, double& jy, double& jz, double h = 1e-4) {
  const double p[3] = {x, y, z};
  const double r = std::sqrt(x * x + y * y + z * z);
  const double theta = std::acos(std::max(-1.0, std::min(1.0, r > 0 ? z / r : 1.0)));
  const double phi = std::atan2(y, x);
  double re0, im0;
  psiComplex(n, l, m, r, theta, phi, Z, re0, im0);
  double d[3];
  for (int k = 0; k < 3; ++k) {
    double pp[3] = {p[0], p[1], p[2]}, pm[3] = {p[0], p[1], p[2]};
    pp[k] += h;
    pm[k] -= h;
    double rp = 0, ip = 0, rm = 0, im = 0;
    const double r1 = std::sqrt(pp[0] * pp[0] + pp[1] * pp[1] + pp[2] * pp[2]);
    const double r2 = std::sqrt(pm[0] * pm[0] + pm[1] * pm[1] + pm[2] * pm[2]);
    psiComplex(n, l, m, r1, std::acos(pp[2] / r1), std::atan2(pp[1], pp[0]), Z, rp, ip);
    psiComplex(n, l, m, r2, std::acos(pm[2] / r2), std::atan2(pm[1], pm[0]), Z, rm, im);
    const double dRe = (rp - rm) / (2 * h), dIm = (ip - im) / (2 * h);
    d[k] = re0 * dIm - im0 * dRe;  // Im(ψ* ∂ψ)
  }
  jx = d[0];
  jy = d[1];
  jz = d[2];
}

}  // namespace atoms
