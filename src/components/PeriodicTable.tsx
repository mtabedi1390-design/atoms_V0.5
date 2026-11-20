import { useMemo, useState } from "react";
import { BLOCK_COLORS, CATEGORY_COLORS, ELEMENTS, type ElementRecord } from "@/data/elements";

interface Props {
  selectedZ: number;
  onSelect: (Z: number) => void;
}

/** Standard 18-column layout; lanthanides/actinides in separate rows 9/10 (cols 4–17). */
function cell(e: ElementRecord): { row: number; col: number } {
  if (e.Z >= 57 && e.Z <= 71) return { row: 9, col: e.Z - 57 + 4 };
  if (e.Z >= 89 && e.Z <= 103) return { row: 10, col: e.Z - 89 + 4 };
  return { row: e.period, col: e.group ?? 3 };
}

export function PeriodicTable({ selectedZ, onSelect }: Props) {
  const [colorBy, setColorBy] = useState<"category" | "block">("block");
  const [query, setQuery] = useState("");
  const grid = useMemo(() => {
    const map = new Map<string, ElementRecord>();
    for (const e of ELEMENTS) {
      const { row, col } = cell(e);
      map.set(`${row}-${col}`, e);
    }
    return map;
  }, []);
  const q = query.trim().toLowerCase();
  const matches = (e: ElementRecord) => q === "" || e.symbol.toLowerCase() === q || e.name.toLowerCase().includes(q) || String(e.Z) === q;

  const onKey = (ev: React.KeyboardEvent) => {
    const cur = ELEMENTS[selectedZ - 1];
    const { row, col } = cell(cur);
    const moves: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const mv = moves[ev.key];
    if (!mv) return;
    ev.preventDefault();
    let r = row, c = col;
    for (let i = 0; i < 18; i++) {
      r += mv[0];
      c += mv[1];
      if (r < 1 || r > 10 || c < 1 || c > 18) return;
      const e = grid.get(`${r}-${c}`);
      if (e) {
        onSelect(e.Z);
        return;
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={query}
          aria-label="Search elements by symbol, name, or atomic number"
          onChange={(e) => {
            setQuery(e.target.value);
            const v = e.target.value.trim().toLowerCase();
            const hit = ELEMENTS.find((el) => el.symbol.toLowerCase() === v || el.name.toLowerCase() === v || String(el.Z) === v);
            if (hit) onSelect(hit.Z);
          }}
          placeholder="Search symbol / name / Z"
          className="h-7 flex-1 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        />
        <select aria-label="Color periodic table by" value={colorBy} onChange={(e) => setColorBy(e.target.value as "category" | "block")} className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-1 text-xs text-zinc-300">
          <option value="block">colour: block</option>
          <option value="category">colour: category</option>
        </select>
      </div>
      <div
        role="grid"
        tabIndex={0}
        onKeyDown={onKey}
        aria-label="Periodic table"
        className="grid gap-[2px] outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
        style={{ gridTemplateColumns: "repeat(18, minmax(0, 1fr))", gridTemplateRows: "repeat(10, auto)" }}
      >
        {ELEMENTS.map((e) => {
          const { row, col } = cell(e);
          const color = colorBy === "block" ? BLOCK_COLORS[e.block] : CATEGORY_COLORS[e.category];
          const sel = e.Z === selectedZ;
          const dim = !matches(e);
          const predicted = e.configuration.evidence === "predicted";
          return (
            <button
              key={e.Z}
              role="gridcell"
              aria-selected={sel}
              aria-label={`${e.name}, Z=${e.Z}, ${e.configuration.evidence}`}
              title={`${e.name} (Z=${e.Z}) — ${e.configuration.value} (${e.configuration.evidence})`}
              onClick={() => onSelect(e.Z)}
              style={{
                gridRow: row + (row >= 9 ? 1 : 0),
                gridColumn: col,
                borderColor: sel ? "#fff" : color + "55",
                borderStyle: predicted && !sel ? "dashed" : "solid",
                background: sel ? color : color + "22",
                opacity: dim ? 0.25 : 1,
              }}
              className="relative flex aspect-square flex-col items-center justify-center rounded-[2px] border text-[9px] leading-none text-zinc-100 transition-colors hover:brightness-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300"
            >
              <span className="font-mono text-[7px] text-zinc-400">{e.Z}</span>
              <span className="font-semibold">{e.symbol}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
        {colorBy === "block"
          ? Object.entries(BLOCK_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{k}-block</span>)
          : Object.entries(CATEGORY_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{k}</span>)}
        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm border border-dashed border-zinc-400" />predicted config (Z ≥ 104)</span>
      </div>
    </div>
  );
}
