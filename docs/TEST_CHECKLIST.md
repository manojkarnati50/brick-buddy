# Test checklist

Run `docker compose up --build`, open http://localhost:8080. Seed data: 6 projects (one per status + a recoloured one)
and a starter inventory of 8 bricks/plates in 8 colours. Parent PIN = `PARENT_PIN` from `.env` (default 1234).

| # | Test | Expected |
|---|---|---|
| 1 | **Generate a model** — Home → 🎤 (or tap 🏠 + pink pot) → Build! | Thinking avatar + stacking bricks, then celebration with confetti, name read aloud. With a key: Parent → project shows model `claude-haiku-5-5`, cost > 0. Without a key: a starter matching her words. |
| 2 | **View in 3D** — open the model | Drag to spin, pinch/scroll to zoom. Home card auto-turntables the favourite model. With the LDraw library (Docker), Parent → project → *Real LDraw parts* renders the MPD via three.js `LDrawLoader`. |
| 3 | **Recolour one brick** — pick a pot, 🖌️, tap a brick | Brick changes instantly with splash + sound + glow. ~3 s later Parent → project shows a new version "Aaradya painted" with a new thumbnail and BOM quantities moved between colour lines. |
| 4 | **Bucket** — 🪣, tap a brick | Every brick of that colour changes. |
| 5 | **Section** — 🏠, tap a brick | The whole group (roof / walls / …) changes. |
| 6 | **Surprise** — 🌈 | New scheme applied and spoken (Claude with a key, random palette without). |
| 7 | **Undo / start again** — ↩ and ⟲ | Steps back one paint; ⟲ returns to v1 colours (saved as a new version — nothing is lost). |
| 8 | **Printed model recolour** — paint the *Zoom Zoom Car* (Printed) | "Already printed" prompt → grown-up gate → saved as a new copy; original inventory untouched. |
| 9 | **Mark as printed** — Parent → Projects → *Mark as Printed* on *Fluffy Bunny* | Inventory "Owned" rises by its piece count; Undo in the toast reverses it. Partial: open the project, set *Print now* quantities → *Mark selected printed* → status Printing. |
| 10 | **Surprise build from inventory** — Home → 🧱 → 🎁 Surprise! | Model built only from available bricks; card shows 🧱 *made from my bricks* and the "uses X of Y" bar. |
| 11 | **Idea + use my bricks never exceeds stock** — toggle 🧱, say "a tower", Build | Parent → project BOM: every line *Need* = ✓ (strict mode). In *Mostly mine* mode, at most N extra appear as *Need*. |
| 12 | **We built it** — on a Printed / from-inventory model tap 🏆 | Status Built; Parent → Inventory "In use" rises, "Available" falls; 🔨 Take it apart returns them. Model appears in 🚲 Town. |
| 13 | **Avatar change persists** — 👗 Dress up → switch *my photos* / *cartoon me*, outfit, crown, background | Change shows instantly everywhere and survives a reload (stored in settings). |
| 14 | **Parent gate** — tap *Grown-ups* briefly | Nothing. Hold 3 s → PIN pad. Wrong PIN → message; 5 wrong in a minute → wait. Correct → parent mode. *Lock* returns to kid mode. |
| 15 | **Spending cap stops calls** — Settings → Monthly cap = 0, make a build | Build shows the gentle pout "Let's take a little break" (HTTP 429), no API call is made. Same for calls per minute/day. |
| 16 | **Time limit** — Settings → daily limit 1 min, wait | Bunny hug "Bye-bye" screen; grown-up hold → +10 min. |
| 17 | **Build guide / games / story / stickers** | 👣 steps with voice; 🔍 find-the-colour, 📏 how tall, 🔢 count (always celebrates); 📖 story read aloud; ⭐ sticker book fills up. |
| 18 | **Backup** — Settings → Export zip (unticked) | Zip has `data.json`, `models/`, `thumbs/` — no `uploads/` or `private/`. Tick *include photos* to add them. Import restores. |
| 19 | **STL** — project → *STL + print list* | Zip with one printable STL per unique part, `print-list.txt` with grams per colour, and the `.mpd`. |
