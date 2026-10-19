import { Icon } from "@iconify/react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Avatar from "@/components/Avatar";
import ParentShell from "@/components/ParentShell";
import { BrickButton, BrickIcon, BrickProgress, Card, StatusChip } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { ColourInfo, InventoryLine, ProjectCard } from "@/lib/types";

interface Stats {
  counters: { projects: number; pieces_generated: number; pieces_printed: number; inventory: number; available: number; in_use: number; streak: number };
  week_over_week: Record<"projects" | "generated" | "printed", { this: number; last: number }>;
  weekly: { week: string; generated: number; printed: number }[];
  inventory_by_colour: (ColourInfo & { value: number })[];
  inventory_by_size: { size: string; value: number }[];
  favourite_colours: (ColourInfo & { value: number })[];
  statuses: Record<string, number>;
  spend: { month_usd: number; month_inr: number; cap_usd: number; total_usd: number; by_model: Record<string, number> };
}

interface Suggestions { count: number; items: { name: string; idea: string; emoji: string; parts: number; exact: boolean }[]; available_pieces: number }

function Delta({ now, before }: { now: number; before: number }) {
  const d = now - before;
  if (!before && !now) return <span className="text-xs font-semibold text-ink/40">—</span>;
  const pct = before ? Math.round((d / before) * 100) : 100;
  return (
    <span className={`text-xs font-bold ${d >= 0 ? "text-[#00843f]" : "text-brick-red"}`}>
      {d >= 0 ? "▲" : "▼"} {Math.abs(pct)}% vs last week
    </span>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const name = useStore((s) => s.settings?.child_name ?? "Aaradya");
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<ProjectCard[]>([]);
  const [sugg, setSugg] = useState<Suggestions | null>(null);
  const [inv, setInv] = useState<InventoryLine[]>([]);

  useEffect(() => {
    api.get<Stats>("/api/stats").then(setStats);
    api.get<ProjectCard[]>("/api/projects").then((p) => setRecent(p.slice(0, 6)));
    api.get<Suggestions>("/api/suggestions").then(setSugg).catch(() => undefined);
    api.get<{ items: InventoryLine[] }>("/api/inventory").then((r) => setInv(r.items));
  }, []);

  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const c = stats?.counters;
  const wow = stats?.week_over_week;

  return (
    <ParentShell title="Dashboard">
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* hero */}
          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="relative flex items-center gap-4 overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-mint via-sky to-peach p-6 shadow-squish">
            <Avatar pose="wave" size={160} bg={false} />
            <div className="flex-1">
              <div className="text-lg font-semibold text-ink/60">{hello},</div>
              <div className="text-4xl font-bold">{name}'s Brick Studio</div>
              <div className="mt-1 font-semibold text-ink/60">
                {wow ? `${wow.projects.this} new models this week · ${c?.streak ?? 0}-day streak 🔥` : "…"}
              </div>
            </div>
            <BrickButton colour="red" size="lg" onClick={() => nav("/make")}>
              <Icon icon="mdi:plus-thick" /> Make something new
            </BrickButton>
          </motion.div>

          {/* stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              { label: "Projects created", v: c?.projects, d: wow?.projects, icon: "mdi:cube-outline", tint: "bg-sky" },
              { label: "Pieces generated", v: c?.pieces_generated, d: wow?.generated, icon: "mdi:creation", tint: "bg-butter" },
              { label: "Pieces printed", v: c?.pieces_printed, d: wow?.printed, icon: "mdi:printer-3d-nozzle", tint: "bg-peach" },
              { label: "Bricks in inventory", v: c?.inventory, sub: `${c?.available ?? 0} free · ${c?.in_use ?? 0} in use`, icon: "mdi:toy-brick", tint: "bg-mint" },
              { label: "Day streak", v: c?.streak, sub: "days in a row", icon: "mdi:fire", tint: "bg-[#FFE0EE]" },
            ].map((s) => (
              <div key={s.label} className={`rounded-squish p-4 shadow-squish ${s.tint}`}>
                <Icon icon={s.icon} className="text-2xl text-ink/60" />
                <div className="mt-1 text-3xl font-bold">{s.v ?? "…"}</div>
                <div className="text-sm font-semibold text-ink/60">{s.label}</div>
                {s.d ? <Delta now={s.d.this} before={s.d.last} /> : <span className="text-xs font-semibold text-ink/40">{s.sub}</span>}
              </div>
            ))}
          </div>

          <Card>
            <BrickProgress value={c?.pieces_printed ?? 0} max={c?.pieces_generated ?? 0} segments={24}
              label={<><span>🖨️ Printed {c?.pieces_printed ?? 0} of {c?.pieces_generated ?? 0} generated pieces</span><span>🏁</span></>} />
          </Card>

          {/* charts */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 font-bold">Pieces generated vs printed (per week)</h3>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={stats?.weekly ?? []} barGap={4}>
                    <CartesianGrid vertical={false} stroke="#eee8f4" />
                    <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={30} />
                    <Tooltip cursor={{ fill: "#FFF8EE" }} />
                    <Legend />
                    <Bar dataKey="generated" name="Generated" fill="#0055BF" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="printed" name="Printed" fill="#FF7F1E" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <h3 className="mb-3 font-bold">Inventory by colour</h3>
              <div className="h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={stats?.inventory_by_colour ?? []} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="#fff" strokeWidth={3}>
                      {(stats?.inventory_by_colour ?? []).map((e) => <Cell key={e.code} fill={e.hex.toUpperCase() === "#FFFFFF" ? "#ECE7F3" : e.hex} />)}
                    </Pie>
                    <Tooltip />
                    <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <h3 className="mb-3 font-bold">Inventory by size</h3>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={stats?.inventory_by_size ?? []} layout="vertical" margin={{ left: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="size" tickLine={false} axisLine={false} width={90} fontSize={12} />
                    <Tooltip cursor={{ fill: "#FFF8EE" }} />
                    <Bar dataKey="value" name="Bricks" radius={[0, 8, 8, 0]}>
                      {(stats?.inventory_by_size ?? []).map((_, i) => <Cell key={i} fill={["#E3000B", "#FFD500", "#0055BF", "#00A650", "#FF7F1E"][i % 5]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <h3 className="mb-3 font-bold">{name}'s favourite colours</h3>
              <div className="flex h-56 items-end justify-around gap-2">
                {(stats?.favourite_colours ?? []).map((f) => {
                  const max = Math.max(...(stats?.favourite_colours ?? []).map((x) => x.value), 1);
                  return (
                    <div key={f.code} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-xs font-bold">{f.value}</span>
                      <motion.div initial={{ height: 0 }} animate={{ height: `${(f.value / max) * 150}px` }} className="w-full max-w-[44px] rounded-t-xl" style={{ background: f.hex, boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.12)" }} />
                      <span className="text-xs font-semibold text-ink/60">{f.kid_name}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* recently made */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Recently made</h3>
              <button className="btn-soft text-sm" onClick={() => nav("/parent/projects")}>See all</button>
            </div>
            <div className="divide-y divide-ink/5">
              {recent.map((p) => (
                <button key={p.id} onClick={() => nav(`/parent/projects/${p.id}`)} className="flex w-full items-center gap-4 py-3 text-left">
                  <img src={p.photo ?? p.thumbnail ?? ""} alt="" className="h-14 w-14 rounded-2xl bg-cream object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{p.name}</div>
                    <div className="truncate text-sm text-ink/50">“{p.request_text}” · {new Date(p.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="hidden gap-1 sm:flex">{p.colours.slice(0, 5).map((c) => <span key={c.code} className="h-3 w-3 rounded-full" style={{ background: c.hex }} />)}</div>
                  <span className="text-sm font-bold text-ink/60">{p.pieces} pcs</span>
                  <StatusChip status={p.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* right column */}
        <div className="flex flex-col gap-5">
          <Card tint="butter">
            <div className="flex items-center gap-2 text-lg font-bold"><BrickIcon hex="#E3000B" /> Build with my bricks!</div>
            <div className="mt-2 text-4xl font-bold">{sugg?.count ?? "…"}</div>
            <div className="text-sm font-semibold text-ink/60">things you can build right now from {sugg?.available_pieces ?? "…"} free bricks</div>
            <div className="mt-3 flex flex-col gap-2">
              {sugg?.items.map((s) => (
                <div key={s.name} className="flex items-center gap-3 rounded-2xl bg-white/70 p-2">
                  <span className="text-2xl">{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{s.name}</div>
                    <div className="truncate text-xs text-ink/50">{s.exact ? "checked: fits exactly" : s.idea}</div>
                  </div>
                  <span className="text-xs font-bold text-ink/50">~{s.parts}</span>
                </div>
              ))}
            </div>
            <BrickButton colour="yellow" className="mt-4 w-full" onClick={() => nav("/make?bricks=1")}>🧱 Build with my bricks</BrickButton>
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold">Brick inventory</h3>
              <button className="btn-soft text-sm" onClick={() => nav("/parent/inventory")}>Manage</button>
            </div>
            <InventoryPanel items={inv} />
          </Card>

          <Card tint="sky">
            <h3 className="font-bold">Claude spending this month</h3>
            <div className="mt-1 text-3xl font-bold">${stats?.spend.month_usd.toFixed(3) ?? "…"}</div>
            <div className="text-sm font-semibold text-ink/60">≈ ₹{stats?.spend.month_inr.toFixed(2)} · cap ${stats?.spend.cap_usd}</div>
            <div className="mt-3">
              <BrickProgress value={stats?.spend.month_usd ?? 0} max={stats?.spend.cap_usd || 1} segments={12} colours={["#00A650", "#FFD500", "#FF7F1E", "#E3000B"]} />
            </div>
            <div className="mt-2 text-xs text-ink/50">
              {Object.entries(stats?.spend.by_model ?? {}).map(([m, v]) => `${m}: $${v.toFixed(3)}`).join(" · ") || "No calls yet"}
            </div>
          </Card>

          <Card tint="mint">
            <h3 className="mb-2 font-bold">Statuses</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats?.statuses ?? {}).map(([s, n]) => (
                <span key={s} className="chip bg-white">{s}: {n}</span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </ParentShell>
  );
}

/** TurboTax-style panel that fills up with little brick icons per colour. */
function InventoryPanel({ items }: { items: InventoryLine[] }) {
  const byColour = new Map<number, { hex: string; name: string; available: number; owned: number }>();
  for (const i of items) {
    const e = byColour.get(i.colour.code) ?? { hex: i.colour.hex, name: i.colour.name, available: 0, owned: 0 };
    e.available += i.available;
    e.owned += i.owned;
    byColour.set(i.colour.code, e);
  }
  const rows = [...byColour.values()].sort((a, b) => b.owned - a.owned);
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const slots = 10;
        const filled = Math.round((Math.min(r.available, 60) / 60) * slots);
        return (
          <div key={r.name}>
            <div className="mb-1 flex justify-between text-xs font-bold text-ink/60">
              <span>{r.name}</span>
              <span>{r.available} of {r.owned}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: slots }).map((_, i) => <BrickIcon key={i} hex={r.hex} size={14} faded={i >= filled} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
