import { Icon } from "@iconify/react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ParentShell from "@/components/ParentShell";
import { BrickButton, Modal, StatusChip, Toast } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { ProjectCard, Status } from "@/lib/types";

const STATUSES: (Status | "")[] = ["", "Generated", "Printing", "Printed", "Built", "Archived"];

export default function Projects() {
  const nav = useNavigate();
  const catalog = useStore((s) => s.catalog);
  const [items, setItems] = useState<ProjectCard[]>([]);
  const [status, setStatus] = useState<Status | "">("");
  const [colour, setColour] = useState<string>("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "print" | "delete"; p: ProjectCard } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    api.get<ProjectCard[]>(`/api/projects${qs({ status, colour, q, date_from: from, date_to: to })}`).then(setItems);
  }, [status, colour, q, from, to]);
  useEffect(load, [load]);

  async function doConfirm() {
    if (!confirm) return;
    const { kind, p } = confirm;
    setConfirm(null);
    if (kind === "delete") {
      await api.del(`/api/projects/${p.id}`);
      setToast({ msg: `Deleted ${p.name}` });
    } else {
      const r = await api.post<{ batch: string; added: number }>(`/api/projects/${p.id}/print`, {});
      setToast({ msg: `Added ${r.added} pieces to inventory`, undo: async () => { await api.post(`/api/projects/${p.id}/unprint/${r.batch}`); load(); } });
    }
    load();
  }

  async function regenerate(p: ProjectCard) {
    setBusy(p.id);
    const fd = new FormData();
    fd.append("idea", p.request_text || p.name);
    fd.append("mode", p.from_inventory ? "inventory" : "quick");
    fd.append("use_inventory", String(p.from_inventory));
    try {
      const r = await api.form<{ project: ProjectCard }>("/api/generate", fd);
      setToast({ msg: `New version: ${r.project.name}` });
      load();
    } catch (e) {
      setToast({ msg: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ParentShell title="Projects" actions={<BrickButton colour="red" size="sm" onClick={() => nav("/make")}>+ New</BrickButton>}>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-squish bg-white p-4 shadow-squish">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)} className={`chip ${status === s ? "bg-ink text-white" : "bg-ink/5"}`}>{s || "All"}</button>
          ))}
        </div>
        <select className="input" value={colour} onChange={(e) => setColour(e.target.value)}>
          <option value="">Any colour</option>
          {catalog?.colours.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="relative flex-1">
          <Icon icon="mdi:magnify" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input className="input w-full pl-9" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <div key={p.id} className="flex flex-col overflow-hidden rounded-squish bg-white shadow-squish">
            <button className="relative bg-cream" onClick={() => nav(`/parent/projects/${p.id}`)}>
              <img src={p.thumbnail ?? ""} alt="" className="aspect-[4/3] w-full object-contain" />
              {p.photo && <img src={p.photo} alt="real build" className="absolute bottom-2 right-2 h-20 w-20 rounded-2xl border-4 border-white object-cover shadow" />}
              {p.favourite && <span className="absolute left-3 top-3 text-2xl">💖</span>}
              {p.from_inventory && <span className="chip absolute right-3 top-3 bg-butter">🧱 made from my bricks</span>}
            </button>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold">{p.name}</div>
                  <div className="text-xs text-ink/50">{new Date(p.created_at).toLocaleString()} · v{p.version} · {p.model_used}</div>
                </div>
                <StatusChip status={p.status} />
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink/60">
                {p.pieces} pieces
                <span className="flex gap-1">{p.colours.map((c) => <span key={c.code} title={`${c.name} ×${c.count}`} className="h-3 w-3 rounded-full ring-1 ring-ink/10" style={{ background: c.hex }} />)}</span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button className="btn-soft text-sm" onClick={() => nav(`/parent/projects/${p.id}`)}>View 3D</button>
                <button className="btn-soft text-sm" onClick={() => nav(`/parent/projects/${p.id}#parts`)}>Parts list</button>
                {(p.status === "Generated" || p.status === "Printing") && (
                  <button className="btn-soft text-sm" onClick={() => setConfirm({ kind: "print", p })}>Mark as Printed</button>
                )}
                <button className="btn-soft text-sm" disabled={busy === p.id} onClick={() => regenerate(p)}>{busy === p.id ? "…" : "Re-generate"}</button>
                <button className="btn-soft text-sm text-brick-red" onClick={() => setConfirm({ kind: "delete", p })}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        {confirm && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-bold">{confirm.kind === "delete" ? `Delete “${confirm.p.name}”?` : `Mark “${confirm.p.name}” as printed?`}</h3>
            <p className="text-ink/60">
              {confirm.kind === "delete"
                ? "This removes the model, all its versions and thumbnails. Inventory is not changed."
                : `All ${confirm.p.pieces} BOM pieces (minus any already printed) are added to your inventory. You can undo right after. For partial printing, open the project.`}
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-soft" onClick={() => setConfirm(null)}>Cancel</button>
              <BrickButton colour={confirm.kind === "delete" ? "red" : "green"} size="sm" onClick={doConfirm}>{confirm.kind === "delete" ? "Delete" : "Mark printed"}</BrickButton>
            </div>
          </div>
        )}
      </Modal>
      <Toast message={toast?.msg ?? null} action={toast?.undo ? "Undo" : undefined} onAction={toast?.undo} onClose={() => setToast(null)} />
    </ParentShell>
  );
}
