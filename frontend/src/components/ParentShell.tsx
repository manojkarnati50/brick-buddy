import { Icon } from "@iconify/react";
import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import Avatar from "./Avatar";
import { useParentGate } from "./ParentGate";

const NAV = [
  { to: "/parent", label: "Dashboard", icon: "mdi:view-dashboard-outline", colour: "#E3000B", end: true },
  { to: "/parent/projects", label: "Projects", icon: "mdi:cube-outline", colour: "#FFD500" },
  { to: "/parent/inventory", label: "Inventory", icon: "mdi:toy-brick-outline", colour: "#0055BF" },
  { to: "/parent/print", label: "Print queue", icon: "mdi:printer-3d-nozzle-outline", colour: "#FF7F1E" },
  { to: "/parent/big", label: "Big Builds", icon: "mdi:star-four-points-outline", colour: "#00A650" },
  { to: "/parent/avatar", label: "Avatar Studio", icon: "mdi:face-woman-shimmer-outline", colour: "#FF9EC4" },
  { to: "/parent/settings", label: "Settings", icon: "mdi:cog-outline", colour: "#8E7CC3" },
];

export default function ParentShell({ children, title, actions }: { children: ReactNode; title: string; actions?: ReactNode }) {
  const token = useStore((s) => s.parentToken);
  const setToken = useStore((s) => s.setParentToken);
  const name = useStore((s) => s.settings?.child_name ?? "Aaradya");
  const nav = useNavigate();
  const { require, gate } = useParentGate();

  useEffect(() => {
    if (!token) require(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token)
    return (
      <div className="flex min-h-full items-center justify-center bg-cream">
        <button className="btn-soft" onClick={() => nav("/")}>Back to kid mode</button>
        {gate}
      </div>
    );

  return (
    <div className="flex min-h-full bg-cream font-kid">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-2 p-5 lg:flex">
        <div className="mb-4 flex flex-col items-center gap-2 rounded-squish bg-white p-4 shadow-squish">
          <Avatar pose="hips" size={96} portrait />
          <div className="text-lg font-bold">{name}'s Bricks</div>
          <div className="text-xs font-semibold text-ink/50">Parent mode</div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => clsx("flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition", isActive ? "bg-white shadow-squish" : "text-ink/60 hover:bg-white/60")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: n.colour }}>
              <Icon icon={n.icon} className="text-xl" />
            </span>
            {n.label}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-2">
          <button className="btn-soft flex items-center gap-2" onClick={() => nav("/")}>
            <Icon icon="mdi:human-child" /> Kid mode
          </button>
          <button className="btn-soft flex items-center gap-2" onClick={() => { setToken(null); nav("/"); }}>
            <Icon icon="mdi:lock" /> Lock
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 lg:hidden">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: n.colour }} title={n.label}>
                  <Icon icon={n.icon} />
                </NavLink>
              ))}
            </div>
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
        {children}
      </main>
    </div>
  );
}
