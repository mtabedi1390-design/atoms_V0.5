# Renderer benchmark

Generated: 2026-11-19T11:15:54.985Z

**Rendering mode: SwiftShader / ANGLE — CPU software rasterisation (CI container, no GPU)**

- WebGL renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
- OS: linux 6.1.189+ x64
- Browser: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.6778.33 Safari/537.36
- Viewport: 1440×900, devicePixelRatio 1, point sprites additive blended
- Protocol: `?z&samples&mode&adaptive=0`; 4 s warm-up, six telemetry FPS samples 700 ms apart; median reported. Sampling and upload times are from the app's worker/upload timers.
- Hardware acceleration: NOT USED — these FPS values say nothing about real GPU performance

| mode | Z | requested samples | rendered points | median FPS | min–max | sampling (ms) | GPU upload (ms) |
|---|---|---|---|---|---|---|---|
| single | 1 | 25,000 | 25,000 | 21 | 8–28 | 54 | 4.2 |
| single | 1 | 75,000 | 75,000 | 11 | 1–36 | 98 | 2.6 |
| single | 1 | 150,000 | 150,000 | 5 | 5–5 | 114 | 4.7 |
| single | 1 | 300,000 | 300,000 | 2 | 2–3 | 228 | 27.1 |
| atom | 10 | 75,000 | 75,000 | 10 | 2–36 | 70 | 0.5 |
| atom | 10 | 150,000 | 150,000 | 3 | 3–3 | 110 | 1 |
| atom | 10 | 300,000 | 300,000 | 2 | 2–2 | 163 | 18.8 |

## Interpretation

- Software rasterisation is bandwidth- and CPU-bound; the low FPS here is caused by SwiftShader, not by the sample count alone. Under the historical CI screenshots the same caveat applied.
- Full-atom mode renders one draw call per subshell (no per-particle meshes) and uses a shared brightness normalisation; the two modes are not directly comparable in fill-rate cost.
- On capable hardware the target is 60 FPS; the app's adaptive quality reduces the requested sample count after 3 s below 30 FPS. That adaptation is disabled here so workloads stay fixed.
- Run `ATOMS_BENCH_GPU=hardware npm run bench` on a workstation to produce hardware numbers, and record the renderer string. No hardware benchmark was executed in this environment.
