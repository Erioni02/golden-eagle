import { CHAPTERS, FPS, SCENES, VH_PER_SECOND, type Scene } from './scenes'
import { clipUrl, fetchClip, pickVariant, posterUrl, type Variant } from './media'

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
  blobUrl: string | null
  attachedUrl: string | null
  fetching: boolean
  failed: boolean
  primed: boolean
  /** Download is taking too long for the scene on screen — stream it meanwhile. */
  streamFallback: boolean
  /** Last frame we asked the decoder for (-1 = unknown). */
  requested: number
  frames: number
  /** The element has decoded at least one frame of its current source (safe to show). */
  hasFrame: boolean
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

export class FilmEngine {
  readonly scenes: Scene[] = SCENES
  /** Desktop (1080p) or mobile (720p) clips. Drops to 720p for the rest of the visit on a slow line. */
  variant: Variant = pickVariant()
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Total film length in viewport heights (scroll distance mapped to footage). */
  readonly totalVh = SCENES.reduce((sum, s) => sum + (s.frames / FPS) * VH_PER_SECOND + s.holdVh, 0)

  private videos: HTMLVideoElement[] = []
  private stills: HTMLElement[] = []
  private captionEls = new Map<string, HTMLElement>()
  private stage: HTMLElement | null = null
  private fallback: HTMLImageElement | null = null
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

  private clips: ClipState[] = SCENES.map((s) => ({
    blobUrl: null,
    attachedUrl: null,
    fetching: false,
    failed: false,
    primed: false,
    streamFallback: false,
    requested: -1,
    frames: s.frames,
    hasFrame: false,
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
  private lastTs = 0
  private raf = 0
  private running = false
  private stiffness = 6
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
  registerStage = (el: HTMLElement | null) => (this.stage = el)
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
    this.aborter = new AbortController()

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
    this.waitSince = 0
    this.slow = false
    this.running = false
    this.aborter.abort()
    this.clips.forEach((c, i) => {
      if (c.blobUrl) URL.revokeObjectURL(c.blobUrl)
      clearTimeout(c.graceTimer)
      c.graceTimer = 0
      c.blobUrl = c.attachedUrl = null
      c.fetching = false
      c.fetchAbort = null
      c.hasFrame = false
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
  }

  // ───────────────────────────── input (cheap: store + wake)

  private onScroll = () => {
    this.targetY = window.scrollY
    this.wake()
  }
  private onTouch = () => (this.stiffness = 11) // touch already has native momentum — follow it closely
  private onWheel = () => (this.stiffness = 6) // wheel steps are coarse — ease them into a glide
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

    if (this.smoothY !== this.targetY || !settledVideo || ptrMoving) {
      this.raf = requestAnimationFrame(this.tick)
    } else {
      this.running = false // sleep until next scroll / seeked event
    }
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
      if (i + 1 < this.scenes.length) this.seek(i + 1, 0)
      if (i > 0) this.seek(i - 1, this.clips[i - 1].frames - 1)
      this.present(i, p)
    }

    // Hold "breathing": a slow push-in and back while the clip rests on its hero frame.
    const scale = h > 0 && !this.reduced ? 1 + 0.028 * Math.sin(Math.PI * h) : 1
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
    if (tone !== this.toneO && this.toneLayer) {
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
   * Window: previous, current, next two. Anything further away is detached.
   */
  private updateWindow(i: number) {
    this.clips.forEach((c, k) => {
      const want = k >= i - 1 && k <= i + 2
      const keep = k >= i - 2 && k <= i + 3 // hysteresis so scrolling back and forth doesn't thrash
      if (want) this.attach(k)
      else if (!keep && c.attachedUrl && k !== this.shown) this.detach(k)
    })
  }

  private attach(k: number) {
    const c = this.clips[k]
    const v = this.videos[k]
    if (!v) return
    // Prefer the in-memory copy. While it's still downloading, show the poster rather than
    // streaming: a streamed clip turns every scrub step into a network range request.
    // The network URL is only used if the download failed or the user outran it (streamFallback).
    const streamOk = c.failed || (c.streamFallback && (k === this.active || (k === this.active + 1 && this.activeSatisfied())))
    const url = c.blobUrl ?? (streamOk ? clipUrl(this.variant, this.scenes[k].file) : null)
    if (!url || c.attachedUrl === url) return
    // Upgrading a clip that is on screen (active, or held as the last good picture) from
    // stream → blob would blank it while the new source loads; wait until it's off-screen.
    if (c.attachedUrl && (k === this.active || k === this.shown)) return
    c.attachedUrl = url
    c.requested = -1
    c.primed = false
    c.hasFrame = false
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
    if (!v) return
    v.removeAttribute('src')
    v.load()
  }

  private onClipData(k: number) {
    const v = this.videos[k]
    const c = this.clips[k]
    if (c.attachedUrl && v.readyState >= 2) c.hasFrame = true
    if (k === this.streaming && c.hasFrame) {
      this.streaming = -1
      this.pumpLoads()
    }
    if (Number.isFinite(v.duration) && v.duration > 0) c.frames = Math.max(1, Math.round(v.duration * FPS))
    if (IS_IOS && !c.primed) {
      // iOS Safari won't paint seeked frames of a never-played video. A muted play/pause unlocks it.
      c.primed = true
      v.play()
        .then(() => {
          v.pause()
          c.requested = -1
          this.wake()
        })
        .catch(() => {})
    }
    this.wake()
  }

  /**
   * Decides what is actually on screen. A clip is only shown once it has decoded a frame:
   * an element without data renders as an empty (black) layer. Until then:
   *   · near a scene boundary, keep the neighbouring clip. Clips are cut end-frame-to-start-frame,
   *     so its parked boundary frame is the same picture;
   *   · otherwise show the scene's poster still (first or last frame, whichever is closer).
   */
  private present(i: number, p: number) {
    const ready = (k: number) => k >= 0 && k < this.clips.length && !!this.clips[k].attachedUrl && this.clips[k].hasFrame
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
      if (this.fallback && src !== this.fallbackSrc) {
        img.className = this.fallback.className
        img.alt = ''
        img.style.objectPosition = `${(this.scenes[i].focusX ?? 0.5) * 100}% 50%`
        img.style.opacity = this.fallback.style.opacity || '0'
        this.fallback.replaceWith(img)
        this.fallback = img
        this.fallbackSrc = src
      }
    }
    if (target === this.shown) return
    // reveal the incoming layer before hiding the outgoing one, so nothing empty is ever composited
    if (target === -1) {
      if (this.fallback) this.fallback.style.opacity = '1'
    } else this.videos[target].style.opacity = '1'
    if (this.shown >= 0) this.videos[this.shown].style.opacity = '0'
    else if (this.shown === -1 && this.fallback) this.fallback.style.opacity = '0'
    this.shown = target
  }

  /**
   * If a clip's download hasn't landed shortly after it's needed, stream it from the network
   * meanwhile. Per clip, and not cancelled by further scrolling: fast scrolling must never be
   * able to starve a scene of footage.
   */
  private scheduleStream(k: number) {
    const c = this.clips[k]
    if (!c || c.attachedUrl || c.blobUrl || c.graceTimer) return
    const decide = () => {
      c.graceTimer = 0
      if (!this.mounted || c.attachedUrl || c.blobUrl) return
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

  /** The scene on screen has decoded footage (from memory or its stream). */
  private activeSatisfied() {
    const c = this.clips[this.active]
    return !!c && !!c.attachedUrl && c.hasFrame
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
    c.requested = frame
    // aim for the middle of the frame so float rounding never lands on the neighbour
    const t = Math.min((frame + 0.5) / FPS, v.duration - 0.001)
    if (Math.abs(v.currentTime - t) > 0.5 / FPS) v.currentTime = t
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
        if (c.blobUrl || c.fetching || c.failed) return
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
      .then((blobUrl) => {
        if (root.aborted) return URL.revokeObjectURL(blobUrl)
        c.blobUrl = blobUrl
        this.measureSpeed(c)
        // attach now if it's inside the decode window (upgrades an off-screen streamed source too)
        if (k >= this.active - 1 && k <= this.active + 2) this.attach(k)
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
