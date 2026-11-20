// Emits reference vectors consumed by scripts/compare_native.mjs for cross-language
// comparison between this C++ core and src/physics/*.ts.
#include "../quantum_core.hpp"
#include <cstdio>
int main() {
  using namespace atoms;
  std::printf("# kind,args...,value  (r in a0, angular in rad, energies in eV)\n");
  for (int n : {1, 2, 3, 4, 6, 10, 16}) {
    for (int l = 0; l <= std::min(n - 1, 4); ++l) {
      for (double r : {0.01, 0.5, 1.7, 4.2, 11.0}) {
        std::printf("R,%d,%d,%.17g,1,%.17g\n", n, l, r, radialR(n, l, r, 1.0));
        std::printf("RZ,%d,%d,%.17g,26,%.17g\n", n, l, r, radialR(n, l, r, 26.0));
      }
      std::printf("E,%d,1,%.17g\n", n, hydrogenicEnergyEV(n, 1.0));
      std::printf("mean,%d,%d,1,%.17g\n", n, l, meanRadiusAnalytic(n, l, 1.0));
    }
  }
  for (int l = 0; l <= 5; ++l) {
    const int nJ = l + 1;  // valid n for the current reference states
    for (int m = -l; m <= l; ++m) {
      for (double th : {0.15, 0.9, 1.5707963267948966, 2.4}) {
        for (double ph : {0.0, 0.7, 2.9}) {
          std::printf("Y,%d,%d,%.17g,%.17g,%.17g\n", l, m, th, ph, realHarmonic(l, m, th, ph));
        }
      }
      for (double x : {1.3, -2.1}) {
        for (double y : {0.8, -3.0}) {
          for (double z : {0.4, 2.2}) {
            double jx, jy, jz;
            currentAnalytic(nJ, l, m, x, y, z, 1.0, jx, jy, jz);
            std::printf("J,%d,%d,%d,%.17g,%.17g,%.17g,%.17e,%.17e,%.17e\n", nJ, l, m, x, y, z, jx, jy, jz);
          }
        }
      }
    }
  }
  return 0;
}
