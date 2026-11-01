import type Hls from 'hls.js'
import { CHAPTERS, FPS, SCENES, VH_PER_SECOND, type Scene } from './scenes'
import { clipUrl, posterUrl } from './media'

/**
 * FilmEngine — the single source of animation truth.
 *
 *   scroll event ──► targetY (just a number, nothing else happens in the handler)
 *                       │
 *   one rAF loop ──► smoothY eases toward targetY (frame-rate independent)
 *                       │
 *                       ├─► active scene + frame  ──► video.currentTime (only when the frame changes
 *                       │                              and the previous seek has finished)
 *                       ├─► caption opacity/transform (compositor-only, written only when changed)
 *                       └─► progress rail scaleY, hold "breathing" scale
 *
 * React renders the static DOM once and hands element refs to the engine; no per-frame React state.
 * The loop sleeps when everything has settled and wakes on scroll / resize / seeked.
 */

type ClipState = {
  attachedUrl: string | null
  hls: Hls | null
  primed: boolean
  priming: boolean
  /** Last frame we asked the decoder for (-1 = unknown). */
  requested: number
  frames: number
  /** The element has decoded at least one frame of its current source (safe to show). */
  hasFrame: boolean
  /** An iOS seek is not display-ready until Safari reports the frame presented. */
  awaitingFrame: boolean
  frameCheckPending: boolean
}

type CaptionRange = {
  el: HTMLElement
  start: number
  end: number
  fade: number
  openStart: boolean
  openEnd: boolean
  interactive: boolean
  o: number
  y: number
  shown: boolean
  /** Inner word spans, revealed one after another from below a clipping line. */
  words: HTMLElement[]
  wy: number[]
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

type Events = {
  chapter: (index: number) => void
  load: (progress: number, ready: boolean) => void
  /** The scene on screen is waiting on the visitor's network. progress: 0–1, or null if unknown. */
  network: (slow: boolean, progress: number | null) => void
}

const IS_IOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Watermark-blur patch in source pixels (1920×1080) — the partner badge is pinned over it. */
const PATCH = { x1: 1500, y1: 935, x2: 1880, y2: 1045 }

export class FilmEngine {
  readonly scenes: Scene[] = SCENES
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  /** Total film length in viewport heights (scroll distance mapped to footage). */
  readonly totalVh = SCENES.reduce((sum, s) => sum + (s.frames / FPS) * VH_PER_SECOND + s.holdVh, 0)

  private videos: HTMLVideoElement[] = []
  private stills: HTMLElement[] = []
  private captionEls = new Map<string, HTMLElement>()
  private stage: HTMLElement | null = null
  private stageRoot: HTMLElement | null = null
  /** Scroll px where the footer's top edge reaches the top of the viewport. */
  private footerTop = Infinity
  private covered = false
  private fallback: HTMLImageElement | null = null
  private holdLayer: HTMLCanvasElement | null = null
  private holdingFrame = false
  /** What is actually visible: a scene's video layer index, or -1 for the poster still. */
  private shown = -2
  private fallbackSrc = ''
  private preloaded = new Set<string>()
  /** Decoded poster images, by URL. These exact elements are put on screen (no second fetch). */
  private posterImgs = new Map<string, HTMLImageElement>()
  private rail: HTMLElement | null = null
  private spacer: HTMLElement | null = null
  private badge: HTMLElement | null = null
  private wordEls = new Map<string, HTMLElement[]>()
  private lbTop: HTMLElement | null = null
  private lbBottom: HTMLElement | null = null
  private lbValue = -1
  private tcDigits: HTMLElement[] = []
  private tcValues: number[] = []
  private timecodeFrame = -1
  /** Footage seconds elapsed before each scene (holds don't advance the clock). */
  private sceneSec: number[] = SCENES.map((_, i) => SCENES.slice(0, i).reduce((s, x) => s + x.frames / FPS, 0))
  /** When the intro headline starts its timed entrance (after the loader curtain lifts). */
  private introStart = Infinity

  // depth planes + flavor light + pointer parallax
  private snowNear: HTMLElement | null = null
  private snowFar: HTMLElement | null = null
  private snowState = { o: -1, ny: NaN, nx: NaN, fy: NaN, fx: NaN }
  private toneLayer: HTMLElement | null = null
  private toneO = -1
  private tone = ''
  private captionLayer: HTMLElement | null = null
  private capShift = ''
  private readonly finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches
  private ptrTarget = { x: 0, y: 0 }
  private ptr = { x: 0, y: 0 }

  private clips: ClipState[] = SCENES.map((s) => ({
    attachedUrl: null,
    hls: null,
    primed: false,
    priming: false,
    requested: -1,
    frames: s.frames,
    hasFrame: false,
    awaitingFrame: false,
    frameCheckPending: false,
  }))

  // layout (px) — recomputed on resize only
  private vh = 1
  private vw = 1
  private sceneStart: number[] = []
  private scrubPx: number[] = []
  private holdPx: number[] = []
  private filmPx = 1
  private captions: CaptionRange[] = []

  // motion state
  private targetY = 0
  private smoothY = 0
  private lastTs = 0
  private raf = 0
  private running = false
  private stiffness = 6
  private active = -1
  private chapter = -1
  private stageScale = 1
  private railScale = -1

  private listeners: { [K in keyof Events]: Set<Events[K]> } = { chapter: new Set(), load: new Set(), network: new Set() }

  // slow-connection notice
  private waitSince = 0
  private slow = false
  private slowSince = 0
  private slowTimer = 0
  private hideTimer = 0
  private netProgress: number | null = null
  private loadState = { progress: 0, ready: false }
  private readyTimer = 0
  private mounted = false
  private dataHandlers: (() => void)[] = []

  // ───────────────────────────── registration (called from React refs)

  registerVideo = (i: number, el: HTMLVideoElement | null) => {
    if (el) this.videos[i] = el
  }
  registerStill = (i: number, el: HTMLElement | null) => {
    if (el) this.stills[i] = el
  }
  registerCaption = (id: string, el: HTMLElement | null) => {
    if (el) this.captionEls.set(id, el)
    else this.captionEls.delete(id)
  }
  registerWord = (captionId: string, index: number, el: HTMLElement | null) => {
    const list = this.wordEls.get(captionId) ?? []
    if (el) list[index] = el
    this.wordEls.set(captionId, list)
  }
  registerLetterbox = (which: 'top' | 'bottom', el: HTMLElement | null) => {
    if (which === 'top') this.lbTop = el
    else this.lbBottom = el
  }
  /** Timecode digit strips (HH:MM:SS:FF → 8 strips of 0–9), moved with transforms only. */
  registerTimecodeDigit = (index: number, el: HTMLElement | null) => {
    if (el) this.tcDigits[index] = el
  }
  registerSnow = (which: 'near' | 'far', el: HTMLElement | null) => {
    if (which === 'near') this.snowNear = el
    else this.snowFar = el
  }
  registerTone = (el: HTMLElement | null) => (this.toneLayer = el)
  registerCaptionLayer = (el: HTMLElement | null) => (this.captionLayer = el)
  /** Poster still shown when the scene on screen has no decoded video frame yet. */
  registerFallback = (el: HTMLImageElement | null) => (this.fallback = el)
  registerHoldFrame = (el: HTMLCanvasElement | null) => (this.holdLayer = el)
  registerStage = (el: HTMLElement | null) => (this.stage = el)
  /** The whole fixed film layer stack (videos, grade, snow, grain): dropped from compositing under the footer. */
  registerStageRoot = (el: HTMLElement | null) => (this.stageRoot = el)
  registerRail = (el: HTMLElement | null) => (this.rail = el)
  registerSpacer = (el: HTMLElement | null) => (this.spacer = el)
  registerBadge = (el: HTMLElement | null) => {
    this.badge = el
    this.badgeObserver?.disconnect()
    if (!el) return
    // re-centre when its own size changes (logo images / fonts arriving) — fires rarely, never per frame
    this.badgeObserver = new ResizeObserver(() => this.positionBadge())
    this.badgeObserver.observe(el)
  }
  private badgeObserver: ResizeObserver | null = null

  on<K extends keyof Events>(type: K, fn: Events[K]) {
    this.listeners[type].add(fn)
    if (type === 'load') (fn as Events['load'])(this.loadState.progress, this.loadState.ready)
    if (type === 'chapter' && this.chapter >= 0) (fn as Events['chapter'])(this.chapter)
    if (type === 'network') (fn as Events['network'])(this.slow, this.netProgress)
    return () => void this.listeners[type].delete(fn)
  }

  // ───────────────────────────── lifecycle

  mount() {
    if (this.mounted) return
    this.mounted = true

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('resize', this.onResize, { passive: true })
    window.addEventListener('touchstart', this.onTouch, { passive: true })
    window.addEventListener('wheel', this.onWheel, { passive: true })
    if (this.finePointer && !this.reduced) window.addEventListener('pointermove', this.onPointer, { passive: true })

    this.dataHandlers = this.videos.map((v, i) => {
      const onData = () => this.onClipData(i)
      v.addEventListener('seeked', onData)
      v.addEventListener('loadeddata', onData)
      // A streamed clip may stop after its header (preload is a hint): wake so the engine issues
      // the seek that makes the browser fetch and decode an actual frame.
      v.addEventListener('loadedmetadata', this.wake)
      return onData
    })

    this.measure()
    this.targetY = this.smoothY = window.scrollY

    if (this.reduced) {
      this.setLoad(1, true)
    } else {
      this.warmLayers()
      // Never hold the intro behind an HLS manifest or the first decoder startup.
      this.readyTimer = window.setTimeout(() => {
        this.setLoad(this.loadState.progress, true)
      }, 6000)
    }
    this.wake()
  }

  destroy() {
    this.mounted = false
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('touchstart', this.onTouch)
    window.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointermove', this.onPointer)
    this.videos.forEach((v, i) => {
      v.removeEventListener('seeked', this.dataHandlers[i])
      v.removeEventListener('loadeddata', this.dataHandlers[i])
      v.removeEventListener('loadedmetadata', this.wake)
    })
    cancelAnimationFrame(this.raf)
    clearTimeout(this.readyTimer)
    clearTimeout(this.slowTimer)
    clearTimeout(this.hideTimer)
    this.waitSince = 0
    this.slow = false
    this.running = false
    this.clips.forEach((c, i) => {
      c.hls?.destroy()
      c.hls = null
      c.attachedUrl = null
      c.hasFrame = false
      c.awaitingFrame = false
      c.frameCheckPending = false
      c.requested = -1
      const v = this.videos[i]
      if (v) {
        v.removeAttribute('src')
        v.load()
      }
    })
    this.active = -1
    this.shown = -2
    this.holdingFrame = false
    if (this.holdLayer) this.holdLayer.style.opacity = '0'
  }

  /**
   * Shader / raster warm-up, under the loader. The first time a glass card (backdrop blur), the
   * or the flavor light composites, the GPU builds its pipeline: a 250 ms+ stall that
   * otherwise lands mid-scroll on the first flavor. Every such layer is drawn once, practically
   * invisible, then handed back to the engine.
   */
  private warmLayers() {
    const els = [...this.captionEls.values(), this.toneLayer].filter((el): el is HTMLElement => !!el)
    const saved = els.map((el) => [el.style.visibility, el.style.opacity] as const)
    els.forEach((el) => {
      el.style.visibility = 'visible'
      el.style.opacity = '0.004'
    })
    this.warmingLayers = true
    window.setTimeout(() => {
      if (!this.mounted) return
      els.forEach((el, k) => {
        el.style.visibility = saved[k][0]
        el.style.opacity = saved[k][1]
      })
      this.warmingLayers = false
      // forget the cached styles so the next frame writes the real values
      this.captions.forEach((c) => {
        c.o = -1
        c.shown = c.el.style.visibility === 'visible'
      })
      this.toneO = -1
      this.wake()
    }, 700)
  }
  private warmingLayers = false

  // ───────────────────────────── input (cheap: store + wake)

  private onScroll = () => {
    this.targetY = window.scrollY
    this.wake()
  }
  // touch already has native momentum — follow it closely
  private onTouch = () => {
    // Keep the film close to native touch momentum; a slow catch-up reads as judder on phones.
    this.stiffness = 15
    // Retry the muted iOS decoder unlock inside a real touch gesture if autoplay was refused.
    if (IS_IOS && this.active >= 0) this.primeClip(this.active)
  }
  // wheel steps are coarse — ease them into a glide
  private onWheel = () => {
    // A shorter easing tail makes scrubbed footage respond immediately while retaining glide.
    this.stiffness = 12
  }
  private onPointer = (e: PointerEvent) => {
    this.ptrTarget.x = (e.clientX / this.vw) * 2 - 1
    this.ptrTarget.y = (e.clientY / this.vh) * 2 - 1
    this.wake()
  }

  private resizeRaf = 0
  private onResize = () => {
    cancelAnimationFrame(this.resizeRaf)
    this.resizeRaf = requestAnimationFrame(() => {
      // iOS fires resize when the URL bar collapses; layout uses lvh units so only re-measure on real changes
      const w = window.innerWidth
      const h = window.innerHeight
      if (w === this.vw && Math.abs(h - this.vh) < 120) return
      this.measure()
      this.wake()
    })
  }

  private wake = () => {
    if (this.running || !this.mounted) return
    this.running = true
    this.lastTs = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  // ───────────────────────────── layout

  private measure() {
    this.vw = window.innerWidth
    this.vh = window.innerHeight
    // The spacer is (totalVh + 100) lvh tall — deriving the unit from it keeps scroll ↔ film mapping
    // stable on mobile when the browser chrome shows/hides.
    const spacerH = this.spacer?.offsetHeight ?? this.vh * (this.totalVh + 100) / 100
    const unit = spacerH / (this.totalVh + 100)
    this.footerTop = spacerH

    let y = 0
    this.scenes.forEach((s, i) => {
      this.sceneStart[i] = y
      this.scrubPx[i] = (s.frames / FPS) * VH_PER_SECOND * unit
      this.holdPx[i] = s.holdVh * unit
      y += this.scrubPx[i] + this.holdPx[i]
    })
    this.filmPx = y

    this.captions = []
    this.scenes.forEach((s, i) => {
      for (const c of s.captions) {
        const el = this.captionEls.get(c.id)
        if (!el) continue
        const start = this.localToPx(i, c.from)
        const end = this.localToPx(i, c.to)
        this.captions.push({
          el,
          start,
          end,
          fade: Math.min((end - start) * 0.22, this.vh * 0.45),
          openStart: c.from < 0,
          openEnd: end >= this.filmPx - 1,
          interactive: c.layout === 'final' || c.layout === 'flavor',
          o: -1,
          y: NaN,
          shown: el.style.visibility === 'visible', // CSS default is hidden
          words: (this.wordEls.get(c.id) ?? []).filter(Boolean),
          wy: [],
        })
      }
    })

    this.positionBadge()
    this.railScale = -1
  }

  private localToPx(i: number, local: number) {
    const base = this.sceneStart[i]
    if (local <= 1) return base + local * this.scrubPx[i]
    return Math.min(base + this.scrubPx[i] + (local - 1) * this.holdPx[i], this.filmPx)
  }

  /** Where a chapter / flavor lives on the page, in scroll px. */
  positionOf(sceneIndex: number, local: number) {
    return this.localToPx(sceneIndex, local)
  }

  jumpTo(sceneIndex: number, local: number) {
    const top = Math.round(this.localToPx(sceneIndex, local))
    const near = Math.abs(sceneIndex - this.active) <= 1
    if (near && !this.reduced) {
      window.scrollTo({ top, behavior: 'smooth' })
    } else {
      // Long jumps snap: scrubbing through a dozen clips would just be noise.
      window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      this.targetY = this.smoothY = top
      this.wake()
    }
  }

  /**
   * Centres the partner badge on the blurred watermark patch, wherever object-fit: cover put it.
   * Runs on resize / focus change only (reads offsetWidth, so never in the hot path).
   */
  private positionBadge() {
    const b = this.badge
    if (!b) return
    const focus = this.scenes[Math.max(this.active, 0)].focusX ?? 0.5
    const s = Math.max(this.vw / 1920, this.vh / 1080)
    const offX = (this.vw - 1920 * s) * focus
    const offY = (this.vh - 1080 * s) / 2
    b.style.minWidth = `${Math.min((PATCH.x2 - PATCH.x1) * s * 0.92, this.vw - 32).toFixed(1)}px`
    const bw = b.offsetWidth
    const bh = b.offsetHeight
    const cx = offX + ((PATCH.x1 + PATCH.x2) / 2) * s
    const cy = offY + ((PATCH.y1 + PATCH.y2) / 2) * s
    const m = 16
    const left = Math.min(Math.max(cx - bw / 2, m), this.vw - bw - m)
    const top = Math.min(Math.max(cy - bh / 2, m), this.vh - bh - m)
    b.style.transform = `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0)`
    // On portrait screens the cover-crop pushes the watermark corner off-screen: nothing to cover,
    // so the badge steps aside instead of crowding the copy.
    const onScreen = offX + PATCH.x1 * s < this.vw - 48 && offY + PATCH.y1 * s < this.vh - 24
    b.style.opacity = onScreen ? '1' : '0'
    b.style.visibility = onScreen ? 'visible' : 'hidden'
    // Centred bottom cards (the final card) lift above the badge only when they would collide.
    const collides = onScreen && left < this.vw / 2 + 290
    document.documentElement.style.setProperty('--badge-clear', collides ? `${Math.ceil(this.vh - top + 14)}px` : '0px')
  }

  // ───────────────────────────── the loop

  private tick = (ts: number) => {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.1)
    this.lastTs = ts

    // Ease toward the scroll target. exp() makes the glide identical at 60/120/144 Hz.
    const gap = this.targetY - this.smoothY
    if (this.reduced || Math.abs(gap) < 0.5) this.smoothY = this.targetY
    else this.smoothY += gap * (1 - Math.exp(-dt * this.stiffness))

    // pointer eases with a soft spring-like lag, so depth planes feel weighted
    const pk = 1 - Math.exp(-dt * 4.5)
    this.ptr.x += (this.ptrTarget.x - this.ptr.x) * pk
    this.ptr.y += (this.ptrTarget.y - this.ptr.y) * pk
    const ptrMoving = Math.abs(this.ptrTarget.x - this.ptr.x) + Math.abs(this.ptrTarget.y - this.ptr.y) > 0.002

    const settledVideo = this.render(this.smoothY, ts)
    this.coverCheck()

    if (this.smoothY !== this.targetY || !settledVideo || ptrMoving) {
      this.raf = requestAnimationFrame(this.tick)
    } else {
      this.running = false // sleep until next scroll / seeked event
    }
  }

  /**
   * Once the footer fills the viewport, the film layers behind it stop being composited at all:
   * 13 full-screen videos, a moving grain plate and glass cards would otherwise be drawn under an
   * opaque page every frame while the visitor browses the range.
   */
  private coverCheck() {
    const covered = this.targetY >= this.footerTop + 2
    if (covered === this.covered) return
    this.covered = covered
    // opacity, not visibility: children that set visibility: visible would still be drawn, and a
    // transparent layer is skipped by the compositor without tearing down any video decoder
    const o = covered ? '0' : ''
    if (this.stageRoot) this.stageRoot.style.opacity = o
    if (this.captionLayer) this.captionLayer.style.opacity = o
  }

  /** Applies a film position to the DOM. Returns true when everything shows its final state. */
  private render(y: number, now: number): boolean {
    const pos = Math.min(Math.max(y, 0), this.filmPx)
    // Timed entrance for the opening title (the only non-scroll motion in the film).
    const introT = this.reduced ? 1 : clamp01((now - this.introStart) / 1700)

    // locate scene (13 scenes — linear scan is cheaper than anything clever)
    let i = this.scenes.length - 1
    for (let k = 0; k < this.scenes.length - 1; k++) {
      if (pos < this.sceneStart[k + 1]) {
        i = k
        break
      }
    }
    const local = pos - this.sceneStart[i]
    const p = this.scrubPx[i] > 0 ? Math.min(local / this.scrubPx[i], 1) : 1
    const h = this.holdPx[i] > 0 ? Math.max(0, Math.min((local - this.scrubPx[i]) / this.holdPx[i], 1)) : 0

    if (i !== this.active) this.activate(i)

    let settled = true
    if (!this.reduced) {
      const frames = this.clips[i].frames
      settled = this.seek(i, Math.round(p * (frames - 1)))
      // keep neighbours parked on their boundary frames so the hand-off is instant in either direction
      // Never seek a visible outgoing layer in the background: some browsers clear it to black
      // for the duration of the seek, exactly when it is serving as the transition hold frame.
      if (i + 1 < this.scenes.length && i + 1 !== this.shown) this.seek(i + 1, 0)
      if (i > 0 && i - 1 !== this.shown) this.seek(i - 1, this.clips[i - 1].frames - 1)
      this.present(i, p)
    }

    // Hold "breathing": a slow push-in and back while the clip rests on its hero frame.
    // The slow push-in is intentional on desktop; on iPhone it reads as an unwanted zoom.
    const scale = h > 0 && !this.reduced && !IS_IOS ? 1 + 0.028 * Math.sin(Math.PI * h) : 1
    if (this.stage && Math.abs(scale - this.stageScale) > 0.0002) {
      this.stageScale = scale
      this.stage.style.transform = scale === 1 ? '' : `scale3d(${scale.toFixed(4)},${scale.toFixed(4)},1)`
    }

    this.renderCaptions(pos, introT)
    this.renderDepth(i, p, h, pos)

    // Letterbox: the opening frame is 2.39:1 — the bars part as the film starts to move.
    const lb = this.reduced ? (pos > 4 ? 1 : 0) : Math.round(easeOut(clamp01(pos / (this.scrubPx[0] * 0.3))) * 1000) / 1000
    if (lb !== this.lbValue && this.lbTop && this.lbBottom) {
      this.lbValue = lb
      this.lbTop.style.transform = `translate3d(0,${(-lb * 100).toFixed(1)}%,0)`
      this.lbBottom.style.transform = `translate3d(0,${(lb * 100).toFixed(1)}%,0)`
      const vis = lb < 1 ? 'visible' : 'hidden'
      this.lbTop.style.visibility = this.lbBottom.style.visibility = vis
    }

    const railScale = Math.round((pos / this.filmPx) * 1000) / 1000
    if (this.rail && railScale !== this.railScale) {
      this.railScale = railScale
      this.rail.style.transform = `scaleY(${railScale})`
    }

    // Running timecode (HH:MM:SS:FF of footage). Rendered as odometer strips and moved with
    // transforms — changing text every frame would force a layout each time.
    if (this.tcDigits.length === 8) {
      const f = Math.round((this.sceneSec[i] + (p * (this.clips[i].frames - 1)) / FPS) * FPS)
      if (f !== this.timecodeFrame) {
        this.timecodeFrame = f
        const s = Math.floor(f / FPS)
        const m = Math.floor(s / 60)
        const parts = [0, 0, Math.floor(m / 10) % 10, m % 10, Math.floor((s % 60) / 10), s % 10, Math.floor((f % FPS) / 10), f % 10]
        for (let d = 0; d < 8; d++) {
          if (parts[d] === this.tcValues[d]) continue
          this.tcValues[d] = parts[d]
          this.tcDigits[d].style.transform = `translate3d(0,${-parts[d] * 10}%,0)`
        }
      }
    }

    let ch = 0
    for (let k = 0; k < CHAPTERS.length; k++) if (CHAPTERS[k].sceneIndex <= i) ch = k
    if (ch !== this.chapter) {
      this.chapter = ch
      this.listeners.chapter.forEach((fn) => fn(ch))
    }

    return settled && introT >= 1
  }

  /** Snow planes (opening + closing summit), flavor light, and pointer parallax on the type layer. */
  private renderDepth(i: number, p: number, h: number, pos: number) {
    const last = this.scenes.length - 1
    let snow = 0
    if (i <= 1) snow = 1
    else if (i === 2) snow = 1 - clamp01((p - 0.45) / 0.35)
    else if (i === last) snow = clamp01((p - 0.35) / 0.4) * 0.8
    if (this.reduced) snow *= 0.6
    snow = Math.round(snow * 100) / 100

    const st = this.snowState
    if (snow !== st.o && this.snowNear && this.snowFar) {
      st.o = snow
      this.snowNear.style.opacity = this.snowFar.style.opacity = String(snow)
      this.snowNear.style.visibility = this.snowFar.style.visibility = snow > 0 ? 'visible' : 'hidden'
      // These full-screen texture animations are only useful over the two mountain scenes.
      const playState = snow > 0 ? 'running' : 'paused'
      this.snowNear.firstElementChild instanceof HTMLElement && (this.snowNear.firstElementChild.style.animationPlayState = playState)
      this.snowFar.firstElementChild instanceof HTMLElement && (this.snowFar.firstElementChild.style.animationPlayState = playState)
    }
    if (snow > 0 && this.snowNear && this.snowFar && !this.reduced) {
      // near flakes travel faster than far ones: parallax depth from one scroll input
      const ny = Math.round(((pos * 0.42) % 1024) * 2) / 2 + this.ptr.y * 16
      const nx = this.ptr.x * -30
      const fy = Math.round(((pos * 0.16) % 512) * 2) / 2 + this.ptr.y * 6
      const fx = this.ptr.x * -11
      if (Math.abs(ny - st.ny) + Math.abs(nx - st.nx) > 0.3) {
        st.ny = ny
        st.nx = nx
        this.snowNear.style.transform = `translate3d(${nx.toFixed(1)}px,${ny.toFixed(1)}px,0)`
      }
      if (Math.abs(fy - st.fy) + Math.abs(fx - st.fx) > 0.3) {
        st.fy = fy
        st.fx = fx
        this.snowFar.style.transform = `translate3d(${fx.toFixed(1)}px,${fy.toFixed(1)}px,0)`
      }
    }

    // flavor light: rises as the can lands, holds, then dims before the next transformation
    const isFlavor = this.scenes[i].captions.some((c) => c.layout === 'flavor')
    const tone = isFlavor ? Math.round(clamp01((p - 0.72) / 0.28) * (1 - clamp01((h - 0.78) / 0.22)) * 100) / 100 : 0
    if (tone !== this.toneO && this.toneLayer && !this.warmingLayers) {
      this.toneO = tone
      this.toneLayer.style.opacity = String(tone)
    }

    // the type layer drifts opposite the pointer by a few px — it reads as sitting in front of the footage
    if (this.captionLayer && this.finePointer && !this.reduced) {
      const shift = `translate3d(${(this.ptr.x * -7).toFixed(1)}px,${(this.ptr.y * -5).toFixed(1)}px,0)`
      if (shift !== this.capShift) {
        this.capShift = shift
        this.captionLayer.style.transform = shift
      }
    }
  }

  private renderCaptions(pos: number, introT: number) {
    for (const c of this.captions) {
      const inF = c.openStart ? introT : clamp01((pos - c.start) / c.fade)
      const outF = c.openEnd ? 1 : clamp01((c.end - pos) / c.fade)
      const hasWords = c.words.length > 0 && !this.reduced

      // With word reveals the container only needs a quick fade-in; the words carry the entrance.
      const o = Math.round(Math.min(hasWords ? clamp01(inF * 3) : inF, outF) * 1000) / 1000
      const enterY = hasWords ? 0 : (1 - easeOut(inF)) * 36
      const y = this.reduced ? 0 : Math.round((enterY - (1 - easeOut(outF)) * 28) * 10) / 10

      const show = o > 0
      if (show !== c.shown) {
        c.shown = show
        c.el.style.visibility = show ? 'visible' : 'hidden' // hidden layers skip paint entirely
      }
      if (!show) continue
      if (o !== c.o) {
        c.o = o
        c.el.style.opacity = String(o)
        if (c.interactive) c.el.style.pointerEvents = o > 0.6 ? 'auto' : 'none'
      }
      if (y !== c.y) {
        c.y = y
        c.el.style.transform = y === 0 ? '' : `translate3d(0,${y}px,0)`
      }

      if (hasWords) {
        // Staggered mask reveal: each word rises out of its own clipping line.
        const n = c.words.length
        const st = n > 1 ? Math.min(0.14, 0.5 / (n - 1)) : 0
        const span = 1 - st * (n - 1)
        for (let k = 0; k < n; k++) {
          const w = easeOutQuart(clamp01((inF - k * st) / span))
          const wy = Math.round((1 - w) * 1100) / 10 // % of the word's own height
          if (wy !== c.wy[k]) {
            c.wy[k] = wy
            c.words[k].style.transform = wy === 0 ? '' : `translate3d(0,${wy}%,0)`
          }
        }
      }
    }
  }

  // ───────────────────────────── video

  private activate(i: number) {
    const prev = this.active
    this.active = i

    // retint the interface accent once per scene (one style pass, never per frame)
    const flavor = this.scenes[i].captions.find((c) => c.flavor)?.flavor
    const tone = flavor?.color ?? '#f2c230'
    if (tone !== this.tone) {
      this.tone = tone
      // scoped to the two elements that read it, so a retint never restyles the whole document
      this.toneLayer?.style.setProperty('--tone', tone)
      this.rail?.style.setProperty('--tone', tone)
    }
    if (this.reduced) {
      if (this.stills[i]) this.stills[i].style.opacity = '1'
      if (prev >= 0 && this.stills[prev]) this.stills[prev].style.opacity = '0'
    } else {
      // Video layers are swapped in present(), and only once the new clip has a decoded frame.
      this.updateWindow(i)
      this.preloadPosters(i)
    }
    if ((this.scenes[i].focusX ?? 0.5) !== (this.scenes[Math.max(prev, 0)].focusX ?? 0.5)) this.positionBadge()
  }

  /**
   * Keep the current and next HLS clips ready, plus the previous clip for the cut. Each attached
   * source holds decoder and network state, so limiting this window matters on mobile devices.
   */
  private updateWindow(i: number) {
    this.clips.forEach((c, k) => {
      const want = k >= i && k <= i + 1
      const keep = k >= i - 1 && k <= i + 1
      if (want) this.attach(k)
      else if (!keep && c.attachedUrl && k !== this.shown) this.detach(k)
    })
  }

  private attach(k: number) {
    const c = this.clips[k]
    const v = this.videos[k]
    if (!v) return
    const url = clipUrl(this.scenes[k].playbackId)
    if (!url || c.attachedUrl === url) return
    if (c.attachedUrl) this.detach(k)
    c.attachedUrl = url
    c.requested = -1
    c.primed = false
    c.priming = false
    c.hasFrame = false
    c.awaitingFrame = false
    c.frameCheckPending = false
    // Posters are local, tiny stills that cover the video while its HLS playlist buffers/seeks.
    if (!v.getAttribute('poster')) v.poster = posterUrl(this.scenes[k].file, 'first')
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari, including iPhone, has native HLS support.
      v.src = url
      v.load()
    } else {
      // Keep hls.js out of the initial bundle; Safari uses native HLS and never downloads it.
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (!this.mounted || c.attachedUrl !== url || this.videos[k] !== v) return
          if (!Hls.isSupported()) {
            c.attachedUrl = null
            if (k === 0) this.setLoad(1, true)
            this.wake()
            return
          }
          const hls = new Hls({
            capLevelToPlayerSize: true,
            maxBufferLength: 6,
            maxMaxBufferLength: 12,
            backBufferLength: 0,
            enableWorker: true,
            lowLatencyMode: false,
          })
          c.hls = hls
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal || c.attachedUrl !== url) return
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
            else {
              hls.destroy()
              c.hls = null
              c.attachedUrl = null
              c.hasFrame = false
              if (k === 0) this.setLoad(1, true)
              this.wake()
            }
          })
          hls.loadSource(url)
          hls.attachMedia(v)
        })
        .catch(() => {
          if (c.attachedUrl !== url) return
          c.attachedUrl = null
          if (k === 0) this.setLoad(1, true)
          this.wake()
        })
    }
  }

  private detach(k: number) {
    const c = this.clips[k]
    const v = this.videos[k]
    c.attachedUrl = null
    c.requested = -1
    c.hasFrame = false
    c.awaitingFrame = false
    c.frameCheckPending = false
    c.primed = false
    c.priming = false
    c.hls?.destroy()
    c.hls = null
    if (!v) return
    v.removeAttribute('src')
    v.load()
  }

  private onClipData(k: number) {
    const v = this.videos[k]
    const c = this.clips[k]
    // loadeddata can arrive for the old frame while a large seek is still in flight. Only
    // seeked (or a non-seeking loadeddata) makes this clip safe to put back on screen.
    if (c.awaitingFrame) {
      this.confirmPresentedFrame(k)
    } else if (IS_IOS && !c.primed) {
      // Never expose an iOS video surface until its muted play/pause priming has completed.
      c.hasFrame = false
      this.primeClip(k)
    } else if (c.attachedUrl && v.readyState >= 2 && !v.seeking) {
      c.hasFrame = true
      this.restoreHeldFrame(k)
    }
    if (Number.isFinite(v.duration) && v.duration > 0) c.frames = Math.max(1, Math.round(v.duration * FPS))
    if (k === 0 && c.hasFrame) this.setLoad(1, true)
    this.wake()
  }

  /** iOS Safari may report decoded data before it will paint a seeked frame. */
  private primeClip(k: number) {
    const v = this.videos[k]
    const c = this.clips[k]
    if (!IS_IOS || !v || !c?.attachedUrl || c.primed || c.priming || v.readyState < 2) return
    c.priming = true
    c.hasFrame = false
    v.play()
      .then(() => {
        v.pause()
        c.priming = false
        c.primed = true
        c.requested = -1
        c.hasFrame = c.attachedUrl !== null && v.readyState >= 2 && !v.seeking
        this.onFrameReady(k, c.hasFrame)
        this.wake()
      })
      .catch(() => {
        c.priming = false
        // Keep the poster visible; a later touchstart retries play() with a user gesture.
      })
  }

  /** Confirm the destination frame actually reached the compositor before showing it on iOS. */
  private confirmPresentedFrame(k: number) {
    const v = this.videos[k]
    const c = this.clips[k]
    if (!c?.awaitingFrame || c.frameCheckPending || !v || v.seeking) return
    if (!v.requestVideoFrameCallback) {
      // Older Safari has no presentation callback; seeked is its best available signal.
      c.awaitingFrame = false
      c.hasFrame = !!c.attachedUrl && v.readyState >= 2
      this.restoreHeldFrame(k)
      this.onFrameReady(k, c.hasFrame)
      this.wake()
      return
    }
    c.frameCheckPending = true
    v.requestVideoFrameCallback((_now, metadata) => {
      c.frameCheckPending = false
      if (!c.attachedUrl || !c.awaitingFrame) return
      const expected = (c.requested + 0.5) / FPS
      const matchesTarget = c.requested < 0 || Math.abs(metadata.mediaTime - expected) <= 2 / FPS
      if (!v.seeking && v.readyState >= 2 && matchesTarget) {
        c.awaitingFrame = false
        c.hasFrame = true
        this.restoreHeldFrame(k)
        this.onFrameReady(k, true)
        this.wake()
      } else {
        this.confirmPresentedFrame(k)
      }
    })
  }

  /** Keep a decoded frame above the video surface while iOS clears it during a long seek. */
  private holdDecodedFrame(k: number, v: HTMLVideoElement) {
    const canvas = this.holdLayer
    if (!canvas || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return false
    try {
      if (canvas.width !== v.videoWidth) canvas.width = v.videoWidth
      if (canvas.height !== v.videoHeight) canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      canvas.style.objectPosition = v.style.objectPosition
      canvas.style.opacity = '1'
      v.style.opacity = '0'
      this.holdingFrame = true
      this.shown = k
      return true
    } catch {
      return false
    }
  }

  private restoreHeldFrame(k: number) {
    if (!this.holdingFrame || k !== this.shown) return
    if (this.holdLayer) this.holdLayer.style.opacity = '0'
    this.videos[k].style.opacity = '1'
    this.holdingFrame = false
  }

  private onFrameReady(k: number, ready: boolean) {
    if (ready && k === 0) this.setLoad(1, true)
  }

  /**
   * Decides what is actually on screen. A clip is only shown once it has decoded a frame:
   * an element without data renders as an empty (black) layer. Until then:
   *   · near a scene boundary, keep the neighbouring clip. Clips are cut end-frame-to-start-frame,
   *     so its parked boundary frame is the same picture;
   *   · otherwise show the scene's poster still (first or last frame, whichever is closer).
   */
  private present(i: number, p: number) {
    const ready = (k: number) =>
      k >= 0 &&
      k < this.clips.length &&
      !!this.clips[k].attachedUrl &&
      (this.clips[k].hasFrame || (this.holdingFrame && k === this.shown))
    let target: number
    if (ready(i)) target = i
    else if (this.shown === i - 1 && ready(i - 1) && p < 0.3) target = i - 1
    else if (this.shown === i + 1 && ready(i + 1) && p > 0.7) target = i + 1
    else target = -1
    this.setWaiting(target !== i && this.loadState.ready)

    if (target === -1) {
      const src = posterUrl(this.scenes[i].file, p < 0.5 ? 'first' : 'last')
      const img = this.posterImgs.get(src)
      if (!img) {
        // Poster still downloading: hold whatever good picture is up (the previous clip or
        // poster) rather than ever compositing an empty layer. Its arrival wakes the loop.
        this.preloadPoster(src)
        return
      }
      // Swap in the already-decoded image element itself. Re-pointing a visible <img> at a URL
      // can blank it while the browser re-requests (e.g. cache disabled / evicted).
      this.usePoster(i, p < 0.5 ? 'first' : 'last')
    }
    if (target === this.shown) return
    // reveal the incoming layer before hiding the outgoing one, so nothing empty is ever composited
    if (target === -1) {
      if (this.fallback) this.fallback.style.opacity = '1'
    } else this.videos[target].style.opacity = '1'
    if (this.shown >= 0) this.videos[this.shown].style.opacity = '0'
    else if (this.shown === -1 && this.fallback) this.fallback.style.opacity = '0'
    if (this.holdingFrame && this.holdLayer) {
      this.holdLayer.style.opacity = '0'
      this.holdingFrame = false
    }
    this.shown = target
  }

  /** Point the persistent still layer at an already-decoded poster. */
  private usePoster(i: number, side: 'first' | 'last') {
    const src = posterUrl(this.scenes[i].file, side)
    const img = this.posterImgs.get(src)
    if (!img || !this.fallback || src === this.fallbackSrc) return
    img.className = this.fallback.className
    img.alt = ''
    img.style.objectPosition = `${(this.scenes[i].focusX ?? 0.5) * 100}% 50%`
    img.style.opacity = this.fallback.style.opacity || '0'
    this.fallback.replaceWith(img)
    this.fallback = img
    this.fallbackSrc = src
  }

  /**
   * The slow-connection notice. Shown only after the scene on screen has waited on the network
   * for 0.9 s (brief hand-off gaps on a good line never trigger it). Once up, it only clears after
   * footage has flowed for 2 s (and never before it has been up 3 s), so a visitor flicking
   * through on a mediocre line sees one steady status, not a blinking one.
   */
  private setWaiting(waiting: boolean) {
    if (waiting) {
      clearTimeout(this.hideTimer)
      this.hideTimer = 0
      if (this.waitSince) return
      this.waitSince = performance.now()
      this.slowTimer = window.setTimeout(() => this.setSlow(true), 900)
      return
    }
    if (!this.waitSince) return
    this.waitSince = 0
    clearTimeout(this.slowTimer)
    if (this.slow && !this.hideTimer) {
      const left = Math.max(2000, 3000 - (performance.now() - this.slowSince))
      this.hideTimer = window.setTimeout(() => {
        this.hideTimer = 0
        this.setSlow(false)
      }, left)
    }
  }

  private setSlow(on: boolean) {
    if (on === this.slow || !this.mounted) return
    this.slow = on
    if (on) {
      this.slowSince = performance.now()
      // Segment based HLS progress is not a meaningful percentage of a whole clip.
      this.netProgress = null
    }
    this.listeners.network.forEach((fn) => fn(on, this.netProgress))
  }

  /** Warms the poster stills for the next few scenes (small WebPs) so the fallback is instant. */
  private preloadPosters(i: number) {
    for (let k = i; k <= Math.min(i + 3, this.scenes.length - 1); k++) {
      this.preloadPoster(posterUrl(this.scenes[k].file, 'first'))
      this.preloadPoster(posterUrl(this.scenes[k].file, 'last'))
    }
  }

  private preloadPoster(url: string) {
    if (this.preloaded.has(url)) return
    this.preloaded.add(url)
    const img = new Image()
    img.decoding = 'async'
    img.fetchPriority = 'high' // ~100-250 KB each: let them jump the queue ahead of the big clips
    img.onload = () => {
      img
        .decode()
        .catch(() => {})
        .then(() => {
          this.posterImgs.set(url, img)
          this.wake()
        })
    }
    img.onerror = () => this.preloaded.delete(url) // retry next time it's needed
    img.src = url
  }

  /** Requests a frame. Never interrupts an in-flight seek; never re-seeks to the same frame. */
  private seek(k: number, frame: number): boolean {
    const v = this.videos[k]
    const c = this.clips[k]
    // not decodable yet — 'loadeddata' will wake the loop, so don't spin
    if (!v || !c.attachedUrl || v.readyState < 1) return true
    if (v.seeking) return false
    if (c.requested === frame) return true
    // aim for the middle of the frame so float rounding never lands on the neighbour
    const t = Math.min((frame + 0.5) / FPS, v.duration - 0.001)
    const distance = Math.abs(v.currentTime - t)
    if (distance > 0.5 / FPS) {
      // Browsers may clear a video layer while decoding a distant seek. Keep the last good
      // picture/poster visible until seeked confirms that the destination frame is decoded.
      if (k === this.active && distance > 0.2) {
        // If this is the currently visible layer, let its poster decode before starting the seek.
        if (k === this.shown) {
          const held = IS_IOS && this.holdDecodedFrame(k, v)
          if (!held) {
            const side = frame < c.frames / 2 ? 'first' : 'last'
            const still = posterUrl(this.scenes[k].file, side)
            if (!this.posterImgs.has(still)) {
              this.preloadPoster(still)
              return false
            }
            this.usePoster(k, side)
            if (this.fallback) this.fallback.style.opacity = '1'
            v.style.opacity = '0'
            this.shown = -1
          }
        }
        c.hasFrame = false
        if (IS_IOS) c.awaitingFrame = true
      }
      c.requested = frame
      v.currentTime = t
    } else {
      c.requested = frame
    }
    return false
  }

  // ───────────────────────────── loading

  private setLoad(progress: number, ready: boolean) {
    const r = this.loadState.ready || ready
    if (progress === this.loadState.progress && r === this.loadState.ready) return
    this.loadState = { progress, ready: r }
    if (r) {
      clearTimeout(this.readyTimer)
      // the opening title starts rising while the loader curtain is still lifting
      if (this.introStart === Infinity) this.introStart = performance.now() + 450
      this.wake()
    }
    this.listeners.load.forEach((fn) => fn(progress, r))
  }

}
