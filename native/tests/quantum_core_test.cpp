// Native validation of the shared quantum core.
//
// IMPORTANT: we deliberately do NOT use <cassert>/assert.  CMake Release builds define
// NDEBUG, which would silently compile assert() out and let a broken core "pass".
// CHECK below is always active in every configuration and exits non-zero on failure.
#include "../quantum_core.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <string>

namespace {
int g_checks = 0;
int g_failures = 0;

void report(bool ok, const std::string& expr, const std::string& detail, const char* file, int line) {
  ++g_checks;
  if (!ok) {
    ++g_failures;
    std::cerr << "FAIL " << file << ":" << line << "  " << expr << "\n      " << detail << "\n";
  }
}
}  // namespace

#define CHECK(cond) report((cond), #cond, "", __FILE__, __LINE__)
#define CHECK_NEAR(a, b, tol)                                                       \
  do {                                                                              \
    const double va = (a), vb = (b);                                                \
    const std::string d = "|" + std::to_string(va) + " - " + std::to_string(vb) +   \
                          "| = " + std::to_string(std::fabs(va - vb));              \
    report(std::fabs(va - vb) <= (tol), #a " ≈ " #b, d, __FILE__, __LINE__);        \
  } while (0)

int main() {
  using namespace atoms;

  // --- special functions against closed forms -------------------------------
  CHECK_NEAR(laguerre(0, 3.0, 0.7), 1.0, 1e-15);
  CHECK_NEAR(laguerre(1, 1.0, 2.5), 2.0 - 2.5, 1e-14);
  CHECK_NEAR(laguerre(3, 0.0, 1.0), (-1.0 + 9.0 - 18.0 + 6.0) / 6.0, 1e-14);
  for (double x : {-0.9, -0.3, 0.0, 0.25, 0.7, 0.99}) {
    CHECK_NEAR(legendreP(1, 0, x), x, 1e-14);
    CHECK_NEAR(legendreP(1, 1, x), -std::sqrt(1 - x * x), 1e-14);
    CHECK_NEAR(legendreP(2, 0, x), 0.5 * (3 * x * x - 1), 1e-14);
    CHECK_NEAR(legendreP(2, 2, x), 3 * (1 - x * x), 1e-14);
    CHECK_NEAR(legendreP(3, 0, x), 0.5 * (5 * x * x * x - 3 * x), 1e-14);
    // negative-m relation P_l^{-m} = (-1)^m (l-m)!/(l+m)! P_l^m
    CHECK_NEAR(legendreP(2, -1, x), -legendreP(2, 1, x) / 6.0, 1e-14);
    CHECK_NEAR(legendreP(4, -3, x), -legendreP(4, 3, x) / 5040.0, 1e-13);
  }

  // --- radial closed forms ---------------------------------------------------
  for (double Z : {1.0, 2.0, 26.0}) {
    for (double r : {0.05, 0.5, 2.0, 7.0}) {
      CHECK_NEAR(radialR(1, 0, r, Z), 2.0 * std::pow(Z, 1.5) * std::exp(-Z * r), 1e-12);
      CHECK_NEAR(radialR(2, 0, r, Z), std::pow(Z / 2.0, 1.5) * (2.0 - Z * r) * std::exp(-Z * r / 2.0), 1e-12);
      CHECK_NEAR(radialR(2, 1, r, Z),
                 std::pow(Z / 2.0, 1.5) * (Z * r / std::sqrt(3.0)) * std::exp(-Z * r / 2.0), 1e-12);
    }
  }

  // --- radial normalisation and analytic expectation values -----------------
  const int cases[][2] = {{1, 0}, {2, 0}, {2, 1}, {3, 0}, {3, 2}, {4, 3}, {6, 5}, {10, 7}, {16, 0}, {20, 19}};
  for (auto& c : cases) {
    for (double Z : {1.0, 2.0, 26.0}) {
      const int n = c[0], l = c[1];
      const double rMax = radialExtent(n, l, Z) * 1.5;
      const int N = 40000;
      const double h = rMax / N;
      double m0 = 0, m1 = 0;
      for (int i = 0; i <= N; ++i) {
        const double r = i * h;
        const double w = (i == 0 || i == N) ? 1.0 : (i % 2 ? 4.0 : 2.0);
        const double p = radialPDF(n, l, r, Z);
        m0 += w * p;
        m1 += w * p * r;
      }
      CHECK_NEAR(m0 * h / 3.0, 1.0, 2e-5);
      const double mean = m1 * h / 3.0;
      CHECK_NEAR(mean, meanRadiusAnalytic(n, l, Z), 2e-4 * meanRadiusAnalytic(n, l, Z));
    }
  }

  // --- angular normalisation ∫|Y|²dΩ = 1, l ≤ 4, all m ----------------------
  for (int l = 0; l <= 4; ++l) {
    for (int m = -l; m <= l; ++m) {
      const int N = 240;
      const double dt = kPi / N, dp = 2 * kPi / N;
      double s = 0;
      for (int i = 0; i < N; ++i) {
        const double t = (i + 0.5) * dt;
        for (int j = 0; j < N; ++j) {
          const double p = (j + 0.5) * dp;
          double yr, yi;
          psiComplex(5, l, m, 1.0, t, p, 1.0, yr, yi);  // angular shape only
          // divide out R(1)² to test Y alone
          const double R1 = radialR(5, l, 1.0);
          const double d = (yr * yr + yi * yi) / (R1 * R1);
          s += d * std::sin(t);
        }
      }
      CHECK_NEAR(s * dt * dp, 1.0, 3e-3);
    }
  }
  // real tesseral normalisation and orthogonality
  {
    const int N = 300;
    const double dt = kPi / N, dp = 2 * kPi / N;
    double norm = 0, cross = 0;
    for (int i = 0; i < N; ++i) {
      const double t = (i + 0.5) * dt;
      for (int j = 0; j < N; ++j) {
        const double p = (j + 0.5) * dp;
        norm += realHarmonic(2, 1, t, p) * realHarmonic(2, 1, t, p) * std::sin(t);
        cross += realHarmonic(2, 1, t, p) * realHarmonic(2, -1, t, p) * std::sin(t);
      }
    }
    CHECK_NEAR(norm * dt * dp, 1.0, 3e-3);
    CHECK_NEAR(cross * dt * dp, 0.0, 3e-3);
    CHECK(realHarmonic(1, 1, kPi / 2, 0.0) > 0);        // p_x lobe on +x
    CHECK(realHarmonic(1, -1, kPi / 2, kPi / 2) > 0);   // p_y lobe on +y
  }

  // --- energy and nodes ------------------------------------------------------
  CHECK_NEAR(hydrogenicEnergyEV(1, 1), -13.605693122994, 1e-12);
  CHECK_NEAR(hydrogenicEnergyEV(2, 2), -13.605693122994, 1e-12);
  {
    // 2s radial node at r = 2/Z
    CHECK_NEAR(radialR(2, 0, 2.0), 0.0, 1e-14);
    CHECK_NEAR(radialR(2, 0, 1.0, 2.0), 0.0, 1e-14);
    // 3d has no radial node, 3s has two: sample signs
    CHECK(radialR(3, 0, 1.0) * radialR(3, 0, 4.0) < 0);
    CHECK(radialR(3, 0, 4.0) * radialR(3, 0, 12.0) < 0);
    CHECK(radialR(3, 2, 1.0) * radialR(3, 2, 20.0) > 0);
  }

  // --- stability -------------------------------------------------------------
  for (int l : {0, 5, 10, 19}) {
    CHECK(std::isfinite(radialR(25, l, 0.0)));
    CHECK(std::isfinite(radialR(25, l, 1e-9)));
    CHECK(std::fabs(radialR(25, l, 1e5)) < 1e-100);
  }
  CHECK_NEAR(radialR(20, 19, 0.0), 0.0, 1e-300);

  // --- CDF domain tail control (high n / high l) -----------------------------
  for (auto& c : cases) {
    for (double Z : {1.0, 2.0, 26.0}) {
      const RadialDomain d = radialDomainForMass(c[0], c[1], Z, 1e-8);
      CHECK(d.includedMass >= 1.0 - 1e-8);
      CHECK(d.tailMass >= 0.0);
      CHECK(d.tailMass <= 1e-8);
      CHECK(std::isfinite(d.rMax));
    }
  }

  // --- probability current: closed form vs numerical gradient ----------------
  for (auto& state : {std::array<int, 3>{2, 1, 1}, std::array<int, 3>{3, 2, -2}, std::array<int, 3>{4, 3, 2}}) {
    const int n = state[0], l = state[1], m = state[2];
    for (auto& pt : {std::array<double, 3>{1.5, 0.7, 0.4}, std::array<double, 3>{-2.0, 1.0, -0.3},
                     std::array<double, 3>{0.5, -3.0, 2.0}}) {
      double ax, ay, az, nx, ny, nz;
      currentAnalytic(n, l, m, pt[0], pt[1], pt[2], 1.0, ax, ay, az);
      currentNumeric(n, l, m, pt[0], pt[1], pt[2], 1.0, nx, ny, nz);
      const double scale = std::max({std::fabs(ax), std::fabs(ay), std::fabs(az), 1e-12});
      CHECK_NEAR(ax / scale, nx / scale, 1e-5);
      CHECK_NEAR(ay / scale, ny / scale, 1e-5);
      CHECK_NEAR(az / scale, nz / scale, 1e-5);
    }
  }
  {
    double x, y, z;
    currentAnalytic(2, 1, 0, 1.0, 2.0, 3.0, 1.0, x, y, z);
    CHECK(std::fabs(x) + std::fabs(y) + std::fabs(z) == 0.0);  // m = 0 ⇒ j ≡ 0
    currentAnalytic(2, 1, 1, 0.0, 0.0, 1.3, 1.0, x, y, z);
    CHECK(std::fabs(x) + std::fabs(y) + std::fabs(z) == 0.0);  // on z-axis ⇒ j = 0
    currentAnalytic(2, 1, 1, 2.0, 0.0, 0.0, 1.0, x, y, z);
    CHECK(y > 0);  // counter-clockwise about +z for m > 0
  }

  std::cout << "checks=" << g_checks << " failures=" << g_failures << "\n";
  if (g_failures != 0) {
    std::cerr << "quantum_core_test: FAILED " << g_failures << " check(s)\n";
    return EXIT_FAILURE;
  }
  std::cout << "quantum_core_test: all checks passed\n";
  return EXIT_SUCCESS;
}
