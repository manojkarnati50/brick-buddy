import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Avatar from "@/components/Avatar";
import BrickViewer from "@/components/BrickViewer";
import { diff, fitsInventory, mapFromBricks, Palette, targetLines, ToolButtons, useLockedColours, usePaint, type ColourMap, type Tool } from "@/components/ColourStudio";
import KidShell from "@/components/KidShell";
import { useParentGate } from "@/components/ParentGate";
import { BrickButton, BrickProgress, Confetti, Modal } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { colourInfo, useStore } from "@/lib/store";
import type { Brick, InventoryLine, ModelData, ProjectDetail } from "@/lib/types";
import { speak } from "@/lib/voice";

export default function KidModel() {
  const { id } = useParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [model, setModel] = useState<ModelData | null>(null);
  const [original, setOriginal] = useState<ColourMap | null>(null);
  const [available, setAvailable] = useState<Map<string, number> | null>(null);
  const [availableTotal, setAvailableTotal] = useState(0);
  const load = useCallback(async () => {
    const [p, m, v1] = await Promise.all([
      api.get<ProjectDetail>(`/api/projects/${id}`),
      api.get<ModelData>(`/api/projects/${id}/model`),
      api.get<ModelData>(`/api/projects/${id}/model?version=1`),
    ]);
    setProject(p);
    setModel(m);
    setOriginal(mapFromBricks(v1.bricks));
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const settings = useStore((s) => s.settings);
  const inventoryMode = Boolean(project?.from_inventory || settings?.only_inventory_colours);
  useEffect(() => {
    if (!inventoryMode) return;
    api.get<{ items: InventoryLine[]; totals: { available: number } }>("/api/inventory").then((r) => {
      setAvailable(new Map(r.items.map((i) => [`${i.part}:${i.colour.code}`, i.available])));
      setAvailableTotal(r.totals.available);
    });
  }, [inventoryMode, project?.id]);

  if (!project || !model || !original)
    return (
      <KidShell>
        <div className="flex flex-1 items-center justify-center">
          <Avatar pose="think" size={220} />
        </div>
      </KidShell>
    );
  return <Studio key={`${project.id}`} project={project} model={model} original={original} available={inventoryMode ? available : null} availableTotal={availableTotal} reload={load} />;
}

function Studio({ project, model, original, available, availableTotal, reload }: {
  project: ProjectDetail;
  model: ModelData;
  original: ColourMap;
  available: Map<string, number> | null;
  availableTotal: number;
  reload: () => Promise<void>;
}) {
  const nav = useNavigate();
  const settings = useStore((s) => s.settings);
  const palette = settings?.printable_colours ?? [4, 13, 14, 25, 1, 9, 2, 27, 22, 15, 0, 6, 19];
  const { colours, apply, undo, reset } = usePaint(model.bricks);
  const saved = useRef<ColourMap>(mapFromBricks(model.bricks));
  const [tool, setTool] = useState<Tool>("one");
  const [paint, setPaint] = useState<number>(settings?.avatar.brick_colour ?? 13);
  const [highlight, setHighlight] = useState<Set<number>>(new Set());
  const [shake, setShake] = useState<number | null>(null);
  const [askCopy, setAskCopy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [painting, setPainting] = useState(false);
  const locked = useLockedColours(palette, model.bricks, available);
  const { require, gate } = useParentGate();
  const printed = ["Printed", "Built", "Printing"].includes(project.status);

  useEffect(() => {
    void speak(project.narration || project.name);
  }, [project.narration, project.name]);

  // ---- autosave: every pause in painting becomes a new version (never lose her work) ----
  const saveTimer = useRef<number | null>(null);
  const save = useCallback(async (asCopy = false) => {
    const changes = diff(colours, saved.current);
    if (!changes.length) return;
    try {
      const r = await api.post<ProjectDetail>(`/api/projects/${project.id}/recolour`, { changes, created_by: "Aaradya painted", as_copy: asCopy });
      saved.current = new Map(colours);
      if (asCopy) nav(`/model/${r.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setAskCopy(true);
    }
  }, [colours, project.id, nav]);
  useEffect(() => {
    if (printed || !painting) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 3000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [colours, save, printed, painting]);
  // save immediately when leaving the page
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => void (!printed && saveRef.current()), [printed]);

  const onTap = (b: Brick) => {
    if (tool === "surprise") return void surprise();
    const lines = targetLines(tool, b, model.bricks, colours);
    if (available && !fitsInventory(lines, paint, model.bricks, colours, available)) {
      sfx.boop();
      setShake(paint);
      setTimeout(() => setShake(null), 500);
      void speak(`We don't have enough ${colourInfo(paint).kid_name} bricks. Let's pick another colour!`);
      return;
    }
    sfx.splash();
    setPainting(true);
    apply(lines.map((line) => ({ line, colour: paint })));
    setHighlight(new Set(model.bricks.filter((x) => lines.includes(x.line)).map((x) => x.uid)));
    setTimeout(() => setHighlight(new Set()), 1200);
    if (printed) setAskCopy(true);
  };

  async function surprise() {
    if (busy) return;
    setBusy(true);
    sfx.pop();
    void speak("Ooh, a surprise!");
    try {
      const r = await api.post<{ scheme: string; say: string; changes: { line: number; colour: number }[] }>(`/api/projects/${project.id}/surprise-colours`, {});
      const ok = r.changes.filter((c) => !available || fitsInventory([c.line], c.colour, model.bricks, colours, available));
      setPainting(true);
      apply(ok);
      sfx.cheer();
      void speak(`${r.scheme}! ${r.say}`);
    } finally {
      setBusy(false);
      setTool("one");
    }
  }

  const pick = (c: number) => {
    if (locked.has(c)) {
      sfx.boop();
      setShake(c);
      setTimeout(() => setShake(null), 500);
      return;
    }
    sfx.pop();
    setPaint(c);
    void speak(colourInfo(c).kid_name);
    if (tool === "surprise") setTool("one");
  };

  async function weBuiltIt() {
    sfx.cheer();
    setCelebrate(true);
    void speak("Hooray! You built it! You're the builder!");
    await api.post(`/api/projects/${project.id}/built`);
    setTimeout(() => setCelebrate(false), 3500);
    await reload();
  }

  async function takeApart() {
    sfx.snap();
    await api.post(`/api/projects/${project.id}/take-apart`);
    void speak("All the bricks are back in the box!");
    await reload();
  }

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of model.bricks) m.set(colours.get(b.line) ?? b.colour, (m.get(colours.get(b.line) ?? b.colour) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [colours, model.bricks]);

  return (
    <KidShell>
      <Confetti show={celebrate} />
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar pose={celebrate ? "jump" : "hips"} size={90} />
            <div className="text-4xl font-bold">{project.name}</div>
            {project.from_inventory && <span className="chip bg-butter text-ink">🧱 my bricks</span>}
          </div>
          <div className="relative h-[52vh] min-h-[340px] overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-sky to-cream shadow-squish">
            <BrickViewer models={[{ bricks: model.bricks }]} colours={colours} onTap={onTap} highlight={highlight} />
            <div className="pointer-events-none absolute bottom-3 left-3 flex gap-1">
              {counts.map(([c, n]) => (
                <span key={c} className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-sm font-bold">
                  <span className="h-4 w-4 rounded-full" style={{ background: colourInfo(c).hex }} />×{n}
                </span>
              ))}
            </div>
          </div>
          {available && (
            <BrickProgress value={model.bricks.length} max={Math.max(availableTotal, model.bricks.length)} label={<><span>🧱 {model.bricks.length}</span><span>{availableTotal}</span></>} />
          )}
          <Palette palette={palette} selected={paint} onPick={pick} locked={locked} shake={shake} />
        </div>

        <div className="flex flex-row flex-wrap content-start justify-center gap-4 lg:w-[220px] lg:flex-col">
          <ToolButtons tool={tool} onTool={(t) => (t === "surprise" ? void surprise() : setTool(t))} />
          <div className="flex gap-3">
            <BrickButton colour="blue" size="lg" onClick={() => { if (undo()) { sfx.pop(); setPainting(true); } else sfx.boop(); }} title="Undo">
              <Icon icon="mdi:undo-variant" className="text-4xl" />
            </BrickButton>
            <BrickButton colour="orange" size="lg" onClick={() => { setPainting(true); apply(diff(original, colours)); sfx.pop(); void speak("Back to the start!"); }} title="Start again">
              <Icon icon="mdi:restore" className="text-4xl" />
            </BrickButton>
          </div>
          {project.status === "Built" ? (
            <BrickButton colour="yellow" size="lg" onClick={takeApart} title="Take it apart">🔨</BrickButton>
          ) : (project.status === "Printed" || project.from_inventory) && (
            <BrickButton colour="green" size="xl" sound="none" onClick={weBuiltIt} title="We built it!">🏆</BrickButton>
          )}
          <div className="flex gap-3">
            <BrickButton colour="#C77DFF" size="lg" onClick={() => nav(`/guide/${project.id}`)} title="Build steps">👣</BrickButton>
            <BrickButton colour="#FF4F9A" size="lg" onClick={() => nav(`/story?project=${project.id}`)} title="Story">📖</BrickButton>
          </div>
        </div>
      </div>

      <Modal open={askCopy} onClose={() => { setAskCopy(false); reset(saved.current); }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar pose="think" size={140} />
          <p className="text-xl font-bold">This one is already printed!</p>
          <p className="text-ink/60">Ask a grown-up to save your new colours as a new copy.</p>
          <div className="flex gap-4">
            <BrickButton colour="green" size="lg" onClick={() => require(() => { setAskCopy(false); void save(true); })}>✔</BrickButton>
            <BrickButton colour="red" size="lg" onClick={() => { setAskCopy(false); reset(saved.current); }}>✖</BrickButton>
          </div>
        </div>
      </Modal>
      {gate}
    </KidShell>
  );
}
