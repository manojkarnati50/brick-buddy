import { useEffect, useState, type ReactNode } from "react";
import ParentShell from "@/components/ParentShell";
import { BrickButton, Card, Toast } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { PublicSettings } from "@/lib/types";

interface Full extends PublicSettings {
  monthly_cap_usd: number;
  calls_per_minute: number;
  calls_per_day: number;
  filament_g_per_cm3: number;
  infill: number;
  claude: boolean;
  sarvam: boolean;
  models: { quick: string; inventory: string; big: string };
}

export default function Settings() {
  const catalog = useStore((s) => s.catalog);
  const health = useStore((s) => s.health);
  const token = useStore((s) => s.parentToken);
  const setPublic = useStore((s) => s.setSettings);
  const [s, setS] = useState<Full | null>(null);
  const [spend, setSpend] = useState<{ month_usd: number; month_inr: number; total_usd: number } | null>(null);
  const [pin, setPin] = useState("");
  const [includePhotos, setIncludePhotos] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get<Full>("/api/settings/full").then(setS);
    api.get<{ spend: { month_usd: number; month_inr: number; total_usd: number } }>("/api/stats").then((r) => setSpend(r.spend));
  }, []);

  async function save(patch: Partial<Full>) {
    const next = await api.put<Full>("/api/settings", patch);
    setS(next);
    setPublic(await api.get<PublicSettings>("/api/settings"));
    setToast("Saved");
  }

  if (!s) return <ParentShell title="Settings"><div /></ParentShell>;

  return (
    <ParentShell title="Settings">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-lg font-bold">Kid mode</h3>
          <Row label="Child's name"><input className="input" defaultValue={s.child_name} onBlur={(e) => save({ child_name: e.target.value })} /></Row>
          <Row label="Sounds"><Toggle on={!s.mute} onChange={(v) => save({ mute: !v })} /></Row>
          <Row label="Voice (read aloud)"><Toggle on={s.voice_on} onChange={(v) => save({ voice_on: v })} /></Row>
          <Row label="Language">
            <select className="input" value={s.language} onChange={(e) => save({ language: e.target.value as Full["language"] })}>
              <option value="en">English</option><option value="te">Telugu</option><option value="both">Both</option>
            </select>
          </Row>
          <Row label="Voice engine">
            <select className="input" value={s.voice_provider} onChange={(e) => save({ voice_provider: e.target.value as Full["voice_provider"] })}>
              <option value="browser">Browser (Web Speech)</option>
              <option value="sarvam" disabled={!s.sarvam}>Sarvam AI (Telugu){s.sarvam ? "" : " — set SARVAM_API_KEY"}</option>
            </select>
          </Row>
          <Row label="Daily time limit (minutes, 0 = none)"><input className="input w-24" type="number" defaultValue={s.daily_minutes} onBlur={(e) => save({ daily_minutes: Number(e.target.value) })} /></Row>
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-bold">Claude & spending</h3>
          <div className="mb-3 rounded-2xl bg-sky p-3 text-sm font-semibold">
            {s.claude ? "✅ Claude connected" : "⚠️ No ANTHROPIC_API_KEY — using the offline starter builder"} · LDraw Nova: {health?.nova.library ? "✅" : health?.nova.installed ? "installed, no parts library" : "not installed (fallback builder)"}
            <div className="text-xs text-ink/60">Quick: {s.models.quick} · Inventory: {s.models.inventory} · Big: {s.models.big}</div>
          </div>
          <Row label="Monthly cap (USD)"><input className="input w-24" type="number" step="0.5" defaultValue={s.monthly_cap_usd} onBlur={(e) => save({ monthly_cap_usd: Number(e.target.value) })} /></Row>
          <div className="mb-3 text-sm text-ink/60">This month: ${spend?.month_usd.toFixed(4)} (≈ ₹{spend?.month_inr.toFixed(2)}) · all time ${spend?.total_usd.toFixed(4)}</div>
          <Row label="Calls per minute"><input className="input w-24" type="number" defaultValue={s.calls_per_minute} onBlur={(e) => save({ calls_per_minute: Number(e.target.value) })} /></Row>
          <Row label="Calls per day"><input className="input w-24" type="number" defaultValue={s.calls_per_day} onBlur={(e) => save({ calls_per_day: Number(e.target.value) })} /></Row>
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-bold">Build with my bricks</h3>
          <Row label="Mode">
            <select className="input" value={s.inventory_mode} onChange={(e) => save({ inventory_mode: e.target.value as Full["inventory_mode"] })}>
              <option value="strict">Strict — only what we have</option>
              <option value="mostly">Mostly mine — allow a few extra</option>
            </select>
          </Row>
          {s.inventory_mode === "mostly" && <Row label="Extra pieces allowed (N)"><input className="input w-24" type="number" defaultValue={s.mostly_extra} onBlur={(e) => save({ mostly_extra: Number(e.target.value) })} /></Row>}
          <Row label="Colour Studio: only colours in inventory"><Toggle on={s.only_inventory_colours} onChange={(v) => save({ only_inventory_colours: v })} /></Row>
          <div className="mt-2 text-sm font-semibold">Printable colours (paint pots)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {catalog?.colours.map((c) => {
              const on = s.printable_colours.includes(c.code);
              return (
                <button key={c.code} onClick={() => save({ printable_colours: on ? s.printable_colours.filter((x) => x !== c.code) : [...s.printable_colours, c.code] })}
                  className={`chip ${on ? "bg-ink text-white" : "bg-ink/5"}`}>
                  <span className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: c.hex }} />{c.name}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-bold">3D printing</h3>
          <Row label="Filament density (g/cm³)"><input className="input w-24" type="number" step="0.01" defaultValue={s.filament_g_per_cm3} onBlur={(e) => save({ filament_g_per_cm3: Number(e.target.value) })} /></Row>
          <Row label="Infill (0–1)"><input className="input w-24" type="number" step="0.05" defaultValue={s.infill} onBlur={(e) => save({ infill: Number(e.target.value) })} /></Row>
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-bold">Parent PIN</h3>
          <div className="flex gap-2">
            <input className="input w-32" inputMode="numeric" maxLength={4} placeholder="New PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <BrickButton colour="blue" size="sm" disabled={pin.length !== 4} onClick={async () => { await api.post("/api/auth/pin", { pin }); setPin(""); setToast("PIN changed"); }}>Change PIN</BrickButton>
          </div>
        </Card>

        <Card tint="peach">
          <h3 className="mb-3 text-lg font-bold">Backup</h3>
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
            Include photos & recordings (her avatar art, build photos, voice clips)
          </label>
          <div className="flex flex-wrap gap-2">
            <a className="btn-soft bg-white" href={`/api/backup/export?token=${token}&include_photos=${includePhotos}`}>⬇️ Export zip</a>
            <label className="btn-soft cursor-pointer bg-white">⬆️ Import zip
              <input type="file" accept=".zip" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f || !confirm("Importing replaces all current projects and inventory. Continue?")) return;
                const fd = new FormData();
                fd.append("file", f);
                const r = await api.form<{ projects: number }>("/api/backup/import", fd);
                setToast(`Imported ${r.projects} projects`);
              }} />
            </label>
          </div>
        </Card>
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </ParentShell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-ink/70">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`relative h-8 w-14 rounded-full transition ${on ? "bg-brick-green" : "bg-ink/15"}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}
