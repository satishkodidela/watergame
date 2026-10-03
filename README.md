# Glasswater

*You are a water strider. The skin of the pond holds you up. Every raindrop is a
meteor, every ripple a wave, and the waves add up or cancel out.*

One storm, one night, 6–8 minutes. A WebGL2 game with no dependencies, no
build step and no downloaded assets: the whole thing is ~130 KB of source
(about 35 KB gzipped) and the GPU bakes its own textures at startup.

## Play it

```
node tools/serve.mjs        # → http://localhost:8080/
```

Any static host works too (ES modules need `http://`, not `file://`).

| input | action |
| --- | --- |
| drag anywhere / WASD / arrows | skate (glide + momentum; moving fast is "loud") |
| tap / space | **pulse** a ring wave. The timing sets its phase: the glowing ring around you is *bright* (crest) or *dark* (trough). |
| second finger while dragging | pulse |
| Esc / P | pause |

**Cancel:** pulse on *dark* while a *bright* crest is about to reach you. The
waves erase each other and the pond goes glassy around you (a "glass zone").
Chain cancels in the downpour to carve a calm patch.

**Strike:** pulse on *bright* so your crest stacks with another one under a
target: two crests meeting double up. A big enough crest flips a gnat, scares
the fish off mid-lunge, and stuns a backswimmer.

**Surface tension** is the arc above you. It weakens when a wave tall enough to
tip you passes, when you skate into an oil/soap slick (rainbow sheen), and
when you overeat and get heavy. At zero you sink. The arc below you is
hunger: gnats and mosquitoes fall in and struggle, and their struggling has a
ripple signature you learn to read, even in the dark.

## Ponds (the campaign)

Six ponds, 25 levels each, then an endless Storm Season. Every level is a
small **recipe**: pond, length (55 to 110 s), weather curve, which threats are
on, a goal and two extra star conditions. The first levels of each pond and
every boss are authored; the rest come from a seeded generator with a
difficulty budget, so level 212 is the same for everyone.

| pond | twist | boss |
| --- | --- | --- |
| Puddle | rain only, the teaching ground | the first downpour |
| Garden Pond | lily pads break waves and shelter you, a koi | the koi (strike it three times) |
| Rain Barrel | hard walls, every wave reflects and echoes | the overflow spout |
| Roadside Ditch | drift, oil slicks, passing cars throw heavy drops | the storm drain |
| Rice Paddy | night, stalks to weave through, backswimmers, a frog | the egret's shadow |
| Mountain Tarn | cold clear water, gusts, hail bursts | the hailstorm |

Level templates: Survive, Feast (eat N), Glassmaker (cancel or perfect-cancel
N), Hunt (scare the fish or stun hunters with a crest) and Dark Crossing
(reach lights in order). Stars open the next pond, unlock skeletons, and every
fifth level or boss offers a molt.

**Skeletons** are selectable bodies with real stat differences and a score
multiplier: Common Strider, Pond Skater (fast, thin skin), Broadfoot (slow,
tough, big dimples), Giant Strider (huge pulse), Sea Skater (slick-proof) and
Nymph (tiny, fragile, double score).

## Daily Storm (the original run)

| time | phase | what happens |
| --- | --- | --- |
| 0:00 | dawn | golden light, gnats, one gentle teaching drop near you |
| 1:00 | wind rises | slicks drift in on the wind, the fish's shadow appears |
| 2:30 | rain front | rings from everywhere; the interference becomes the spectacle |
| 4:00 | night hunt | the pond goes dark, ripples glow, predators hunt by vibration |
| 5:30 | downpour | the final storm; chain cancels to make glass |
| 7:00 | sunrise | the camera pulls out to show how small your world was |

Survive and **Endless** unlocks: the storms loop, each one harder.

Threats: raindrops (shadow grows, then rings), the fish (bulge from below,
caustics warp, rumble; it locks on where you *were* when it started to rise),
the frog at the bank (its eyes glint, then the tongue), the backswimmer (fast
V-shaped wake; stop moving to go silent), slicks (route around; they also calm
the water, which is real physics), and the downpour itself.

**Daily Storm** uses one seed per UTC day for everyone, so scores are
comparable. **Free Storm** rolls a new sky every time. Between runs you
**molt**: pick one of three upgrades (longer legs, repellent hairs, stronger
pulse, wider sense, resonance). Progress, best scores, stars and the daily best
are in `localStorage`. Your best run leaves a *ghost*: faint ripples on the
next pond.

## How it works

One GPU wave simulation drives both the gameplay and the picture. The waves
you see are exactly the waves that hit you.

```
src/
  water.js     256×256 (or 128×128) RGBA16F ping-pong wave sim, impulses, damping
               zones, obstacle mask, async PBO readback (128×128 height+slope)
  worlds.js    the six pond presets (bed, water, light, glow, bank, edge, roster)
  levels.js    level recipes: authored openers and bosses, the seeded generator,
               templates, goals, star conditions, LevelScript director
  skeletons.js the six strider bodies
  shaders.js   all GLSL: sim, bed bake, water surface, sprites, post
  renderer.js  pass order: water → sprites → ¼-res blur chain → composite
  game.js      strider, director (time → weather), threats, scoring, molts, camera
  main.js      fixed 60 Hz step, quality tiers + auto scaling, DOM screens
  audio.js     everything synthesized with Web Audio (rain, wind, plips, chords)
  input.js     drag joystick / tap pulse / keyboard
  rng.js       mulberry32 + daily seed
```

**Sim.** Explicit 2D wave equation, `h' = h + (h − h₋₁)·d + c²∇²h`, with a
Laplacian-of-velocity viscosity term that kills grid-scale ripples, a sponge
layer at the pond rim, and up to 16 impulses + 12 damping zones per step as
uniforms. Rings write a slightly smaller ring into the previous-height channel
so the pulse travels *outward* instead of collapsing back on the strider.
Glass zones and slicks are damping zones in the same pass. Lily pads and
stalks are an R8 mask the sim forces to zero, so waves reflect and diffract
around them; the Rain Barrel swaps the absorbing rim for a hard wall.

**Surface shader.** From the single height map: normals (central differences
plus analytic leg-dimple and fish-bulge gradients), refraction of a baked
procedural pebble bed, caustics from the Laplacian on a 2-texel stencil, the
strider's "flower" shadow (dark dimples with bright lensing rims, like the real
insect), a procedural sky with Fresnel reflection, a sharp sun-glitter lobe over
wind-driven micro-ripples, thin-film rainbow on slicks, bioluminescent crests at
night, and a sense-radius fog. Outside the pond: the bank with moss and a wet
rim.

**Post.** One ¼-res blur chain serves both soft bloom and tilt-shift depth of
field (focus follows the strider's row), then vignette, grade and grain.

**Readback.** The sim renders a 128² RGBA8 height/slope map that is read back
through alternating pixel buffers with fence syncs, so gameplay samples the
*actual* water with one frame of latency and no pipeline stall.

**Quality.** Three tiers (grid, substeps, render scale, DOF, blur resolution,
micro-ripples). The game starts on a tier picked from the device and drops a
tier after 2.5 s of frames slower than 45 fps; it climbs back after 30 s of
headroom. Override with `?quality=high|medium|low` or the title-screen toggle.

## Dev tools

```
npm i -D playwright-core      # once; uses a system Chromium (PLAYWRIGHT_BROWSERS_PATH)
node tools/shot.mjs shots     # headless screenshots of every phase
SCENES=bot node tools/shot.mjs   # scripted bot plays the whole storm, prints tension log
LEVELS=1:0,1:8,1:24 SCENES=calib node tools/shot.mjs   # bot plays campaign levels, prints clear/stars
SCENES=worlds,mech,skel node tools/shot.mjs   # every pond, every mechanic, every skeleton
```

`window.__gw` exposes the game, water and renderer in the console
(`__gw.advance(seconds)`, `__gw.game.god = true`, `__gw.renderer.debugView = 'sim'`).

## Platform notes

- Everything is procedural: zero image or audio files, so the build is the
  source folder. Zip it for CrazyGames / Poki / Facebook Instant Games.
- Portrait and landscape both work; the camera follows the strider at a macro
  zoom and pulls out for the sunrise reveal.
- Needs WebGL2 with `EXT_color_buffer_float` or `EXT_color_buffer_half_float`
  (every current browser, including iOS 15+).
