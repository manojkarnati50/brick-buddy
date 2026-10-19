import { Icon } from "@iconify/react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BrickViewer from "@/components/BrickViewer";
import ParentShell from "@/components/ParentShell";
import { BrickButton, BrickIcon, BrickProgress, Card, Modal, StatusChip, Toast } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { BomLine, InventoryLine, ModelData, ProjectDetail as PD, Status } from "@/lib/types";

interface PrintList { lines: { part: string; name: string; colour: { name: string; hex: string; code: number }; to_print: number; grams: number }[]; by_colour: { colour: { name: string; hex: string }; pieces: number; grams: number }[] }

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const token = useStore((s) => s.parentToken);
  const health = useStore((s) => s.health);
  const catalog = useStore((s) => s.catalog);
  const printable = useStore((s) => s.settings?.printable_colours ?? []);
  const [p, setP] = useState<PD | null>(null);
  const [model, setModel] = useState<ModelData | null>(null);
  const [printList, setPrintList] = useState<PrintList | null>(null);
  const [available, setAvailable] = useState<Map<string, number>>(new Map());
  const [real, setReal] = useState(false);
  const [group, setGroup] = useState<"colour" | "size">("colour");
  const [onlyInv, setOnlyInv] = useState(Boolean(useStore.getState().settings?.only_inventory_colours));
  const [swap, setSwap] = useState<{ from: number; to: number }>({ from: -1, to: -1 });
  const [partial, setPartial] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [copyAsk, setCopyAsk] = useState<{ changes: { line: number; colour: number }[] } | null>(null);
  const [editingName, setEditingName] = useState(false);

  const load = useCallback(async () => {
    const [pd, m, pl, inv] = await Promise.all([
      api.get<PD>(`/api/projects/${id}`),
      api.get<ModelData>(`/api/projects/${id}/model`),
      api.get<PrintList>(`/api/projects/${id}/print-list`),
      api.get<{ items: InventoryLine[] }>("/api/inventory"),
    ]);
    setP(pd);
    setModel(m);
    setPrintList(pl);
    setAvailable(new Map(inv.items.map((i) => [`${i.part}:${i.colour.code}`, i.available])));
    setPartial(Object.fromEntries(pd.bom.map((l) => [`${l.part}:${l.colour.code}`, Math.max(0, l.quantity - (l.printed ?? 0))])));
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (window.location.hash === "#parts") setTimeout(() => document.getElementById("parts")?.scrollIntoView({ behavior: "smooth" }), 400);
  }, [p?.id]);

  const colourOptions = useCallback(
    (part?: string) =>
      (catalog?.colours ?? []).filter((c) => printable.includes(c.code) && (!onlyInv || (part ? (available.get(`${part}:${c.code}`) ?? 0) > 0 : [...available.entries()].some(([k, v]) => k.endsWith(`:${c.code}`) && v > 0)))),
    [catalog, printable, onlyInv, available],
  );

  async function recolour(changes: { line: number; colour: number }[], asCopy = false) {
    if (!changes.length) return;
    try {
      const r = await api.post<PD>(`/api/projects/${id}/recolour`, { changes, created_by: "Parent edit", as_copy: asCopy });
      if (asCopy) nav(`/parent/projects/${r.id}`);
      else await load();
      setToast({ msg: asCopy ? "Saved as a new copy" : `Saved as v${r.version}` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setCopyAsk({ changes });
      else setToast({ msg: (e as Error).message });
    }
  }

  const lineChange = (l: BomLine, to: number) => {
    if (!model) return;
    const changes = [...new Set(model.bricks.filter((b) => b.part === l.part && b.colour === l.colour.code).map((b) => b.line))].map((line) => ({ line, colour: to }));
    void recolour(changes);
  };

  const globalSwap = () => {
    if (!model || swap.from < 0 || swap.to < 0) return;
    void recolour([...new Set(model.bricks.filter((b) => b.colour === swap.from).map((b) => b.line))].map((line) => ({ line, colour: swap.to })));
  };

  async function markPrinted(all: boolean) {
    const body = all ? {} : { lines: Object.entries(partial).filter(([, q]) => q > 0).map(([k, q]) => ({ part: k.split(":")[0], colour: Number(k.split(":")[1]), quantity: q })) };
    const r = await api.post<{ batch: string; added: number; status: Status }>(`/api/projects/${id}/print`, body);
    setToast({ msg: `Added ${r.added} pieces to inventory · now ${r.status}`, undo: async () => { await api.post(`/api/projects/${id}/unprint/${r.batch}`); await load(); } });
    await load();
  }

  async function patch(body: Record<string, unknown>) {
    await api.patch(`/api/projects/${id}`, body);
    await load();
  }

  async function uploadPhoto(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    await api.form(`/api/projects/${id}/photo`, fd);
    await load();
  }

  const groups = useMemo(() => {
    const g = new Map<string, BomLine[]>();
    for (const l of p?.bom ?? []) {
      const k = group === "colour" ? l.colour.name : l.size_group;
      g.set(k, [...(g.get(k) ?? []), l]);
    }
    return [...g.entries()];
  }, [p, group]);

  if (!p || !model) return <ParentShell title="Loading…"><div /></ParentShell>;
  const usedColours = [...new Set(model.bricks.map((b) => b.colour))];

  return (
    <ParentShell
      title={p.name}
      actions={
        <>
          <StatusChip status={p.status} />
          <select className="input" value={p.status} onChange={(e) => patch({ status: e.target.value })}>
            {["Generated", "Printing", "Printed", "Built", "Archived"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-soft" onClick={() => patch({ favourite: !p.favourite })}>{p.favourite ? "💖" : "🤍"}</button>
          <a className="btn-soft" href={`/api/projects/${id}/stl.zip?token=${token}`}><Icon icon="mdi:download" className="inline" /> STL + print list</a>
          <label className="btn-soft cursor-pointer"><Icon icon="mdi:camera" className="inline" /> Photo
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </label>
          <button className="btn-soft" onClick={() => setEditingName(true)}>Rename</button>
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="p-0">
            <div className="relative h-[460px] overflow-hidden rounded-squish bg-gradient-to-b from-sky to-cream">
              <BrickViewer key={real ? "real" : "box"} models={[{ bricks: model.bricks }]} realParts={real ? model.mpd : null} />
              <div className="absolute right-3 top-3 flex gap-2">
                {health?.ldraw_library && (
                  <button className="btn-soft bg-white/80" onClick={() => setReal((r) => !r)}>{real ? "Chunky view" : "Real LDraw parts"}</button>
                )}
                <button className="btn-soft bg-white/80" onClick={() => nav(`/model/${id}`)}>Kid view</button>
              </div>
            </div>
          </Card>
          <Card tint="peach">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1">
                <div className="text-sm font-bold text-ink/50">Her words</div>
                <div className="text-xl font-bold">“{p.request_text || "—"}”</div>
                <div className="text-xs text-ink/50">{new Date(p.created_at).toLocaleString()} · {p.model_used} · ${p.cost_usd.toFixed(4)} · source: {p.source}</div>
              </div>
              {p.request_audio && <audio controls src={p.request_audio} className="h-10" />}
              {p.photo && <img src={p.photo} alt="real build" className="h-24 w-24 rounded-2xl object-cover" />}
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 font-bold">Versions</h3>
            <div className="no-scrollbar flex gap-3 overflow-x-auto">
              {p.versions.map((v) => (
                <div key={v.version} className={`w-36 shrink-0 rounded-2xl p-2 ${v.version === p.version ? "bg-mint" : "bg-cream"}`}>
                  <img src={v.thumbnail ?? ""} alt="" className="aspect-square w-full rounded-xl bg-white" />
                  <div className="mt-1 text-sm font-bold">v{v.version} · {v.pieces} pcs</div>
                  <div className="text-xs text-ink/50">{v.created_by}</div>
                  {v.version !== p.version && (
                    <button className="mt-1 text-xs font-bold text-brick-blue" onClick={async () => {
                      try { await api.post(`/api/projects/${id}/restore/${v.version}`); await load(); } catch (e) { setToast({ msg: (e as Error).message }); }
                    }}>Restore</button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <BrickProgress value={p.have} max={p.have + p.need} label={<><span>Have {p.have} / need to print {p.need}</span><span>{p.have + p.need} pcs</span></>} />
            <div className="mt-4 flex flex-wrap gap-2">
              <BrickButton colour="green" size="sm" disabled={p.status === "Printed" || p.status === "Built"} onClick={() => markPrinted(true)}>🖨️ Mark all printed</BrickButton>
              <BrickButton colour="orange" size="sm" disabled={p.status === "Printed" || p.status === "Built"} onClick={() => markPrinted(false)}>Mark selected printed</BrickButton>
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 font-bold">Recolour (precise)</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Replace</span>
              <select className="input" value={swap.from} onChange={(e) => setSwap((s) => ({ ...s, from: Number(e.target.value) }))}>
                <option value={-1}>colour…</option>
                {usedColours.map((c) => <option key={c} value={c}>{catalog?.colours.find((x) => x.code === c)?.name ?? c}</option>)}
              </select>
              <span className="text-sm font-semibold">with</span>
              <select className="input" value={swap.to} onChange={(e) => setSwap((s) => ({ ...s, to: Number(e.target.value) }))}>
                <option value={-1}>colour…</option>
                {colourOptions().map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <button className="btn-soft" onClick={globalSwap}>Swap</button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={onlyInv} onChange={(e) => setOnlyInv(e.target.checked)} /> Only show colours I have in inventory
            </label>
          </Card>

          <Card className="overflow-x-auto">
            <div id="parts" className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Parts list (BOM)</h3>
              <div className="flex gap-1">
                {(["colour", "size"] as const).map((g) => (
                  <button key={g} className={`chip ${group === g ? "bg-ink text-white" : "bg-ink/5"}`} onClick={() => setGroup(g)}>by {g}</button>
                ))}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink/50">
                <tr><th className="py-1">Part</th><th>Size</th><th>Colour</th><th className="text-right">Qty</th><th className="text-right">Have</th><th className="text-right">Need</th><th className="text-right">Print now</th></tr>
              </thead>
              <tbody>
                {groups.map(([g, lines]) => (
                  <Fragment key={`g-${g}`}>
                    <tr><td colSpan={7} className="pt-3 text-xs font-bold uppercase tracking-wide text-ink/40">{g}</td></tr>
                    {lines.map((l) => {
                      const k = `${l.part}:${l.colour.code}`;
                      const remaining = l.quantity - (l.printed ?? 0);
                      return (
                        <tr key={k} className="border-t border-ink/5">
                          <td className="py-2"><div className="flex items-center gap-2"><BrickIcon hex={l.colour.hex} w={l.size.startsWith("1×1") ? 1 : 2} size={18} /><div><div className="font-bold">{l.name}</div><div className="text-xs text-ink/40">{l.dat}</div></div></div></td>
                          <td>{l.size} {l.height}</td>
                          <td>
                            <select className="rounded-lg bg-ink/5 px-2 py-1 font-semibold" value={l.colour.code} onChange={(e) => lineChange(l, Number(e.target.value))}>
                              {[l.colour, ...colourOptions(l.part).filter((c) => c.code !== l.colour.code)].map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="text-right font-bold">{l.quantity}</td>
                          <td className="text-right">{l.have}</td>
                          <td className={`text-right font-bold ${l.need ? "text-brick-red" : "text-[#00843f]"}`}>{l.need || "✓"}</td>
                          <td className="text-right">
                            {remaining > 0 ? (
                              <input type="number" min={0} max={remaining} value={partial[k] ?? 0} onChange={(e) => setPartial((s) => ({ ...s, [k]: Math.max(0, Math.min(remaining, Number(e.target.value))) }))}
                                className="w-16 rounded-lg bg-ink/5 px-2 py-1 text-right" />
                            ) : <span className="text-xs text-ink/40">printed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          {printList && (
            <Card tint="butter">
              <h3 className="mb-2 font-bold">Filament for what's left to print</h3>
              <div className="flex flex-wrap gap-2">
                {printList.by_colour.filter((c) => c.pieces > 0).map((c) => (
                  <span key={c.colour.name} className="chip bg-white"><span className="h-3 w-3 rounded-full" style={{ background: c.colour.hex }} />{c.colour.name}: {c.pieces} pcs · ~{c.grams} g</span>
                ))}
                {!printList.by_colour.some((c) => c.pieces > 0) && <span className="text-sm text-ink/60">Everything is printed 🎉</span>}
              </div>
            </Card>
          )}
          <div className="flex gap-2">
            <button className="btn-soft text-brick-red" onClick={async () => { if (confirm(`Delete ${p.name}?`)) { await api.del(`/api/projects/${id}`); nav("/parent/projects"); } }}>Delete project</button>
          </div>
        </div>
      </div>

      <Modal open={Boolean(copyAsk)} onClose={() => setCopyAsk(null)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-bold">Already printed</h3>
          <p className="text-ink/60">Changing colours of a printed or built model would make the inventory numbers wrong. Save the new colours as a new copy instead?</p>
          <div className="flex justify-end gap-2">
            <button className="btn-soft" onClick={() => setCopyAsk(null)}>Cancel</button>
            <BrickButton colour="green" size="sm" onClick={() => { const c = copyAsk!.changes; setCopyAsk(null); void recolour(c, true); }}>Save as copy</BrickButton>
          </div>
        </div>
      </Modal>
      <Modal open={editingName} onClose={() => setEditingName(false)}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("name") as string; setEditingName(false); void patch({ name: v }); }}>
          <h3 className="text-xl font-bold">Rename</h3>
          <input name="name" defaultValue={p.name} className="input" autoFocus />
          <button type="submit" className="rounded-2xl bg-brick-green px-4 py-3 font-bold text-white shadow-brick">Save</button>
        </form>
      </Modal>
      <Toast message={toast?.msg ?? null} action={toast?.undo ? "Undo" : undefined} onAction={toast?.undo} onClose={() => setToast(null)} />
    </ParentShell>
  );
}
