# Golden Eagle: Scroll Film

A cinematic, scroll-controlled film: frozen summit → ice break → six flavors → energy → movement → Kosovo → the world → final hero.
Built with React 18, TypeScript, Vite and Tailwind CSS v4. There are no animation libraries: one `requestAnimationFrame` loop drives everything.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
```

## Design system

| Role | Choice |
|---|---|
| Type | **Geist** (variable, self-hosted). Display weight 560, tracking −0.055em, mixed case |
| Emphasis | **Geist Italic** in brand gold: the same family, never a second typeface (`*word*` in `scenes.ts`) |
| Labels / timecode | **Geist Mono** |
| Icons | **Phosphor**, one weight |
| Surfaces | Double-bezel liquid glass: a frosted `.bezel` tray holding a tinted `.core` plate. This is a web approximation; Apple doesn't publish a CSS version |
| Radii | Pills for everything interactive, 2rem for every card |
| Motion | `--ease-out` / `--ease-in-out` / `--ease-drawer` curves. Hover effects are gated behind `(hover: hover)`. Everything collapses under `prefers-reduced-motion` |

**Signature moves:**
- **Letterbox opening.** The first frame is 2.39:1 and the bars part as the film starts.
- **Word-by-word headlines.** Each word rises out of its own clipping line, driven by scroll.
- **Depth planes.** Two snow layers at different distances drift over the opening and closing summit and respond to scroll and the pointer. The type layer also shifts slightly against the pointer.
- **Flavor light.** During each flavor's hold, that flavor's colour spills onto the interface side of the frame and retints the progress rail.
- **Film HUD.** A rolling timecode (transform-only digits) and chapter ticks.
- **Camera weight.** The film follows the scroll on a critically damped spring: it eases in and out like a camera move and never overshoots. With a mouse or trackpad the frame leans in by up to 1.6% at speed, like a dolly push.
- **Frame blending.** Between two whole frames the next one is cross-faded in by the scroll position, so slow scrolling glides instead of stepping at 24 fps. At rest it settles on a single frame.
- **Page glide.** With a mouse or trackpad the engine moves the page itself, on the same spring as the film, so a notched wheel becomes one continuous move and the range section glides like the film. Touch keeps native momentum. "The Range" and chapter jumps ride the same spring, slower.
- **Parallax exit.** As the range section rises, the last frame sinks behind it at a third of the page's speed and dims under a feathered edge.

**Copy rules:**
- No em dashes.
- No `01 / 06` counters.
- No scroll cue.
- At most two eyebrow tags on the whole page.
- One label per call-to-action intent ("The Range", "Replay the film").

## Responsive layout modes

The film's type sits on video, so placement follows the shape of the frame. These are custom Tailwind variants in `index.css`:

| Mode | When | Behaviour |
|---|---|---|
| default | landscape tablets and up | Copy anchored left/centre; flavor card floats mid-left |
| `stack:` | phones (<768px) and portrait tablets (<1024px portrait) | All copy docks to the bottom edge; the flavor card spans the width |
| `short:` | height ≤ 560px (landscape phones) | Compact cards; secondary copy hidden |

The type scale is bounded by width **and** height (`min(vw, vh)`), so short laptops never get oversized headlines. The partner badge hides itself when the cover-crop pushes the watermark corner off-screen (portrait), and centred cards lift above it when they would collide.

Tested at 320×568, 390×844, 430×932, 844×390, 768×1024, 820×1180, 1024×768, 1280×720, 1440×900, 1920×1080 and 2560×1080. Automated checks covered no horizontal overflow, no off-screen captions, no caption/nav/badge collisions and no wrapped buttons.

## Structure

| Path | What it is |
|---|---|
| `src/film/scenes.ts` | **The film as data**: clip order, hold lengths, chapter names, all captions and flavor copy. Edit text here. |
| `src/film/FilmEngine.ts` | Scroll → film engine (single rAF loop, spring, canvas / video presentation, captions, decode window, loading) |
| `src/film/decoder.ts` | WebCodecs path: a small MP4 demuxer, one shared GOP-streaming decoder, and each clip's bitmap cache around the playhead |
| `src/film/media.ts` | Clip URLs, desktop/mobile variant choice, Blob download with progress |
| `src/components/*` | Stage (videos, snow planes, flavor light, grain), Captions, Title (word reveals), Letterbox, Nav (island + full-screen menu), Rail (timecode HUD), PartnerBadge, Loader, Footer (range grid + close) |
| `public/media/desktop/` | 1080p clips, GOP 8, no B-frames (77 MB total) |
| `public/media/mobile/` | 720p clips, GOP 6 (32 MB total) |
| `public/media/posters/` | First/last frame of each clip (WebP), used for instant paint and reduced motion |
| `public/brand/` | Optimised logos (`golden-eagle.webp`, `eagle-emblem.webp`, `frutex-on-dark.svg`) |
| `brand-source/` | The original logo files you supplied |
| `scripts/encode.sh` | Re-creates everything in `public/media` from `media/raw` |

## Clip order (raw Cloudinary file → scene)

| # | Scene | Cloudinary file |
|---|---|---|
| 01 | Mountain approach | `75ec4de7…` (`…_1` is a byte-identical duplicate, unused) |
| 02 | Ice reveal | `e10a46c5…` |
| 03 | Shatter → Original | `7c748a97…` |
| 04 | Original → Red | `963c6c93…` |
| 05 | Red → Sugar Free | `110663ff…` |
| 06 | Sugar Free → Tropical | `2d4286d9…` |
| 07 | Tropical → Strawberry | `d2cd5336…` |
| 08 | Strawberry → Coffee | `ef884f43…` |
| 09 | Coffee → Energy | `8cdaae14…` |
| 10 | Energy → Movement | `1a3251da…` |
| 11 | Kosovo | `a007d465…` |
| 12 | World | `3f932ce5…` |
| 13 | Return → Final hero | `65b0bfc3…` |

## The watermark

The "AI generated" text is removed in the encode (ffmpeg `delogo` plus a feathered blur). The Golden Eagle × Frutex glass badge is then pinned over that area at runtime: the engine works out where `object-fit: cover` put that patch for the current screen size.

## Performance notes

- **Input handlers only store a target** (`scrollY`, or the wheel's running total while the engine glides the page). One rAF loop follows it on a critically damped spring (an analytic step, so the glide is identical at 60/120/144 Hz), writes the page position when gliding, and sleeps when settled.
- **Every screen refresh shows a new, exact frame.** Frames are decoded with WebCodecs and drawn on a canvas in every browser that has it. A seeked `<video>` can only change its picture as fast as seeks complete, one at a time. Measured in Chrome, that was every other refresh at a normal scrolling speed, and in Safari far worse (stutter, blanking, seconds of black after a jump). The `<video>` path remains as the fallback.
- **QA switches** (add to the URL): `?video` forces the `<video>` path, `?native` turns off the page glide, `?debug` exposes the engine as `window.__film` on a production build.

### Canvas path (WebCodecs)

- **One decoder for the whole film.** Each downloaded clip is demuxed in the browser (`decoder.ts`, no library), and a single hardware decoder, created once under the loader, streams GOPs from any clip. The bitstream is fed as Annex B with the clip's SPS/PPS in front of every keyframe, so switching clips needs no reconfiguration. A decoder per scene used to stall Chrome's GPU thread for ~170 ms at every cut and allocate a fresh set of picture buffers each time.
- **Frames near the playhead are kept as `ImageBitmap` copies,** so the engine draws the exact frame in the same rAF it asks for it, and the decoder gets its own buffers straight back. Holding the decoder's `VideoFrame`s instead starved it to 4 fps.
- **The canvas never goes black.** It keeps its pixels until something better is drawn. While a GOP decodes, it shows whichever is closest to the right picture: the nearest decoded frame, the scene's first or last poster, or what it already holds (a cut's shared frame counts for both scenes). Long jumps land on the poster of the exact landing frame within one or two rAFs.
- **The decoder is kept streaming.** At most two GOPs are in flight, served in priority order: the scene on screen first, then the neighbour in the direction of travel. It's never flushed mid-stream (a flush drains the whole pipeline, and flushing after every GOP cut throughput to a quarter), only once everything wanted has been fed. The GOP behind the playhead is only decoded when moving slowly enough to turn around. Past one footage frame per refresh the cross-fade is skipped, since every refresh shows a new frame anyway.
- **Memory is bounded by role.** The scene on screen keeps three GOPs (two on phones and tablets). Its neighbours keep only the GOP at the shared cut, so crossing a cut in either direction is instant. Clips are released two scenes away. At 1080p the total is about 40 bitmaps (~330 MB of GPU memory); at 720p about 26 (~100 MB).
- **Safety nets.** A clip that can't be read falls back to its `<video>`. Two such clips, a decoder that fails repeatedly, or measured throughput under 45 frames/s switch the visit to the `<video>` path. A decoder the browser reclaims (idle background tab) is rebuilt quietly.

Smoothness benchmark (production build, headless Chrome on an Intel Iris Xe laptop, 1440×900, whole film; "fresh" = refreshes where the picture changed while the film was moving):

| Pass | `<video>` path: fresh / dropped | Canvas path: fresh / dropped |
|---|---|---|
| 900 px/s | 47% / 1 of ~1,000 | 100% / 3 of ~1,000 |
| 1800 px/s forward | 79% / 0–1 of ~1,480 | 100% / 11 of ~1,480 |
| 1800 px/s back | 78% / 0–2 of ~1,480 | 100% / 9 of ~1,480 |

The canvas path is also exact (mean error 0.01 frames when blending), and a fast flick that rendered 30 frames in 4 s with one decoder per scene renders 215 with the shared decoder.

Real wheel input (CDP, 100 px notches): with the page glide, the page moves in ~13 px steps with an unevenness of 1.2 px between consecutive steps, against 100 px jumps natively. A trackpad-style flick goes from 13.2 to 0.7.

### `<video>` path (no WebCodecs, or fallback)

- **Video seeks happen only when the target frame changes,** never while a seek is in flight, and always to the middle of the frame. Neighbouring clips are parked on their boundary frames, so the hand-off between clips is invisible.
- **The screen is never empty.** A clip is only shown once it has decoded a frame. Until then the engine holds the neighbouring clip's matching boundary frame, or the scene's poster still (posters are pre-decoded and swapped in as elements, so they never blank).
- **No more than five `<video>` elements hold a source at once on phones and iOS,** to keep decoder memory in check. On desktop-class devices every downloaded clip stays attached instead: attaching or detaching a source spins a hardware decoder up or down and stalls the compositor for 100–180 ms, so it happens once per clip, only while the viewer is at rest, and never at a scene boundary mid-scroll.

Measured on a production build with headless Chrome while scrubbing: about 0.4 ms of script and 0.4 ms of style work per frame, layout close to zero, no long tasks, and a 2.2 MB JS heap.

Whole-film scroll test (production build, Chrome, 1440×900, forward and back at 1800 px/s plus a slow 700 px/s pass): 1 dropped frame out of about 7,000, worst frame 33 ms. Before the decoder and warm-up changes the slow pass alone dropped 65 frames with stalls up to 350 ms.

### Both paths

- **Clips are downloaded whole into memory (Blob),** nearest-ahead first, two at a time, so a frame never waits on a network range request. A clip falls back to streaming through its `<video>` if a download fails or stalls.
- **Outrunning the downloads degrades to streaming, not black.** If the scene on screen hasn't downloaded yet (and won't land within ~1.5 s, judged from live download progress), it streams immediately with priority: its duplicate download is cancelled and background prefetches pause until it shows a frame. Downloads of clips already scrolled past are cancelled. The next scene pre-streams only once the current one is satisfied.
- **Slow connections are named, not hidden.** If the scene on screen has waited on the network for 0.9 s, a small glass notice under the nav says "Your connection is slow" with the download progress (`NetworkNotice.tsx`). It clears once footage has flowed for 2 s, never shows on a good line, and is announced once to screen readers.
- **GPU warm-up under the loader.** Every glass card and the flavor light are composited once at near-zero opacity while the loader is up. The first backdrop-blur draw otherwise costs a 250 ms+ stall, which used to land on the first flavor.
- **Nothing is drawn behind the footer.** Once the range section fills the viewport, the film layers drop to opacity 0 and the compositor skips them (no decoder teardown, so coming back up is instant). Footer reveals animate only `opacity` and `transform`.
- **Clips use a short keyframe interval with no B-frames,** so a random seek decodes at most 7 frames (the raw files had one keyframe per clip). The canvas path depends on both: each GOP is decoded on its own, and a clip with B-frames is refused there and plays from its `<video>`. Keep `-g` and `-bf 0` in `scripts/encode.sh`.
- **Captions animate only `opacity` and `transform`,** and each value is written only when it changes. React never re-renders per frame.
- **Liquid glass (`backdrop-filter`) is limited to small surfaces:** the nav, badge and cards.
- **The film grain plate is exactly viewport-sized.** It used to be 200% in each direction, which cost Safari a 4× full-screen texture for nothing.
- `prefers-reduced-motion` shows still frames per scene with no video downloads, and captions don't move.

## Hosting the clips on a CDN

The clips are served from `/media` by default. To serve them from Cloudinary (or any CDN), upload the **encoded** files with the same folder layout (`desktop/`, `mobile/`, `posters/`) and set:

```
VITE_MEDIA_BASE=https://res.cloudinary.com/<cloud>/video/upload/<folder>
```

Use the encoded files, not the raw uploads: the raw ones still carry the watermark and have one keyframe per clip, which makes scrubbing stutter.
