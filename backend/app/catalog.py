"""Kid-safe part catalogue and LDraw colour table.

Footprints for bricks/plates/tiles come from LDraw Nova's verified
`ldraw_tools/data/rectangular-parts.json` (x_studs is the part's local X axis).
Slopes and rounds use their official LDraw footprints.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict

BRICK_H = 24.0  # LDU
PLATE_H = 8.0
STUD = 20.0


@dataclass(frozen=True)
class Part:
    id: str            # LDraw file name without .dat
    name: str          # friendly name ("2×4 brick")
    kind: str          # brick | plate | tile | slope | round | baseplate
    x: int             # studs along local X
    z: int             # studs along local Z
    height: float      # body height in LDU
    studs: bool = True
    kid: bool = True   # allowed in kid builds

    @property
    def dat(self) -> str:
        return f"{self.id}.dat"

    @property
    def plates(self) -> int:
        return int(round(self.height / PLATE_H))

    @property
    def size_label(self) -> str:
        a, b = sorted((self.x, self.z))
        return f"{a}×{b}"

    @property
    def size_group(self) -> str:
        if self.kind == "brick":
            return f"{self.size_label} brick"
        if self.kind in ("plate", "baseplate"):
            return "plates"
        if self.kind == "tile":
            return "tiles"
        if self.kind == "slope":
            return "slopes"
        return "round & special"

    def to_dict(self) -> dict:
        d = asdict(self)
        d.update(dat=self.dat, size_label=self.size_label, size_group=self.size_group, plates=self.plates)
        return d


_PARTS = [
    # bricks
    Part("3005", "1×1 brick", "brick", 1, 1, BRICK_H),
    Part("3004", "1×2 brick", "brick", 2, 1, BRICK_H),
    Part("3622", "1×3 brick", "brick", 3, 1, BRICK_H),
    Part("3010", "1×4 brick", "brick", 4, 1, BRICK_H),
    Part("3009", "1×6 brick", "brick", 6, 1, BRICK_H),
    Part("3008", "1×8 brick", "brick", 8, 1, BRICK_H),
    Part("3003", "2×2 brick", "brick", 2, 2, BRICK_H),
    Part("3002", "2×3 brick", "brick", 3, 2, BRICK_H),
    Part("3001", "2×4 brick", "brick", 4, 2, BRICK_H),
    Part("3007", "2×8 brick", "brick", 8, 2, BRICK_H),
    # plates
    Part("3024", "1×1 plate", "plate", 1, 1, PLATE_H),
    Part("3023b", "1×2 plate", "plate", 2, 1, PLATE_H),
    Part("3623", "1×3 plate", "plate", 3, 1, PLATE_H),
    Part("3710", "1×4 plate", "plate", 4, 1, PLATE_H),
    Part("3666", "1×6 plate", "plate", 6, 1, PLATE_H),
    Part("3022", "2×2 plate", "plate", 2, 2, PLATE_H),
    Part("3021", "2×3 plate", "plate", 3, 2, PLATE_H),
    Part("3020", "2×4 plate", "plate", 4, 2, PLATE_H),
    Part("3795", "2×6 plate", "plate", 6, 2, PLATE_H),
    Part("3034", "2×8 plate", "plate", 8, 2, PLATE_H),
    Part("3031", "4×4 plate", "plate", 4, 4, PLATE_H),
    Part("3032", "4×6 plate", "plate", 6, 4, PLATE_H),
    Part("3036", "6×8 plate", "plate", 8, 6, PLATE_H),
    # tiles (smooth tops; nothing can sit on them)
    Part("3070b", "1×1 tile", "tile", 1, 1, PLATE_H, studs=False),
    Part("3069b", "1×2 tile", "tile", 2, 1, PLATE_H, studs=False),
    Part("3068b", "2×2 tile", "tile", 2, 2, PLATE_H, studs=False),
    # slopes (roofs!). Slope runs along local Z.
    Part("3040", "1×2 roof slope", "slope", 1, 2, BRICK_H, studs=False),
    Part("3039", "2×2 roof slope", "slope", 2, 2, BRICK_H, studs=False),
    Part("3038", "2×3 roof slope", "slope", 3, 2, BRICK_H, studs=False),
    Part("3037", "2×4 roof slope", "slope", 4, 2, BRICK_H, studs=False),
    # rounds
    Part("3062b", "1×1 round brick", "round", 1, 1, BRICK_H),
    Part("4073", "1×1 round plate", "round", 1, 1, PLATE_H),
    Part("3941", "2×2 round brick", "round", 2, 2, BRICK_H),
    # big base (town / parent only)
    Part("91405", "16×16 base plate", "baseplate", 16, 16, PLATE_H, kid=False),
]

PARTS: dict[str, Part] = {p.id: p for p in _PARTS}


def part_id(ref: str) -> str:
    """'3001.dat' / 'parts/3001.DAT' -> '3001'."""
    ref = ref.replace("\\", "/").split("/")[-1].strip()
    return ref[:-4] if ref.lower().endswith(".dat") else ref


def get_part(ref: str) -> Part | None:
    return PARTS.get(part_id(ref).lower()) or PARTS.get(part_id(ref))


def kid_parts() -> list[Part]:
    return [p for p in _PARTS if p.kid]


@dataclass(frozen=True)
class Colour:
    code: int
    name: str
    hex: str
    kid_name: str


# Hex values follow LDraw LDConfig.ldr.
_COLOURS = [
    Colour(4, "Red", "#C91A09", "red"),
    Colour(13, "Pink", "#FC97AC", "pink"),
    Colour(5, "Dark Pink", "#C870A0", "dark pink"),
    Colour(14, "Yellow", "#F2CD37", "yellow"),
    Colour(25, "Orange", "#FE8A18", "orange"),
    Colour(1, "Blue", "#0055BF", "blue"),
    Colour(9, "Light Blue", "#B4D2E3", "light blue"),
    Colour(73, "Medium Blue", "#5A93DB", "sky blue"),
    Colour(2, "Green", "#237841", "green"),
    Colour(27, "Lime", "#BBE90B", "lime"),
    Colour(22, "Purple", "#81007B", "purple"),
    Colour(15, "White", "#FFFFFF", "white"),
    Colour(0, "Black", "#05131D", "black"),
    Colour(6, "Brown", "#583927", "brown"),
    Colour(19, "Tan", "#E4CD9E", "tan"),
    Colour(71, "Light Bluish Grey", "#A0A5A9", "grey"),
    Colour(70, "Reddish Brown", "#582A12", "wood brown"),
    Colour(10, "Bright Green", "#4B9F4A", "bright green"),
]

COLOURS: dict[int, Colour] = {c.code: c for c in _COLOURS}

# The 13 kid "paint pots" (spec §8), default printable set.
KID_PALETTE = [4, 13, 14, 25, 1, 9, 2, 27, 22, 15, 0, 6, 19]


def colour(code: int) -> Colour:
    return COLOURS.get(code) or Colour(code, f"Colour {code}", "#999999", f"colour {code}")


def colour_dict(code: int) -> dict:
    c = colour(code)
    return {"code": c.code, "name": c.name, "hex": c.hex, "kid_name": c.kid_name}


def colour_by_name(name: str) -> int | None:
    n = name.strip().lower().replace("_", " ")
    for c in _COLOURS:
        if n in (c.name.lower(), c.kid_name):
            return c.code
    return None
