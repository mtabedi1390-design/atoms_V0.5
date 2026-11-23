/**
 * ATOMS v0.7.0 Full-Stack Express + Vite Server.
 *
 * Exposes controlled local computational endpoints (`/api/hf/*`) that bridge
 * requests to the local Python PySCF + libcint + BSE engine (`science/hf_backend.py`)
 * with strict origin/host validation, real process cancellation, port-conflict
 * diagnostics, and clean child-process / Vite shutdown.
 *
 * Compatible with both:
 *  - `tsx server.ts` (development with Vite HMR middlewares; defaults to 127.0.0.1:3000)
 *  - `node server.ts` (production with Node 22 native TypeScript stripping serving dist/)
 */
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_SCRIPT = path.resolve(__dirname, "science", "hf_backend.py");
const LS_BACKEND_SCRIPT = path.resolve(__dirname, "science", "ls_ci_backend.py");
const IS_PROD = process.env.NODE_ENV === "production";

interface ServerCliArgs {
  readonly host: string;
  readonly port: number;
}

function parseServerArgs(argv: readonly string[]): ServerCliArgs {
  let host = process.env.ATOMS_HOST ?? process.env.HOST ?? "127.0.0.1";
  let port = Number(process.env.PORT ?? 3000);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host" && i + 1 < argv.length) {
      host = argv[++i];
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
    } else if (arg === "--port" && i + 1 < argv.length) {
      port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid server port: ${String(port)}`);
  }
  return { host, port };
}

const { host: BIND_HOST, port: PORT } = parseServerArgs(process.argv.slice(2));

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLoopbackHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(clean) || clean.startsWith("127.");
}

function extractHostname(hostHeader: string): string {
  const trimmed = hostHeader.trim();
  if (trimmed.startsWith("[")) {
    const idx = trimmed.indexOf("]");
    return idx >= 0 ? trimmed.slice(0, idx + 1) : trimmed;
  }
  const colonIdx = trimmed.lastIndexOf(":");
  return colonIdx > 0 ? trimmed.slice(0, colonIdx) : trimmed;
}

/**
 * Validate Host + Origin/Referer/Sec-Fetch-Site headers for `/api/hf/*`.
 * Prevents cross-origin websites from driving local Python SCF execution.
 * Never sets permissive wildcard CORS headers.
 */
function validateLocalApiOrigin(req: Request, res: Response, next: NextFunction): void {
  const reqHost = req.headers.host;
  if (!reqHost) {
    res.status(403).json({
      ok: false,
      code: "FORBIDDEN_ORIGIN",
      error: "Missing Host header on /api/hf request.",
    });
    return;
  }

  const reqHostname = extractHostname(reqHost);
  if (isLoopbackHost(BIND_HOST) && !isLoopbackHost(reqHostname)) {
    res.status(403).json({
      ok: false,
      code: "FORBIDDEN_ORIGIN",
      error: `Rejected non-loopback Host '${reqHostname}' on loopback-bound server.`,
    });
    return;
  }

  const secFetchSite = req.headers["sec-fetch-site"];
  if (typeof secFetchSite === "string" && secFetchSite === "cross-site") {
    res.status(403).json({
      ok: false,
      code: "FORBIDDEN_ORIGIN",
      error: "Cross-site browser requests to /api/hf are forbidden.",
    });
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    try {
      const originUrl = new URL(origin);
      const hostMatch = originUrl.host.toLowerCase() === reqHost.toLowerCase();
      const loopbackMatch = isLoopbackHost(BIND_HOST) && isLoopbackHost(originUrl.hostname);
      if (!hostMatch && !loopbackMatch) {
        res.status(403).json({
          ok: false,
          code: "FORBIDDEN_ORIGIN",
          error: `Cross-origin request rejected: Origin '${origin}' does not match Host '${reqHost}'.`,
        });
        return;
      }
    } catch {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN_ORIGIN",
        error: "Malformed Origin header.",
      });
      return;
    }
  }

  next();
}

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

function runPythonJsonSync(
  executable: string,
  payload: unknown,
  timeoutMs = 15000,
  scriptPath: string = BACKEND_SCRIPT,
): Record<string, unknown> {
  const stdout = execFileSync(executable, [scriptPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as Record<string, unknown>;
}

function withRuntimeDiagnostics(cap: Record<string, unknown>): Record<string, unknown> {
  return {
    ...cap,
    runtime: {
      executionMode: "full-local-scientific",
      bindHost: BIND_HOST,
      port: PORT,
      nodeVersion: process.version,
      pid: process.pid,
    },
  };
}

function detectPythonBackendForScript(scriptPath: string, unavailableFallback: Record<string, unknown>): PythonDetection {
  if (!existsSync(scriptPath)) {
    return {
      executable: null,
      capabilities: withRuntimeDiagnostics({
        ...unavailableFallback,
        available: false,
        blocker: `Missing computational script: ${scriptPath}`,
      }),
    };
  }
  const errors: string[] = [];
  for (const exe of candidatePythonExecutables()) {
    if (exe.includes(path.sep) && !existsSync(exe)) continue;
    try {
      const cap = runPythonJsonSync(exe, { action: "capabilities" }, 15000, scriptPath);
      if (cap.available === true) {
        return {
          executable: exe,
          capabilities: withRuntimeDiagnostics({ ...cap, pythonExecutable: exe }),
        };
      }
      errors.push(`${exe}: ${String(cap.error ?? "unavailable")}`);
    } catch (err) {
      errors.push(`${exe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    executable: null,
    capabilities: withRuntimeDiagnostics({
      ...unavailableFallback,
      available: false,
      blocker:
        "No Python environment with PySCF + Basis Set Exchange was found. Run `bash scripts/setup_python_backend.sh` (or set ATOMS_PYTHON) and restart the ATOMS server.",
      probeDetails: errors.slice(0, 4),
    }),
  };
}

let cachedDetection: PythonDetection | null = null;
function getDetection(refresh = false): PythonDetection {
  if (!cachedDetection || refresh) {
    cachedDetection = detectPythonBackendForScript(BACKEND_SCRIPT, {});
  }
  return cachedDetection;
}

let cachedLSDetection: PythonDetection | null = null;
function getLSDetection(refresh = false): PythonDetection {
  if (!cachedLSDetection || refresh) {
    cachedLSDetection = detectPythonBackendForScript(LS_BACKEND_SCRIPT, {
      method: "fixed-orbital-ls-ci",
      orbitalSource: "atom-sph-avg-hf",
      orbitalOptimizationSupported: false,
    });
  }
  return cachedLSDetection;
}

const activeChildren = new Set<ChildProcess>();

function terminateChildGracefully(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    activeChildren.delete(child);
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    activeChildren.delete(child);
    return;
  }
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // already dead
      }
    }
  }, 400);
  forceTimer.unref();
}

function runPythonCalculation(
  executable: string,
  payload: Record<string, unknown>,
  req: Request,
  res: Response,
  timeoutMs = 90000,
  scriptPath: string = BACKEND_SCRIPT,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      req.off("aborted", onAbort);
      res.off("close", onAbort);
      clearTimeout(timer);
    };

    const killChild = () => terminateChildGracefully(child);

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
      activeChildren.delete(child);
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    });

    child.on("close", (code) => {
      activeChildren.delete(child);
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

function inspectPortOwnerReadOnly(port: number): string | null {
  try {
    const out = execFileSync("ss", ["-ltnp", `sport = :${port}`], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const lines = out.split(/\r?\n/).slice(1).filter((l) => l.trim().length > 0);
    if (lines.length > 0) return lines.join("; ");
  } catch {
    // ss unavailable or netlink restricted; fall back to /proc/net/tcp
  }
  try {
    const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
    const tcp = execFileSync("awk", [`$2 ~ /:${hexPort}$/ && $4 == "0A" {print $2, $10}`, "/proc/net/tcp"], {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (tcp) return `/proc/net/tcp listener (${tcp.replace(/\s+/g, " ")})`;
  } catch {
    // ignore /proc read failure
  }
  return null;
}

async function startServer(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // Guard all computational HF endpoints against cross-origin execution.
  app.use("/api/hf", validateLocalApiOrigin);

  // Local health & capabilities discovery (re-probe optional via ?refresh=1)
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

  // Guard LS-CI computational endpoints with identical local origin protection.
  app.use("/api/ls", validateLocalApiOrigin);

  app.get("/api/ls/capabilities", (req: Request, res: Response) => {
    const refresh = req.query.refresh === "1";
    const det = getLSDetection(refresh);
    res.json(det.capabilities);
  });

  app.post("/api/ls/calculate", async (req: Request, res: Response) => {
    const det = getLSDetection(false);
    if (!det.executable) {
      res.status(503).json({
        ok: false,
        code: "BACKEND_UNAVAILABLE",
        error: String(det.capabilities.blocker ?? "LS-CI Python backend unavailable."),
      });
      return;
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") {
      res.status(400).json({ ok: false, code: "INVALID_REQUEST", error: "JSON request body required." });
      return;
    }

    try {
      const result = await runPythonCalculation(
        det.executable,
        { ...body, action: "calculate" },
        req,
        res,
        120000,
        LS_BACKEND_SCRIPT,
      );
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

  let viteServer: { middlewares: express.RequestHandler; close: () => Promise<void> } | null = null;

  if (!IS_PROD) {
    const { createServer } = await import("vite");
    viteServer = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const httpServer: HttpServer = createHttpServer(app);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of Array.from(activeChildren)) {
      terminateChildGracefully(child);
    }
    const hardExit = setTimeout(() => {
      process.exit(0);
    }, 2500);
    hardExit.unref();
    try {
      if (viteServer) {
        await viteServer.close();
      }
    } catch {
      // ignore close errors during shutdown
    }
    httpServer.closeAllConnections?.();
    httpServer.close(() => {
      clearTimeout(hardExit);
      process.exit(0);
    });
    void signal;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  httpServer.on("error", async (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const owner = inspectPortOwnerReadOnly(PORT);
      console.error(
        `ATOMS server failed to bind ${BIND_HOST}:${PORT} (EADDRINUSE — port already in use).`,
      );
      if (owner) {
        console.error(`Owning socket details: ${owner}`);
      }
      console.error(
        "Stop the already-running server instance or start ATOMS on another port (e.g., PORT=3001 npm run dev). Unrelated processes will NOT be killed automatically.",
      );
      if (viteServer) {
        try {
          await viteServer.close();
        } catch {
          // ignore
        }
      }
      process.exit(1);
      return;
    }
    console.error("ATOMS server error:", err);
    process.exit(1);
  });

  httpServer.listen(PORT, BIND_HOST, () => {
    const det = getDetection(false);
    const lsDet = getLSDetection(false);
    const engine = (det.capabilities.engine as { version?: string } | undefined)?.version;
    console.log(
      `ATOMS server listening on http://${BIND_HOST}:${PORT} (${IS_PROD ? "production" : "development"}) · PySCF: ${
        det.executable ? `active (${engine ?? "unknown"})` : "unavailable"
      } · LS-CI: ${lsDet.executable ? "active" : "unavailable"}`,
    );
  });
}

void startServer();
