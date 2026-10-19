import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "@/components/Avatar";
import KidShell from "@/components/KidShell";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import type { ProjectCard } from "@/lib/types";
import { speak } from "@/lib/voice";

const BADGE: Record<string, string> = { Generated: "✨", Printing: "🖨️", Printed: "📦", Built: "🏆", Archived: "💤" };

export default function MyModels() {
  const [items, setItems] = useState<ProjectCard[] | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    api.get<ProjectCard[]>("/api/projects").then(setItems);
  }, []);
  return (
    <KidShell>
      {items && items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Avatar pose="hug" size={240} />
          <button className="text-6xl" onClick={() => nav("/make")} aria-label="Make one">🎤</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {items?.map((p, i) => (
            <motion.button key={p.id} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.92 }} aria-label={p.name}
              onClick={() => { sfx.snap(); void speak(p.name); nav(`/model/${p.id}`); }}
              className="relative flex flex-col items-center rounded-[2rem] bg-white p-3 shadow-squish">
              <img src={p.photo ?? p.thumbnail ?? ""} alt="" className="aspect-square w-full rounded-3xl bg-cream object-cover" />
              <span className="absolute right-3 top-3 text-3xl">{BADGE[p.status]}</span>
              {p.favourite && <span className="absolute left-3 top-3 text-3xl">💖</span>}
              <div className="mt-2 flex gap-1">
                {p.colours.slice(0, 5).map((c) => (
                  <span key={c.code} className="h-4 w-4 rounded-full" style={{ background: c.hex }} />
                ))}
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </KidShell>
  );
}
