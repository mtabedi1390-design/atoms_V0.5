/**
 * Browser / Web-Worker Fetch Transport & Capability Cache for PySCF Backend (ATOMS v0.7.0).
 *
 * Pure Web Standards (`fetch`, `AbortSignal`) — zero React, Three.js, or Node built-ins.
 */
import type { HFCalculateRequest, HFCalculationResponse, HFCapabilitiesResponse, HFTransport } from "./types";

let cachedCapabilities: HFCapabilitiesResponse | null = null;

export function setCachedHFCapabilities(cap: HFCapabilitiesResponse | null): void {
  cachedCapabilities = cap;
}

export function getCachedHFCapabilities(): HFCapabilitiesResponse | null {
  return cachedCapabilities;
}

function resolveBaseUrl(explicitBaseUrl: string): string {
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

export function createHttpHFTransport(baseUrl = ""): HFTransport {
  const getOrigin = () => resolveBaseUrl(baseUrl);
  return {
    async getCapabilities(signal?: AbortSignal): Promise<HFCapabilitiesResponse> {
      try {
        const res = await fetch(`${getOrigin()}/api/hf/capabilities`, {
          method: "GET",
          signal,
          headers: { Accept: "application/json" },
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          const cap: HFCapabilitiesResponse = {
            available: false,
            blocker:
              "Local PySCF Express server (/api/hf/capabilities) is not active (static preview or offline mode). Start the ATOMS full-stack server via `npm run dev` or `npm start` with PySCF installed.",
          };
          cachedCapabilities = cap;
          return cap;
        }
        const data = (await res.json()) as HFCapabilitiesResponse;
        cachedCapabilities = data;
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cap: HFCapabilitiesResponse = {
          available: false,
          blocker: `PySCF local computational endpoint unreachable (${msg}). Start the ATOMS server with Python PySCF installed.`,
        };
        cachedCapabilities = cap;
        return cap;
      }
    },

    async calculate(request: HFCalculateRequest, signal?: AbortSignal): Promise<HFCalculationResponse> {
      if (signal?.aborted) {
        throw new DOMException("Calculation aborted", "AbortError");
      }
      const res = await fetch(`${getOrigin()}/api/hf/calculate`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(request),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          `PySCF local server endpoint (/api/hf/calculate) returned non-JSON HTTP ${res.status}. Ensure the ATOMS Express+PySCF server is running.`,
        );
      }

      const data = (await res.json()) as HFCalculationResponse;
      if (!res.ok && data.code === "BACKEND_UNAVAILABLE") {
        throw new Error(data.error ?? "PySCF local backend is unavailable.");
      }
      return data;
    },
  };
}

export const defaultHttpHFTransport = createHttpHFTransport();

export async function probeHFCapabilities(
  transport: HFTransport = defaultHttpHFTransport,
  signal?: AbortSignal,
): Promise<HFCapabilitiesResponse> {
  return transport.getCapabilities(signal);
}
