/**
 * Structured-clone-safe HTTP Transport for ATOMS v0.7.1 LS Term & CI Backend (`/api/ls/*`).
 *
 * Detects non-JSON HTML responses (static/viewer fallback mode) and reports
 * offline/unavailable states explicitly without fabricating results.
 */
import type { LSCIRequest, LSCIResponse, LSCapabilitiesResponse, LSTransport } from "./types";

let cachedLSCapabilities: LSCapabilitiesResponse | null = null;

function resolveBaseUrl(explicitBaseUrl = ""): string {
  if (explicitBaseUrl) return explicitBaseUrl;
  if (typeof globalThis !== "undefined" && "location" in globalThis && globalThis.location) {
    const loc = globalThis.location;
    if (typeof loc.origin === "string" && /^https?:/i.test(loc.origin)) {
      return loc.origin;
    }
    if (typeof loc.href === "string" && loc.href.startsWith("blob:")) {
      try {
        const inner = new URL(loc.href.slice(5));
        if (/^https?:/i.test(inner.origin)) return inner.origin;
      } catch {
        // fallback to relative URL
      }
    }
  }
  return "";
}

export function getCachedLSCapabilities(): LSCapabilitiesResponse | null {
  return cachedLSCapabilities;
}

export function setCachedLSCapabilities(cap: LSCapabilitiesResponse | null): void {
  cachedLSCapabilities = cap;
}

const OFFLINE_CAPABILITIES_FALLBACK = (blocker: string): LSCapabilitiesResponse => ({
  available: false,
  blocker,
  method: "fixed-orbital-ls-ci",
  orbitalSource: "atom-sph-avg-hf",
  orbitalOptimizationSupported: false,
  orbitalOptimizationNote:
    "Fixed-orbital LS-CI uses spherically averaged Hartree–Fock radial orbitals. MCHF radial orbital optimization is not implemented in v0.7.1.",
  supportedZRange: [1, 30],
  limits: {
    maxDeterminants: 12000,
    maxCsfs: 2500,
    denseDiagonalizationThreshold: 450,
    maxDenseMemoryMB: 256,
  },
});

async function parseJsonOrBlocker(res: Response): Promise<{ okJson: boolean; data?: unknown; textSnippet?: string }> {
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!ct.toLowerCase().includes("application/json")) {
    return { okJson: false, textSnippet: text.slice(0, 120) };
  }
  try {
    return { okJson: true, data: JSON.parse(text) };
  } catch {
    return { okJson: false, textSnippet: text.slice(0, 120) };
  }
}

export async function probeLSCapabilities(
  signal?: AbortSignal,
  refresh = false,
  baseUrl = "",
): Promise<LSCapabilitiesResponse> {
  if (typeof fetch !== "function") {
    const off = OFFLINE_CAPABILITIES_FALLBACK(
      "Fetch API unavailable in this environment; live LS-CI backend cannot be queried.",
    );
    cachedLSCapabilities = off;
    return off;
  }

  try {
    const origin = resolveBaseUrl(baseUrl);
    const url = refresh ? `${origin}/api/ls/capabilities?refresh=1` : `${origin}/api/ls/capabilities`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    const parsed = await parseJsonOrBlocker(res);
    if (!parsed.okJson || !parsed.data || typeof parsed.data !== "object") {
      const off = OFFLINE_CAPABILITIES_FALLBACK(
        "Static/viewer mode detected: `/api/ls/capabilities` returned non-JSON content. Start the local Express + Python backend (`npm run dev` or `npm run start`) for live LS-CI calculations.",
      );
      cachedLSCapabilities = off;
      return off;
    }
    const cap = parsed.data as LSCapabilitiesResponse;
    cachedLSCapabilities = cap;
    return cap;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const off = OFFLINE_CAPABILITIES_FALLBACK(
      `Unable to reach local LS-CI backend (/api/ls/capabilities): ${err instanceof Error ? err.message : String(err)}`,
    );
    cachedLSCapabilities = off;
    return off;
  }
}

export class HttpLSTransport implements LSTransport {
  private readonly baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  async getCapabilities(signal?: AbortSignal): Promise<LSCapabilitiesResponse> {
    return probeLSCapabilities(signal, false, this.baseUrl);
  }

  async calculate(request: LSCIRequest, signal?: AbortSignal): Promise<LSCIResponse> {
    if (typeof fetch !== "function") {
      throw new Error("HTTP fetch unavailable for /api/ls/calculate.");
    }
    const origin = resolveBaseUrl(this.baseUrl);
    const res = await fetch(`${origin}/api/ls/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
      signal,
    });

    const parsed = await parseJsonOrBlocker(res);
    if (!parsed.okJson || !parsed.data || typeof parsed.data !== "object") {
      throw new Error(
        `LS-CI backend returned non-JSON response (HTTP ${res.status}). Ensure the local ATOMS Express + Python server is running.`,
      );
    }

    const payload = parsed.data as LSCIResponse;
    if (!res.ok) {
      throw new Error(payload.error ?? `LS-CI calculation failed (HTTP ${res.status}).`);
    }
    return payload;
  }
}

export const defaultHttpLSTransport = new HttpLSTransport();
