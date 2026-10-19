/**
 * Colour Studio state + palette. Painting only changes colour codes on LDraw lines,
 * so it is instant and never calls Claude (except "Surprise me").
 */
import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import { colourInfo } from "@/lib/store";
import type { Brick } from "@/lib/types";

export type Tool = "one" | "bucket" | "section" | "surprise";
export type ColourMap = Map<number, number>; // LDraw line -> colour code

export function mapFromBricks(bricks: Brick[]): ColourMap {
  const m = new Map<number, number>();
  for (const b of bricks) m.set(b.line, b.colour);
  return m;
}

export function diff(a: ColourMap, b: ColourMap) {
  const out: { line: number; colour: number }[] = [];
  for (const [line, c] of a) if (b.get(line) !== c) out.push({ line, colour: c });
  return out;
}

/** Undo-able paint state. */
export function usePaint(bricks: Brick[]) {
  const [colours, setColours] = useState<ColourMap>(() => mapFromBricks(bricks));
  const history = useRef<ColourMap[]>([]);
  const [, force] = useState(0);

  const reset = useCallback((m: ColourMap) => {
    history.current = [];
    setColours(new Map(m));
    force((n) => n + 1);
  }, []);

  const apply = useCallback((changes: { line: number; colour: number }[]) => {
    setColours((cur) => {
      if (!changes.some((c) => cur.get(c.line) !== c.colour)) return cur;
      history.current.push(cur);
      const next = new Map(cur);
      for (const c of changes) next.set(c.line, c.colour);
      return next;
    });
    force((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setColours(prev);
    force((n) => n + 1);
    return Boolean(prev);
  }, []);

  return { colours, apply, undo, reset, canUndo: history.current.length > 0 };
}

/** Lines a tap would paint for the current tool. */
export function targetLines(tool: Tool, tapped: Brick, bricks: Brick[], colours: ColourMap): number[] {
  if (tool === "bucket") {
    const c = colours.get(tapped.line);
    return [...new Set(bricks.filter((b) => colours.get(b.line) === c).map((b) => b.line))];
  }
  if (tool === "section") return [...new Set(bricks.filter((b) => b.section === tapped.section).map((b) => b.line))];
  return [tapped.line];
}

/**
 * Inventory check: after painting `lines` with `colour`, would any part+colour exceed what's available?
 * `available` is keyed "part:colour".
 */
export function fitsInventory(lines: number[], colour: number, bricks: Brick[], colours: ColourMap, available: Map<string, number>) {
  const next = new Map(colours);
  for (const l of lines) next.set(l, colour);
  const need = new Map<string, number>();
  for (const b of bricks) {
    const k = `${b.part}:${next.get(b.line) ?? b.colour}`;
    need.set(k, (need.get(k) ?? 0) + 1);
  }
  for (const b of bricks) {
    if (next.get(b.line) !== colour) continue;
    const k = `${b.part}:${colour}`;
    if ((need.get(k) ?? 0) > (available.get(k) ?? 0)) return false;
  }
  return true;
}

export function Palette({ palette, selected, onPick, locked, shake }: {
  palette: number[];
  selected: number;
  onPick: (c: number) => void;
  locked: Set<number>;
  shake: number | null;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {palette.map((code) => {
        const c = colourInfo(code);
        const isLocked = locked.has(code);
        return (
          <motion.button key={code} aria-label={c.kid_name} whileTap={{ scale: 0.85 }}
            animate={shake === code ? { x: [0, -8, 8, -6, 6, 0] } : selected === code ? { y: -8 } : { y: 0 }}
            onClick={() => onPick(code)}
            className="relative flex h-[88px] w-[88px] items-end justify-center rounded-b-[2.2rem] rounded-t-2xl shadow-brick"
            style={{ background: isLocked ? "#E7E3EE" : c.hex, outline: selected === code ? "5px solid #3B3355" : "none", outlineOffset: 3 }}>
            {/* paint-pot rim */}
            <span className="absolute -top-2 left-1 right-1 h-4 rounded-full" style={{ background: isLocked ? "#D7D2E0" : c.hex, filter: "brightness(1.15)" }} />
            {isLocked && <Icon icon="mdi:lock" className="mb-6 text-2xl text-ink/40" />}
          </motion.button>
        );
      })}
    </div>
  );
}

export function ToolButtons({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  const tools: { t: Tool; icon: string; label: string }[] = [
    { t: "one", icon: "🖌️", label: "One brick" },
    { t: "bucket", icon: "🪣", label: "Same colour" },
    { t: "section", icon: "🏠", label: "Part of the model" },
    { t: "surprise", icon: "🌈", label: "Surprise me" },
  ];
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {tools.map(({ t, icon, label }) => (
        <motion.button key={t} aria-label={label} title={label} whileTap={{ scale: 0.88 }}
          onClick={() => { sfx.click(); onTool(t); }}
          className={`flex h-[88px] w-[88px] items-center justify-center rounded-3xl text-5xl shadow-squish ${tool === t ? "bg-brick-yellow" : "bg-white"}`}>
          {icon}
        </motion.button>
      ))}
    </div>
  );
}

export function useLockedColours(palette: number[], bricks: Brick[], available: Map<string, number> | null) {
  return useMemo(() => {
    const out = new Set<number>();
    if (!available) return out;
    const parts = new Set(bricks.map((b) => b.part));
    for (const c of palette) {
      let any = false;
      for (const p of parts) if ((available.get(`${p}:${c}`) ?? 0) > 0) any = true;
      if (!any) out.add(c);
    }
    return out;
  }, [palette, bricks, available]);
}
