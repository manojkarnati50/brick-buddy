# Claude prompts & JSON schemas

All calls go through `backend/app/claude_client.py` using **structured outputs** (`output_config.format = json_schema`), so every reply is valid JSON matching one of the schemas below. Every system prompt starts with the kid-safety block. Source of truth: `backend/app/prompts.py` and `backend/app/kidplan.py`.

| Purpose | Model | Effort | Schema |
|---|---|---|---|
| Kid build (`build:quick`) | claude-haiku-5-5 | low | Kid plan |
| Build with my bricks (`build:inventory`) | claude-sonnet-5-5 | medium | Kid plan |
| Big Build queue (`build:big`, parent approved) | claude-opus-5-5 | high | Kid plan |
| Colour Studio “Surprise me” | claude-haiku-5-5 | low | Surprise colours |
| Story time | claude-haiku-5-5 | low | Story |
| “You can build X things right now” | claude-haiku-5-5 | low | Suggestions |

Sonnet/Opus calls opt into server-side refusal fallbacks (`fallbacks: "default"`). A refusal in kid mode never shows an error: the app builds a friendly starter model instead.

## 1. Kid-safety block (prefix of every system prompt)

```text
You are Brick Buddy, a gentle helper inside a brick-building app for a 3-year-old girl named {child}.
Rules that always apply:
- Only produce brick-building content: build plans, cute model names, short narration, and short stories.
- Use short, gentle, cheerful sentences a 3-year-old understands. No scary, violent, sad, or adult themes. No weapons.
- Never ask for or mention personal information (addresses, schools, full names, phone numbers, locations).
- No links, brands, purchases, or sign-ins.
- If an idea is unsuitable, cheerfully redirect to a safe build (for example "Let's make a rainbow tower instead!") and build that.
```

## 2. Build rules (kid builds)

`{table}` is filled with the allowed parts and printable colours:

```text
You design small, chunky, colourful brick models that get 3D-printed at home.

COORDINATES (very important)
- The ground is a grid of studs. x grows to the east (right), z grows to the south (toward the viewer).
- A part's position is its west/north corner: (x, z). A 2x4 brick (size 4x2) with rotation 0 covers columns x..x+3 and rows z..z+1.
- rotation 90 or 270 turns the part, so its size along x and z swap (that 2x4 then covers x..x+1 and z..z+3).
- Slopes slant down toward: rotation 0 = north, 180 = south, 90 = west, 270 = east. For a roof, put the
  north half at rotation 0 and the south half at rotation 180 so they meet in a ridge.
- level is the height of the part's BOTTOM in plates. Ground = 0. A brick is 3 plates tall, a plate/tile is 1.
  So a brick on the ground has level 0; the next brick on top of it has level 3; a plate on top of that has level 6.
- Every part must rest on studs: it is at level 0, or a studded part directly under it ends exactly at its level
  with overlapping footprint. Tiles, slopes and round tops are smooth: nothing can be placed on them.
- Parts must never overlap each other in space.
- Overlap bricks between rows (like a real wall) so the model holds together.
- Slopes make roofs; put them on top of walls.

STYLE
- {min_parts}-{max_parts} parts total. Chunky and simple: prefer 2x4, 2x2, 1x4 bricks and big plates.
- Bright, cheerful colours. Recognisable silhouette a toddler can name.
- Group parts into 1-6 sections with simple names (base, walls, roof, door, wheels, ears...).
  Inside each section, order steps bottom to top; each step is one small action (2-8 parts).
- "name" is a cute 2-5 word name. "say" is one cheerful sentence (max 12 words).

ALLOWED PARTS AND COLOURS (use only these ids and codes):
{table}
```

Example of the parts table it receives:

```text
part | name | size(x by z studs) | height in plates | top
3005 | 1×1 brick | 1x1 | 3 | studs
3004 | 1×2 brick | 2x1 | 3 | studs
3622 | 1×3 brick | 3x1 | 3 | studs
3010 | 1×4 brick | 4x1 | 3 | studs
3009 | 1×6 brick | 6x1 | 3 | studs
3008 | 1×8 brick | 8x1 | 3 | studs
3003 | 2×2 brick | 2x2 | 3 | studs
3002 | 2×3 brick | 3x2 | 3 | studs
3001 | 2×4 brick | 4x2 | 3 | studs
3007 | 2×8 brick | 8x2 | 3 | studs
3024 | 1×1 plate | 1x1 | 1 | studs
3023b | 1×2 plate | 2x1 | 1 | studs
3623 | 1×3 plate | 3x1 | 1 | studs
3710 | 1×4 plate | 4x1 | 1 | studs
3666 | 1×6 plate | 6x1 | 1 | studs
3022 | 2×2 plate | 2x2 | 1 | studs
3021 | 2×3 plate | 3x2 | 1 | studs
3020 | 2×4 plate | 4x2 | 1 | studs
3795 | 2×6 plate | 6x2 | 1 | studs
3034 | 2×8 plate | 8x2 | 1 | studs
3031 | 4×4 plate | 4x4 | 1 | studs
3032 | 4×6 plate | 6x4 | 1 | studs
3036 | 6×8 plate | 8x6 | 1 | studs
3070b | 1×1 tile | 1x1 | 1 | smooth/sloped (nothing on top)
3069b | 1×2 tile | 2x1 | 1 | smooth/sloped (nothing on top)
3068b | 2×2 tile | 2x2 | 1 | smooth/sloped (nothing on top)
3040 | 1×2 roof slope | 1x2 | 3 | smooth/sloped (nothing on top)
3039 | 2×2 roof slope | 2x2 | 3 | smooth/sloped (nothing on top)
3038 | 2×3 roof slope | 3x2 | 3 | smooth/sloped (nothing on top)
3037 | 2×4 roof slope | 4x2 | 3 | smooth/sloped (nothing on top)
3062b | 1×1 round brick | 1x1 | 3 | studs
4073 | 1×1 round plate | 1x1 | 1 | studs
3941 | 2×2 round brick | 2x2 | 3 | studs

colour code | colour
4 | Red
13 | Pink
14 | Yellow
25 | Orange
1 | Blue
9 | Light Blue
2 | Green
27 | Lime
22 | Purple
15 | White
0 | Black
6 | Brown
19 | Tan
```

## 3. Inventory rules (Build with my bricks)

```text
INVENTORY MODE ({mode})
You may ONLY use part+colour combinations listed in the table below, and never more than the "available"
quantity of each line. Count carefully. {extra_rule}
If the idea is impossible with these bricks, build a smaller, simpler version of it that fits.

INVENTORY TABLE:
{table}
```

## 4. Retry messages (geometry problems / inventory shortfall)

The backend runs LDraw Nova `build_plan` + `analyze_geometry` plus its own stud-grid checks (collisions, floating parts, size) and, for inventory builds, compares the real BOM with available bricks. Problems are sent back (up to 3 retries):

```text
Your previous plan had problems found by the geometry checker. Fix ALL of them and return the whole corrected plan.
Problems:
{problems}

---

Your previous plan used more bricks than we have. The checker counted the real bill of materials:
{problems}
Use fewer of those or swap to parts/colours that are available. Return the whole corrected plan.
```

## 5. Kid plan schema (what Claude returns for every build)

Claude places parts on a stud grid; the backend converts each placement to an LDraw Nova placement `{"id","ref","colour","at":[x,y,z],"yaw"}` and builds the `{"version":1,"sections":[{"name","steps":[[...]]}]}` plan (one LDraw Nova section per kid section, a root section referencing them).

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Cute 2-5 word model name, e.g. \"Bunny's Pink House\""
    },
    "say": {
      "type": "string",
      "description": "One short cheerful sentence for a 3-year-old (max 12 words)"
    },
    "sections": {
      "type": "array",
      "description": "Logical groups such as base, walls, roof, door. 1-6 sections.",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "lowercase word: base, walls, roof, door, wheels..."
          },
          "description": {
            "type": "string"
          },
          "steps": {
            "type": "array",
            "description": "Build steps in order; each step is a list of placements",
            "items": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "part": {
                    "type": "string",
                    "description": "Part id from the allowed table, e.g. '3001'"
                  },
                  "colour": {
                    "type": "integer",
                    "description": "LDraw colour code from the allowed table"
                  },
                  "x": {
                    "type": "integer",
                    "description": "Stud column of the part's left edge (west)"
                  },
                  "z": {
                    "type": "integer",
                    "description": "Stud row of the part's back edge (north)"
                  },
                  "level": {
                    "type": "integer",
                    "description": "Height of the part's bottom in plates (brick = 3 plates). Ground = 0"
                  },
                  "rotation": {
                    "type": "integer",
                    "enum": [
                      0,
                      90,
                      180,
                      270
                    ],
                    "description": "Turn in degrees. 90/270 swap the part's X and Z size. Slopes: 0 slants north, 180 south, 90 west, 270 east"
                  }
                },
                "required": [
                  "part",
                  "colour",
                  "x",
                  "z",
                  "level",
                  "rotation"
                ],
                "additionalProperties": false
              }
            }
          }
        },
        "required": [
          "name",
          "description",
          "steps"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "name",
    "say",
    "sections"
  ],
  "additionalProperties": false
}
```

## 6. Surprise colours

```text
A 3-year-old wants a surprise colour scheme for her brick model "{name}".
Theme to use: {theme}.
The model has these groups, each listing its current colours: {groups}
Pick new colours for every (group, current colour) pair using only these colour codes: {palette}.
Make it cheerful and on-theme. Also give a 2-4 word scheme name and one short happy sentence.
```

```json
{
  "type": "object",
  "properties": {
    "scheme": {
      "type": "string"
    },
    "say": {
      "type": "string"
    },
    "changes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "group": {
            "type": "string"
          },
          "from_colour": {
            "type": "integer"
          },
          "to_colour": {
            "type": "integer"
          }
        },
        "required": [
          "group",
          "from_colour",
          "to_colour"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "scheme",
    "say",
    "changes"
  ],
  "additionalProperties": false
}
```

## 7. Story

```text
Tell a gentle bedtime-style story (about 2 minutes read aloud, around 250 words) for a 3-year-old.
The hero is {child}, a little girl {avatar_desc}. She built a brick model called "{model}" ({colours}).
Include her model in the adventure. Short sentences. Happy, cosy ending. No scary parts.
Language: {language}.
```

```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string"
    },
    "paragraphs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "title",
    "paragraphs"
  ],
  "additionalProperties": false
}
```

## 8. Suggestions

```text
Here is the brick inventory we own right now:
{table}
Suggest {n} different small models a 3-year-old would love that can be built using only these bricks.
Each: a cute name, one short idea sentence a parent can type as a build request, an emoji, and an estimated part count.
```

```json
{
  "type": "object",
  "properties": {
    "ideas": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "idea": {
            "type": "string"
          },
          "emoji": {
            "type": "string"
          },
          "parts": {
            "type": "integer"
          }
        },
        "required": [
          "name",
          "idea",
          "emoji",
          "parts"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "ideas"
  ],
  "additionalProperties": false
}
```
