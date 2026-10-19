import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "@/components/Avatar";
import BrickViewer, { type Placed } from "@/components/BrickViewer";
import KidShell from "@/components/KidShell";
import { api } from "@/lib/api";
import type { Brick } from "@/lib/types";
import { speak } from "@/lib/voice";

interface TownItem { id: number; name: string; status: string; x: number; z: number; bricks: Brick[] }

/** Her town: every Printed/Built model on one big green baseplate. */
export default function Town() {
  const [items, setItems] = useState<TownItem[] | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    api.get<TownItem[]>("/api/town").then((t) => {
      setItems(t);
      void speak(t.length ? `Welcome to your town! You have ${t.length} things here!` : "Your town is waiting for your first model!");
    });
  }, []);

  if (items && !items.length)
    return (
      <KidShell bg="bg-mint">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Avatar pose="hug" size={240} />
          <button className="text-6xl" onClick={() => nav("/make")} aria-label="Make one">🎤</button>
        </div>
      </KidShell>
    );

  // normalise each model so its footprint starts at its town slot
  const models: Placed[] = (items ?? []).map((it) => {
    const minx = Math.min(...it.bricks.map((b) => b.bbox[0]));
    const minz = Math.min(...it.bricks.map((b) => b.bbox[2]));
    return { bricks: it.bricks, offset: [it.x * 20 - minx - 20, 0, it.z * 20 - minz - 20] };
  });
  const size = Math.max(24, ...(items ?? []).map((it) => Math.max(it.x, it.z) + 12));

  return (
    <KidShell bg="bg-mint">
      <div className="relative flex-1 overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-sky to-mint shadow-squish" style={{ minHeight: "70vh" }}>
        {items && <BrickViewer models={models} baseplate={size} autoRotate />}
        <div className="absolute bottom-4 left-4">
          <Avatar pose="bike" size={120} bg={false} />
        </div>
      </div>
    </KidShell>
  );
}
