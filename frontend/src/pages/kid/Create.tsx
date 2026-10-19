import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Avatar from "@/components/Avatar";
import KidShell from "@/components/KidShell";
import { BrickButton, BrickIcon, Confetti } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { useStore } from "@/lib/store";
import type { ProjectCard } from "@/lib/types";
import { canListen, listen, speak } from "@/lib/voice";

const IDEAS = [
  ["🏠", "house"], ["🚗", "car"], ["🐰", "bunny"], ["🚀", "rocket"], ["🌳", "tree"], ["🌸", "flower"],
  ["🏰", "castle"], ["⛵", "boat"], ["🤖", "robot"], ["🐱", "kitty"], ["🌈", "rainbow"], ["🎂", "birthday cake"],
] as const;

const POTS = [
  [4, "red"], [13, "pink"], [14, "yellow"], [25, "orange"], [1, "blue"], [9, "light blue"], [2, "green"], [22, "purple"], [15, "white"],
] as const;

interface Starter { key: string; name: string; emoji: string; kind: string; thumb?: string | null }

type Phase = { kind: "idle" } | { kind: "listening"; partial: string } | { kind: "thinking" } | { kind: "done"; project: ProjectCard } | { kind: "oops"; message: string };

export default function Create() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const name = useStore((s) => s.settings?.child_name ?? "Aaradya");
  const [useBricks, setUseBricks] = useState(params.get("bricks") === "1");
  const [words, setWords] = useState<string[]>([]);
  const [spoken, setSpoken] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [starters, setStarters] = useState<Starter[]>([]);
  const listener = useRef<ReturnType<typeof listen> | null>(null);

  useEffect(() => {
    api.get<Starter[]>("/api/starters").then(setStarters).catch(() => undefined);
    void speak(useBricks ? "Let's build with your bricks! Tell me an idea, or tap surprise!" : "What shall we build? Tell me, or tap a picture!");
  }, [useBricks]);

  const idea = [spoken, ...words].filter(Boolean).join(" ").trim();

  async function toggleMic() {
    if (phase.kind === "listening") {
      listener.current?.stop();
      return;
    }
    sfx.pop();
    setPhase({ kind: "listening", partial: "" });
    const l = listen((t) => setPhase({ kind: "listening", partial: t }));
    listener.current = l;
    setTimeout(() => l.stop(), 8000);
    const r = await l.result;
    setAudio(r.audio);
    if (r.text) setSpoken(r.text);
    setPhase({ kind: "idle" });
    if (r.text) void speak(`${r.text}! Great idea!`);
  }

  async function build(surprise = false) {
    if (!idea && !surprise) {
      void speak("Tell me your idea first, or tap a picture!");
      sfx.boop();
      return;
    }
    sfx.snap();
    setPhase({ kind: "thinking" });
    void speak(surprise ? "Ooh, a surprise! Let me look at your bricks…" : "Hmm, let me think… I'm building it!");
    const fd = new FormData();
    fd.append("idea", surprise ? "" : idea);
    fd.append("mode", useBricks || surprise ? "inventory" : "quick");
    fd.append("use_inventory", String(useBricks || surprise));
    fd.append("surprise", String(surprise));
    if (audio) fd.append("audio", audio, "idea.webm");
    try {
      const r = await api.form<{ project: ProjectCard }>("/api/generate", fd);
      sfx.cheer();
      setPhase({ kind: "done", project: r.project });
      void speak(`Ta-da! ${r.project.name}! ${r.project.narration}`);
    } catch (e) {
      sfx.boop();
      const msg = e instanceof ApiError && e.status === 429 ? "Let's take a little break, then build again!" : "Oops! Let's try that again.";
      setPhase({ kind: "oops", message: msg });
      void speak(msg);
    }
  }

  async function useStarter(s: Starter) {
    sfx.snap();
    setPhase({ kind: "thinking" });
    try {
      const r = await api.post<{ project: ProjectCard }>(`/api/starters/${s.key}`);
      sfx.cheer();
      setPhase({ kind: "done", project: r.project });
      void speak(`Here it is! ${r.project.name}!`);
    } catch {
      setPhase({ kind: "oops", message: "Oops! Let's try that again." });
    }
  }

  async function bigBuild() {
    if (!idea) return void speak("Tell me your big idea first!");
    await api.post("/api/bigbuild", { idea });
    sfx.cheer();
    void speak("I asked a grown-up for your big build! Yay!");
    setWords([]);
    setSpoken("");
  }

  return (
    <KidShell bg={useBricks ? "bg-butter/60" : "bg-cream"}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {/* mic + idea bubble */}
          <div className="flex flex-wrap items-center gap-6 rounded-[2.5rem] bg-white p-6 shadow-squish">
            {canListen() && (
              <motion.button onClick={toggleMic} aria-label="Talk" whileTap={{ scale: 0.9 }}
                animate={phase.kind === "listening" ? { scale: [1, 1.08, 1] } : {}} transition={{ repeat: Infinity, duration: 1 }}
                className="flex h-32 w-32 items-center justify-center rounded-full text-white shadow-brick" style={{ background: phase.kind === "listening" ? "#00A650" : "#E3000B" }}>
                <Icon icon={phase.kind === "listening" ? "mdi:stop" : "mdi:microphone"} className="text-7xl" />
              </motion.button>
            )}
            <div className="min-h-[64px] flex-1 text-3xl font-bold">
              {phase.kind === "listening" ? (phase.partial || "I'm listening… 👂") : idea || <span className="text-ink/30">…</span>}
            </div>
            {(idea || audio) && (
              <button aria-label="Clear" className="flex h-[88px] w-[88px] items-center justify-center rounded-3xl bg-ink/5 text-4xl" onClick={() => { setWords([]); setSpoken(""); setAudio(null); sfx.click(); }}>
                🧽
              </button>
            )}
          </div>

          {/* tap pictures */}
          <div className="grid grid-cols-4 gap-4 sm:grid-cols-6">
            {IDEAS.map(([emoji, word]) => (
              <motion.button key={word} whileTap={{ scale: 0.85 }} aria-label={word}
                onClick={() => { sfx.click(); setWords((w) => (w.includes(word) ? w : [...w, word])); void speak(word); }}
                className={`flex aspect-square min-h-[88px] items-center justify-center rounded-3xl text-5xl shadow-squish ${words.includes(word) ? "bg-sky ring-4 ring-brick-blue" : "bg-white"}`}>
                {emoji}
              </motion.button>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {POTS.map(([code, word]) => {
              const hex = useStore.getState().catalog?.colours.find((c) => c.code === code)?.hex ?? "#999";
              return (
                <motion.button key={code} whileTap={{ scale: 0.85 }} aria-label={word}
                  onClick={() => { sfx.splash(); setWords((w) => [...w.filter((x) => !POTS.some((p) => p[1] === x)), word]); void speak(word); }}
                  className={`h-[88px] w-[88px] rounded-full shadow-brick ${words.includes(word) ? "ring-4 ring-ink/40" : ""}`} style={{ background: hex }} />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <BrickButton colour="green" size="xl" sound="none" onClick={() => build(false)}>
              <Icon icon="mdi:hammer-wrench" className="text-5xl" /> Build!
            </BrickButton>
            <motion.button whileTap={{ scale: 0.9 }} aria-label="Use my bricks"
              onClick={() => { setUseBricks((v) => !v); sfx.snap(); }}
              className={`mt-3 flex h-[120px] items-center gap-3 rounded-3xl px-6 text-2xl font-bold shadow-squish ${useBricks ? "bg-brick-yellow" : "bg-white"}`}>
              <BrickIcon hex="#E3000B" size={30} /> <BrickIcon hex="#0055BF" size={30} />
              <Icon icon={useBricks ? "mdi:toggle-switch" : "mdi:toggle-switch-off-outline"} className="text-5xl" />
            </motion.button>
            {useBricks && (
              <BrickButton colour="orange" size="xl" sound="none" onClick={() => build(true)}>
                🎁 Surprise!
              </BrickButton>
            )}
            <BrickButton colour="blue" size="lg" onClick={bigBuild} title="Ask a grown-up for a big build">
              🌟 Big!
            </BrickButton>
          </div>
        </div>

        {/* ready-made models */}
        <div className="rounded-[2.5rem] bg-white/70 p-5 shadow-squish">
          <div className="mb-3 flex items-center gap-2 text-2xl font-bold">⚡ <span>Ready now</span></div>
          <div className="no-scrollbar grid max-h-[70vh] grid-cols-2 gap-3 overflow-auto">
            {starters.map((s) => (
              <motion.button key={s.key} whileTap={{ scale: 0.9 }} onClick={() => useStarter(s)} aria-label={s.name}
                className="flex min-h-[110px] flex-col items-center justify-center gap-1 rounded-3xl bg-cream p-2 shadow-squish">
                {s.thumb ? <img src={s.thumb} alt="" className="h-20 w-20 object-contain" /> : <span className="text-5xl">{s.emoji}</span>}
                <span className="text-xs font-semibold text-ink/60">{s.name}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {(phase.kind === "thinking" || phase.kind === "done" || phase.kind === "oops") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-cream/95 p-6">
            {phase.kind === "thinking" && (
              <>
                <Avatar pose="think" size={240} />
                <StackingBricks />
                <div className="text-3xl font-bold text-ink/70">Building… 🧱</div>
              </>
            )}
            {phase.kind === "done" && (
              <>
                <Confetti show />
                <Avatar pose="jump" size={220} />
                {phase.project.thumbnail && (
                  <motion.img src={phase.project.thumbnail} initial={{ scale: 0.4, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 14 }} className="h-56 w-56 rounded-3xl bg-white shadow-squish" />
                )}
                <div className="text-4xl font-bold">{phase.project.name}</div>
                <BrickButton colour="green" size="xl" onClick={() => nav(`/model/${phase.project.id}`)}>
                  <Icon icon="mdi:arrow-right-bold" className="text-5xl" />
                </BrickButton>
              </>
            )}
            {phase.kind === "oops" && (
              <>
                <Avatar pose="pout" size={220} />
                <div className="max-w-md text-center text-3xl font-bold text-ink/70">{phase.message}</div>
                <BrickButton colour="yellow" size="xl" onClick={() => setPhase({ kind: "idle" })}>
                  <Icon icon="mdi:refresh" className="text-5xl" />
                </BrickButton>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <span className="sr-only">{name}</span>
    </KidShell>
  );
}

function StackingBricks() {
  const colours = ["#E3000B", "#FFD500", "#0055BF", "#00A650", "#FF7F1E"];
  return (
    <div className="flex h-36 flex-col-reverse items-center">
      {colours.map((c, i) => (
        <motion.div key={c} initial={{ y: -200, opacity: 0 }} animate={{ y: 0, opacity: [0, 1, 1, 0] }}
          transition={{ delay: i * 0.45, duration: 2.6, repeat: Infinity, repeatDelay: 0.2, times: [0, 0.15, 0.85, 1] }}>
          <BrickIcon hex={c} size={26} />
        </motion.div>
      ))}
    </div>
  );
}
