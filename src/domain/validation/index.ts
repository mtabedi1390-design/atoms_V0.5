/**
 * Pure domain validation & provider support-assessment primitives.
 * Zero dependency on React, DOM, or Three.js.
 */
import type { EvidenceClass } from "@/science/providers";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly field?: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface SupportAssessment {
  readonly supported: boolean;
  readonly evidenceClass: EvidenceClass;
  readonly reasons: readonly string[];
  readonly limitations: readonly string[];
  readonly blockedBy?: string;
}

export function okValidation(issues: readonly ValidationIssue[] = []): ValidationResult {
  const hasError = issues.some((i) => i.severity === "error");
  return { valid: !hasError, issues };
}

export function failValidation(code: string, message: string, field?: string): ValidationResult {
  return {
    valid: false,
    issues: [{ severity: "error", code, field, message }],
  };
}

export function validationFromIssues(issues: readonly ValidationIssue[]): ValidationResult {
  return {
    valid: !issues.some((i) => i.severity === "error"),
    issues,
  };
}

export function assertValid(res: ValidationResult, context: string): void {
  if (!res.valid) {
    const msgs = res.issues
      .filter((i) => i.severity === "error")
      .map((i) => `[${i.code}] ${i.message}`)
      .join("; ");
    throw new RangeError(`${context}: ${msgs}`);
  }
}
