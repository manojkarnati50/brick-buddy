import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "@/components/Avatar";
import { HoldButton, useParentGate } from "@/components/ParentGate";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { speak } from "@/lib/voice";

/** Gentle "bye-bye" screen when the daily time limit is reached. No dead end: a grown-up can add time. */
export default function Bedtime() {
  const name = useStore((s) => s.settings?.child_name ?? "Aaradya");
  const nav = useNavigate();
  const { require, gate } = useParentGate();
  useEffect(() => {
    void speak(`Bye-bye ${name}! The bricks are sleepy now. See you tomorrow!`);
  }, [name]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-[#E8E4F7] p-8 font-kid">
      <div className="text-6xl">🌙 ⭐ ✨</div>
      <Avatar pose="hug" size={280} config={undefined} />
      <div className="text-5xl font-bold text-ink/80">Bye-bye! 👋</div>
      <div className="fixed bottom-6 right-6">
        <HoldButton label="Grown-ups: +10 min" onDone={() => require(async () => { await api.post("/api/usage/extend"); nav("/"); })} />
      </div>
      {gate}
    </div>
  );
}
