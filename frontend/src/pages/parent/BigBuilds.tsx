import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ParentShell from "@/components/ParentShell";
import { BrickButton, Card } from "@/components/ui";
import { api } from "@/lib/api";

interface Big { id: number; created_at: string; idea: string; status: string; project_id: number | null; note: string }

/** Parent-approved queue for bigger Opus builds. */
export default function BigBuilds() {
  const [items, setItems] = useState<Big[]>([]);
  const [idea, setIdea] = useState("");
  const [running, setRunning] = useState<number | null>(null);
  const nav = useNavigate();
  const load = useCallback(() => void api.get<Big[]>("/api/bigbuild").then(setItems), []);
  useEffect(load, [load]);

  async function approve(b: Big) {
    setRunning(b.id);
    try {
      await api.post(`/api/bigbuild/${b.id}/approve`);
    } finally {
      setRunning(null);
      load();
    }
  }

  return (
    <ParentShell title="Big Build queue">
      <Card tint="sky" className="mb-5">
        <p className="mb-3 text-sm font-semibold text-ink/70">
          Big builds use Claude Opus (40–160 parts) and only run after you approve them. Aaradya can request one with the 🌟 button.
        </p>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Add an idea, e.g. a castle with a pink tower" value={idea} onChange={(e) => setIdea(e.target.value)} />
          <BrickButton colour="blue" size="sm" onClick={async () => { if (idea.trim()) { await api.post("/api/bigbuild", { idea }); setIdea(""); load(); } }}>Add</BrickButton>
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        {items.map((b) => (
          <Card key={b.id} className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold">“{b.idea}”</div>
              <div className="text-xs text-ink/50">{new Date(b.created_at).toLocaleString()} · {b.status}{b.note ? ` · ${b.note}` : ""}</div>
            </div>
            {(b.status === "waiting" || b.status === "failed") && (
              <>
                <BrickButton colour="green" size="sm" disabled={running !== null} onClick={() => approve(b)}>{running === b.id ? "Building… (up to a few minutes)" : "Approve & build"}</BrickButton>
                <button className="btn-soft" onClick={async () => { await api.post(`/api/bigbuild/${b.id}/reject`); load(); }}>Reject</button>
              </>
            )}
            {b.project_id && <button className="btn-soft" onClick={() => nav(`/parent/projects/${b.project_id}`)}>Open project</button>}
          </Card>
        ))}
        {!items.length && <Card>No big build requests yet.</Card>}
      </div>
    </ParentShell>
  );
}
