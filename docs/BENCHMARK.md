# Renderer benchmark

Generated: 2026-11-20T21:30:26.952Z

**Rendering mode: SwiftShader / ANGLE — CPU software rasterisation (CI container, no GPU)**

- WebGL renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
- OS: linux 4.19.0-gvisor x64
- Browser: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.8059.12 Safari/537.36
- Viewport: 1440×900, devicePixelRatio 1, point sprites additive blended
- Protocol: `?z&samples&mode&adaptive=0`; 4 s warm-up, six telemetry FPS samples 700 ms apart; median reported. Sampling and upload times are from the app's worker/upload timers.
- Hardware acceleration: NOT USED — these FPS values say nothing about real GPU performance

| mode | Z | requested samples | rendered points | median FPS | min–max | sampling (ms) | GPU upload (ms) |
|---|---|---|---|---|---|---|---|
| single | 1 | 25,000 | 25,000 | 19 | 18–21 | 55 | 5.5 |
| single | 1 | 75,000 | 75,000 | 8 | 7–12 | 130 | 5 |
| single | 1 | 150,000 | 150,000 | 5 | 4–5 | 134 | 7.2 |
| single | 1 | 300,000 | 300,000 | 2 | 1–3 | 287 | 11.8 |
| atom | 10 | 75,000 | 75,000 | 11 | 7–12 | 90 | 5.8 |
| atom | 10 | 150,000 | 150,000 | 5 | 3–6 | 88 | 8.6 |
| atom | 10 | 300,000 | 300,000 | 3 | 1–3 | 144 | 11.8 |

## Interpretation

- Software rasterisation is bandwidth- and CPU-bound; the low FPS here is caused by SwiftShader, not by the sample count alone. Under the historical CI screenshots the same caveat applied.
- Full-atom mode renders one draw call per subshell (no per-particle meshes) and uses a shared brightness normalisation; the two modes are not directly comparable in fill-rate cost.
- On capable hardware the target is 60 FPS; the app's adaptive quality reduces the requested sample count after 3 s below 30 FPS. That adaptation is disabled here so workloads stay fixed.
- Run `ATOMS_BENCH_GPU=hardware npm run bench` on a workstation to produce hardware numbers, and record the renderer string. No hardware benchmark was executed in this environment.
