import { motion } from "motion/react";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import BrickViewer from "@/components/BrickViewer";
import KidShell from "@/components/KidShell";
import { BrickButton, Confetti } from "@/components/ui";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { colourInfo } from "@/lib/store";
import type { Brick, ModelData } from "@/lib/types";
import { speak } from "@/lib/voice";

type Kind = "find" | "tall" | "count";
interface Round { project_id: number; name: string; target_colour: number; count: number; tall: number }

/** Little games with her own models. Always celebrate, never "wrong". */
export default function Games() {
  const [kind, setKind] = useState<Kind | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [model, setModel] = useState<ModelData | null>(null);
  const [party, setParty] = useState(false);
  const [found, setFound] = useState<Set<number>>(new Set());

  async function start(k: Kind) {
    sfx.snap();
    setKind(k);
    setParty(false);
    setFound(new Set());
    const r = await api.get<Round>(`/api/game/round?kind=${k}`);
    setRound(r);
    setModel(await api.get<ModelData>(`/api/projects/${r.project_id}/model`));
    const c = colourInfo(r.target_colour).kid_name;
    void speak(k === "find" ? `Can you find a ${c} brick? Tap it!` : k === "tall" ? `How many bricks tall is the ${r.name}?` : `How many ${c} bricks can you count?`);
  }

  function celebrate(text: string) {
    sfx.cheer();
    setParty(true);
    void speak(text);
    void api.post("/api/stickers", { kind: "game", emoji: "🎈", label: "Played a game" }).catch(() => undefined);
    setTimeout(() => setParty(false), 2500);
  }

  function tapBrick(b: Brick) {
    if (!round || kind !== "find") return;
    if (b.colour === round.target_colour) {
      setFound((f) => new Set(f).add(b.uid));
      celebrate(`Yes! You found the ${colourInfo(b.colour).kid_name} brick! Hooray!`);
    } else {
      sfx.pop();
      void speak(`Ooh, that one is ${colourInfo(b.colour).kid_name}! Can you find ${colourInfo(round.target_colour).kid_name}?`);
    }
  }

  function answer(n: number) {
    if (!round) return;
    const real = kind === "tall" ? round.tall : round.count;
    if (n === real) celebrate(`Yes! ${real}! You're so clever!`);
    else {
      const counting = Array.from({ length: real }, (_, i) => i + 1).join(", ");
      celebrate(`Good try! Let's count together: ${counting}! It's ${real}!`);
    }
  }

  useEffect(() => {
    void speak("Which game shall we play?");
  }, []);

  return (
    <KidShell bg="bg-peach/50">
      <Confetti show={party} />
      {!kind || !round || !model ? (
        <div className="flex flex-1 flex-wrap items-center justify-center gap-8">
          {([["find", "🔍", "#FFD500"], ["tall", "📏", "#00A650"], ["count", "🔢", "#0055BF"]] as const).map(([k, e, c]) => (
            <motion.button key={k} whileTap={{ scale: 0.9 }} onClick={() => start(k)} aria-label={k}
              className="flex h-48 w-48 items-center justify-center rounded-[2.5rem] text-8xl shadow-brick" style={{ background: c }}>
              {e}
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="h-[60vh] min-h-[340px] overflow-hidden rounded-[2.5rem] bg-white shadow-squish">
            <BrickViewer models={[{ bricks: model.bricks }]} onTap={tapBrick} highlight={found} autoRotate={kind !== "find"} />
          </div>
          <div className="flex flex-col items-center gap-4">
            <Avatar pose={party ? "jump" : "think"} size={160} />
            {kind === "find" ? (
              <div className="h-28 w-28 rounded-full shadow-brick" style={{ background: colourInfo(round.target_colour).hex }} />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                  <BrickButton key={n} colour={["red", "yellow", "blue", "green", "orange"][n % 5]} size="lg" onClick={() => answer(n)}>{n}</BrickButton>
                ))}
              </div>
            )}
            <BrickButton colour="orange" size="lg" onClick={() => start(kind)}>🔁</BrickButton>
          </div>
        </div>
      )}
    </KidShell>
  );
}
