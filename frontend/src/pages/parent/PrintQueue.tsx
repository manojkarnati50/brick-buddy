import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ParentShell from "@/components/ParentShell";
import { BrickIcon, Card } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Queue {
  groups: { colour: { name: string; hex: string; code: number }; pieces: number; grams: number; lines: { part: string; name: string; quantity: number; grams_each: number; projects: string[] }[] }[];
  projects: { id: number; name: string; status: string }[];
}

/** Everything still to print (Generated + Printing projects), grouped by filament colour. */
export default function PrintQueue() {
  const [q, setQ] = useState<Queue | null>(null);
  const token = useStore((s) => s.parentToken);
  const nav = useNavigate();
  useEffect(() => {
    api.get<Queue>("/api/print-queue").then(setQ);
  }, []);
  const totalG = q?.groups.reduce((a, g) => a + g.grams, 0) ?? 0;
  return (
    <ParentShell title="Print queue">
      <Card tint="butter" className="mb-5">
        <div className="text-lg font-bold">{q?.groups.reduce((a, g) => a + g.pieces, 0) ?? "…"} pieces · ~{totalG.toFixed(0)} g filament · {q?.groups.length ?? 0} colours</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {q?.projects.map((p) => (
            <span key={p.id} className="chip bg-white">
              <button onClick={() => nav(`/parent/projects/${p.id}`)}>{p.name}</button>
              <a className="text-brick-blue" href={`/api/projects/${p.id}/stl.zip?token=${token}`}>STL</a>
            </span>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {q?.groups.map((g) => (
          <Card key={g.colour.code}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-bold"><span className="h-6 w-6 rounded-full ring-2 ring-ink/10" style={{ background: g.colour.hex }} />{g.colour.name}</div>
              <span className="chip bg-cream">{g.pieces} pcs · ~{g.grams} g</span>
            </div>
            {g.lines.map((l) => (
              <div key={l.part} className="flex items-center gap-3 border-t border-ink/5 py-2 text-sm">
                <BrickIcon hex={g.colour.hex} size={18} />
                <div className="flex-1"><div className="font-bold">{l.quantity} × {l.name}</div><div className="text-xs text-ink/50">{l.projects.join(", ")}</div></div>
                <span className="text-xs text-ink/50">{(l.grams_each * l.quantity).toFixed(1)} g</span>
              </div>
            ))}
          </Card>
        ))}
        {q && !q.groups.length && <Card>Nothing waiting to print 🎉</Card>}
      </div>
    </ParentShell>
  );
}
