import { motion } from "motion/react";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import KidShell from "@/components/KidShell";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { speak } from "@/lib/voice";

interface Sticker { id: number; kind: string; emoji: string; label: string; at: string }

const TINT: Record<string, string> = { created: "#FFF1B8", printed: "#FFD9C7", built: "#DDF2E6", painted: "#FFE0EE", story: "#F1E4FF", game: "#D6ECFF", avatar: "#D9F6F8" };

export default function Stickers() {
  const [items, setItems] = useState<Sticker[]>([]);
  useEffect(() => {
    api.get<Sticker[]>("/api/stickers").then((s) => {
      setItems(s);
      void speak(`You have ${s.length} stickers! Wow!`);
    });
  }, []);
  return (
    <KidShell bg="bg-[#FFE0EE]/50">
      <div className="mb-6 flex items-center gap-4">
        <Avatar pose="jump" size={120} />
        <div className="text-6xl font-bold">⭐ {items.length}</div>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center"><Avatar pose="hug" size={220} /></div>
      ) : (
        <div className="grid grid-cols-3 gap-5 sm:grid-cols-5 lg:grid-cols-7">
          {items.map((s, i) => (
            <motion.button key={s.id} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: (i % 5) * 4 - 8 }}
              transition={{ delay: Math.min(i, 30) * 0.03, type: "spring" }} whileTap={{ scale: 1.2 }}
              onClick={() => { sfx.pop(); void speak(s.label); }} aria-label={s.label}
              className="flex aspect-square items-center justify-center rounded-full border-4 border-white text-5xl shadow-squish"
              style={{ background: TINT[s.kind] ?? "#fff" }}>
              {s.emoji}
            </motion.button>
          ))}
        </div>
      )}
    </KidShell>
  );
}
