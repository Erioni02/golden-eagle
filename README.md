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
| `src/film/FilmEngine.ts` | Scroll → video engine (single rAF loop, seeking, captions, decode window, loading) |
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

- **The scroll handler only stores `scrollY`.** One rAF loop eases toward it (frame-rate-independent exponential smoothing) and sleeps when settled.
- **Video seeks happen only when the target frame changes,** never while a seek is in flight, and always to the middle of the frame. Neighbouring clips are parked on their boundary frames, so the hand-off between clips is invisible.
- **Clips are downloaded whole into memory (Blob → object URL),** nearest-ahead first, two at a time, so seeking never waits on network range requests. A clip falls back to streaming if a download fails or stalls.
- **The screen is never empty.** A clip is only shown once it has decoded a frame. Until then the engine holds the neighbouring clip's matching boundary frame, or the scene's poster still (posters are pre-decoded and swapped in as elements, so they never blank).
- **Outrunning the downloads degrades to streaming, not black.** If the scene on screen hasn't downloaded yet (and won't land within ~1.5 s, judged from live download progress), it streams immediately with priority: its duplicate download is cancelled and background prefetches pause until it shows a frame. Downloads of clips already scrolled past are cancelled. The next scene pre-streams only once the current one is satisfied.
- **Slow connections are named, not hidden.** If the scene on screen has waited on the network for 0.9 s, a small glass notice under the nav says "Your connection is slow" with the download progress (`NetworkNotice.tsx`). It clears once footage has flowed for 2 s, never shows on a good line, and is announced once to screen readers.
- **No more than five `<video>` elements hold a source at once,** to keep decoder memory in check, which matters on iOS.
- **Clips use a short keyframe interval with no B-frames,** so a random seek decodes at most 7 frames (the raw files had one keyframe per clip).
- **Captions animate only `opacity` and `transform`,** and each value is written only when it changes. React never re-renders per frame.
- **Liquid glass (`backdrop-filter`) is limited to small surfaces:** the nav, badge and cards.
- `prefers-reduced-motion` shows still frames per scene with no video downloads, and captions don't move.

Measured on a production build with headless Chrome while scrubbing: about 0.4 ms of script and 0.4 ms of style work per frame, layout close to zero, no long tasks, and a 2.2 MB JS heap.

## Hosting the clips on a CDN

The clips are served from `/media` by default. To serve them from Cloudinary (or any CDN), upload the **encoded** files with the same folder layout (`desktop/`, `mobile/`, `posters/`) and set:

```
VITE_MEDIA_BASE=https://res.cloudinary.com/<cloud>/video/upload/<folder>
```

Use the encoded files, not the raw uploads: the raw ones still carry the watermark and have one keyframe per clip, which makes scrubbing stutter.
