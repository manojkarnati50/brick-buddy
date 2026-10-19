import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "@/components/Avatar";
import BrickViewer from "@/components/BrickViewer";
import KidShell from "@/components/KidShell";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { useStore } from "@/lib/store";
import type { ModelData, Pose, ProjectCard } from "@/lib/types";
import { speak } from "@/lib/voice";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const TILES: { to: string; say: string; emoji?: string; pose?: Pose; colour: string; tint: string }[] = [
  { to: "/make", say: "Let's make something!", emoji: "🎤", colour: "#E3000B", tint: "#FFE3E3" },
  { to: "/make?bricks=1", say: "Build with my bricks!", emoji: "🧱", colour: "#FFD500", tint: "#FFF1B8" },
  { to: "/my", say: "My models", emoji: "🏠", colour: "#0055BF", tint: "#D6ECFF" },
  { to: "/town", say: "Let's go to my town!", pose: "bike", colour: "#00A650", tint: "#DDF2E6" },
  { to: "/games", say: "Let's play a game!", emoji: "🎲", colour: "#FF7F1E", tint: "#FFD9C7" },
  { to: "/story", say: "Story time!", emoji: "📖", colour: "#C77DFF", tint: "#F1E4FF" },
  { to: "/stickers", say: "My stickers", emoji: "⭐", colour: "#FF4F9A", tint: "#FFE0EE" },
  { to: "/me", say: "Dress up!", emoji: "👗", colour: "#00B5C8", tint: "#D9F6F8" },
];

export default function KidHome() {
  const nav = useNavigate();
  const name = useStore((s) => s.settings?.child_name ?? "Aaradya");
  const [latest, setLatest] = useState<ModelData | null>(null);

  useEffect(() => {
    api.get<ProjectCard[]>("/api/projects").then((ps) => {
      const p = ps.find((p) => p.favourite) ?? ps[0];
      if (p) api.get<ModelData>(`/api/projects/${p.id}/model`).then(setLatest).catch(() => undefined);
    });
  }, []);

  return (
    <KidShell home={false}>
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative grid min-h-[300px] grid-cols-1 items-center gap-4 overflow-hidden rounded-[2.5rem] bg-mint p-6 shadow-squish md:grid-cols-[auto_1fr_minmax(240px,320px)]">
        <button aria-label="Say hi" onClick={() => { sfx.pop(); void speak(`Hi ${name}! What shall we build today?`); }}>
          <Avatar pose="wave" size={210} bg={false} />
        </button>
        <div>
          <div className="text-xl font-semibold text-ink/60">{greeting()},</div>
          <div className="text-5xl font-bold sm:text-6xl">Hi {name}! 👋</div>
          <div className="mt-2 flex gap-2">
            {["#E3000B", "#FFD500", "#0055BF", "#00A650", "#FF7F1E"].map((c) => (
              <span key={c} className="h-4 w-8 rounded" style={{ background: c }} />
            ))}
          </div>
        </div>
        <button className="h-60 w-full overflow-hidden rounded-3xl bg-white/60" onClick={() => latest && nav(`/model/${latest.id}`)} aria-label="My latest model">
          {latest && <BrickViewer models={[{ bricks: latest.bricks }]} autoRotate />}
        </button>
      </motion.div>

      <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {TILES.map((t, i) => (
          <motion.button key={t.to} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 * i, type: "spring", stiffness: 300, damping: 20 }}
            whileTap={{ scale: 0.92, y: 4 }}
            onClick={() => { sfx.snap(); void speak(t.say); nav(t.to); }}
            aria-label={t.say}
            className="relative mt-3 flex aspect-square min-h-[140px] items-center justify-center rounded-[2rem] shadow-squish"
            style={{ background: t.tint }}>
            <span className="absolute -top-3 left-0 right-0 flex justify-evenly px-6">
              {[0, 1, 2].map((s) => (
                <span key={s} className="h-4 w-9 rounded-t-lg" style={{ background: t.colour }} />
              ))}
            </span>
            <span className="absolute inset-x-0 top-0 h-3 rounded-t-[2rem]" style={{ background: t.colour }} />
            {t.pose ? <Avatar pose={t.pose} size={120} bg={false} /> : <span className="text-7xl drop-shadow-sm">{t.emoji}</span>}
          </motion.button>
        ))}
      </div>
    </KidShell>
  );
}
