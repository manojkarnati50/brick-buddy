export type Status = "Generated" | "Printing" | "Printed" | "Built" | "Archived";

export interface ColourInfo {
  code: number;
  name: string;
  hex: string;
  kid_name: string;
}

export interface ProjectCard {
  id: number;
  name: string;
  status: Status;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  photo: string | null;
  pieces: number;
  favourite: boolean;
  from_inventory: boolean;
  version: number;
  model_used: string;
  cost_usd: number;
  source: string;
  narration: string;
  request_text: string;
  request_audio: string | null;
  colours: (ColourInfo & { count: number })[];
}

export interface BomLine {
  part: string;
  dat: string;
  name: string;
  kind: string;
  size: string;
  size_group: string;
  height: string;
  colour: ColourInfo;
  quantity: number;
  printed?: number;
  have: number;
  need: number;
}

export interface Version {
  version: number;
  thumbnail: string | null;
  created_by: string;
  created_at: string;
  note: string;
  pieces: number;
}

export interface ProjectDetail extends ProjectCard {
  bom: BomLine[];
  have: number;
  need: number;
  versions: Version[];
  mpd_url: string | null;
}

export interface Brick {
  uid: number;
  line: number;
  part: string;
  colour: number;
  pos: [number, number, number];
  matrix: number[];
  section: string;
  step: number;
  bbox: [number, number, number, number, number, number];
  known: boolean;
  dims: [number, number, number] | null;
  kind: string;
}

export interface ModelData {
  id: number;
  name: string;
  bricks: Brick[];
  sections: string[];
  steps: number;
  mpd: string;
}

export interface Part {
  id: string;
  name: string;
  kind: string;
  x: number;
  z: number;
  height: number;
  studs: boolean;
  size_label: string;
  size_group: string;
}

export interface Catalog {
  parts: Part[];
  colours: ColourInfo[];
  kid_palette: number[];
}

export interface AvatarConfig {
  style?: "photo" | "cartoon"; // photo = her real photos (background removed), cartoon = layered SVG
  outfit: "cherry" | "hoodie" | "party" | "raincoat" | "princess" | "astronaut";
  accessory: "none" | "bow" | "flower" | "headband" | "crown";
  headphones: boolean;
  background: string;
  brick_colour: number;
}

export interface PublicSettings {
  mute: boolean;
  voice_on: boolean;
  language: "en" | "te" | "both";
  voice_provider: "browser" | "sarvam";
  daily_minutes: number;
  printable_colours: number[];
  only_inventory_colours: boolean;
  avatar: AvatarConfig;
  child_name: string;
  inventory_mode: "strict" | "mostly";
  mostly_extra: number;
}

export interface Health {
  ok: boolean;
  claude: boolean;
  ldraw_library: boolean;
  sarvam: boolean;
  nova: { installed: boolean; library: boolean; error: string };
}

export interface InventoryLine extends Omit<BomLine, "have" | "need"> {
  owned: number;
  in_use: number;
  available: number;
  low: boolean;
}

export type Pose = "wave" | "think" | "jump" | "hug" | "pout" | "bike" | "hips";
