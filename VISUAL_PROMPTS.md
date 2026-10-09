# GOLDEN EAGLE — Scroll Film: Production Prompt Bible (v2)

> One continuous cinematic film, controlled by scroll.
> 15 keyframes (stills) → 14 video clips that chain end-frame to start-frame.

---

## PART 0 — PRODUCTION RULES

### 0.1 Workflow
| Step | Action | Tool examples |
|---|---|---|
| 1 | Photograph or collect a clean front shot of **each real can** (6 flavors) | Phone photo on white, or official packshots |
| 2 | Generate **keyframes K01–K15** with the can photo attached as image reference | Midjourney (`--cref`/`--oref`), Flux Kontext, GPT-Image, Nano Banana |
| 3 | Fix any label errors in the keyframes (Photoshop / inpaint) **before** making video | Photoshop Generative Fill, Flux Fill |
| 4 | Generate each clip with **Start frame + End frame** | Kling 2.x, Veo 3, Runway Gen-4, Luma Ray, Higgsfield |
| 5 | Check: last frame of clip N must match first frame of clip N+1 | — |
| 6 | Drop finished files in `/videos` | — |

### 0.2 Technical spec (every clip)
| Parameter | Value |
|---|---|
| Resolution | 1920×1080 (16:9) master · optional 1080×1920 (9:16) mobile version |
| FPS | 24 (preferred) or 30 |
| Duration | 5–8 s |
| Camera | ONE continuous move · no cuts · no zoom jumps |
| Motion blur | Minimal (shutter 1/500 look) |
| Text | None generated · only the real can label |
| Audio | Off |

### 0.3 The Can — consistency lock (paste into every prompt that shows the can)
> **CAN LOCK:** a single standard 250 ml slim aluminum energy-drink can, upright, perfectly vertical, centered horizontally in frame, occupying ~45% of frame height, straight-on eye-level product angle, brushed-aluminum top with silver pull-tab, label exactly matching the reference image, sharp and legible, no distortion, no extra cans.

*(Change "250 ml slim" if your can is a different size.)*

### 0.4 Global style suffix (end of EVERY prompt)
> Cinematic premium energy-drink commercial, shot on ARRI Alexa 65, Cooke anamorphic lenses, ultra-photoreal, 8K detail, HDR, Golden Eagle palette of deep black, molten gold (#D4A017) and glacial blue-white, high contrast, volumetric light, crisp specular highlights on aluminum, physically accurate ice/liquid/particles, shallow depth of field, stabilized gimbal motion, no cuts, no text, no watermark.

### 0.5 Global negative prompt
> text, captions, subtitles, watermark, fake logo, misspelled label, warped or bent can, melting can, multiple cans, floating can, tilted can, cartoon, 3D render look, plastic, CGI, low-res, noise, flicker, jitter, camera shake, jump cut, scene change, morphing background mid-shot, extra limbs, distorted bird, human face close-up, oversaturated, washed out

### 0.6 Flavor world table (edit to match your real cans)
| Flavor | Label colors | Key light | Particles / props | Mood |
|---|---|---|---|---|
| Original | Gold + black | Warm gold sunrise rim | Ice shards, frost dust | Legendary, iconic |
| Red | Crimson + gold | Deep red key, orange rim | Glowing embers, heat haze, sparks | Fierce, intense |
| Sugar Free | Silver/white + ice blue | Cool white key, cyan rim | Ice crystals, snowflakes, frost mist | Pure, clean, sharp |
| Tropical | Orange + teal + yellow | Warm orange sun, teal fill | Mango & pineapple slices, palm leaves, water droplets | Bright, exotic |
| Strawberry | Pink-red + gold | Soft pink key, magenta rim | Whole/halved strawberries, juice droplets | Juicy, playful |
| Coffee | Dark brown + cream + gold | Warm amber key, low fill | Roasted beans, smoke wisps, crema swirls | Rich, deep, focused |

---

## PART 1 — KEYFRAMES (STILL IMAGES)

Template used for every keyframe:
**SUBJECT · ENVIRONMENT · COMPOSITION · CAMERA · LIGHTING · MATERIALS & FX · COLOR · MOOD**

---

### K01 — Opening: The Frozen Summit (wide)
- **Subject:** A colossal, jagged frozen mountain peak; on its very summit, a massive cube of blue glacial ice (size of a house), visible but small at this distance.
- **Environment:** Above a sea of clouds; neighboring peaks lower and fading; wind tearing snow plumes off the ridgeline.
- **Composition:** Peak in center, summit on upper third line; sky occupies top 40%; clouds bottom 30%.
- **Camera:** Extreme wide aerial, 24 mm, slightly below summit height, looking across.
- **Lighting:** Blue-hour pre-dawn; thin band of gold light at the horizon behind the peak; faint golden glow from inside the ice block.
- **Materials & FX:** Wind-blown spindrift, fine atmospheric haze, crisp ice ridges, rime ice.
- **Color:** 80% deep navy/ice-blue, 20% gold accent (horizon + ice glow).
- **Mood:** Silent, ancient, epic, mysterious.

> **PROMPT:** Extreme wide aerial establishing shot of a colossal jagged frozen mountain peak rising above a sea of clouds at blue-hour pre-dawn, wind tearing long plumes of snow off the icy ridges, on the very summit a massive house-sized cube of ancient blue glacial ice glowing faintly gold from within, distant lower peaks fading in haze, thin band of golden light on the horizon behind the mountain, 24mm lens, summit placed on the upper third, deep navy and ice-blue tones with gold accents, silent epic mysterious atmosphere. [GLOBAL STYLE]

---

### K02 — The Ice Monolith
- **Subject:** The glacial ice cube; inside, the dark silhouette of an upright can, barely visible.
- **Environment:** Flat summit plateau, wind-sculpted snow, small ice debris around the base.
- **Composition:** Ice block centered, fills ~60% of frame; horizon low.
- **Camera:** Low-angle medium shot, 35 mm, camera ~1 m above snow, tilted slightly up.
- **Lighting:** Cold blue ambient; warm gold glow pulsing from the center of the ice; first sunrise rim on ice edges.
- **Materials & FX:** Ice with trapped air bubbles, internal fracture planes, frost crust on surface, spindrift at base.
- **Color:** Ice-blue / cyan, gold core.
- **Mood:** Something powerful is sealed inside.

> **PROMPT:** Low-angle medium shot on a windswept mountain summit plateau, a monumental cube of clear blue glacial ice dominating the center of the frame, ancient trapped air bubbles and internal fracture planes, thick frost crust on its surface, inside the ice the dark silhouette of an upright energy drink can barely visible with a warm golden glow radiating from it, spindrift snow swirling around the base, cold blue twilight with the first golden sunrise rim-light catching the ice edges, 35mm lens. [GLOBAL STYLE]

---

### K03 — First Crack (macro)
- **Subject:** Golden Eagle Original can frozen inside ice. [CAN LOCK]
- **Composition:** Can centered; one bright hairline crack running diagonally across frame, top-left to bottom-right.
- **Camera:** Macro close-up, 85 mm, straight-on.
- **Lighting:** Gold light leaking through the crack; cool blue light through surrounding ice.
- **Materials & FX:** Frost veil partly obscuring the can, micro bubbles, sparkle on frost crystals.
- **Mood:** Tension right before release.

> **PROMPT:** Macro close-up through the face of a block of glacial ice, the Golden Eagle Original energy drink can [reference image] frozen upright inside, centered and partly veiled by frost and tiny air bubbles, a single razor-thin hairline crack running diagonally across the ice glowing with intense molten-gold light leaking from within, cool blue light through the surrounding ice, frost crystals sparkling, 85mm macro, extreme ice texture detail, tense anticipation. [CAN LOCK] [GLOBAL STYLE]

---

### K04 — HERO: Original
- **Subject:** Golden Eagle Original can. [CAN LOCK]
- **Environment:** Standing on a broken slab of ice on the summit; ice shards suspended mid-air around it.
- **Composition:** Can dead center; shards distributed in a loose ring, some in foreground (blurred).
- **Camera:** 50 mm, eye-level with can, straight-on, f/2.8.
- **Lighting:** Strong gold sunrise backlight (rim on both can edges); soft cool fill from front; specular stripe down the can.
- **Materials & FX:** Condensation droplets, frost patches on aluminum, frozen ice shards, fine snow particles.
- **Color:** Black background → gold rim → ice-blue shards.
- **Mood:** Legendary, unleashed.

> **PROMPT:** Iconic hero product shot of the Golden Eagle Original energy drink can [reference image] standing upright on a broken slab of glacial ice on a mountain summit, dozens of crystal-clear ice shards frozen mid-air in a loose ring around it, blurred shards in the foreground, condensation droplets and frost patches on the brushed aluminum, strong golden sunrise backlight creating bright rim light on both edges of the can, soft cool blue frontal fill, deep blue-black background with fine floating snow, 50mm eye-level straight-on, f/2.8. [CAN LOCK] [GLOBAL STYLE]

---

### K05 — HERO: Red
> **PROMPT:** Iconic hero product shot of the Golden Eagle Red energy drink can [reference image], identical framing, size and straight-on eye-level angle as the previous hero, surrounded by hundreds of glowing red-orange embers drifting upward and visible heat-haze distortion in the background, small sparks, deep crimson key light from the left, hot orange rim light, black-to-crimson gradient background, condensation droplets on the can, fierce and intense mood, 50mm f/2.8. [CAN LOCK] [GLOBAL STYLE]

### K06 — HERO: Sugar Free
> **PROMPT:** Iconic hero product shot of the Golden Eagle Sugar Free energy drink can [reference image], identical framing, size and straight-on angle, surrounded by floating hexagonal ice crystals, delicate snowflakes and soft frost mist, frost feathering across the lower half of the can, clean bright white key light, cyan rim light, pale icy-blue to white gradient background, pure, minimal, razor-sharp mood, 50mm f/2.8. [CAN LOCK] [GLOBAL STYLE]

### K07 — HERO: Tropical
> **PROMPT:** Iconic hero product shot of the Golden Eagle Tropical energy drink can [reference image], identical framing, size and straight-on angle, juicy mango cubes, pineapple slices and glistening water droplets suspended in the air around it, out-of-focus palm leaves framing the edges, warm orange sunlight streaming through humid mist from the upper right, teal shadows, vibrant exotic mood, 50mm f/2.8. [CAN LOCK] [GLOBAL STYLE]

### K08 — HERO: Strawberry
> **PROMPT:** Iconic hero product shot of the Golden Eagle Strawberry energy drink can [reference image], identical framing, size and straight-on angle, glossy whole and halved fresh strawberries and sparkling pink juice droplets suspended mid-air around it, soft pink key light, magenta rim light with gold highlights, blush-pink to deep red gradient background, juicy playful mood, 50mm f/2.8. [CAN LOCK] [GLOBAL STYLE]

### K09 — HERO: Coffee
> **PROMPT:** Iconic hero product shot of the Golden Eagle Coffee energy drink can [reference image], identical framing, size and straight-on angle, dark roasted coffee beans floating in the air, slow curling wisps of warm smoke, a swirl of creamy crema in the background, warm amber key light, low fill, deep espresso-brown to black background with golden highlights, rich focused mood, 50mm f/2.8. [CAN LOCK] [GLOBAL STYLE]

---

### K10 — Energy Burst
- **Subject:** Original can at center of an explosion of molten-gold liquid and electricity.
- **Composition:** Radial — energy ribbons spiral out from the can toward frame edges.
- **Camera:** 35 mm, eye-level, slight push feeling.
- **Lighting:** The energy itself is the light source; can rim-lit gold-white.
> **PROMPT:** The Golden Eagle Original energy drink can [reference image] at the exact center of a massive explosion of molten liquid gold, swirling ribbons of gold liquid and splash crowns spiraling outward toward the edges of the frame, crackling electric-white lightning arcs wrapping around the can, thousands of sparks frozen at peak motion, pure black background, the energy itself lighting the scene, explosive adrenaline, 35mm. [CAN LOCK] [GLOBAL STYLE]

### K11 — Movement
- **Subject:** Athlete silhouette mid-leap (no visible face), arms spread.
- **Environment:** Rocky ridge / open terrain, blazing sunset.
- **Composition:** Athlete in upper-center, sun directly behind them.
> **PROMPT:** Dynamic wide shot of a lone athlete silhouetted mid-leap across a gap between rocks on a high ridge, arms spread, body fully extended, blazing golden sun directly behind them, streaks of golden light trailing their motion, dust and particles kicked up in the air, warm orange-gold sky with dark foreground, face not visible, freedom and momentum, 24mm low angle. [GLOBAL STYLE]

### K12 — Kosovo
> **PROMPT:** Breathtaking aerial golden-hour view flying over the Rugova Canyon mountains in Kosovo, dramatic limestone cliffs and layered forested peaks fading into warm haze, a river glinting deep in the gorge, a majestic real golden eagle soaring in the foreground right third with wings fully spread, every feather lit gold by the low sun, proud and majestic, 35mm aerial. [GLOBAL STYLE]

### K13 — The World
> **PROMPT:** View from high orbit of planet Earth at sunrise, the sun cresting the curve of the planet creating a thin brilliant golden line of dawn along the horizon, Europe and the Balkans visible below, city lights glowing across continents on the night side, a faint luminous golden trail arcing around the globe, black space with subtle stars, awe-inspiring scale. [GLOBAL STYLE]

### K14 — Return to the Mountain
> **PROMPT:** Wide aerial shot descending through golden clouds toward the same jagged frozen mountain peak from the opening, now fully bathed in warm golden sunrise light, snow glowing gold and pink, the ice block gone, the summit clear, sky bright gold to soft blue, triumphant homecoming feeling, 24mm. [GLOBAL STYLE]

### K15 — FINAL HERO
- **Subject:** Original can on the summit rock + real golden eagle perched beside it.
- **Composition:** Can center, eagle left of can at the same height, sun directly behind can.
- **Camera:** Low heroic angle, 35 mm, looking up.
> **PROMPT:** The Golden Eagle Original energy drink can [reference image] standing tall and alone on the highest rock of a snowy mountain summit, low heroic camera angle looking up, a real golden eagle perched on the rock directly to its left with wings half-open, the rising sun exactly behind the can creating a radiant golden halo and gentle anamorphic lens flare, glittering snow particles in the air, sea of clouds below, triumphant and iconic final commercial frame, 35mm. [CAN LOCK] [GLOBAL STYLE]

---

## PART 2 — VIDEO CLIPS

Template used for every clip:
**START → END · DURATION · CAMERA · TIMELINE (second-by-second) · FX · CONTINUITY · PROMPT**

---

### 01_mountain.mp4 — The Frozen Summit
| Field | Detail |
|---|---|
| Start → End | K01 → K02 |
| Duration | 8 s |
| Camera | Drone push-in + descent, constant slow speed, slight ease-out at end |
| Continuity | Must end exactly on K02 composition |

**Timeline**
- 0–2 s: Wide aerial, drifting forward over clouds; snow plumes streaming off ridge.
- 2–5 s: Camera glides over icy ridgeline, losing altitude; gold horizon brightens slightly.
- 5–7 s: Ice block grows in frame; gold glow inside begins to pulse.
- 7–8 s: Camera settles at low angle on the ice block, motion eases to near stop.

> **PROMPT:** Single continuous slow drone push-in: begin with an extreme wide aerial shot of a colossal frozen mountain peak above a sea of clouds at blue-hour pre-dawn, wind tearing snow plumes off the ridges; the camera glides steadily forward over the icy ridgeline, gradually descending, as a thin band of gold light brightens on the horizon; the massive glacial ice block on the summit grows larger in frame and a warm golden glow begins to pulse inside it; the camera eases to a low-angle medium shot of the ice block and almost stops. Snow particles drifting past the lens, constant speed, no cuts. [GLOBAL STYLE]

---

### 02_ice_reveal.mp4 — The Ice Awakens
| Field | Detail |
|---|---|
| Start → End | K02 → K03 |
| Duration | 6 s |
| Camera | Slow dolly-in, straight line, no rotation |

**Timeline**
- 0–2 s: Dolly toward the ice; silhouette inside is dark.
- 2–4 s: Frost on surface thins/melts; can becomes visible; glow strengthens.
- 4–6 s: A single hairline crack ignites with gold light across the face; camera arrives at macro.

> **PROMPT:** Slow straight dolly-in toward a giant block of blue glacial ice on a mountain summit; as the camera approaches, the frost on the ice surface slowly melts away revealing an upright Golden Eagle energy drink can frozen inside, the golden glow behind it intensifying; at the end a single razor-thin crack forms diagonally across the ice and ignites with molten-gold light, camera arriving at a macro close-up with the can centered. Subtle snow drift, slow, tense, cinematic, one continuous move. [CAN LOCK] [GLOBAL STYLE]

---

### 03_ice_shatter.mp4 — The Break-Out
| Field | Detail |
|---|---|
| Start → End | K03 → K04 |
| Duration | 7 s |
| Camera | Slight pull-back to hero framing; locked during hold |
| Speed | Ultra slow motion (1000 fps look) during shatter |

**Timeline**
- 0–1.5 s: Crack branches into a glowing web across the whole block.
- 1.5–3 s: Ice bursts outward toward the lens in super slow motion; frost dust cloud.
- 3–5 s: Shards decelerate and freeze in mid-air; gold sunrise floods from behind can.
- 5–5.5 s: Camera settles on the straight-on hero angle.
- 5.5–7 s: **HOLD** — can perfectly still, shards suspended, only fine snow drifts.

> **PROMPT:** The glowing golden crack across the ice spreads rapidly into a web of luminous fractures, then the entire ice block explodes outward toward the camera in ultra slow motion, thousands of crystal-clear shards and a cloud of frost dust flying past the lens, the shards decelerate and hang suspended in mid-air, revealing the Golden Eagle Original can standing perfectly upright and untouched at the center while a burst of warm golden sunrise light floods from behind it; the camera pulls back slightly into a straight-on eye-level hero framing and holds completely still for the final 1.5 seconds with only fine snow drifting. Physically accurate ice fracture. [CAN LOCK] [GLOBAL STYLE]

---

### 04–08 — FLAVOR TRANSFORMATIONS (shared rules)
| Field | Detail |
|---|---|
| Duration | 6 s each |
| Camera | **Locked-off, tripod.** No movement at all |
| Can motion | Exactly ONE 360° turn clockwise (seen from above), constant speed, 0 → 4.5 s |
| Label morph | Happens while the back of the can faces camera (≈1.5–3 s) so the swap is hidden |
| Environment morph | Gradual, 1–4 s |
| Hold | 4.5–6 s, can front-facing, perfectly still; only particles move |

**Shared timeline**
- 0–1.5 s: Can begins turning; old world still present.
- 1.5–3 s: Back of can faces camera; label and colors swap; particles start transforming.
- 3–4.5 s: Can turns back to front revealing new flavor; new world fully formed.
- 4.5–6 s: **HOLD.**

---

### 04_original_to_red.mp4
**K04 → K05**
> **PROMPT:** Locked-off tripod shot. The Golden Eagle Original can stays perfectly centered and upright and makes exactly one smooth constant-speed 360° rotation on its vertical axis; while its back faces the camera the label seamlessly changes from the Original gold-and-black design into the Golden Eagle Red crimson-and-gold design; simultaneously the suspended ice shards melt and ignite into glowing red-orange embers drifting upward, cold blue light warms into deep crimson with heat-haze rippling the background; the can returns to face the camera straight-on and holds perfectly still for the final 1.5 seconds while only the embers drift. Label crisp and legible. [CAN LOCK] [GLOBAL STYLE]

### 05_red_to_sugarfree.mp4
**K05 → K06**
> **PROMPT:** Locked-off tripod shot. The Golden Eagle Red can stays perfectly centered and upright and makes exactly one smooth constant-speed 360° rotation; while its back faces the camera the label changes seamlessly into the Golden Eagle Sugar Free silver-white and ice-blue design; the glowing embers cool, slow down and crystallize into floating ice crystals and snowflakes, heat-haze freezes into frost mist, crimson light shifts to clean bright white with cyan rim, frost feathers spread across the lower half of the can; the can returns front-facing and holds perfectly still for the final 1.5 seconds. Label crisp and legible. [CAN LOCK] [GLOBAL STYLE]

### 06_sugarfree_to_tropical.mp4
**K06 → K07**
> **PROMPT:** Locked-off tripod shot. The Golden Eagle Sugar Free can stays perfectly centered and upright and makes exactly one smooth constant-speed 360° rotation; while its back faces the camera the label changes seamlessly into the Golden Eagle Tropical orange, teal and yellow design; the ice crystals melt into glistening suspended water droplets, mango cubes and pineapple slices tumble slowly into frame, out-of-focus palm leaves grow in from the edges, warm orange sunlight breaks through humid mist with teal shadows; the can returns front-facing and holds perfectly still for the final 1.5 seconds. Label crisp and legible. [CAN LOCK] [GLOBAL STYLE]

### 07_tropical_to_strawberry.mp4
**K07 → K08**
> **PROMPT:** Locked-off tripod shot. The Golden Eagle Tropical can stays perfectly centered and upright and makes exactly one smooth constant-speed 360° rotation; while its back faces the camera the label changes seamlessly into the Golden Eagle Strawberry pink-red and gold design; the mango and pineapple pieces transform into glossy whole and halved fresh strawberries, water droplets turn into sparkling pink juice droplets, palm leaves fade away, lighting shifts to soft pink key with magenta rim; the can returns front-facing and holds perfectly still for the final 1.5 seconds. Label crisp and legible. [CAN LOCK] [GLOBAL STYLE]

### 08_strawberry_to_coffee.mp4
**K08 → K09**
> **PROMPT:** Locked-off tripod shot. The Golden Eagle Strawberry can stays perfectly centered and upright and makes exactly one smooth constant-speed 360° rotation; while its back faces the camera the label changes seamlessly into the Golden Eagle Coffee dark-brown, cream and gold design; the strawberries darken and shrink into roasted coffee beans, juice droplets evaporate into slow curling wisps of warm smoke, a crema swirl forms in the background, light shifts to warm amber with deep shadows; the can returns front-facing and holds perfectly still for the final 1.5 seconds. Label crisp and legible. [CAN LOCK] [GLOBAL STYLE]

---

### 09_energy.mp4 — Energy
| Field | Detail |
|---|---|
| Start → End | K09 → K10 |
| Duration | 7 s |
| Camera | Locked 0–3 s, then slow push-in |

**Timeline**
- 0–2 s: Coffee can turns a half rotation; label returns to Original gold-and-black.
- 2–3 s: Beat of stillness; gold light gathers in the can's center.
- 3–5 s: Shockwave — molten gold liquid + electric arcs blast outward; beans and smoke blown away.
- 5–7 s: Ribbons spiral around the can; camera pushes in.

> **PROMPT:** The Golden Eagle Coffee can turns a smooth half rotation and transforms back into the Golden Eagle Original gold-and-black can; a brief moment of stillness as golden light gathers inside it; then a massive slow-motion shockwave erupts outward from the can, molten liquid gold ribbons and splash crowns spiraling toward the edges of the frame, crackling electric-white lightning arcs wrapping around it, the coffee beans and smoke blasted out of frame, thousands of sparks; the camera slowly pushes in on the can at the heart of the explosion. Pure black background, explosive adrenaline. [CAN LOCK] [GLOBAL STYLE]

---

### 10_movement.mp4 — Movement
| Field | Detail |
|---|---|
| Start → End | K10 → K11 |
| Duration | 7 s |
| Camera | Fly-through forward, then lateral tracking |

**Timeline**
- 0–2 s: Camera flies forward through the gold explosion; ribbons stretch into light streaks.
- 2–4 s: Streaks become light trails; a sunset landscape forms; athlete sprinting.
- 4–7 s: Athlete leaps in slow motion across a rock gap, sun behind; camera tracks alongside.

> **UPDATED (new K11 = athlete in red kit grabbing the can, ice shards, misty highland):**
>
> **PROMPT:** Start: the Golden Eagle energy drink can floats at the center of a molten-gold energy explosion on a black background, gold liquid ribbons and electric arcs swirling around it. 0–2 s: the shockwave peaks and the swirling molten gold rapidly cools and crystallizes into hundreds of crystal-clear ice shards that keep flying outward in slow motion, the black background tearing open like a curtain to reveal a misty mountain highland with green moss, dark rocks and glacier ice under an overcast silver sky. 2–4 s: the camera eases back slightly and drifts left so the can sits left of center; a male athlete in a red football kit and dark red shorts sprints into frame from the right background toward the camera, low and powerful, water droplets and ice spray bursting from his stride. 4–6 s: he extends his right arm and his hand closes firmly around the can mid-air, the can tilting toward the camera, label facing the lens, sharp and legible, condensation on the aluminum. 6–7 s: freeze into ultra slow motion, ice shards and droplets hanging in the air around the can and athlete, camera locked. Shallow depth of field, focus on the can, cold diffused daylight with soft highlights. One continuous move, no cuts. [CAN LOCK] [GLOBAL STYLE]
>
> **Negative add-on:** garbled jersey text, extra fingers, deformed hand, warped label, face distortion, second can.

*Alternates (send all, I'll sequence them):* `10b_skate.mp4` skateboarder mid-air at sunset over concrete bowl · `10c_bike.mp4` mountain biker jumping off a ridge · `10d_dance.mp4` street dancer spinning under golden street lights. Same structure: gold light trails, no faces, slow-motion peak.

---

### 11_kosovo.mp4 — Kosovo
| Field | Detail |
|---|---|
| Start → End | K11 → K12 |
| Duration | 8 s |
| Camera | Crane up → forward aerial flight |

**Timeline**
- 0–2 s: Camera rises past the leaping athlete into the sky.
- 2–5 s: Reveals and flies over Rugova Canyon at golden hour, river below.
- 5–8 s: Golden eagle glides in from right, flies alongside camera, wings spread.

> **PROMPT:** The camera rises up past the leaping athlete into the golden sky and transitions into a sweeping forward aerial flight over the dramatic Rugova Canyon mountains of Kosovo at golden hour, sheer limestone cliffs and layered forested peaks glowing in warm haze, a river glinting deep in the gorge; a majestic real golden eagle glides into frame from the right and soars alongside the camera with wings fully spread, every feather lit gold. Epic, proud, continuous flight. [GLOBAL STYLE]

*Optional Kosovo extras:*
- `11b_prishtina.mp4`: *Slow aerial drift over Prishtina at dusk, warm city lights switching on block by block, the NEWBORN monument glowing in the city center, silhouettes of young people walking in the streets, energetic and modern.*
- `11c_prizren.mp4`: *Golden-hour aerial orbit around Prizren Fortress above the old stone town, red-tile roofs, minarets and the Ottoman stone bridge, warm lights reflecting on the Bistrica river.*

---

### 12_world.mp4 — The World
| Field | Detail |
|---|---|
| Start → End | K12 → K13 |
| Duration | 8 s |
| Camera | Continuous vertical pull-up, accelerating then slowing |

**Timeline**
- 0–2 s: Follow eagle climbing; mountains shrink.
- 2–4 s: Through cloud layer; Balkans visible.
- 4–6 s: Through atmosphere; curvature appears.
- 6–8 s: Full Earth at sunrise; gold dawn line; golden trail arcs around globe.

> **PROMPT:** The camera follows the golden eagle as it climbs higher and higher, the Kosovo mountains shrinking below, rising through a layer of golden clouds, the Balkans and Europe coming into view, through the thin blue atmosphere until the curvature of the Earth appears, ending in orbit with the whole planet at sunrise, a thin brilliant golden line of dawn sweeping across the horizon, city lights glowing on the night side and a luminous golden trail arcing around the globe. One continuous upward pull-out, awe-inspiring scale. [GLOBAL STYLE]

---

### 13_return.mp4 — Back to the Mountain
| Field | Detail |
|---|---|
| Start → End | K13 → K14 |
| Duration | 7 s |
| Camera | Dive down, fast → smooth deceleration |

**Timeline**
- 0–2 s: From orbit, camera tilts down and dives toward the Balkans.
- 2–4 s: Atmospheric entry glow, through golden clouds.
- 4–7 s: Slows; the opening mountain emerges, now golden, ice gone.

> **PROMPT:** From orbit the camera tilts down and dives toward Earth, plunging through the atmosphere with a soft golden entry glow, bursting through layers of sunrise clouds, then decelerating gracefully as the same jagged frozen mountain from the opening emerges through the clouds, now fully bathed in warm golden sunrise light, snow glowing gold and pink, the ice block gone. Continuous dive, smooth deceleration at the end. [GLOBAL STYLE]

---

### 14_final_hero.mp4 — The Final Hero
| Field | Detail |
|---|---|
| Start → End | K14 → K15 |
| Duration | 8 s |
| Camera | Descending glide → settles to low heroic angle → **locked** |

**Timeline**
- 0–3 s: Camera glides down onto summit; can comes into view on the top rock.
- 3–5 s: Golden eagle swoops in from left, lands beside can, folds wings halfway.
- 5–6 s: Sun crests exactly behind can → halo + flare.
- 6–8 s: **HOLD** — fully still; only snow sparkle and cloud drift.

> **PROMPT:** The camera glides down onto the golden mountain summit and settles at a low heroic angle looking up at the Golden Eagle Original can standing tall and alone on the highest rock; a real golden eagle swoops in from the left and lands on the rock beside the can, folding its wings halfway; the sun crests exactly behind the can, creating a radiant golden halo and gentle anamorphic lens flare, snow particles glittering, clouds rolling below; the camera comes to a complete stop and the final 2 seconds are perfectly still. Triumphant, iconic final shot. [CAN LOCK] [GLOBAL STYLE]

---

## PART 3 — OPTIONAL EXTRAS

| File | Purpose | Prompt |
|---|---|---|
| `loop_original.mp4` … `loop_coffee.mp4` | 4 s seamless idle loop while user pauses on a flavor | *"[Flavor] can perfectly still and centered, locked-off camera, only the surrounding [particles from table 0.6] drift slowly, seamless loop, [GLOBAL STYLE]"* |
| `can_[flavor]_front/34/side.png` | Flavor selector / shop section | *"Studio packshot of the Golden Eagle [Flavor] can on pure black, [front / three-quarter / side] view, soft gold rim light, [CAN LOCK]"* |
| `logo.svg` | Typography + end card | Official file please; don't generate it |

---

## PART 4 — QA CHECKLIST (before sending)
- [ ] Label legible and correct in every frame where the can faces camera
- [ ] Can size/position identical in K04–K09 (overlay them to check)
- [ ] Last frame of each clip ≈ first frame of next
- [ ] No cuts, no flicker, no text artifacts
- [ ] Holds are truly still (no drift of the can)

## PART 5 — DELIVERY
```
/videos
  01_mountain.mp4
  02_ice_reveal.mp4
  03_ice_shatter.mp4
  04_original_to_red.mp4
  05_red_to_sugarfree.mp4
  06_sugarfree_to_tropical.mp4
  07_tropical_to_strawberry.mp4
  08_strawberry_to_coffee.mp4
  09_energy.mp4
  10_movement.mp4        (+ 10b/10c/10d optional)
  11_kosovo.mp4          (+ 11b/11c optional)
  12_world.mp4
  13_return.mp4
  14_final_hero.mp4
/assets
  logo.svg
  can photos per flavor
```
