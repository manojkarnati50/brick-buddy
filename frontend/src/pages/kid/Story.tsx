import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Avatar from "@/components/Avatar";
import KidShell from "@/components/KidShell";
import { BrickButton } from "@/components/ui";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import type { ProjectCard } from "@/lib/types";
import { speak, stopSpeaking } from "@/lib/voice";

interface StoryData { title: string; paragraphs: string[] }

/** Story time: Claude tells a short story starring her avatar and one of her models, read aloud. */
export default function Story() {
  const [params] = useSearchParams();
  const [models, setModels] = useState<ProjectCard[]>([]);
  const [story, setStory] = useState<StoryData | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [para, setPara] = useState(-1);
  const playing = useRef(false);

  useEffect(() => {
    api.get<ProjectCard[]>("/api/projects").then((ps) => {
      setModels(ps);
      const pre = Number(params.get("project"));
      const p = ps.find((x) => x.id === pre);
      if (p) void tell(p);
      else void speak("Pick a model for your story!");
    });
    return () => {
      playing.current = false;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tell(p: ProjectCard) {
    sfx.snap();
    setLoading(true);
    setThumb(p.thumbnail);
    try {
      const s = await api.post<StoryData>("/api/story", { project_id: p.id });
      setStory(s);
      void read(s);
    } finally {
      setLoading(false);
    }
  }

  async function read(s: StoryData) {
    playing.current = true;
    await speak(s.title);
    for (let i = 0; i < s.paragraphs.length && playing.current; i++) {
      setPara(i);
      await speak(s.paragraphs[i]);
    }
    setPara(-1);
    playing.current = false;
  }

  if (loading)
    return (
      <KidShell bg="bg-[#F1E4FF]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Avatar pose="think" size={240} />
          <div className="text-3xl font-bold text-ink/60">📖 …</div>
        </div>
      </KidShell>
    );

  if (story)
    return (
      <KidShell bg="bg-[#F1E4FF]">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center gap-4">
            <Avatar pose="hug" size={220} />
            {thumb && <img src={thumb} alt="" className="h-40 w-40 rounded-3xl bg-white shadow-squish" />}
            <div className="flex gap-3">
              <BrickButton colour="green" size="lg" onClick={() => { stopSpeaking(); playing.current = false; setTimeout(() => void read(story), 100); }}>▶️</BrickButton>
              <BrickButton colour="red" size="lg" onClick={() => { playing.current = false; stopSpeaking(); setPara(-1); }}>⏹️</BrickButton>
            </div>
          </div>
          <div className="rounded-[2.5rem] bg-white p-8 shadow-squish">
            <h2 className="mb-4 text-3xl font-bold">{story.title}</h2>
            {story.paragraphs.map((p, i) => (
              <motion.p key={i} animate={{ scale: para === i ? 1.03 : 1, opacity: para === -1 || para === i ? 1 : 0.45 }}
                className="mb-3 origin-left text-xl leading-relaxed">
                {p}
              </motion.p>
            ))}
          </div>
        </div>
      </KidShell>
    );

  return (
    <KidShell bg="bg-[#F1E4FF]">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {models.map((p) => (
          <motion.button key={p.id} whileTap={{ scale: 0.92 }} onClick={() => tell(p)} aria-label={p.name}
            className="rounded-[2rem] bg-white p-3 shadow-squish">
            <img src={p.thumbnail ?? ""} alt="" className="aspect-square w-full rounded-3xl bg-cream" />
          </motion.button>
        ))}
      </div>
    </KidShell>
  );
}
