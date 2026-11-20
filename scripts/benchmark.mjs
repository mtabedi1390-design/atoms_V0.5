#!/usr/bin/env node
/**
 * Reproducible renderer benchmark.
 *
 * IMPORTANT: by default this launches Chromium with ANGLE/SwiftShader (CPU software
 * rasterisation) because the CI container has no GPU.  These numbers characterise CI
 * behaviour only and are NOT evidence of hardware WebGL2 performance.  Run the same
 * script on a workstation (remove the SwiftShader flags) to obtain hardware numbers,
 * and label the result with `WEBGL_debug_renderer_info`.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { platform, release, arch } from "node:os";

const PORT = 4179;
const SWIFTSHADER = process.env.ATOMS_BENCH_GPU !== "hardware";
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(3000);

const browser = await chromium.launch({
  args: SWIFTSHADER
    ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    : ["--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const renderer = await (async () => {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "webgl2 unavailable";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
})();
const ua = await page.evaluate(() => navigator.userAgent);
const dpr = await page.evaluate(() => window.devicePixelRatio);

const cases = [];
for (const n of [25000, 75000, 150000, 300000]) cases.push({ mode: "single", z: 1, samples: n });
for (const n of [75000, 150000, 300000]) cases.push({ mode: "atom", z: 10, samples: n });

for (const c of cases) {
  await page.goto(`http://127.0.0.1:${PORT}/?z=${c.z}&samples=${c.samples}&mode=${c.mode}&adaptive=0`);
  await page.waitForTimeout(4000);
  const readings = [];
  for (let i = 0; i < 6; i++) {
    const t = await page.locator("header.h-12").innerText();
    const fps = Number(/(\d+) fps/.exec(t.replace(/\n/g, " · "))?.[1] ?? 0);
    readings.push(fps);
    await page.waitForTimeout(700);
  }
  const text = (await page.locator("header.h-12").innerText()).replace(/\n/g, " · ");
  const workerMs = Number(/worker ([\d.]+) ms/.exec(text)?.[1] ?? 0);
  const uploadMs = Number(/upload ([\d.]+) ms/.exec(text)?.[1] ?? 0);
  const points = Number(/([\d,]+) pts/.exec(text)?.[1]?.replace(/,/g, "") ?? 0);
  const sorted = [...readings].sort((a, b) => a - b);
  c.medianFps = sorted[Math.floor(sorted.length / 2)];
  c.minFps = sorted[0];
  c.maxFps = sorted[sorted.length - 1];
  c.workerMs = workerMs;
  c.uploadMs = uploadMs;
  c.points = points;
  console.log(`${c.mode} Z=${c.z} N=${c.samples} → median ${c.medianFps} fps (min ${c.minFps}, max ${c.maxFps}), worker ${workerMs} ms, upload ${uploadMs} ms, ${points} pts`);
}
await browser.close();
server.kill();

const head = `# Renderer benchmark\n\nGenerated: ${new Date().toISOString()}\n\n` +
`**Rendering mode: ${SWIFTSHADER ? "SwiftShader / ANGLE — CPU software rasterisation (CI container, no GPU)" : "hardware GPU requested"}**\n\n` +
`- WebGL renderer: \`${renderer}\`\n- OS: ${platform()} ${release()} ${arch()}\n- Browser: ${ua}\n- Viewport: 1440×900, devicePixelRatio ${dpr}, point sprites additive blended\n- Protocol: \`?z&samples&mode&adaptive=0\`; 4 s warm-up, six telemetry FPS samples 700 ms apart; median reported. Sampling and upload times are from the app's worker/upload timers.\n- Hardware acceleration: ${SWIFTSHADER ? "NOT USED — these FPS values say nothing about real GPU performance" : "used"}\n\n` +
`| mode | Z | requested samples | rendered points | median FPS | min–max | sampling (ms) | GPU upload (ms) |\n|---|---|---|---|---|---|---|---|\n` +
cases.map((c) => `| ${c.mode} | ${c.z} | ${c.samples.toLocaleString()} | ${c.points.toLocaleString()} | ${c.medianFps} | ${c.minFps}–${c.maxFps} | ${c.workerMs} | ${c.uploadMs} |`).join("\n") +
`\n\n## Interpretation\n\n` +
`- Software rasterisation is bandwidth- and CPU-bound; the low FPS here is caused by SwiftShader, not by the sample count alone. Under the historical CI screenshots the same caveat applied.\n` +
`- Full-atom mode renders one draw call per subshell (no per-particle meshes) and uses a shared brightness normalisation; the two modes are not directly comparable in fill-rate cost.\n` +
`- On capable hardware the target is 60 FPS; the app's adaptive quality reduces the requested sample count after 3 s below 30 FPS. That adaptation is disabled here so workloads stay fixed.\n` +
`- Run \`ATOMS_BENCH_GPU=hardware npm run bench\` on a workstation to produce hardware numbers, and record the renderer string. No hardware benchmark was executed in this environment.\n`;
mkdirSync("docs", { recursive: true });
writeFileSync("docs/BENCHMARK.md", head);
console.log("wrote docs/BENCHMARK.md");
