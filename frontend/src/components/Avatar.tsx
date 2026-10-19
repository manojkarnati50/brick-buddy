/**
 * Aaradya's avatar, built from layered SVG pieces so Avatar Studio changes are instant and free.
 * Look: long wavy dark-brown hair, brown eyes, warm smile; default outfit = white top with a red cherry,
 * wide blue jeans with star patches, white sneakers.
 *
 * If the parent uploads generated art for a pose (docs/AVATAR_PROMPTS.md), that PNG is shown instead.
 */
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { colourInfo, useStore } from "@/lib/store";
import type { AvatarConfig, Pose } from "@/lib/types";

const SKIN = "#E7B18C";
const SKIN_SHADE = "#D49470";
const HAIR = "#3A2316";
const HAIR_LIGHT = "#6A4129";
const JEANS = "#6F9DDB";

const DEFAULT: AvatarConfig = { style: "photo", outfit: "cherry", accessory: "bow", headphones: false, background: "#DDF2E6", brick_colour: 13 };

type Pt = [number, number];
const ARMS: Record<Pose, { l: [Pt, Pt]; r: [Pt, Pt] }> = {
  wave: { l: [[86, 192], [84, 214]], r: [[174, 140], [182, 112]] },
  think: { l: [[96, 198], [108, 152]], r: [[144, 198], [132, 152]] },
  pout: { l: [[96, 198], [106, 154]], r: [[144, 198], [134, 154]] },
  jump: { l: [[70, 134], [60, 104]], r: [[170, 134], [180, 104]] },
  hug: { l: [[92, 200], [126, 196]], r: [[148, 200], [114, 196]] },
  bike: { l: [[110, 196], [150, 204]], r: [[150, 192], [172, 200]] },
  hips: { l: [[70, 186], [94, 206]], r: [[170, 186], [146, 206]] },
};

interface OutfitStyle {
  top: string;
  topShade: string;
  sleeve: string | null; // null = bare arms
  bottom: "jeans" | "dress" | "coat" | "gown" | "suit";
  bottomColour: string;
  shoes: string;
}

const OUTFITS: Record<AvatarConfig["outfit"], OutfitStyle> = {
  cherry: { top: "#FFFFFF", topShade: "#ECE6F2", sleeve: null, bottom: "jeans", bottomColour: JEANS, shoes: "#FFFFFF" },
  hoodie: { top: "#9CC48A", topShade: "#83AD72", sleeve: "#9CC48A", bottom: "jeans", bottomColour: JEANS, shoes: "#FFFFFF" },
  party: { top: "#FF9EC4", topShade: "#F07AAA", sleeve: null, bottom: "dress", bottomColour: "#FF9EC4", shoes: "#FFD1E3" },
  raincoat: { top: "#FFD54A", topShade: "#F0BC22", sleeve: "#FFD54A", bottom: "coat", bottomColour: "#FFD54A", shoes: "#E3000B" },
  princess: { top: "#C9A7F2", topShade: "#B18BE6", sleeve: "#E3D3FA", bottom: "gown", bottomColour: "#C9A7F2", shoes: "#FFF1B8" },
  astronaut: { top: "#F4F6FB", topShade: "#D9DEEA", sleeve: "#F4F6FB", bottom: "suit", bottomColour: "#F4F6FB", shoes: "#9AA3B5" },
};

export default function Avatar({ pose = "wave", size = 220, config, bg = true, className, portrait }: {
  pose?: Pose;
  size?: number;
  config?: AvatarConfig;
  bg?: boolean;
  className?: string;
  /** small round profile picture: crop to her face */
  portrait?: boolean;
}) {
  const stored = useStore((s) => s.settings?.avatar);
  const art = useStore((s) => s.avatarArt[pose]);
  const cfg = config ?? stored ?? DEFAULT;
  const reduce = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const o = OUTFITS[cfg.outfit] ?? OUTFITS.cherry;
  const brick = colourInfo(cfg.brick_colour).hex;
  const arms = ARMS[pose];

  if (art && cfg.style !== "cartoon" && portrait) {
    return (
      <div className={className} style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: cfg.background, position: "relative" }}>
        <img src={art} alt="Aaradya" draggable={false} style={{ position: "absolute", width: "190%", left: "-45%", top: "4%", maxWidth: "none" }} />
      </div>
    );
  }
  if (art && cfg.style !== "cartoon") {
    // her real photo, background removed (stored only on this machine)
    return (
      <div className={className} style={{ position: "relative", width: size, height: size * 1.25 }}>
        {bg && <div style={{ position: "absolute", left: "2%", right: "2%", top: "10%", bottom: "0%", borderRadius: "50%", background: cfg.background }} />}
        <motion.img
          src={art}
          alt="Aaradya"
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 8px 10px rgba(59,51,85,0.18))" }}
          animate={reduce ? undefined : pose === "jump" ? { y: [0, -16, 0] } : pose === "hug" ? { rotate: [-2, 2, -2] } : { y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: pose === "jump" ? 0.9 : 3, ease: "easeInOut" }}
        />
        {pose === "jump" && !reduce && (
          <svg viewBox="0 0 240 300" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}><Sparkles /></svg>
        )}
      </div>
    );
  }

  const bodyAnim = reduce
    ? undefined
    : pose === "jump"
      ? { y: [0, -18, 0] }
      : pose === "hug"
        ? { rotate: [-2, 2, -2] }
        : pose === "bike"
          ? { x: [-3, 3, -3] }
          : { y: [0, -2.5, 0] };
  const happyEyes = pose === "hug" || pose === "jump";
  const legsBent = pose === "bike";

  return (
    <svg viewBox="0 0 240 300" width={size} height={size * 1.25} className={className} role="img" aria-label="Aaradya">
      <defs>
        <radialGradient id={`skin${id}`} cx="45%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#F6CDAE" />
          <stop offset="70%" stopColor={SKIN} />
          <stop offset="100%" stopColor={SKIN_SHADE} />
        </radialGradient>
        <linearGradient id={`hair${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={HAIR_LIGHT} />
          <stop offset="100%" stopColor={HAIR} />
        </linearGradient>
        <linearGradient id={`top${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={o.top} />
          <stop offset="100%" stopColor={o.topShade} />
        </linearGradient>
        <radialGradient id={`gloss${id}`} cx="35%" cy="25%" r="40%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {bg && <circle cx="120" cy="150" r="118" fill={cfg.background} />}
      {bg && <ellipse cx="120" cy="290" rx="70" ry="8" fill="#3B3355" opacity="0.08" />}

      {pose === "bike" && <Bike />}

      <motion.g style={{ originX: "120px", originY: "280px" }} animate={bodyAnim}
        transition={{ repeat: Infinity, duration: pose === "jump" ? 0.9 : pose === "hug" ? 2.4 : 2.8, ease: "easeInOut" }}>
        {/* hair (back layer, long + wavy) */}
        <path d="M58 104 C50 150 44 190 60 214 C70 228 64 240 78 246 C86 222 92 196 96 160 L144 160 C148 196 154 222 162 246 C176 240 170 228 180 214 C196 190 190 150 182 104 Z"
          fill={`url(#hair${id})`} />

        {/* legs */}
        <Legs o={o} bent={legsBent} pose={pose} />

        {/* torso */}
        <Torso o={o} id={id} brick={brick} />

        {/* left arm behind for hug/think so the hands meet nicely */}
        <Arm shoulder={[94, 164]} elbow={arms.l[0]} hand={arms.l[1]} sleeve={o.sleeve} id={id} />
        {pose !== "wave" && <Arm shoulder={[146, 164]} elbow={arms.r[0]} hand={arms.r[1]} sleeve={o.sleeve} id={id} />}

        {pose === "hug" && <Bunny />}

        {/* neck + head */}
        <rect x="110" y="138" width="20" height="18" rx="8" fill={SKIN_SHADE} />
        <motion.g style={{ originX: "120px", originY: "140px" }}
          animate={reduce ? undefined : pose === "think" ? { rotate: [-4, 2, -4] } : pose === "pout" ? { rotate: [3, 5, 3] } : { rotate: [0, -1.5, 0] }}
          transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}>
          <ellipse cx="120" cy="96" rx="58" ry="55" fill={`url(#skin${id})`} />
          <ellipse cx="62" cy="102" rx="9" ry="12" fill={SKIN} />
          <ellipse cx="178" cy="102" rx="9" ry="12" fill={SKIN} />
          <Face pose={pose} happyEyes={happyEyes} />
          {/* fringe + wavy front strands */}
          <path d="M62 92 C60 50 92 34 122 36 C156 36 184 56 178 96 C170 74 156 62 140 58 C132 72 112 78 92 74 C80 80 70 86 62 92 Z" fill={`url(#hair${id})`} />
          <path d="M64 88 C56 112 60 130 54 150 C64 142 70 120 70 100 Z" fill={HAIR} />
          <path d="M176 88 C184 112 180 130 186 150 C176 142 170 120 170 100 Z" fill={HAIR} />
          <path d="M96 48 C112 42 134 42 150 52" stroke={HAIR_LIGHT} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />
          <Accessory kind={cfg.accessory} />
          {cfg.headphones && <Headphones colour={brick} />}
        </motion.g>

        {/* waving arm in front, with a peace sign */}
        {pose === "wave" && (
          <motion.g style={{ originX: "146px", originY: "164px" }} animate={reduce ? undefined : { rotate: [0, 14, 0, 14, 0] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}>
            <Arm shoulder={[146, 164]} elbow={arms.r[0]} hand={arms.r[1]} sleeve={o.sleeve} id={id} peace />
          </motion.g>
        )}

        {/* her favourite brick */}
        {(pose === "wave" || pose === "hips") && <MiniBrick x={30} y={238} colour={brick} />}
      </motion.g>
      {pose === "jump" && !reduce && <Sparkles />}
    </svg>
  );
}

function Face({ pose, happyEyes }: { pose: Pose; happyEyes: boolean }) {
  const pout = pose === "pout";
  return (
    <g>
      {/* eyebrows */}
      <path d={pout ? "M84 72 Q96 66 106 72" : "M84 70 Q96 62 106 68"} stroke="#4A2C1B" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d={pout ? "M134 72 Q144 66 156 72" : "M134 68 Q144 62 156 70"} stroke="#4A2C1B" strokeWidth="4" fill="none" strokeLinecap="round" />
      {happyEyes ? (
        <>
          <path d="M84 96 Q96 82 108 96" stroke="#3A2316" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M132 96 Q144 82 156 96" stroke="#3A2316" strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {[96, 144].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="94" rx="14" ry="16" fill="#fff" />
              <circle cx={cx + (pose === "think" ? 3 : 1)} cy={pose === "think" ? 90 : 96} r="10.5" fill="#6B3E1E" />
              <circle cx={cx + (pose === "think" ? 3 : 1)} cy={pose === "think" ? 90 : 96} r="5.5" fill="#24130A" />
              <circle cx={cx + 5} cy={pose === "think" ? 86 : 91} r="3.6" fill="#fff" />
              <circle cx={cx - 3} cy={pose === "think" ? 94 : 100} r="1.8" fill="#fff" />
              <path d={`M${cx - 14} 84 Q${cx} 74 ${cx + 14} 84`} stroke="#3A2316" strokeWidth="3" fill="none" strokeLinecap="round" />
            </g>
          ))}
        </>
      )}
      {/* nose + cheeks */}
      <ellipse cx="120" cy="112" rx="5" ry="3.5" fill={SKIN_SHADE} />
      <ellipse cx="82" cy="118" rx={pout ? 12 : 10} ry="6.5" fill="#F48C8C" opacity="0.45" />
      <ellipse cx="158" cy="118" rx={pout ? 12 : 10} ry="6.5" fill="#F48C8C" opacity="0.45" />
      {/* mouth */}
      {pout ? (
        <path d="M110 132 Q120 124 130 132 Q120 129 110 132 Z" fill="#C2556B" stroke="#A23E55" strokeWidth="2" strokeLinejoin="round" />
      ) : pose === "jump" || pose === "wave" ? (
        <g>
          <path d="M104 124 Q120 146 136 124 Z" fill="#B5405A" />
          <path d="M110 136 Q120 142 130 136 Q120 132 110 136 Z" fill="#F28AA0" />
          <path d="M106 124 L134 124" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : (
        <path d="M106 126 Q120 140 134 126" stroke="#A23E55" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
    </g>
  );
}

function Torso({ o, id, brick }: { o: OutfitStyle; id: string; brick: string }) {
  return (
    <g>
      {/* hips/bottom garment top part */}
      {o.bottom === "dress" || o.bottom === "gown" || o.bottom === "coat" ? null : (
        <path d="M90 200 L150 200 L154 216 L86 216 Z" fill={o.bottomColour} />
      )}
      <path d="M94 154 C88 170 86 188 88 206 L152 206 C154 188 152 170 146 154 C136 150 104 150 94 154 Z" fill={`url(#top${id})`} />
      <path d="M94 154 C88 170 86 188 88 206 L152 206 C154 188 152 170 146 154 C136 150 104 150 94 154 Z" fill={`url(#gloss${id})`} />
      {o.top === "#FFFFFF" && (
        // cherry tank top: straps + red cherry
        <g>
          <path d="M100 152 L104 140 M140 152 L136 140" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          <path d="M118 168 Q124 158 132 156" stroke="#2E7D32" strokeWidth="2.5" fill="none" />
          <path d="M124 166 Q128 160 132 156" stroke="#2E7D32" strokeWidth="2.5" fill="none" />
          <circle cx="116" cy="178" r="7" fill="#D7263D" />
          <circle cx="127" cy="175" r="7" fill="#E3364C" />
          <circle cx="113" cy="175" r="2" fill="#fff" opacity="0.7" />
          <path d="M131 156 Q138 152 140 158 Q134 160 131 156 Z" fill="#43A047" />
        </g>
      )}
      {o.sleeve === "#9CC48A" && (
        // hoodie: zip + pocket + hood edge
        <g>
          <path d="M120 156 L120 206" stroke="#6E9A5E" strokeWidth="2.5" />
          <path d="M100 186 Q120 196 140 186 L138 204 L102 204 Z" fill="#8DB87A" />
          <path d="M98 154 Q120 166 142 154" stroke="#83AD72" strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      )}
      {o.bottom === "suit" && (
        <g>
          <rect x="104" y="166" width="32" height="20" rx="5" fill="#0055BF" />
          <circle cx="112" cy="176" r="3" fill="#E3000B" />
          <circle cx="122" cy="176" r="3" fill="#FFD500" />
          <circle cx="132" cy="176" r="3" fill="#00A650" />
        </g>
      )}
      {o.bottom === "coat" && (
        <g>
          {[166, 182, 198].map((y) => (
            <circle key={y} cx="120" cy={y} r="3" fill="#B98A00" />
          ))}
        </g>
      )}
      {(o.bottom === "dress" || o.bottom === "gown") && (
        <g>
          {[[104, 170], [134, 182], [114, 196], [138, 162]].map(([x, y]) => (
            <path key={`${x}${y}`} d={`M${x} ${y - 4} L${x + 1.5} ${y} L${x + 5} ${y + 1} L${x + 1.5} ${y + 2.5} L${x} ${y + 6} L${x - 1.5} ${y + 2.5} L${x - 5} ${y + 1} L${x - 1.5} ${y} Z`} fill="#fff" opacity="0.85" />
          ))}
        </g>
      )}
      {/* tiny brick badge in her favourite colour */}
      <rect x="138" y="190" width="10" height="7" rx="1.5" fill={brick} opacity="0.95" />
    </g>
  );
}

function Legs({ o, bent, pose }: { o: OutfitStyle; bent: boolean; pose: Pose }) {
  const spread = pose === "jump" ? 10 : 0;
  if (bent) {
    return (
      <g>
        <path d="M96 204 L84 236 L102 244 L114 210 Z" fill={o.bottom === "jeans" ? JEANS : SKIN} />
        <path d="M144 204 L156 236 L138 244 L126 210 Z" fill={o.bottom === "jeans" ? JEANS : SKIN} />
        <ellipse cx="90" cy="248" rx="14" ry="7" fill={o.shoes} stroke="#CFC6DA" strokeWidth="2" />
        <ellipse cx="150" cy="248" rx="14" ry="7" fill={o.shoes} stroke="#CFC6DA" strokeWidth="2" />
        {(o.bottom === "dress" || o.bottom === "gown") && <path d="M86 200 L154 200 L166 228 L74 228 Z" fill={o.bottomColour} />}
      </g>
    );
  }
  const shoe = (x: number) => (
    <g>
      <path d={`M${x - 16} 280 Q${x - 16} 266 ${x} 266 Q${x + 18} 266 ${x + 18} 280 Z`} fill={o.shoes} stroke="#CFC6DA" strokeWidth="2" />
      <rect x={x - 16} y="278" width="34" height="5" rx="2.5" fill="#E9E3F2" />
    </g>
  );
  return (
    <g>
      {o.bottom === "jeans" || o.bottom === "suit" ? (
        <>
          <path d={`M88 206 L${80 - spread} 270 L${112 - spread / 2} 270 L118 214 Z`} fill={o.bottomColour} />
          <path d={`M152 206 L${160 + spread} 270 L${128 + spread / 2} 270 L122 214 Z`} fill={o.bottomColour} />
          {o.bottom === "jeans" && (
            <>
              <Star x={98} y={236} c="#FFD500" />
              <Star x={142} y={250} c="#FF9EC4" />
              <path d="M120 212 L120 226" stroke="#5A86C2" strokeWidth="2" />
            </>
          )}
        </>
      ) : (
        <>
          <rect x={98 - spread} y="226" width="12" height="44" rx="6" fill={o.bottom === "coat" ? "#E3000B" : SKIN} />
          <rect x={130 + spread} y="226" width="12" height="44" rx="6" fill={o.bottom === "coat" ? "#E3000B" : SKIN} />
          {o.bottom === "dress" && <path d="M88 200 L152 200 L168 238 Q120 248 72 238 Z" fill={o.bottomColour} />}
          {o.bottom === "gown" && <path d="M88 200 L152 200 L176 266 Q120 276 64 266 Z" fill={o.bottomColour} />}
          {o.bottom === "coat" && <path d="M88 200 L152 200 L158 240 L82 240 Z" fill={o.bottomColour} />}
        </>
      )}
      {shoe(96 - spread)}
      {shoe(144 + spread)}
    </g>
  );
}

function Star({ x, y, c }: { x: number; y: number; c: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 3 : 7;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill={c} stroke="#fff" strokeWidth="1" />;
}

function Arm({ shoulder, elbow, hand, sleeve, id, peace }: { shoulder: Pt; elbow: Pt; hand: Pt; sleeve: string | null; id: string; peace?: boolean }) {
  const d = `M${shoulder[0]} ${shoulder[1]} L${elbow[0]} ${elbow[1]} L${hand[0]} ${hand[1]}`;
  return (
    <g>
      <path d={d} stroke={SKIN} strokeWidth="15" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {sleeve && (
        <path d={`M${shoulder[0]} ${shoulder[1]} L${elbow[0]} ${elbow[1]}`} stroke={sleeve} strokeWidth="17" fill="none" strokeLinecap="round" />
      )}
      <circle cx={hand[0]} cy={hand[1]} r="10" fill={`url(#skin${id})`} />
      {peace && (
        <g>
          <rect x={hand[0] - 6} y={hand[1] - 26} width="6" height="20" rx="3" fill={SKIN} transform={`rotate(-12 ${hand[0]} ${hand[1]})`} />
          <rect x={hand[0] + 1} y={hand[1] - 26} width="6" height="20" rx="3" fill={SKIN} transform={`rotate(12 ${hand[0]} ${hand[1]})`} />
        </g>
      )}
    </g>
  );
}

function Accessory({ kind }: { kind: AvatarConfig["accessory"] }) {
  switch (kind) {
    case "bow":
      return (
        <g transform="translate(160 52) rotate(18)">
          <path d="M0 0 L-20 -12 L-20 12 Z" fill="#FF6FA5" />
          <path d="M0 0 L20 -12 L20 12 Z" fill="#FF6FA5" />
          <circle r="6" fill="#E34F8C" />
        </g>
      );
    case "flower":
      return (
        <g transform="translate(166 64)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-8" rx="6" ry="9" fill="#FFF1B8" transform={`rotate(${a})`} stroke="#FFD500" strokeWidth="1" />
          ))}
          <circle r="5" fill="#FF7F1E" />
        </g>
      );
    case "headband":
      return <path d="M66 74 C80 34 160 34 174 74" stroke="#E3000B" strokeWidth="8" fill="none" strokeLinecap="round" />;
    case "crown":
      return (
        <g transform="translate(120 40)">
          <path d="M-26 6 L-26 -14 L-13 -4 L0 -20 L13 -4 L26 -14 L26 6 Z" fill="#FFD500" stroke="#E0A800" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="0" cy="-2" r="3.5" fill="#E3000B" />
          <circle cx="-15" cy="1" r="2.5" fill="#0055BF" />
          <circle cx="15" cy="1" r="2.5" fill="#00A650" />
        </g>
      );
    default:
      return null;
  }
}

function Headphones({ colour }: { colour: string }) {
  return (
    <g>
      <path d="M58 100 C54 34 186 34 182 100" stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M58 100 C54 34 186 34 182 100" stroke="#D9D2E6" strokeWidth="2" fill="none" />
      <rect x="44" y="86" width="22" height="34" rx="10" fill={colour} stroke="#fff" strokeWidth="3" />
      <rect x="174" y="86" width="22" height="34" rx="10" fill={colour} stroke="#fff" strokeWidth="3" />
    </g>
  );
}

function Bunny() {
  return (
    <g transform="translate(120 192)">
      <ellipse cx="-9" cy="-34" rx="6" ry="16" fill="#FFFFFF" stroke="#E7DDEF" strokeWidth="2" />
      <ellipse cx="9" cy="-34" rx="6" ry="16" fill="#FFFFFF" stroke="#E7DDEF" strokeWidth="2" />
      <ellipse cx="-9" cy="-34" rx="3" ry="10" fill="#FFC2D6" />
      <ellipse cx="9" cy="-34" rx="3" ry="10" fill="#FFC2D6" />
      <circle cx="0" cy="-10" r="17" fill="#FFFFFF" stroke="#E7DDEF" strokeWidth="2" />
      <ellipse cx="0" cy="12" rx="20" ry="16" fill="#FFFFFF" stroke="#E7DDEF" strokeWidth="2" />
      <circle cx="-6" cy="-12" r="2.6" fill="#3B3355" />
      <circle cx="6" cy="-12" r="2.6" fill="#3B3355" />
      <ellipse cx="0" cy="-6" rx="3" ry="2" fill="#FF8FB1" />
    </g>
  );
}

function Bike() {
  return (
    <g>
      {[70, 172].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="262" r="26" fill="none" stroke="#FF7FB0" strokeWidth="8" />
          <circle cx={cx} cy="262" r="26" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="4 8" />
          <circle cx={cx} cy="262" r="5" fill="#FF7FB0" />
        </g>
      ))}
      <path d="M70 262 L112 222 L160 222 L172 262 M112 222 L120 262 L160 222 M156 222 L164 196" stroke="#FF5C9A" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="98" y="212" width="30" height="9" rx="4.5" fill="#7A3B5E" />
      <path d="M156 196 L176 196" stroke="#7A3B5E" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

function MiniBrick({ x, y, colour }: { x: number; y: number; colour: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="8" width="40" height="22" rx="4" fill={colour} />
      <rect x="5" y="2" width="11" height="8" rx="2.5" fill={colour} />
      <rect x="24" y="2" width="11" height="8" rx="2.5" fill={colour} />
      <rect x="0" y="24" width="40" height="6" rx="3" fill="#000" opacity="0.15" />
      <rect x="3" y="10" width="34" height="4" rx="2" fill="#fff" opacity="0.35" />
    </g>
  );
}

function Sparkles() {
  return (
    <g>
      {[[40, 60, "#FFD500"], [200, 50, "#E3000B"], [30, 180, "#0055BF"], [210, 170, "#00A650"], [120, 14, "#FF7F1E"]].map(([x, y, c], i) => (
        <motion.rect key={i} x={x as number} y={y as number} width="10" height="7" rx="2" fill={c as string}
          animate={{ y: [(y as number), (y as number) - 12, (y as number)], rotate: [0, 30, 0], opacity: [1, 0.6, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 + i * 0.15 }} />
      ))}
    </g>
  );
}
