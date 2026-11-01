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
| `src/film/media.ts` | Mux HLS stream URLs and local poster paths |
| `src/components/*` | Stage (videos, snow planes, flavor light, grain), Captions, Title (word reveals), Letterbox, Nav (island + full-screen menu), Rail (timecode HUD), PartnerBadge, Loader, Footer (range grid + close) |
| `public/media/posters/` | First/last frame WebP stills, used as loading fallbacks and for reduced motion |
| `public/media/cards/` | Flavor grid images |
| `public/brand/` | Optimised logos (`golden-eagle.webp`, `eagle-emblem.webp`, `frutex-on-dark.svg`) |
| `brand-source/` | The original logo files you supplied |
| `scripts/encode.sh` | Regenerates poster stills; temporary MP4 intermediates are not written to `public/` |

## Mux clip order

Playback IDs are stored with the scenes so clips can be reordered by their content. The extra summit link supplied was a duplicate and is not used twice.

| # | Scene | Mux playback ID |
|---|---|---|
| 01 | Summit | `auLDErgiw9PWL1kJqNSUkWOE5l8nc1UTvF9PBYJKxY00` |
| 02 | Ice | `srdJHmwBJXiHNgJ7R1STYq4TpKeQ33CCKhefvJkm7Rg` |
| 03 | Shatter | `XCPePN0100dmO8LFnBM1AXL01hSLiT02L1pdUnOC025XOaL00` |
| 04 | Red | `JAGqKwjFfsXTiOMD3PFwOMFgb1XV6mWuvBFXLZXiEj8` |
| 05 | Sugar Free | `Ij0101JSV00vMgxylefgSSIg4psJvdi31k4AHeQkZXNNC8` |
| 06 | Tropical | `7TS334bW5Z003jf00CiAkz02NmXeQoIoGT006N1w00wT01eiA` |
| 07 | Strawberry | `lPecdopcDDHSyLHh1wcDL83xWcyh7cA00Owd01018012F6A` |
| 08 | Coffee | `EajZNX0102ThZTfUbW501rw2RYHMTxApyftvDBE2FzTMf4` |
| 09 | Energy | `JtXlDYMwpYvCE8ViU6c00Nkngki02pxW008HIPHacOZ600g` |
| 10 | Movement | `DE4Yfmf5bf1bS2RdgXwOfrFGvBH8PSCOmhXQezfIPeA` |
| 11 | Kosovo | `M78h7At2FzCdjom01qkekSBGdo003Uh83XECiNy6TlJFQ` |
| 12 | World | `4O25EWtiLDSC00CD5XtMqxfcpMWCRfLPjd1pI7v23zrY` |
| 13 | Return | `01ES7RTCtRg1KNEWq81qBIRZUG802na9fCP6xYC4rjsJY` |

## The watermark

The poster generator removes the known "AI generated" label from its temporary source encode before saving local stills. At runtime the Golden Eagle × Frutex glass badge is pinned over the matching patch in the Mux footage; the engine accounts for the current `object-fit: cover` crop.

## Performance notes

- **The scroll handler only stores `scrollY`.** One rAF loop eases toward it (frame-rate-independent exponential smoothing) and sleeps when settled.
- **Video seeks happen only when the target frame changes,** never while a seek is in flight, and always to the middle of the frame.
- **Mux delivers adaptive HLS streams.** The current and next clips are loaded, while the previous clip stays available around the cut; older sources are detached to limit decoder and network use.
- **The screen is never empty.** A clip is shown only after a frame decodes. While a stream is loading or seeking, the engine holds a decoded frame or a local poster instead of exposing a black video layer.
- **Slow connections are named, not hidden.** If the scene on screen has waited on the network for 0.9 s, a small glass notice under the nav says "Your connection is slow" (`NetworkNotice.tsx`). It clears once footage has flowed for 2 s and is announced to screen readers.
- **At most three `<video>` elements hold sources at once,** keeping a small decoder window for scene cuts without retaining the whole film.
- **GPU warm-up under the loader.** Every glass card and the flavor light are composited once at near-zero opacity while the loader is up. The first backdrop-blur draw otherwise costs a 250 ms+ stall, which used to land on the first flavor.
- **Nothing is drawn behind the footer.** Once the range section fills the viewport, the film layers drop to opacity 0 and the compositor skips them (no decoder teardown, so coming back up is instant). Footer reveals animate only `opacity` and `transform`.
- **Captions animate only `opacity` and `transform`,** and each value is written only when it changes. React never re-renders per frame.
- **Liquid glass (`backdrop-filter`) is limited to small surfaces:** the nav, badge and cards.
- `prefers-reduced-motion` shows local still frames per scene without attaching video streams, and captions don't move.

## Mux playback

The browser requests `https://stream.mux.com/<playback-id>.m3u8`. Safari uses native HLS; other browsers lazy-load hls.js. The local MP4 encodes are not part of the website bundle or deployment. Only the small poster and flavor-card images remain local.
