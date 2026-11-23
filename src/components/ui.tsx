import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function Panel({ title, children, className, right }: { title: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cn("border-b border-zinc-800", className)}>
      <header className="flex items-center justify-between bg-zinc-900/80 px-3 py-1.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{title}</h2>
        {right}
      </header>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs" title={hint}>
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-200 tabular-nums">{children}</span>
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="block py-0.5 text-xs">
      <div className="flex justify-between">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-200 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-0.5 h-1 w-full cursor-pointer accent-amber-400" />
    </label>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { v: T; label: string; disabled?: boolean; title?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-sm border border-zinc-700 text-[11px]">
      {options.map((o) => (
        <button
          key={o.v}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.v)}
          className={cn("flex-1 px-2 py-1 transition-colors", value === o.v ? "bg-zinc-200 text-zinc-900" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800", o.disabled && "cursor-not-allowed opacity-40")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-0.5 text-xs text-zinc-400">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-amber-400" />
    </label>
  );
}

export function Badge({
  kind,
  children,
  "data-testid": testId,
}: {
  kind: "measured" | "evaluated" | "predicted" | "unavailable" | "exact" | "estimate";
  children: ReactNode;
  "data-testid"?: string;
}) {
  const c: Record<string, string> = {
    measured: "border-emerald-700 text-emerald-300",
    evaluated: "border-sky-700 text-sky-300",
    predicted: "border-amber-700 text-amber-300",
    unavailable: "border-zinc-700 text-zinc-500",
    exact: "border-emerald-700 text-emerald-300",
    estimate: "border-amber-700 text-amber-300",
  };
  return (
    <span data-testid={testId} className={cn("rounded-sm border px-1 py-px text-[9px] uppercase tracking-wide", c[kind])}>
      {children}
    </span>
  );
}
