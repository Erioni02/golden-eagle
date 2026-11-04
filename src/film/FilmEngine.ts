import { CHAPTERS, FPS, SCENES, VH_PER_SECOND, type Scene } from './scenes'
import { clipUrl, fetchClip, pickVariant, posterUrl, type Variant } from './media'
import { FrameStore, codecSupported, type Clip } from './decoder'

/**
 * FilmEngine — the single source of animation truth.
 *
 *   scroll event ──► targetY (just a number, nothing else happens in the handler)
 *                       │
 *   one rAF loop ──► smoothY follows targetY on a critically damped spring (frame-rate independent)
 *                       │
 *                       ├─► active scene + fractional frame ──► canvas: the decoded frame, cross-faded
 *                       │                                       into the next one between whole frames
 *                       │     (no WebCodecs: video.currentTime, only when the frame changes and the
 *                       │      previous seek has finished)
 *                       ├─► caption opacity/transform (compositor-only, written only when changed)
 *                       └─► progress rail scaleY, hold "breathing" + speed push scale, footer parallax
 *
 * React renders the static DOM once and hands element refs to the engine; no per-frame React state.
 * The loop sleeps when everything has settled and wakes on scroll / resize / decoded frame / seeked.
 */

type ClipState = {
  /** The downloaded clip (null until it has fully arrived). */
  blob: Blob | null
  /** Object URL of `blob`, made only if a <video> needs it. */
  blobUrl: string | null
  attachedUrl: string | null
  fetching: boolean
  failed: boolean
  primed: boolean
  priming: boolean
  /** Download is taking too long for the scene on screen — stream it meanwhile. */
  streamFallback: boolean
  /** Last frame we asked the decoder for (-1 = unknown). */
  requested: number
  frames: number
  /** The element has decoded at least one frame of its current source (safe to show). */
  hasFrame: boolean
  /** An iOS seek is not display-ready until Safari reports the frame presented. */
  awaitingFrame: boolean
  frameCheckPending: boolean
  /** Cancels this clip's download (when the viewer has already scrolled past it). */
  fetchAbort: AbortController | null
  /** Pending "stream it if the download hasn't landed" timer. */
  graceTimer: number
  /** Download progress (bytes) and start time, to tell "nearly here" from "far away". */
  loaded: number
  total: number
  fetchStart: number
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

/** `shown` value for the decoded-frame canvas (video layers are 0…n, the poster still is -1). */
const CANVAS = -3

const QUERY = new URLSearchParams(location.search)

export class FilmEngine {
  readonly scenes: Scene[] = SCENES
  /** Desktop (1080p) or mobile (720p) clips. Drops to 720p for the rest of the visit on a slow line. */
  variant: Variant = pickVariant()
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  /**
   * Frames come from WebCodecs and are drawn on a canvas, in every browser that has it. A seeked
   * <video> can only change its picture as fast as seeks complete (one at a time): in Chrome that
   * was every other screen refresh at a normal scrolling speed, and in Safari far worse (stutter,
   * blanking). The canvas changes on every refresh. `?video` forces the <video> path for QA.
   * Turned off for the rest of the visit if decoding fails for two clips or can't keep up.
   */
  private codec = codecSupported() && !this.reduced && !QUERY.has('video')
  /**
   * <video> path only. Desktop-class device with decoder headroom: every downloaded clip stays attached.
   * Attaching or detaching a <video> source spins a hardware decoder up / down, which stalls the
   * compositor for 100–180 ms. Doing that at a scene boundary mid-scroll is a visible hitch, so on
   * these devices it happens once per clip, while the viewer is at rest, and never again.
   */
  private readonly roomy =
    !this.codec &&
    !IS_IOS &&
    this.variant === 'desktop' &&
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) >= 4

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
  private exitShift = 0
  private exitShade = 0
  private shade: HTMLElement | null = null
  private fallback: HTMLImageElement | null = null
  private holdLayer: HTMLCanvasElement | null = null
  private holdingFrame = false
  /** What is actually visible: a scene's video layer index, or -1 for the poster still. */
  private shown = -2
  private fallbackSrc = ''
  private preloaded = new Set<string>()
  /** The on-screen clip being streamed with priority (-1 = none): background downloads pause for it. */
  private streaming = -1
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

  // decoded-frame canvas (WebCodecs path)
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  /** The one shared decoder, and each nearby clip's frames in it. */
  private store: FrameStore | null = null
  private tracks: (Clip | null)[] = SCENES.map(() => null)
  private opening = new Set<number>()
  private codecFailed: boolean[] = SCENES.map(() => false)
  /** What the canvas holds: scene and (fractional) frame. Posters count as their first / last frame. */
  private cv = { scene: -1, f: -1 }
  private canvasFocus = ''
  /** Displayed fractional frame: tracks the scroll while moving, settles on a whole frame at rest. */
  private dispF = 0
  private dispScene = -1
  /** Mounted generation: async work from an earlier mount (StrictMode, HMR) is ignored. */
  private gen = 0

  private clips: ClipState[] = SCENES.map((s) => ({
    blob: null,
    blobUrl: null,
    attachedUrl: null,
    fetching: false,
    failed: false,
    primed: false,
    priming: false,
    streamFallback: false,
    requested: -1,
    frames: s.frames,
    hasFrame: false,
    awaitingFrame: false,
    frameCheckPending: false,
    fetchAbort: null,
    graceTimer: 0,
    loaded: 0,
    total: 0,
    fetchStart: 0,
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
  /** Film velocity, px/s (from the spring). */
  private velocity = 0
  /** Spring frequency (rad/s): lower = heavier, longer glide. Set by the input device. */
  private omega = 10
  /** Last direction of travel (1 forward, -1 back): decoding runs ahead of it. */
  private dir = 1
  private dt = 1 / 60
  private lastTs = 0
  private raf = 0
  private running = false
  private active = -1
  private chapter = -1
  private stageScale = 1
  private railScale = -1

  private inflight = 0
  private aborter = new AbortController()
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
  /** The decoded-frame canvas (WebCodecs path). */
  registerCanvas = (el: HTMLCanvasElement | null) => (this.canvas = el)
  /** Darkens the film as the range section rises over it. */
  registerShade = (el: HTMLElement | null) => (this.shade = el)
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
    this.gen++
    this.aborter = new AbortController()

    if (this.codec && this.canvas) {
      // Backing store at the clip's own resolution; CSS object-fit: cover scales it like the videos.
      const [w, h] = this.variant === 'desktop' ? [1920, 1080] : [1280, 720]
      this.canvas.width = w
      this.canvas.height = h
      this.ctx = this.canvas.getContext('2d', { alpha: false })
    }
    if (!this.ctx) this.codec = false
    if (this.codec) {
      const gen = this.gen
      this.store = new FrameStore(
        this.wake,
        () => gen === this.gen && this.codecOff(),
        (frames, ms) => gen === this.gen && this.decodeRate(frames, ms),
      )
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('resize', this.onResize, { passive: true })
    window.addEventListener('touchstart', this.onTouch, { passive: true })
    // not passive: with a mouse or trackpad the engine glides the page itself (see onWheel)
    window.addEventListener('wheel', this.onWheel, { passive: !this.glide })
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
      this.pumpLoads()
      // Don't hold the intro hostage on slow networks: after 6 s, stream instead.
      this.readyTimer = window.setTimeout(() => {
        this.clips[0].streamFallback = true
        if (this.active <= 1) this.attach(0)
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
    clearTimeout(this.warmTimer)
    this.warmTimer = 0
    this.warming = -1
    this.waitSince = 0
    this.slow = false
    this.running = false
    this.aborter.abort()
    this.tracks.forEach((t) => t?.release())
    this.tracks = this.tracks.map(() => null)
    this.store?.close()
    this.store = null
    this.opening.clear()
    this.cv = { scene: -1, f: -1 }
    this.dispScene = -1
    this.clips.forEach((c, i) => {
      if (c.blobUrl) URL.revokeObjectURL(c.blobUrl)
      clearTimeout(c.graceTimer)
      c.graceTimer = 0
      c.blob = null
      c.blobUrl = c.attachedUrl = null
      c.fetching = false
      c.fetchAbort = null
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
    this.inflight = 0
    this.active = -1
    this.shown = -2
    this.holdingFrame = false
    if (this.holdLayer) this.holdLayer.style.opacity = '0'
    if (this.canvas) this.canvas.style.opacity = '0'
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
    const y = window.scrollY
    // our own glide step: the target is already where it should be
    if (this.driving && Math.abs(y - this.writtenY) < 2) return
    // anything else (scrollbar, keys, find-in-page, an anchor) takes over until the next wheel
    this.driving = false
    this.targetY = y
    this.lastInput = performance.now()
    this.wake()
  }
  // touch already has native momentum — follow it closely
  private onTouch = () => {
    // Keep the film close to native touch momentum; a slow catch-up reads as judder on phones.
    this.omega = 26
    this.lastInput = performance.now()
    // Retry the muted iOS decoder unlock inside a real touch gesture if autoplay was refused.
    if (IS_IOS && this.active >= 0 && !this.canvasClip(this.active)) this.primeClip(this.active)
  }
  // wheel and trackpad input: a weighted glide, like a camera on a fluid head
  private onWheel = (e: WheelEvent) => {
    this.omega = 11
    this.lastInput = performance.now()
    if (!this.glide || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // pinch-zoom, sideways
    const root = document.documentElement
    if (root.style.overflow === 'hidden' || root.classList.contains('is-loading')) return // menu / loader
    // The page glides on the same spring as the film, so the range section, the scrollbar and the
    // film move as one: a notched mouse wheel becomes one continuous move instead of 100 px jumps.
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.vh : 1
    const max = root.scrollHeight - this.vh
    if (!this.driving) {
      this.driving = true
      this.targetY = window.scrollY
    }
    this.targetY = Math.min(Math.max(this.targetY + e.deltaY * unit, 0), max)
    this.wake()
  }
  /**
   * Mouse / trackpad: the engine scrolls the page (touch keeps native momentum; reduced motion keeps
   * native; `?native` turns it off for comparison).
   */
  private readonly glide = this.finePointer && !this.reduced && !QUERY.has('native')
  /** The engine is currently moving the page (until another kind of scroll takes over). */
  private driving = false
  private writtenY = -1
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
    if (!this.reduced) this.preloadPosters(sceneIndex) // the landing frame's still, in case it beats the decoder
    if (near && this.glide) {
      // the film's own spring carries the page there, slower than a wheel move: a camera move
      this.driving = true
      this.omega = 6
      this.targetY = top
      this.wake()
    } else if (near && !this.reduced) {
      window.scrollTo({ top, behavior: 'smooth' })
    } else {
      // Long jumps snap: scrubbing through a dozen clips would just be noise.
      this.driving = false
      window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      this.targetY = this.smoothY = top
      this.velocity = 0
      this.wake()
    }
  }

  /**
   * "The Range": from far away, cut to just above the section (gliding through the whole film
   * would be a smear), then glide the last stretch in on the film's spring.
   */
  toRange = () => {
    const el = document.getElementById('range')
    if (!el) return
    const top = Math.round(el.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0))
    if (!this.glide) return window.scrollTo({ top, behavior: this.reduced ? ('instant' as ScrollBehavior) : 'smooth' })
    if (Math.abs(top - window.scrollY) > this.vh * 3) {
      const from = Math.round(top - this.vh * 1.4)
      this.writtenY = from // the scroll event this causes is ours
      window.scrollTo({ top: from, behavior: 'instant' as ScrollBehavior })
      this.smoothY = from
      this.velocity = 0
    }
    this.driving = true
    this.omega = 6
    this.targetY = top
    this.wake()
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
    this.dt = dt

    // Follow the scroll target on a critically damped spring. Unlike an exponential chase (full
    // speed on the first frame) it eases in as well as out and never overshoots: the film starts
    // and stops like a camera move. The analytic step makes the glide identical at 60/120/144 Hz.
    const x = this.smoothY - this.targetY
    if (this.reduced || (Math.abs(x) < 0.5 && Math.abs(this.velocity) < 8)) {
      this.smoothY = this.targetY
      this.velocity = 0
    } else {
      const w = this.omega
      const e = Math.exp(-w * dt)
      const c = this.velocity + w * x
      this.smoothY = this.targetY + (x + c * dt) * e
      this.velocity = (this.velocity - c * w * dt) * e
      if (Math.abs(this.velocity) > 30) this.dir = this.velocity > 0 ? 1 : -1
    }
    if (this.driving) {
      const y = Math.round(this.smoothY)
      if (y !== this.writtenY) {
        this.writtenY = y
        window.scrollTo(0, y)
      }
    }

    // pointer eases with a soft spring-like lag, so depth planes feel weighted
    const pk = 1 - Math.exp(-dt * 4.5)
    this.ptr.x += (this.ptrTarget.x - this.ptr.x) * pk
    this.ptr.y += (this.ptrTarget.y - this.ptr.y) * pk
    const ptrMoving = Math.abs(this.ptrTarget.x - this.ptr.x) + Math.abs(this.ptrTarget.y - this.ptr.y) > 0.002

    this.coverCheck()
    const settledVideo = this.render(this.smoothY, ts)

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
    // While the range rises over the last frame, the film sinks away behind it: it travels at a
    // third of the page's speed and dims, so the footer reads as a layer in front, not a cut.
    // Follows the page's real scroll position so it stays locked to the footer's edge (the spring
    // when the engine is gliding the page, the native position otherwise).
    const docY = this.driving ? this.smoothY : this.targetY
    const exit = clamp01((docY - (this.footerTop - this.vh)) / this.vh)
    const shift = this.reduced ? 0 : Math.round(exit * this.vh * 0.32 * 10) / 10
    const shade = Math.round(exit * 0.72 * 100) / 100
    if (shift !== this.exitShift || shade !== this.exitShade) {
      this.exitShift = shift
      this.exitShade = shade
      if (this.stageRoot) this.stageRoot.style.transform = shift ? `translate3d(0,${-shift}px,0)` : ''
      if (this.shade) this.shade.style.opacity = String(shade)
    }

    const covered = docY >= this.footerTop + 2
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
      if (this.canvasClip(i)) {
        settled = this.presentCanvas(i, p)
      } else {
        const frames = this.clips[i].frames
        settled = this.seek(i, Math.round(p * (frames - 1)))
        // keep neighbours parked on their boundary frames so the hand-off is instant in either direction
        // Never seek a visible outgoing layer in the background: some browsers clear it to black
        // for the duration of the seek, exactly when it is serving as the transition hold frame.
        if (i + 1 < this.scenes.length && i + 1 !== this.shown) this.seek(i + 1, 0)
        if (i > 0 && i - 1 !== this.shown) this.seek(i - 1, this.clips[i - 1].frames - 1)
        this.present(i, p)
      }
    }

    // Hold "breathing": a slow push-in and back while the clip rests on its hero frame.
    // The slow push-in is intentional on desktop; on iPhone it reads as an unwanted zoom.
    const breathe = h > 0 && !this.reduced && !IS_IOS ? 1 + 0.028 * Math.sin(Math.PI * h) : 1
    // Speed push: the frame leans in a touch while the film moves fast, like a camera on a dolly.
    // Mouse / trackpad only; on touch the finger is already the camera.
    const push = this.finePointer && !this.reduced ? Math.min(Math.abs(this.velocity) / (this.vh * 5), 1) * 0.016 : 0
    const scale = breathe * (1 + push)
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

    // the type layer drifts opposite the pointer by a few px — it reads as sitting in front of the
    // footage — and sinks with the film as the range section rises over it
    if (this.captionLayer && !this.reduced) {
      const px = this.finePointer ? this.ptr.x * -7 : 0
      const py = (this.finePointer ? this.ptr.y * -5 : 0) - this.exitShift
      const shift = px || py ? `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)` : ''
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
      if (this.streaming !== -1 && this.streaming !== i) this.streaming = -1
      this.dropStaleDownloads()
      this.updateWindow(i)
      this.pumpLoads()
      this.scheduleStream(i)
      this.scheduleStream(i + 1)
      this.preloadPosters(i)
    }
    if ((this.scenes[i].focusX ?? 0.5) !== (this.scenes[Math.max(prev, 0)].focusX ?? 0.5)) this.positionBadge()
  }

  /**
   * Only a few <video> elements hold a source at once (decoder memory — iOS is strict about this).
   * Window: previous, current, next two. Anything further away is detached. On the canvas path a
   * <video> is only used to stream a clip that hasn't downloaded yet.
   */
  private updateWindow(i: number) {
    this.clips.forEach((c, k) => {
      const want = k >= i - 1 && k <= i + 2
      const keep = this.roomy || (k >= i - 2 && k <= i + 3) // hysteresis so scrolling back and forth doesn't thrash
      if (want) this.attach(k)
      else if (!keep && c.attachedUrl && k !== this.shown) this.detach(k)
      // drawn from its decoder now: the stream that covered for the download can go
      if (c.attachedUrl && k !== this.shown && this.canvasClip(k)) this.detach(k)
    })
    this.syncDecoders(i)
    this.scheduleWarm()
  }

  // ───────────────────────────── decoded frames (WebCodecs → canvas)

  /** This clip is drawn on the canvas from its decoder (else: its <video>, or a poster). */
  private canvasClip(k: number) {
    return this.codec && !this.codecFailed[k] && !!this.clips[k]?.blob
  }

  /**
   * Clips are read into the shared decoder for the scene on screen and its two neighbours, and
   * released two scenes away (so scrolling back and forth across a cut doesn't re-read them).
   * Each one's cache is sized by role: the playhead's scene keeps a few GOPs; a neighbour keeps
   * only the GOP at the shared cut.
   */
  private syncDecoders(i: number) {
    this.tracks.forEach((clip, k) => {
      const d = Math.abs(k - i)
      if (clip && (!this.codec || d > 2)) {
        clip.release()
        this.tracks[k] = null
      } else if (d <= 1) this.openTrack(k)
      this.sizeCache(k)
    })
  }

  private sizeCache(k: number) {
    const clip = this.tracks[k]
    const i = this.active
    if (!clip) return
    if (k === i) {
      // phones and tablets get one GOP less (memory); 1080p frames are ~8 MB each
      clip.setCap(clip.gop * (IS_IOS || this.variant === 'mobile' ? 2 : 3))
    } else if (k === i + 1) {
      clip.focus = 0
      clip.setCap(clip.gopLength(0))
    } else if (k === i - 1) {
      clip.focus = clip.frames - 1
      clip.setCap(this.tailGops(clip).reduce((n, g) => n + clip.gopLength(g), 0))
    } else clip.setCap(0)
  }

  /** The GOPs at a clip's end cut: the last one, plus the one before when the last is only a frame or two. */
  private tailGops(clip: Clip) {
    const last = clip.lastGop
    return last > 0 && clip.gopLength(last) < clip.gop / 2 ? [last, last - 1] : [last]
  }

  private openTrack(k: number) {
    const c = this.clips[k]
    const store = this.store
    if (!store || !this.canvasClip(k) || this.tracks[k] || this.opening.has(k)) return
    this.opening.add(k)
    const gen = this.gen
    store.open(c.blob!).then(
      (clip) => {
        if (gen !== this.gen) return
        this.opening.delete(k)
        if (!this.canvasClip(k) || Math.abs(k - this.active) > 2) return
        this.tracks[k] = clip
        this.sizeCache(k)
        this.wake()
      },
      () => {
        if (gen !== this.gen) return
        this.opening.delete(k)
        this.trackFailed(k)
      },
    )
  }

  /**
   * Throughput guard. Apple silicon, recent iPhones and current PC GPUs decode these clips at
   * several hundred frames a second; a machine that manages under ~45 can't keep the canvas fed
   * while scrubbing, and the decoding would compete with drawing. There, the <video> path (which
   * only decodes the frames it lands on) is the better experience.
   */
  private decodeRate(frames: number, ms: number) {
    if (!this.codec || frames < 12 || ms <= 0) return
    const fps = (frames * 1000) / ms
    this.rateEma = this.rateSamples++ ? this.rateEma * 0.6 + fps * 0.4 : fps
    if (this.rateSamples >= 3 && this.rateEma < 45) this.codecOff()
  }
  private rateEma = 0
  private rateSamples = 0

  /** The canvas path is off for the rest of the visit: every clip goes back to its <video>. */
  private codecOff() {
    if (!this.codec) return
    this.codec = false
    if (this.active >= 0) this.updateWindow(this.active) // releases the clips, attaches the videos
    this.store?.close()
    this.wake()
  }

  /** A clip this browser can't decode goes back to its <video>; two such clips and the canvas path is off. */
  private trackFailed(k: number) {
    if (this.codecFailed[k]) return
    this.codecFailed[k] = true
    this.tracks[k]?.release()
    this.tracks[k] = null
    if (this.codecFailed.filter(Boolean).length >= 2) return this.codecOff()
    if (this.active >= 0) this.updateWindow(this.active)
    this.wake()
  }

  /**
   * Canvas path: puts the best available picture for this scroll position on screen, this frame.
   *  · decoded: the exact frame, with the next one cross-faded in by the fractional position, so
   *    slow scrolling glides instead of stepping at 24 fps. At rest it settles on a whole frame.
   *  · still decoding: whichever is closest to the right picture of the nearest decoded frame, the
   *    scene's first / last poster, or what the canvas already shows (a cut's shared boundary frame
   *    counts as both scenes'). The canvas keeps its pixels until something better is drawn.
   * Returns false while the cross-fade is still settling; decoded frames and posters wake the loop.
   */
  private presentCanvas(i: number, p: number): boolean {
    this.setWaiting(false) // in memory: nothing is waiting on the network
    const dec = this.tracks[i]
    const n = dec?.frames ?? this.clips[i].frames
    const F = p * (n - 1)

    let easing = false
    if (this.dispScene !== i || this.smoothY !== this.targetY) this.dispF = F
    else {
      const to = Math.round(F)
      const d = to - this.dispF
      if (Math.abs(d) < 0.01) this.dispF = to
      else {
        this.dispF += d * (1 - Math.exp(-this.dt * 12))
        easing = true
      }
    }
    this.dispScene = i
    const at = this.dispF
    const f0 = Math.min(Math.floor(at), n - 1)
    const f1 = Math.min(f0 + 1, n - 1)
    const w = at - f0

    if (dec) {
      dec.focus = at
      const g = dec.gopOf(f0)
      // The decoder serves this scene first, then the neighbour in the direction of travel. The
      // neighbours want the GOPs at this scene's cuts, so a cut is instant either way.
      const next = this.tracks[i + 1]
      const prev = this.tracks[i - 1]
      if (next) next.want = [0]
      if (prev) prev.want = this.tailGops(prev)
      this.store!.order = [dec, this.tracks[i + this.dir] ?? null, this.tracks[i - this.dir] ?? null]
      // The playhead's GOP, the cross-fade partner's, one ahead of the travel; and one behind only
      // when moving slowly enough to change direction (at speed it would be decoded for nothing).
      const slow = Math.abs(this.velocity) < this.vh
      dec.request(slow ? [g, dec.gopOf(f1), g + this.dir, g - this.dir] : [g, dec.gopOf(f1), g + this.dir])
      if (dec.has(f0)) {
        // Once the film passes more than a footage frame per screen refresh, every refresh shows a
        // new frame anyway: the cross-fade would cost a second full-size draw for nothing.
        const perRefresh = (Math.abs(this.velocity) * this.dt * (n - 1)) / this.scrubPx[i]
        const blend = perRefresh < 1 && w > 0.01 && f1 !== f0 && dec.has(f1)
        this.paint(i, dec, f0, blend ? f1 : -1, w)
        return !easing
      }
    }

    // A streamed <video> of this scene that covered for its download stays up until frames decode.
    if (this.shown === i && this.clips[i].hasFrame) {
      this.seek(i, Math.round(F))
      return true
    }

    let keep = Infinity
    if (this.shown === CANVAS) {
      const cv = this.cv
      const prevLast = (this.tracks[i - 1]?.frames ?? this.clips[i - 1]?.frames ?? 0) - 1
      if (cv.scene === i) keep = Math.abs(cv.f - at)
      else if (cv.scene === i - 1 && cv.f >= prevLast) keep = at
      else if (cv.scene === i + 1 && cv.f <= 0) keep = n - 1 - at
    }
    const near = dec ? dec.nearest(at) : -1
    const dNear = near >= 0 ? Math.abs(near - at) : Infinity
    const first = this.poster(i, 'first')
    const last = this.poster(i, 'last')
    const dFirst = first ? at : Infinity
    const dLast = last ? n - 1 - at : Infinity
    const best = Math.min(dNear, dFirst, dLast)
    if (best >= keep || best === Infinity) return true
    if (best === dNear) this.paint(i, dec!, near, -1, 0)
    else if (best === dFirst) this.paintStill(i, first!, 0)
    else this.paintStill(i, last!, n - 1)
    return true
  }

  /** Draws decoded frame f0, with f1 cross-faded over it at weight w. Skips the draw if unchanged. */
  private paint(i: number, dec: Clip, f0: number, f1: number, w: number) {
    const ctx = this.ctx!
    const a = f1 >= 0 ? Math.round(w * 48) / 48 : 0
    const f = f0 + a
    if (this.cv.scene !== i || this.cv.f !== f || this.shown !== CANVAS) {
      const { width, height } = this.canvas!
      ctx.globalAlpha = 1
      ctx.drawImage(dec.get(f0)!, 0, 0, width, height)
      if (a > 0) {
        ctx.globalAlpha = a
        ctx.drawImage(dec.get(f1)!, 0, 0, width, height)
        ctx.globalAlpha = 1
      }
      this.cv.scene = i
      this.cv.f = f
    }
    this.showCanvas(i)
  }

  /** Draws a poster still (a scene's first or last frame) onto the canvas. */
  private paintStill(i: number, img: HTMLImageElement, frame: number) {
    const { width, height } = this.canvas!
    this.ctx!.globalAlpha = 1
    this.ctx!.drawImage(img, 0, 0, width, height)
    this.cv.scene = i
    this.cv.f = frame
    this.showCanvas(i)
  }

  private showCanvas(i: number) {
    const focus = `${(this.scenes[i].focusX ?? 0.5) * 100}% 50%`
    if (focus !== this.canvasFocus) {
      this.canvasFocus = focus
      this.canvas!.style.objectPosition = focus
    }
    this.reveal(CANVAS)
  }

  /** A scene's decoded poster image (or undefined, and it starts loading; its arrival wakes the loop). */
  private poster(i: number, side: 'first' | 'last') {
    const src = posterUrl(this.scenes[i].file, side)
    const img = this.posterImgs.get(src)
    if (!img) this.preloadPoster(src)
    return img
  }

  /**
   * Swaps the visible layer: a video (index), the poster still (-1) or the canvas. The incoming
   * layer is revealed before the outgoing one is hidden, so nothing empty is ever composited.
   */
  private reveal(target: number) {
    if (target === this.shown) return
    const layer = (k: number) => (k === CANVAS ? this.canvas : k === -1 ? this.fallback : k >= 0 ? this.videos[k] : null)
    const incoming = layer(target)
    const outgoing = layer(this.shown)
    if (incoming) incoming.style.opacity = '1'
    if (outgoing) outgoing.style.opacity = '0'
    if (this.holdingFrame && this.holdLayer) {
      this.holdLayer.style.opacity = '0'
      this.holdingFrame = false
    }
    this.shown = target
  }

  /**
   * Roomy devices: attaches downloaded clips outside the decode window ahead of time, one at a
   * time and only while the viewer is at rest (reading the intro, pausing on a flavor), so the
   * decoder spin-up never lands mid-scroll.
   */
  private scheduleWarm() {
    if (!this.roomy || this.warmTimer || !this.mounted) return
    this.warmTimer = window.setTimeout(() => {
      this.warmTimer = 0
      if (!this.mounted) return
      // one decoder spin-up at a time (a clip that never decodes is given up on after 3 s)
      if (this.warming >= 0 && !this.clips[this.warming].hasFrame && performance.now() - this.warmSince < 3000) return this.scheduleWarm()
      this.warming = -1
      const calm = performance.now() - this.lastInput > 350 && Math.abs(this.targetY - this.smoothY) < 1
      if (!calm) return this.scheduleWarm()
      const from = Math.max(this.active, 0)
      let best = -1
      this.clips.forEach((c, k) => {
        if (!c.blob || c.attachedUrl) return
        if (best < 0 || Math.abs(k - from) + (k < from ? 0.5 : 0) < Math.abs(best - from) + (best < from ? 0.5 : 0)) best = k
      })
      if (best < 0) return // everything downloaded is warm; a landing download re-schedules
      this.warming = best
      this.warmSince = performance.now()
      this.attach(best)
      this.scheduleWarm()
    }, 220)
  }
  private warmTimer = 0
  private warming = -1
  private warmSince = 0
  private lastInput = 0

  private attach(k: number) {
    const c = this.clips[k]
    const v = this.videos[k]
    if (!v || this.canvasClip(k)) return // drawn from its decoder: no <video> needed
    // Prefer the in-memory copy. While it's still downloading, show the poster rather than
    // streaming: a streamed clip turns every scrub step into a network range request.
    // The network URL is only used if the download failed or the user outran it (streamFallback).
    const streamOk = c.failed || (c.streamFallback && (k === this.active || (k === this.active + 1 && this.activeSatisfied())))
    if (c.blob && !c.blobUrl) c.blobUrl = URL.createObjectURL(c.blob)
    const url = c.blobUrl ?? (streamOk ? clipUrl(this.variant, this.scenes[k].file) : null)
    if (!url || c.attachedUrl === url) return
    // Upgrading a clip that is on screen (active, or held as the last good picture) from
    // stream → blob would blank it while the new source loads; wait until it's off-screen.
    if (c.attachedUrl && (k === this.active || k === this.shown)) return
    c.attachedUrl = url
    c.requested = -1
    c.primed = false
    c.priming = false
    c.hasFrame = false
    c.awaitingFrame = false
    c.frameCheckPending = false
    // posters are assigned lazily so 13 images aren't fetched up front
    if (!v.getAttribute('poster')) v.poster = posterUrl(this.scenes[k].file, 'first')
    v.src = url
    v.load()
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
    if (k === this.streaming && c.hasFrame) {
      this.streaming = -1
      this.pumpLoads()
    }
    if (Number.isFinite(v.duration) && v.duration > 0) c.frames = Math.max(1, Math.round(v.duration * FPS))
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
        this.resumeLoadsAfterFrame(k, c.hasFrame)
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
      this.resumeLoadsAfterFrame(k, c.hasFrame)
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
        this.resumeLoadsAfterFrame(k, true)
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

  private resumeLoadsAfterFrame(k: number, ready: boolean) {
    if (!ready || k !== this.streaming) return
    this.streaming = -1
    this.pumpLoads()
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
    this.reveal(target)
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
   * If a clip's download hasn't landed shortly after it's needed, stream it from the network
   * meanwhile. Per clip, and not cancelled by further scrolling: fast scrolling must never be
   * able to starve a scene of footage.
   */
  private scheduleStream(k: number) {
    const c = this.clips[k]
    if (!c || c.attachedUrl || c.blob || c.graceTimer) return
    const decide = () => {
      c.graceTimer = 0
      if (!this.mounted || c.attachedUrl || c.blob) return
      if (k === 0 && !this.loadState.ready) return // the intro gate handles the first clip
      const next = k === this.active + 1
      if (k !== this.active && !next) return // the viewer already moved on
      if (next && !this.activeSatisfied()) {
        c.graceTimer = window.setTimeout(decide, 400) // never compete with the scene on screen
        return
      }
      // Is the proper (in-memory) copy nearly here? Then wait for it: streaming now would cancel
      // downloads that are about to land and cascade into the next scenes.
      if (c.fetching && c.total > 0) {
        const elapsed = Math.max((performance.now() - c.fetchStart) / 1000, 0.05)
        const eta = c.loaded > 0 ? (c.total - c.loaded) / (c.loaded / elapsed) : Infinity
        if (eta < 1.5) {
          c.graceTimer = window.setTimeout(decide, 250)
          return
        }
      }
      c.streamFallback = true
      if (!next) {
        // The scene on screen gets the whole connection until it has a frame: cancel the duplicate
        // download of this clip and the background prefetches (they resume right after).
        this.streaming = k
        this.clips.forEach((x) => x.fetching && x.fetchAbort?.abort())
        if (this.slow && this.netProgress !== null) {
          this.netProgress = null
          this.listeners.network.forEach((fn) => fn(true, null))
        }
      }
      this.attach(k)
    }
    c.graceTimer = window.setTimeout(decide, 400)
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
      this.downgrade()
      this.slowSince = performance.now()
      this.netProgress = this.activeProgress()
    }
    this.listeners.network.forEach((fn) => fn(on, this.netProgress))
  }

  /** Observed download speed of a finished clip; below ~12 Mbps the 1080p film can't keep up. */
  private measureSpeed(c: ClipState) {
    const secs = (performance.now() - c.fetchStart) / 1000
    if (c.total > 1e6 && secs > 0.2 && (c.total * 8) / secs / 1e6 < 12) this.downgrade()
  }

  /**
   * Switches all clips not yet downloaded to the 720p set (~40% of the bytes). Clips already in
   * memory keep their quality; in-flight 1080p downloads are restarted at 720p, except the clip
   * on screen if it is nearly done.
   */
  private downgrade() {
    if (this.variant === 'mobile') return
    this.variant = 'mobile'
    this.clips.forEach((c, k) => {
      if (!c.fetching) return
      const nearly = c.total && c.loaded / c.total > 0.6
      if (k === this.active && nearly) return
      c.fetchAbort?.abort()
    })
  }

  /** Download progress of the scene on screen (null while streaming / unknown). */
  private activeProgress(): number | null {
    const c = this.clips[this.active]
    if (!c || !c.fetching || !c.total) return null
    return Math.min(c.loaded / c.total, 1)
  }

  /** The scene on screen has footage: in memory for its decoder, or a stream showing frames. */
  private activeSatisfied() {
    const c = this.clips[this.active]
    return !!c && (this.canvasClip(this.active) || (!!c.attachedUrl && c.hasFrame))
  }

  /** Cancels downloads of clips the viewer has already scrolled past, so bandwidth goes ahead. */
  private dropStaleDownloads() {
    this.clips.forEach((c, k) => {
      if (c.fetching && k < this.active - 1) c.fetchAbort?.abort()
    })
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

  /** Downloads clips as Blobs, two at a time, nearest-ahead first. */
  private pumpLoads() {
    if (!this.mounted) return
    if (this.streaming !== -1) return // the on-screen stream has priority until it shows a frame
    const from = Math.max(this.active, 0)
    while (this.inflight < 2) {
      let best = -1
      let bestScore = Infinity
      this.clips.forEach((c, k) => {
        if (c.blob || c.fetching || c.failed) return
        const d = k - from
        const score = d >= 0 ? d : -d * 2.5 // prefer what's ahead of the viewer
        if (score < bestScore) {
          bestScore = score
          best = k
        }
      })
      if (best < 0) return
      this.loadClip(best)
    }
  }

  private loadClip(k: number) {
    const c = this.clips[k]
    c.fetching = true
    this.inflight++
    const url = clipUrl(this.variant, this.scenes[k].file)
    const root = this.aborter.signal // a destroyed mount (StrictMode, HMR): ignore everything
    const own = new AbortController() // this clip only: cancelled when the viewer scrolls past it
    const onRootAbort = () => own.abort()
    root.addEventListener('abort', onRootAbort, { once: true })
    c.fetchAbort = own
    c.loaded = c.total = 0
    c.fetchStart = performance.now()
    fetchClip(
      url,
      (loaded, total) => {
        c.loaded = loaded
        c.total = total
        // only while the scene is actually waiting: once footage is up, background progress is noise
        if (this.slow && this.waitSince && k === this.active && total) {
          const pr = Math.floor((loaded / total) * 100) / 100
          if (pr !== this.netProgress) {
            this.netProgress = pr
            this.listeners.network.forEach((fn) => fn(true, pr))
          }
        }
        if (k === 0 && total && !root.aborted) this.setLoad(Math.min(loaded / total, 1), false)
      },
      own.signal,
    )
      .then((blob) => {
        if (root.aborted) return
        c.blob = blob
        this.measureSpeed(c)
        // Inside the window: open its decoder (canvas path) or attach it (upgrades an off-screen
        // streamed source too).
        if (k >= this.active - 1 && k <= this.active + 2) {
          this.attach(k)
          this.syncDecoders(this.active)
        } else this.scheduleWarm()
        if (k === 0) this.setLoad(1, true)
      })
      .catch(() => {
        if (own.signal.aborted) return // cancelled on purpose: refetched later if needed
        c.failed = true // stays on the streamed URL
        if (k === 0) this.setLoad(1, true)
        if (k >= this.active - 1 && k <= this.active + 2) this.attach(k)
      })
      .finally(() => {
        root.removeEventListener('abort', onRootAbort)
        if (root.aborted) return
        c.fetching = false
        c.fetchAbort = null
        this.inflight--
        this.pumpLoads()
        this.wake()
      })
  }
}
