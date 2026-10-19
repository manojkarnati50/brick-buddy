# 🧱 Brick Buddy

A home web app where a 3-year-old dreams up LEGO-style models by **voice or by tapping pictures**, Claude turns
the idea into a real, buildable brick model (via [LDraw Nova](https://github.com/anteloc/ldraw-nova) v0.6.0),
and a parent 3D-prints the bricks. It tracks every model, every brick and the physical brick inventory.

- **Kid mode** — huge buttons, voice, her own avatar, no reading needed, Colour Studio to repaint bricks.
- **Parent mode** — dashboard, projects, BOMs, inventory, print queue, Big Builds, settings — behind a parent gate
  (hold 3 s, then a 4-digit PIN).

Runs entirely on your own computer and home Wi-Fi. Nothing is publicly hosted.

---

## What's inside

```
brick-buddy/
├── docker-compose.yml           # one command starts everything
├── .env.example                 # ANTHROPIC_API_KEY, PARENT_PIN, SARVAM_API_KEY, models
├── backend/                     # Python 3.12 + FastAPI + SQLite (SQLModel)
│   ├── Dockerfile               # installs LDraw Nova v0.6.0 + the official LDraw parts library
│   └── app/
│       ├── main.py              # API + static files + serves the built frontend
│       ├── catalog.py           # kid-safe parts (footprints verified by LDraw Nova) + LDraw colours
│       ├── kidplan.py           # Claude's stud-grid plan JSON schema -> LDraw Nova build plan
│       ├── nova.py              # build_plan / analyze_geometry / get_parts wrapper (+ offline fallback)
│       ├── validate.py          # stud-grid collision / floating / size checks
│       ├── generation.py        # idea -> Claude -> build -> check -> retry (x3) -> save
│       ├── claude_client.py     # structured outputs, rate limits, spending cap, cost log
│       ├── prompts.py           # kid-safety + build system prompts, other schemas
│       ├── ldraw.py, library.py # MPD reader/writer, recolouring, LDraw library bounds
│       ├── render.py            # isometric PNG thumbnails (Pillow)
│       ├── stl.py               # printable STL bricks + filament grams
│       ├── inventory.py, bom.py, store.py, seed.py, auth.py, db.py
│       └── routes/              # projects, generate, inventory, stats, kid, system, voice, backup
├── frontend/                    # React 18 + Vite + TypeScript + Tailwind + Motion + three.js + Recharts
│   ├── Dockerfile, nginx/       # nginx on :8080 (http) and :8443 (https, self-signed — needed for the iPad mic)
│   └── src/
│       ├── components/          # Avatar, BrickViewer (three.js), ColourStudio, ParentGate, brick UI kit
│       ├── pages/kid/           # Home, Create, Model (Colour Studio), Town, Guide, Games, Story, Stickers, Avatar Studio, Bedtime
│       └── pages/parent/        # Dashboard, Projects, ProjectDetail, Inventory, PrintQueue, BigBuilds, Settings
├── tools/make_avatars.py        # her photos -> transparent avatar poses, on-device (Apple Vision)
└── docs/
    ├── PROMPTS_AND_SCHEMAS.md   # every Claude system prompt + JSON schema
    ├── AVATAR.md                # avatar poses, photo cut-outs, image-generation prompts
    └── TEST_CHECKLIST.md
```

## Install & run (Docker)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Get the code and add your key:

   ```bash
   git clone https://github.com/<you>/brick-buddy.git && cd brick-buddy
   cp .env.example .env        # then edit .env and paste your ANTHROPIC_API_KEY
   ```

3. Start it (the first build downloads LDraw Nova and the ~90 MB LDraw parts library):

   ```bash
   docker compose up --build
   ```

4. Open **http://localhost:8080** on this computer.

No API key yet? It still works: builds come from the built-in starter models (house, car, tower, bunny, tree,
rocket, flower) chosen by keywords in her idea, and stories are offline.

### Open it on the iPad (home Wi-Fi)

1. Find this computer's IP: on a Mac `ipconfig getifaddr en0` (e.g. `192.168.1.20`).
2. Restart with that IP baked into the certificate: `HOST_IP=192.168.1.20 docker compose up -d`
3. On the iPad open **https://192.168.1.20:8443**, tap *Show details → visit this website* once
   (self-signed certificate). HTTPS is needed so Safari allows the microphone.
4. Share → **Add to Home Screen** for a full-screen app. Use **Guided Access** (Settings → Accessibility) to keep her inside it.

Plain http://192.168.1.20:8080 also works, but the microphone will be blocked by Safari (tapping pictures still works).

### Without Docker (development)

```bash
# backend
cd backend && python3.12 -m venv .venv
.venv/bin/pip install fastapi "uvicorn[standard]" sqlmodel "anthropic>=1.10,<2" pillow python-multipart httpx
.venv/bin/uvicorn app.main:app --reload --port 8000
# optional: full LDraw Nova pipeline
git clone --branch v0.6.0 https://github.com/anteloc/ldraw-nova.git ../ldraw-nova && .venv/bin/pip install -e ../ldraw-nova
export LDRAW_DIR=/path/to/ldraw LDRAW_NOVA_DIR=../ldraw-nova   # unzip complete.zip from library.ldraw.org

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :8000)
```

## Her avatar (her real photos)

Her photos are turned into transparent cut-outs **on this Mac** with Apple's Vision framework — nothing is uploaded:

```bash
pip install pyobjc-framework-Vision pyobjc-framework-Quartz pillow
python tools/make_avatars.py --wave peace.png --think chin-on-hands.png --jump jump.png \
  --hug bunny.png --pout pout.png --bike bike.png --hips hands-on-hips.png --out backend/data/private/avatar
```

Each pose is used for one app state (wave = home greeting, think = Claude is building, jump = celebrations,
hug = empty states + bedtime, pout = gentle "let's try again", bike = "go to my town", hips = "I'm the builder").
In **Avatar Studio** she can switch between *my photos* and the *cartoon me* (layered SVG with outfits, hair
accessories, headphones, background and favourite brick colour). See [docs/AVATAR.md](docs/AVATAR.md).

**Privacy:** photos live only in `backend/data/private/avatar/` (git-ignored, Docker volume on this machine). They
are never sent to Claude, never put in exports unless you tick *include photos*, and never in analytics.

## Using it

- **Make a model:** Home → 🎤 → she talks (or taps pictures and paint pots) → **Build!** The thinking avatar shows
  while Claude builds; the celebration shows the result.
- **Build with my bricks:** the 🧱 tile (or toggle on the Make screen). *Surprise!* lets Claude invent something from
  what you have; strict/mostly-mine mode is in Settings.
- **Colour Studio:** on any model, pick a paint pot, then 🖌️ one brick, 🪣 every brick of that colour, 🏠 a whole
  section, or 🌈 surprise. ↩ undo, ⟲ start again. Each pause in painting saves a new version.
- **Mark a project as printed:** Parent → Projects → *Mark as Printed* (or open the project, enter partial
  quantities and *Mark selected printed*). The pieces are added to inventory and an **Undo** appears for a few seconds.
- **We built it!** — her 🏆 button marks it Built and moves those bricks from *available* to *in use*; 🔨 takes it apart.
- **Print helper:** on a project, *STL + print list* downloads printable STL bricks, the MPD, and a filament list.
  *Print queue* groups everything still to print by filament colour.

## Costs & safety

- Kid builds use `claude-haiku-5-5`, inventory builds `claude-sonnet-5-5`, Big Builds (parent-approved queue)
  `claude-opus-5-5`. Every call is logged with tokens and USD/INR; rate limits per minute/day and a hard monthly cap
  (Settings) stop calls before they are made.
- Every Claude call starts with a kid-safety system prompt; Claude only returns build plans, names, one-line
  narration and stories (structured JSON). There is no open chat in kid mode, no links, ads, purchases or sign-ins.
- The API key stays in `.env` on the server; the browser never sees it.
- Voice: the browser's Web Speech API is used by default (Safari/Chrome may use Apple's/Google's speech service for
  recognition). Her recorded idea audio is stored locally so you can replay it.

## Licence

AGPL-3.0 (this app uses LDraw Nova, which is AGPL-3.0). The LDraw parts library is © LDraw.org contributors under its own licence (see library.ldraw.org).
LEGO® is a trademark of the LEGO Group, which does not sponsor or endorse this project.
