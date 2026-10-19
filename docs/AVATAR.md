# Aaradya's avatar

The app shows her avatar in seven poses, one per app state. File names the code expects (in
`backend/data/private/avatar/`, transparent PNG, roughly 900 px tall):

| File | Pose | Used for |
|---|---|---|
| `wave.png` | waving / peace sign | home greeting "Hi Aaradya!", dashboard hero |
| `think.png` | chin on hands, smiling | "thinking" while Claude builds, loading |
| `jump.png` | jumping, arms up | celebrations (model finished, printed, built, games) |
| `hug.png` | hugging the bunny | empty states, story time, bedtime / time's up |
| `pout.png` | pouting, chin in hands | gentle "oops, let's try again" (never a scary error) |
| `bike.png` | riding the pink balance bike | "go to my town" tile, town screen |
| `hips.png` | hands on hips | "I'm the builder!" on the model page, parent profile circle |

## Option A — her real photos (default)

`tools/make_avatars.py` cuts her out of each photo with Apple's Vision framework
(`VNGenerateForegroundInstanceMaskRequest`, macOS 14+), entirely on this Mac, then trims and resizes:

```bash
pip install pyobjc-framework-Vision pyobjc-framework-Quartz pillow
python tools/make_avatars.py --wave … --think … --jump … --hug … --pout … --bike … --hips … \
  --out backend/data/private/avatar
```

Props she is holding (the bunny, the bike) are kept with her. You can also upload or replace single poses in
**Parent → Avatar Studio → Custom pose art**.

## Option B — cartoon me (built in)

A layered SVG avatar (`frontend/src/components/Avatar.tsx`) in a soft, glossy cartoon style: long wavy dark-brown hair,
brown eyes, warm smile, white cherry top, wide star-patch jeans, white sneakers. Avatar Studio layers are instant and
free (no AI call): outfit (cherry top, green hoodie, party dress, raincoat, princess, astronaut), hair accessory (none,
bow, flower clip, headband, crown), headphones, background colour, favourite brick colour. Switch between *my photos*
and *cartoon me* in Avatar Studio.

## Option C — generated 3D-cartoon art

If you'd rather have Pixar-style art, generate one image per pose with any image model (on your own account; keep the
reference photos private) and save them under the file names above. Shared style prompt, then the pose line:

> Soft, glossy 3D-animated cartoon character of a 3-year-old Indian girl, big expressive brown eyes, rounded features,
> warm light-brown skin, long wavy dark-brown hair just past the shoulders, warm smile. White sleeveless tank top with a
> small red cherry, wide light-blue jeans with white star patches, white sneakers. Full body, centred, plain transparent
> background, soft studio lighting, high detail, no text.

- `wave.png` — standing, one hand making a peace sign next to her face, big smile.
- `think.png` — sitting cross-legged, chin resting on both hands, gentle smile, looking up thoughtfully.
- `jump.png` — mid-jump with both arms up, legs bent, laughing.
- `hug.png` — sitting, hugging a cream-coloured plush bunny, cosy smile.
- `pout.png` — sitting cross-legged, chin in hands, cute pout, puffed cheeks (gentle, not sad).
- `bike.png` — riding a pink toddler balance bike, laughing.
- `hips.png` — standing tall, hands on hips, proud smile ("I'm the builder!").
- Studio layers (optional, for a fully illustrated Avatar Studio): the same character in a green hoodie, party dress,
  yellow raincoat, princess dress and astronaut suit; separate transparent PNGs of a pink bow, flower clip, red
  headband, gold crown and white headphones.
