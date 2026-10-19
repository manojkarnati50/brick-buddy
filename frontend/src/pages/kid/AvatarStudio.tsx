import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import Avatar from "@/components/Avatar";
import KidShell from "@/components/KidShell";
import ParentShell from "@/components/ParentShell";
import { Card } from "@/components/ui";
import { api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { colourInfo, useStore } from "@/lib/store";
import type { AvatarConfig, Pose } from "@/lib/types";
import { speak } from "@/lib/voice";

const OUTFITS: { v: AvatarConfig["outfit"]; say: string }[] = [
  { v: "cherry", say: "cherry top" }, { v: "hoodie", say: "green hoodie" }, { v: "party", say: "party dress" },
  { v: "raincoat", say: "raincoat" }, { v: "princess", say: "princess dress" }, { v: "astronaut", say: "astronaut" },
];
const ACCESSORIES: { v: AvatarConfig["accessory"]; e: string }[] = [
  { v: "none", e: "🚫" }, { v: "bow", e: "🎀" }, { v: "flower", e: "🌼" }, { v: "headband", e: "〰️" }, { v: "crown", e: "👑" },
];
const BACKGROUNDS = ["#DDF2E6", "#FFD9C7", "#FFF1B8", "#D6ECFF", "#F1E4FF", "#FFE0EE", "#FFFFFF"];
const POSES: Pose[] = ["wave", "think", "jump", "hug", "pout", "bike", "hips"];

export default function AvatarStudio({ parent }: { parent?: boolean }) {
  const stored = useStore((s) => s.settings?.avatar);
  const setAvatar = useStore((s) => s.setAvatar);
  const palette = useStore((s) => s.settings?.printable_colours ?? [4, 13, 14, 1, 2]);
  const [cfg, setCfg] = useState<AvatarConfig>(stored ?? { style: "photo", outfit: "cherry", accessory: "bow", headphones: false, background: "#DDF2E6", brick_colour: 13 });
  const [pose, setPose] = useState<Pose>("wave");
  const hasArt = useStore((s) => Object.keys(s.avatarArt).length > 0);

  async function change(patch: Partial<AvatarConfig>, say?: string) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    setAvatar(next); // instant everywhere
    sfx.pop();
    if (say) void speak(say);
    await api.put<AvatarConfig>("/api/avatar", next).catch(() => undefined);
  }

  const body = (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
      <div className="flex flex-col items-center gap-4">
        <motion.div key={cfg.outfit + cfg.accessory} initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
          <Avatar pose={pose} size={300} config={cfg} />
        </motion.div>
        <div className="flex flex-wrap justify-center gap-2">
          {POSES.map((p) => (
            <button key={p} onClick={() => { setPose(p); sfx.click(); }} aria-label={p}
              className={`h-[72px] w-[72px] overflow-hidden rounded-2xl shadow-squish ${pose === p ? "bg-brick-yellow" : "bg-white"}`}>
              <Avatar pose={p} size={64} config={cfg} bg={false} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        {hasArt && (
          <Row label="🪞">
            <Choice on={cfg.style !== "cartoon"} onClick={() => change({ style: "photo" }, "That's me!")} label="my photos">
              <Avatar pose="wave" size={70} config={{ ...cfg, style: "photo" }} bg={false} />
            </Choice>
            <Choice on={cfg.style === "cartoon"} onClick={() => change({ style: "cartoon" }, "Cartoon me!")} label="cartoon">
              <Avatar pose="wave" size={70} config={{ ...cfg, style: "cartoon" }} bg={false} />
            </Choice>
          </Row>
        )}
        <Row label="👕">
          {OUTFITS.map((o) => (
            <Choice key={o.v} on={cfg.outfit === o.v} onClick={() => change({ outfit: o.v }, o.say)} label={o.say}>
              <Avatar pose="wave" size={70} config={{ ...cfg, style: "cartoon", outfit: o.v }} bg={false} />
            </Choice>
          ))}
        </Row>
        <Row label="🎀">
          {ACCESSORIES.map((a) => (
            <Choice key={a.v} on={cfg.accessory === a.v} onClick={() => change({ accessory: a.v }, a.v === "none" ? "no hair clip" : a.v)} label={a.v}>
              <span className="text-5xl">{a.e}</span>
            </Choice>
          ))}
        </Row>
        <Row label="🎧">
          <Choice on={cfg.headphones} onClick={() => change({ headphones: !cfg.headphones }, "headphones")} label="headphones">
            <span className="text-5xl">{cfg.headphones ? "🎧" : "🔇"}</span>
          </Choice>
          {BACKGROUNDS.map((b) => (
            <Choice key={b} on={cfg.background === b} onClick={() => change({ background: b })} label="background">
              <span className="h-14 w-14 rounded-full border-4 border-white" style={{ background: b }} />
            </Choice>
          ))}
        </Row>
        <Row label="🧱">
          {palette.map((c) => (
            <Choice key={c} on={cfg.brick_colour === c} onClick={() => change({ brick_colour: c }, `${colourInfo(c).kid_name} is my favourite!`)} label={colourInfo(c).kid_name}>
              <span className="h-14 w-14 rounded-2xl shadow-brick" style={{ background: colourInfo(c).hex }} />
            </Choice>
          ))}
        </Row>
      </div>
    </div>
  );

  if (parent)
    return (
      <ParentShell title="Avatar Studio">
        {body}
        <AvatarArtUploads />
      </ParentShell>
    );
  return <KidShell bg="bg-[#D9F6F8]/50">{body}</KidShell>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[2rem] bg-white/70 p-3 shadow-squish">
      <span className="w-12 text-center text-4xl">{label}</span>
      <div className="no-scrollbar flex flex-1 gap-3 overflow-x-auto py-1">{children}</div>
    </div>
  );
}

function Choice({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <motion.button whileTap={{ scale: 0.88 }} onClick={onClick} aria-label={label}
      className={`flex h-[88px] min-w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-3xl ${on ? "bg-brick-yellow" : "bg-cream"}`}>
      {children}
    </motion.button>
  );
}

/** Parent-only: upload generated pose art (see docs/AVATAR_PROMPTS.md). Stored privately on this machine. */
function AvatarArtUploads() {
  const art = useStore((s) => s.avatarArt);
  const setArt = useStore((s) => s.setAvatarArt);
  const upload = async (pose: Pose, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    setArt(await api.form<Record<string, string>>(`/api/avatar/art/${pose}`, fd));
  };
  const remove = async (pose: Pose) => setArt(await api.del<Record<string, string>>(`/api/avatar/art/${pose}`));
  return (
    <Card className="mt-6">
      <h3 className="mb-1 text-xl font-bold">Custom pose art (optional)</h3>
      <p className="mb-4 text-sm text-ink/60">
        Upload transparent PNGs of her (photos with the background removed — see <code>tools/make_avatars.py</code> — or art from
        <code>docs/AVATAR_PROMPTS.md</code>). They are stored only on this machine
        (<code>data/private/avatar</code>), never sent to Claude and never exported unless you tick “include photos”.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {POSES.map((p) => (
          <div key={p} className="flex flex-col items-center gap-2 rounded-2xl bg-cream p-3">
            <div className="text-sm font-bold">{p}.png</div>
            {art[p] ? <img src={`${art[p]}?t=${Date.now()}`} alt="" className="h-20 object-contain" /> : <Avatar pose={p} size={60} bg={false} config={{ ...(useStore.getState().settings?.avatar as AvatarConfig), style: "cartoon" }} />}
            <label className="btn-soft cursor-pointer text-xs">
              Upload
              <input type="file" accept="image/png" className="hidden" onChange={(e) => e.target.files?.[0] && upload(p, e.target.files[0])} />
            </label>
            {art[p] && <button className="text-xs text-brick-red" onClick={() => remove(p)}>Remove</button>}
          </div>
        ))}
      </div>
    </Card>
  );
}
