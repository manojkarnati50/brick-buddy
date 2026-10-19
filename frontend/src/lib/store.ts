import { create } from "zustand";
import type { AvatarConfig, Catalog, ColourInfo, Health, PublicSettings } from "./types";

const TOKEN_KEY = "bb.parentToken";

function readToken(): string | null {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    const exp = Number(t.split(".")[0]);
    return exp * 1000 > Date.now() ? t : null;
  } catch {
    return null;
  }
}

interface State {
  settings: PublicSettings | null;
  catalog: Catalog | null;
  health: Health | null;
  avatarArt: Record<string, string>;
  parentToken: string | null;
  setSettings: (s: PublicSettings) => void;
  setAvatar: (a: AvatarConfig) => void;
  setCatalog: (c: Catalog) => void;
  setHealth: (h: Health) => void;
  setAvatarArt: (a: Record<string, string>) => void;
  setParentToken: (t: string | null) => void;
}

export const useStore = create<State>((set) => ({
  settings: null,
  catalog: null,
  health: null,
  avatarArt: {},
  parentToken: readToken(),
  setSettings: (settings) => set({ settings }),
  setAvatar: (avatar) => set((st) => (st.settings ? { settings: { ...st.settings, avatar } } : {})),
  setCatalog: (catalog) => set({ catalog }),
  setHealth: (health) => set({ health }),
  setAvatarArt: (avatarArt) => set({ avatarArt }),
  setParentToken: (parentToken) => {
    try {
      if (parentToken) sessionStorage.setItem(TOKEN_KEY, parentToken);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
    set({ parentToken });
  },
}));

export function colourInfo(code: number): ColourInfo {
  const c = useStore.getState().catalog?.colours.find((c) => c.code === code);
  return c ?? { code, name: `Colour ${code}`, hex: "#999999", kid_name: "colour" };
}

export function useColour() {
  const catalog = useStore((s) => s.catalog);
  return (code: number): ColourInfo =>
    catalog?.colours.find((c) => c.code === code) ?? { code, name: `Colour ${code}`, hex: "#999999", kid_name: "colour" };
}
