import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Avatar from "./components/Avatar";
import { api } from "./lib/api";
import { useStore } from "./lib/store";
import type { Catalog, Health, PublicSettings } from "./lib/types";
import AvatarStudio from "./pages/kid/AvatarStudio";
import Bedtime from "./pages/kid/Bedtime";
import Create from "./pages/kid/Create";
import Games from "./pages/kid/Games";
import Guide from "./pages/kid/Guide";
import KidHome from "./pages/kid/Home";
import KidModel from "./pages/kid/Model";
import MyModels from "./pages/kid/MyModels";
import Stickers from "./pages/kid/Stickers";
import Story from "./pages/kid/Story";
import Town from "./pages/kid/Town";
import BigBuilds from "./pages/parent/BigBuilds";
import Dashboard from "./pages/parent/Dashboard";
import Inventory from "./pages/parent/Inventory";
import PrintQueue from "./pages/parent/PrintQueue";
import ProjectDetail from "./pages/parent/ProjectDetail";
import Projects from "./pages/parent/Projects";
import Settings from "./pages/parent/Settings";

export default function App() {
  const { setSettings, setCatalog, setHealth, setAvatarArt } = useStore();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<PublicSettings>("/api/settings").then(setSettings),
      api.get<Catalog>("/api/catalog").then(setCatalog),
      api.get<Health>("/api/health").then(setHealth),
      api.get<Record<string, string>>("/api/avatar/art").then(setAvatarArt),
    ])
      .then(() => setReady(true))
      .catch(() => setError(true));
  }, [setSettings, setCatalog, setHealth, setAvatarArt]);

  if (!ready)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-cream font-kid">
        <Avatar pose={error ? "pout" : "think"} size={200} />
        <p className="text-xl font-semibold text-ink/60">{error ? "Brick Buddy is waking up… is the server running?" : "Getting the bricks ready…"}</p>
      </div>
    );

  return (
    <Routes>
      <Route path="/" element={<KidHome />} />
      <Route path="/make" element={<Create />} />
      <Route path="/model/:id" element={<KidModel />} />
      <Route path="/my" element={<MyModels />} />
      <Route path="/town" element={<Town />} />
      <Route path="/guide/:id" element={<Guide />} />
      <Route path="/games" element={<Games />} />
      <Route path="/story" element={<Story />} />
      <Route path="/stickers" element={<Stickers />} />
      <Route path="/me" element={<AvatarStudio />} />
      <Route path="/bedtime" element={<Bedtime />} />
      <Route path="/parent" element={<Dashboard />} />
      <Route path="/parent/projects" element={<Projects />} />
      <Route path="/parent/projects/:id" element={<ProjectDetail />} />
      <Route path="/parent/inventory" element={<Inventory />} />
      <Route path="/parent/print" element={<PrintQueue />} />
      <Route path="/parent/big" element={<BigBuilds />} />
      <Route path="/parent/avatar" element={<AvatarStudio parent />} />
      <Route path="/parent/settings" element={<Settings />} />
      <Route path="*" element={<KidHome />} />
    </Routes>
  );
}
