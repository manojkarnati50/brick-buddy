/**
 * Parent gate: press and HOLD the lock for 3 seconds, then type the 4-digit PIN.
 * A toddler won't hold still that long, and can't read the numbers prompt.
 */
import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Modal } from "./ui";

export function useParentGate() {
  const token = useStore((s) => s.parentToken);
  const [open, setOpen] = useState(false);
  const [alreadyHeld, setAlreadyHeld] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  /** `held`: the user already held a HoldButton for 3 s, so go straight to the PIN pad. */
  const require = (then: () => void, opts?: { held?: boolean }) => {
    if (useStore.getState().parentToken) then();
    else {
      pending.current = then;
      setAlreadyHeld(Boolean(opts?.held));
      setOpen(true);
    }
  };
  const gate = (
    <ParentGateModal
      open={open}
      skipHold={alreadyHeld}
      onClose={() => setOpen(false)}
      onUnlocked={() => {
        setOpen(false);
        pending.current?.();
        pending.current = null;
      }}
    />
  );
  return { unlocked: Boolean(token), require, gate };
}

export function HoldButton({ onDone, seconds = 3, label = "Grown-ups: hold" }: { onDone: () => void; seconds?: number; label?: string }) {
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState(false);
  const timer = useRef<number | null>(null);
  const start = useRef(0);
  const stop = () => {
    if (timer.current) {
      // let go too early: show a gentle "keep holding" hint
      if (performance.now() - start.current < seconds * 1000) {
        setHint(true);
        setTimeout(() => setHint(false), 2000);
      }
      cancelAnimationFrame(timer.current);
    }
    timer.current = null;
    setProgress(0);
  };
  const tick = () => {
    const p = Math.min(1, (performance.now() - start.current) / (seconds * 1000));
    setProgress(p);
    if (p >= 1) {
      stop();
      onDone();
    } else timer.current = requestAnimationFrame(tick);
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId); // keep the hold even if the finger drifts
        start.current = performance.now();
        setHint(false);
        timer.current = requestAnimationFrame(tick);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none", WebkitTouchCallout: "none" }}
      className="relative flex h-14 items-center gap-2 overflow-hidden rounded-full bg-white/80 px-4 text-sm font-semibold text-ink/50 shadow-squish"
    >
      <motion.span className="absolute inset-y-0 left-0 bg-mint" style={{ width: `${progress * 100}%` }} />
      <Icon icon="mdi:lock-outline" className="relative text-xl" />
      <span className="relative">{hint ? "Keep holding for 3 seconds…" : progress > 0 ? `Hold… ${Math.ceil(seconds - progress * seconds)}` : label}</span>
    </button>
  );
}

function ParentGateModal({ open, onClose, onUnlocked, skipHold }: { open: boolean; onClose: () => void; onUnlocked: () => void; skipHold?: boolean }) {
  const [held, setHeld] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const setToken = useStore((s) => s.setParentToken);

  useEffect(() => {
    if (open) setHeld(Boolean(skipHold));
    else {
      setHeld(false);
      setPin("");
      setError("");
    }
  }, [open, skipHold]);

  const unlockedRef = useRef(onUnlocked);
  unlockedRef.current = onUnlocked;
  useEffect(() => {
    if (pin.length !== 4) return;
    const attempt = pin;
    setPin("");
    api
      .post<{ token: string }>("/api/auth/parent", { pin: attempt })
      .then((r) => {
        setToken(r.token);
        unlockedRef.current();
      })
      .catch((e: Error) => setError(e.message));
  }, [pin, setToken]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-5 text-center">
        <Icon icon="mdi:account-lock-outline" className="text-5xl text-brick-blue" />
        {!held ? (
          <>
            <p className="font-semibold text-ink/70">For grown-ups. Press and hold for 3 seconds.</p>
            <HoldButton onDone={() => setHeld(true)} label="Hold to continue" />
          </>
        ) : (
          <>
            <p className="font-semibold text-ink/70">Enter your 4-digit PIN</p>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-4 w-4 rounded-full" style={{ background: i < pin.length ? "#0055BF" : "#E5E0EE" }} />
              ))}
            </div>
            {error && <p className="text-sm font-semibold text-brick-red">{error}</p>}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) =>
                k === "" ? (
                  <span key="blank" />
                ) : (
                  <button key={k} type="button" className="h-16 w-16 rounded-2xl bg-white text-2xl font-bold shadow-squish active:scale-95"
                    onClick={() => (k === "⌫" ? setPin((p) => p.slice(0, -1)) : setPin((p) => (p.length < 4 ? p + k : p)))}>
                    {k}
                  </button>
                ),
              )}
            </div>
          </>
        )}
        <button className="text-sm font-semibold text-ink/50" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
