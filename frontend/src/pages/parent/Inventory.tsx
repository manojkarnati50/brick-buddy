import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ParentShell from "@/components/ParentShell";
import { BrickButton, BrickIcon, Card, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { InventoryLine } from "@/lib/types";

interface Inv { items: InventoryLine[]; totals: { owned: number; in_use: number; available: number }; low_stock_threshold: number; batch?: string }
interface LogRow { id: number; at: string; name: string; colour_name: string; delta: number; reason: string; batch: string | null; undone: boolean }

export default function Inventory() {
  const catalog = useStore((s) => s.catalog);
  const [inv, setInv] = useState<Inv | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [colourFilter, setColourFilter] = useState<number | null>(null);
  const [batch, setBatch] = useState<{ part: string; colour: number; quantity: number }[]>([{ part: "3001", colour: 4, quantity: 4 }]);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);

  const load = useCallback(() => {
    api.get<Inv>("/api/inventory").then(setInv);
    api.get<LogRow[]>("/api/inventory/log").then(setLog);
  }, []);
  useEffect(load, [load]);

  async function step(i: InventoryLine, delta: number) {
    setInv(await api.post<Inv>("/api/inventory/set", { part: i.part, colour: i.colour.code, delta, reason: delta > 0 ? "Manual +" : "Manual −" }));
    api.get<LogRow[]>("/api/inventory/log").then(setLog);
  }

  async function addBatch() {
    const r = await api.post<Inv>("/api/inventory/batch", { lines: batch.filter((l) => l.quantity > 0), reason: "Added a printed batch" });
    setInv(r);
    setToast({ msg: "Batch added", undo: async () => { await api.post(`/api/inventory/undo/${r.batch}`); load(); } });
    api.get<LogRow[]>("/api/inventory/log").then(setLog);
  }

  const byColour = useMemo(() => {
    const g = new Map<number, InventoryLine[]>();
    for (const i of inv?.items ?? []) if (colourFilter === null || i.colour.code === colourFilter) g.set(i.colour.code, [...(g.get(i.colour.code) ?? []), i]);
    return [...g.entries()];
  }, [inv, colourFilter]);

  return (
    <ParentShell title="Inventory">
      <div className="mb-5 grid grid-cols-3 gap-4">
        {[["Owned", inv?.totals.owned, "bg-sky"], ["Available", inv?.totals.available, "bg-mint"], ["In use (Built)", inv?.totals.in_use, "bg-peach"]].map(([l, v, c]) => (
          <div key={l as string} className={`rounded-squish p-4 shadow-squish ${c}`}><div className="text-3xl font-bold">{v ?? "…"}</div><div className="text-sm font-semibold text-ink/60">{l}</div></div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className={`chip ${colourFilter === null ? "bg-ink text-white" : "bg-white"}`} onClick={() => setColourFilter(null)}>All colours</button>
        {[...new Map((inv?.items ?? []).map((i) => [i.colour.code, i.colour])).values()].map((c) => (
          <button key={c.code} className={`chip ${colourFilter === c.code ? "bg-ink text-white" : "bg-white"}`} onClick={() => setColourFilter(c.code)}>
            <span className="h-3 w-3 rounded-full" style={{ background: c.hex }} />{c.name}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          {byColour.map(([code, items]) => (
            <Card key={code}>
              <div className="mb-3 flex items-center gap-2 font-bold"><span className="h-4 w-4 rounded-full" style={{ background: items[0].colour.hex }} />{items[0].colour.name}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((i) => (
                  <div key={i.part} className={`rounded-2xl p-3 ${i.low ? "bg-peach" : "bg-cream"}`}>
                    <div className="flex items-center justify-between">
                      <BrickIcon hex={i.colour.hex} w={i.size.startsWith("1×1") ? 1 : 2} size={24} />
                      {i.low && <span className="chip bg-white text-xs text-brick-red"><Icon icon="mdi:alert" /> low</span>}
                    </div>
                    <div className="mt-1 text-sm font-bold">{i.name}</div>
                    <div className="text-xs text-ink/50">{i.available} free · {i.in_use} in use</div>
                    <div className="mt-2 flex items-center justify-between">
                      <button className="h-10 w-10 rounded-xl bg-white text-xl font-bold shadow-squish" onClick={() => step(i, -1)}>−</button>
                      <span className="text-xl font-bold">{i.owned}</span>
                      <button className="h-10 w-10 rounded-xl bg-white text-xl font-bold shadow-squish" onClick={() => step(i, +1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <div className="flex flex-col gap-5">
          <Card tint="butter">
            <h3 className="mb-3 font-bold">Add a batch I just printed</h3>
            <div className="flex flex-col gap-2">
              {batch.map((l, idx) => (
                <div key={idx} className="flex gap-2">
                  <select className="input min-w-0 flex-1 text-sm" value={l.part} onChange={(e) => setBatch((b) => b.map((x, j) => (j === idx ? { ...x, part: e.target.value } : x)))}>
                    {catalog?.parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className="input w-28 text-sm" value={l.colour} onChange={(e) => setBatch((b) => b.map((x, j) => (j === idx ? { ...x, colour: Number(e.target.value) } : x)))}>
                    {catalog?.colours.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                  <input className="input w-16 text-sm" type="number" min={0} value={l.quantity} onChange={(e) => setBatch((b) => b.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
                </div>
              ))}
              <button className="btn-soft text-sm" onClick={() => setBatch((b) => [...b, { part: "3003", colour: 4, quantity: 2 }])}>+ another line</button>
              <BrickButton colour="green" size="sm" onClick={addBatch}>Add to inventory</BrickButton>
            </div>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">History</h3>
            <div className="max-h-[520px] overflow-auto text-sm">
              {log.map((r) => (
                <div key={r.id} className={`flex items-center gap-2 border-b border-ink/5 py-2 ${r.undone ? "opacity-40 line-through" : ""}`}>
                  <span className={`w-12 text-right font-bold ${r.delta > 0 ? "text-[#00843f]" : "text-brick-red"}`}>{r.delta > 0 ? "+" : ""}{r.delta}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.name} · {r.colour_name}</div>
                    <div className="truncate text-xs text-ink/50">{r.reason} · {new Date(r.at).toLocaleString()}</div>
                  </div>
                  {r.batch && !r.undone && (
                    <button className="text-xs font-bold text-brick-blue" onClick={async () => { await api.post(`/api/inventory/undo/${r.batch}`); load(); }}>undo</button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <Toast message={toast?.msg ?? null} action={toast?.undo ? "Undo" : undefined} onAction={toast?.undo} onClose={() => setToast(null)} />
    </ParentShell>
  );
}
