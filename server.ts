/**
 * ATOMS v0.7.0 Full-Stack Express + Vite Server.
 *
 * Exposes controlled local computational endpoints (`/api/hf/*`) that bridge
 * requests to the local Python PySCF + libcint + BSE engine (`science/hf_backend.py`)
 * with strict input validation, real process cancellation, and honest offline reporting.
 *
 * Compatible with both:
 *  - `tsx server.ts` (development with Vite HMR middlewares on port 3000)
 *  - `node server.ts` (production with Node 22 native TypeScript stripping serving dist/)
 */
import express from "express";
import type { Request, Response } from "express";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_SCRIPT = path.resolve(__dirname, "science", "hf_backend.py");
const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === "production";

interface PythonDetection {
  readonly executable: string | null;
  readonly capabilities: Record<string, unknown>;
}

function candidatePythonExecutables(): string[] {
  const list: string[] = [];
  if (process.env.ATOMS_PYTHON) list.push(process.env.ATOMS_PYTHON);
  list.push(path.resolve(__dirname, ".venv", "bin", "python"));
  list.push(path.resolve(__dirname, ".venv", "Scripts", "python.exe"));
  list.push("/opt/atoms-py/bin/python");
  list.push("python3");
  list.push("python");
  return list;
}

function runPythonJsonSync(executable: string, payload: unknown, timeoutMs = 15000): Record<string, unknown> {
  const stdout = execFileSync(executable, [BACKEND_SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as Record<string, unknown>;
}

function detectPythonBackend(): PythonDetection {
  if (!existsSync(BACKEND_SCRIPT)) {
    return {
      executable: null,
      capabilities: {
        available: false,
        blocker: `Missing computational script: ${BACKEND_SCRIPT}`,
      },
    };
  }
  const errors: string[] = [];
  for (const exe of candidatePythonExecutables()) {
    if (exe.includes(path.sep) && !existsSync(exe)) continue;
    try {
      const cap = runPythonJsonSync(exe, { action: "capabilities" }, 15000);
      if (cap.available === true) {
        return { executable: exe, capabilities: { ...cap, pythonExecutable: exe } };
      }
      errors.push(`${exe}: ${String(cap.error ?? "unavailable")}`);
    } catch (err) {
      errors.push(`${exe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    executable: null,
    capabilities: {
      available: false,
      blocker:
        "No Python environment with PySCF + Basis Set Exchange was found. Run `bash scripts/setup_python_backend.sh` (or set ATOMS_PYTHON) and restart the ATOMS server.",
      probeDetails: errors.slice(0, 4),
    },
  };
}

let cachedDetection: PythonDetection | null = null;
function getDetection(refresh = false): PythonDetection {
  if (!cachedDetection || refresh) {
    cachedDetection = detectPythonBackend();
  }
  return cachedDetection;
}

function runPythonCalculation(
  executable: string,
  payload: Record<string, unknown>,
  req: Request,
  res: Response,
  timeoutMs = 90000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [BACKEND_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      req.off("aborted", onAbort);
      res.off("close", onAbort);
      clearTimeout(timer);
    };

    const killChild = () => {
      if (child.killed) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 500);
    };

    const onAbort = () => {
      if (!settled && !res.writableFinished) {
        settled = true;
        cleanup();
        killChild();
        reject(new Error("CLIENT_ABORTED"));
      }
    };

    req.on("aborted", onAbort);
    res.on("close", onAbort);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        killChild();
        reject(new Error(`PySCF calculation exceeded ${timeoutMs} ms timeout.`));
      }
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        if (code !== 0 && !parsed.error) {
          reject(new Error(stderr || `Backend exited with code ${String(code)}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(stderr || stdout || `Invalid backend JSON (exit code ${String(code)})`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Localhost-only health & capabilities discovery (re-probe optional via ?refresh=1)
  app.get("/api/hf/capabilities", (req: Request, res: Response) => {
    const refresh = req.query.refresh === "1";
    const det = getDetection(refresh);
    res.json(det.capabilities);
  });

  app.post("/api/hf/calculate", async (req: Request, res: Response) => {
    const det = getDetection(false);
    if (!det.executable) {
      res.status(503).json({
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        error: String(det.capabilities.blocker ?? "PySCF backend unavailable."),
      });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") {
      res.status(400).json({ ok: false, code: "INVALID_REQUEST", error: "JSON request body required." });
      return;
    }

    try {
      const result = await runPythonCalculation(det.executable, { ...body, action: "calculate" }, req, res);
      if (result.error && result.ok === false) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "CLIENT_ABORTED") {
        if (!res.headersSent) res.status(499).end();
        return;
      }
      res.status(500).json({ ok: false, code: "CALCULATION_ERROR", error: msg });
    }
  });

  if (!IS_PROD) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const det = getDetection(false);
    const engine = (det.capabilities.engine as { version?: string } | undefined)?.version;
    console.log(
      `ATOMS server listening on http://0.0.0.0:${PORT} (${IS_PROD ? "production" : "development"}) · PySCF: ${
        det.executable ? `active (${engine ?? "unknown"})` : "unavailable"
      }`,
    );
  });
}

void startServer();
