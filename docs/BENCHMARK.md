# ATOMS v0.6.0 — Compute & Renderer Benchmark

Generated: 2026-11-21T14:01:15.454Z

## 1. CPU Physics & Numerical Compute Benchmarks (Single-Thread Node / V8)

- Environment: linux 4.19.0-gvisor x64 (single-thread `tsx`; Web Workers run off the main UI thread in the browser)

| Benchmark | Iterations | Mean (ms) | Total (ms) |
|---|---|---|---|
| Schrödinger ψ_3d evaluation (10,000 points) | 10 | 7.1518 | 71.52 |
| Dirac 4-spinor Ψ_2p3/2 evaluation (10,000 points) | 10 | 14.1001 | 141 |
| Dirac radial expectation quadrature (N_grid = 2,000, Au78+) | 50 | 0.816 | 40.8 |
| NR E1 transition matrix element (2p -> 1s, 4,000 intervals) | 25 | 0.0619 | 1.55 |
| Dirac E1 transition matrix element (2p_3/2 -> 1s_1/2, 4,000 intervals) | 25 | 3.7968 | 94.92 |
| Marching Tetrahedra isosurface (3d real, 24^3 grid) | 5 | 60.5852 | 302.93 |
| Marching Tetrahedra isosurface (Dirac 2p_3/2, 32^3 grid) | 3 | 94.0278 | 282.08 |
| Schrödinger Monte Carlo sampling (50,000 pts) | 3 | 59.6814 | 179.04 |
| Dirac 4-spinor Monte Carlo sampling (50,000 pts) | 3 | 99.0413 | 297.12 |

## 2. Browser WebGL2 Rendering Benchmark

**Rendering mode: SwiftShader / ANGLE — CPU software rasterisation (CI container, no GPU)**

- WebGL renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
- OS: linux 4.19.0-gvisor x64
- Browser: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.8059.12 Safari/537.36
- Viewport: 1440×900, devicePixelRatio 1, point sprites additive blended
- Protocol: `?z&samples&mode&adaptive=0`; 4 s warm-up, six telemetry FPS samples 700 ms apart; median reported. Sampling and upload times are from the app's worker/upload timers.
- Hardware acceleration: NOT USED — these FPS values characterize CPU SwiftShader rasterisation only and are NOT hardware GPU measurements

| mode | Z | requested samples | rendered points | median FPS | min–max | sampling (ms) | GPU upload (ms) |
|---|---|---|---|---|---|---|---|
| single | 1 | 25,000 | 25,000 | 29 | 21–33 | 63 | 2.5 |
| single | 1 | 75,000 | 75,000 | 12 | 9–14 | 107 | 4.4 |
| single | 1 | 150,000 | 150,000 | 6 | 5–7 | 141 | 8.5 |
| single | 1 | 300,000 | 300,000 | 3 | 2–3 | 230 | 26 |
| atom | 10 | 75,000 | 75,000 | 13 | 11–13 | 52 | 14.5 |
| atom | 10 | 150,000 | 150,000 | 7 | 5–7 | 78 | 8.8 |
| atom | 10 | 300,000 | 300,000 | 4 | 2–4 | 131 | 19.1 |

## 3. Interpretation

- Pure scientific compute kernels (analytical Schrödinger/Dirac evaluation, 4,000-point E1 radial quadratures, 24³–32³ Marching Tetrahedra isosurfaces) complete in single-digit to low-tens of milliseconds and execute asynchronously inside dedicated Web Workers so UI controls never block.
- Software rasterisation is CPU- and memory-bandwidth-bound; the low FPS above is caused by ANGLE/SwiftShader software emulation rather than the WebGL2 draw calls or sample counts.
- Full-atom mode renders one draw call per subshell (or one draw call for tabulated Dirac–Fock / PySCF HF total density) with shared cross-subshell normalization.
- On capable workstation GPUs the target is 60 FPS; adaptive quality throttles sample counts after 3 s below 30 FPS (disabled in this benchmark).
- Run `ATOMS_BENCH_GPU=hardware npm run bench` on a workstation with a GPU to measure real hardware WebGL2 FPS, and verify `WEBGL_debug_renderer_info` is not SwiftShader.
