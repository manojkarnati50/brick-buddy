import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { sfx } from "@/lib/sound";
import type { Status } from "@/lib/types";

export const BRICK = { red: "#E3000B", yellow: "#FFD500", blue: "#0055BF", green: "#00A650", orange: "#FF7F1E" } as const;
type BrickName = keyof typeof BRICK;

function textOn(colour: string) {
  return colour === BRICK.yellow ? "#3B3355" : "#ffffff";
}

/** LEGO-style button: studs on top, chunky bottom edge, "snap" press. */
export function BrickButton({ colour = "red", children, onClick, className, size = "md", disabled, sound = "click", title }: {
  colour?: BrickName | string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
  sound?: "click" | "snap" | "none";
  title?: string;
}) {
  const bg = (BRICK as Record<string, string>)[colour] ?? colour;
  const reduce = useReducedMotion();
  const pad = { sm: "px-4 py-2 text-base min-h-[48px]", md: "px-6 py-3 text-lg min-h-[60px]", lg: "px-8 py-4 text-2xl min-h-[88px] min-w-[88px]", xl: "px-10 py-6 text-3xl min-h-[120px] min-w-[120px]" }[size];
  const studs = { sm: 2, md: 3, lg: 4, xl: 4 }[size];
  return (
    <motion.button
      type="button"
      title={title}
      disabled={disabled}
      whileTap={reduce ? undefined : { scale: 0.92, y: 4 }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 600, damping: 18 }}
      onClick={() => {
        if (sound === "click") sfx.click();
        if (sound === "snap") sfx.snap();
        onClick?.();
      }}
      className={clsx("relative mt-3 select-none rounded-2xl font-bold shadow-brick disabled:opacity-40", pad, className)}
      style={{ background: bg, color: textOn(bg) }}
    >
      <span aria-hidden className="pointer-events-none absolute -top-[9px] left-0 right-0 flex justify-evenly px-3">
        {Array.from({ length: studs }).map((_, i) => (
          <span key={i} className="h-[11px] w-[22px] rounded-t-md" style={{ background: bg, boxShadow: "inset 0 3px 0 rgba(255,255,255,0.35)" }} />
        ))}
      </span>
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

/** Little brick icon in any colour. */
export function BrickIcon({ hex, w = 2, size = 22, faded }: { hex: string; w?: number; size?: number; faded?: boolean }) {
  const width = size * (w >= 2 ? 1.6 : 1);
  return (
    <svg width={width} height={size} viewBox={`0 0 ${w >= 2 ? 32 : 20} 20`} style={{ opacity: faded ? 0.18 : 1 }}>
      <rect x="0" y="5" width={w >= 2 ? 32 : 20} height="15" rx="3" fill={hex} />
      {(w >= 2 ? [4, 18] : [5]).map((x) => (
        <rect key={x} x={x} y="1" width="10" height="6" rx="2" fill={hex} />
      ))}
      <rect x="0" y="16" width={w >= 2 ? 32 : 20} height="4" rx="2" fill="#000" opacity="0.15" />
      <rect x="2" y="7" width={w >= 2 ? 28 : 16} height="3" rx="1.5" fill="#fff" opacity="0.35" />
    </svg>
  );
}

/** TurboTax-style brick progress bar. */
export function BrickProgress({ value, max, segments = 20, label, colours = [BRICK.green, BRICK.yellow, BRICK.blue, BRICK.red] }: {
  value: number;
  max: number;
  segments?: number;
  label?: ReactNode;
  colours?: string[];
}) {
  const filled = max > 0 ? Math.round((Math.min(value, max) / max) * segments) : 0;
  return (
    <div>
      {label && <div className="mb-2 flex justify-between text-sm font-semibold text-ink/70">{label}</div>}
      <div className="flex gap-[3px] rounded-2xl bg-ink/5 p-2">
        {Array.from({ length: segments }).map((_, i) => {
          const on = i < filled;
          const c = colours[Math.floor((i / segments) * colours.length)];
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ opacity: on ? 1 : 0.35, y: on ? 0 : 2 }}
              transition={{ delay: on ? i * 0.02 : 0 }}
              className="relative h-7 flex-1 rounded-md"
              style={{ background: on ? c : "#ffffff", boxShadow: on ? "inset 0 -4px 0 rgba(0,0,0,0.15)" : "inset 0 0 0 2px rgba(59,51,85,0.08)" }}
            >
              <span className="absolute -top-[5px] left-1/2 h-[6px] w-[45%] -translate-x-1/2 rounded-t" style={{ background: on ? c : "#f1edf6" }} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  Generated: "bg-sky text-brick-blue",
  Printing: "bg-butter text-[#8a6d00]",
  Printed: "bg-peach text-[#b4471f]",
  Built: "bg-mint text-[#00753a]",
  Archived: "bg-ink/10 text-ink/60",
};

export function StatusChip({ status }: { status: Status }) {
  return <span className={clsx("chip", STATUS_STYLE[status])}>{status}</span>;
}

/** Brick confetti for celebrations (respects reduced motion). */
export function Confetti({ show, count = 36 }: { show: boolean; count?: number }) {
  const reduce = useReducedMotion();
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    if (show) setSeed((s) => s + 1);
  }, [show]);
  if (reduce) return null;
  const colours: string[] = [...Object.values(BRICK), "#FF9EC4", "#B4D2E3"];
  return (
    <AnimatePresence>
      {show && (
        <div key={seed} className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {Array.from({ length: count }).map((_, i) => {
            const x = Math.random() * 100;
            const c = colours[i % colours.length];
            return (
              <motion.div
                key={i}
                className="absolute top-0"
                style={{ left: `${x}%` }}
                initial={{ y: -40, rotate: 0, opacity: 1 }}
                animate={{ y: window.innerHeight + 60, rotate: (Math.random() - 0.5) * 720, x: (Math.random() - 0.5) * 160 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.8 + Math.random() * 1.2, ease: "easeIn", delay: Math.random() * 0.3 }}
              >
                <BrickIcon hex={c} w={Math.random() > 0.5 ? 2 : 1} size={18 + Math.random() * 10} />
              </motion.div>
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}

export function Toast({ message, action, onAction, onClose }: { message: string | null; action?: string; onAction?: () => void; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-ink px-5 py-3 font-semibold text-white shadow-squish">
          <span>{message}</span>
          {action && (
            <button className="rounded-xl bg-white/15 px-3 py-1" onClick={() => { onAction?.(); onClose(); }}>
              {action}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Card({ children, className, tint }: { children: ReactNode; className?: string; tint?: "mint" | "peach" | "butter" | "sky" | "cream" }) {
  const bg = tint ? { mint: "bg-mint", peach: "bg-peach", butter: "bg-butter", sky: "bg-sky", cream: "bg-cream" }[tint] : "bg-white";
  return <div className={clsx("rounded-squish p-5 shadow-squish", bg, className)}>{children}</div>;
}

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-[#3B3355]/25 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className={clsx("max-h-[90vh] w-full overflow-auto rounded-squish bg-cream p-6 shadow-squish", wide ? "max-w-3xl" : "max-w-md")}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
