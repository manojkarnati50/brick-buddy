import { Icon } from "@iconify/react";
import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { stopSpeaking } from "@/lib/voice";
import { HoldButton, useParentGate } from "./ParentGate";
import { BrickButton } from "./ui";

/** Every kid screen: big home brick (top-left), safe padding from edges, grown-up hold button. */
export default function KidShell({ children, bg = "bg-cream", home = true }: { children: ReactNode; bg?: string; home?: boolean }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { require, gate } = useParentGate();

  // time limit: count minutes while the tab is visible
  useEffect(() => {
    if (loc.pathname === "/bedtime") return;
    const check = (u: { time_up: boolean }) => u.time_up && nav("/bedtime");
    api.get<{ time_up: boolean }>("/api/usage/today").then(check).catch(() => undefined);
    const t = setInterval(() => {
      if (document.visibilityState === "visible")
        api.post<{ time_up: boolean }>("/api/usage/ping", { seconds: 60 }).then(check).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(t);
  }, [loc.pathname, nav]);

  useEffect(() => () => stopSpeaking(), [loc.pathname]);

  return (
    <div className={`relative min-h-full ${bg} font-kid`}>
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 pb-8 pt-6 sm:px-10">
        {home && (
          <div className="mb-4 flex items-start justify-between">
            <BrickButton colour="red" size="lg" onClick={() => nav("/")} title="Home">
              <Icon icon="mdi:home-variant" className="text-4xl" />
            </BrickButton>
          </div>
        )}
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
      <div className="fixed bottom-4 right-4 opacity-70">
        <HoldButton label="Grown-ups: hold 3 s" onDone={() => require(() => nav("/parent"), { held: true })} />
      </div>
      {gate}
    </div>
  );
}
