/**
 * Browser / Web-Worker Fetch Transport & Capability Cache for
 * ATOMS v0.7.2 Post-Hartree–Fock Electron Correlation Backend.
 *
 * Pure Web Standards (`fetch`, `AbortSignal`) — zero React, Three.js, or Node built-ins.
 */
import type {
  CorrelationCalculateRequest,
  CorrelationCalculationResponse,
  CorrelationCapabilitiesResponse,
  CorrelationTransport,
} from "./types";

let cachedCorrelationCapabilities: CorrelationCapabilitiesResponse | null = null;

export function setCachedCorrelationCapabilities(cap: CorrelationCapabilitiesResponse | null): void {
  cachedCorrelationCapabilities = cap;
}

export function getCachedCorrelationCapabilities(): CorrelationCapabilitiesResponse | null {
  return cachedCorrelationCapabilities;
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

export function createHttpCorrelationTransport(baseUrl = ""): CorrelationTransport {
  const getOrigin = () => resolveBaseUrl(baseUrl);

  return {
    async getCapabilities(signal?: AbortSignal, refresh = false): Promise<CorrelationCapabilitiesResponse> {
      try {
        const suffix = refresh ? "?refresh=1" : "";
        const res = await fetch(`${getOrigin()}/api/correlation/capabilities${suffix}`, {
          method: "GET",
          signal,
          headers: { Accept: "application/json" },
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          const cap: CorrelationCapabilitiesResponse = {
            available: false,
            blocker:
              "Local PySCF Correlation Express endpoint (/api/correlation/capabilities) returned non-JSON (static preview or offline mode). Start the ATOMS full-stack server with PySCF installed.",
          };
          cachedCorrelationCapabilities = cap;
          return cap;
        }
        const data = (await res.json()) as CorrelationCapabilitiesResponse;
        cachedCorrelationCapabilities = data;
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cap: CorrelationCapabilitiesResponse = {
          available: false,
          blocker: `PySCF Electron Correlation endpoint unreachable (${msg}). Start the ATOMS server with Python PySCF installed.`,
        };
        cachedCorrelationCapabilities = cap;
        return cap;
      }
    },

    async calculate(
      request: CorrelationCalculateRequest,
      signal?: AbortSignal,
    ): Promise<CorrelationCalculationResponse> {
      if (signal?.aborted) {
        throw new DOMException("Calculation aborted", "AbortError");
      }

      const res = await fetch(`${getOrigin()}/api/correlation/calculate`, {
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
          `PySCF Correlation server endpoint (/api/correlation/calculate) returned non-JSON HTTP ${res.status}. Ensure the ATOMS Express+PySCF server is running.`,
        );
      }

      const data = (await res.json()) as CorrelationCalculationResponse;
      if (!res.ok && data.code === "BACKEND_UNAVAILABLE") {
        throw new Error(data.error ?? "PySCF Correlation local backend is unavailable.");
      }
      return data;
    },
  };
}

export const defaultHttpCorrelationTransport = createHttpCorrelationTransport();

export async function probeCorrelationCapabilities(
  transport: CorrelationTransport = defaultHttpCorrelationTransport,
  refresh = false,
  signal?: AbortSignal,
): Promise<CorrelationCapabilitiesResponse> {
  return transport.getCapabilities(signal, refresh);
}
