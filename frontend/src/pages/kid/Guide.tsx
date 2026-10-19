import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Avatar from "@/components/Avatar";
import BrickViewer from "@/components/BrickViewer";
import KidShell from "@/components/KidShell";
import { BrickButton, BrickIcon, Confetti } from "@/components/ui";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { colourInfo } from "@/lib/store";
import type { ModelData } from "@/lib/types";
import { speak } from "@/lib/voice";

/** Step-by-step build guide: one LDraw step at a time, with big pictures and voice. */
export default function Guide() {
  const { id } = useParams();
  const [model, setModel] = useState<ModelData | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    api.get<ModelData>(`/api/projects/${id}/model`).then(setModel);
  }, [id]);

  const stepBricks = useMemo(() => model?.bricks.filter((b) => b.step === step) ?? [], [model, step]);
  const done = model ? step >= model.steps : false;

  const sayStep = useCallback(() => {
    if (!model) return;
    if (done) {
      void speak("You did it! All finished!");
      return;
    }
    const groups = new Map<string, number>();
    for (const b of stepBricks) {
      const k = `${colourInfo(b.colour).kid_name}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    const what = [...groups.entries()].map(([c, n]) => `${n === 1 ? "the" : n} ${c} ${n === 1 ? "one" : "ones"}`).join(" and ");
    void speak(step === 0 ? `Let's build! First, ${what}.` : `Now ${what} on top!`);
  }, [step, model, stepBricks, done]);

  useEffect(() => {
    if (done) sfx.cheer();
    sayStep();
  }, [sayStep, done]);

  if (!model) return <KidShell><Avatar pose="think" size={200} /></KidShell>;

  return (
    <KidShell>
      <Confetti show={done} />
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="relative h-[62vh] min-h-[360px] overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-butter to-cream shadow-squish">
          <BrickViewer models={[{ bricks: model.bricks }]} maxStep={done ? undefined : step} currentStep={done ? undefined : step} autoRotate={done} />
          <div className="absolute left-4 top-4 flex gap-2">
            {Array.from({ length: model.steps }).map((_, i) => (
              <span key={i} className="h-4 w-8 rounded" style={{ background: i <= step ? "#00A650" : "#ffffffaa" }} />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          {done ? <Avatar pose="jump" size={180} /> : (
            <div className="flex flex-wrap justify-center gap-3 rounded-3xl bg-white p-4 shadow-squish">
              {stepBricks.map((b) => (
                <BrickIcon key={b.uid} hex={colourInfo(b.colour).hex} w={(b.dims?.[0] ?? 2) >= 2 ? 2 : 1} size={34} />
              ))}
            </div>
          )}
          <div className="flex gap-4">
            <BrickButton colour="blue" size="xl" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <Icon icon="mdi:arrow-left-bold" className="text-5xl" />
            </BrickButton>
            <BrickButton colour="green" size="xl" sound="snap" disabled={done} onClick={() => setStep((s) => s + 1)}>
              <Icon icon="mdi:arrow-right-bold" className="text-5xl" />
            </BrickButton>
          </div>
          <BrickButton colour="yellow" size="lg" onClick={sayStep} title="Say it again">
            🔊
          </BrickButton>
        </div>
      </div>
    </KidShell>
  );
}
