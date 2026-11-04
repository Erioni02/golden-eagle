import { FPS } from './scenes'

/**
 * Frame-accurate clip decoding for scroll scrubbing (WebCodecs).
 *
 * A <video> element seeks asynchronously, and every browser handles that differently. Safari in
 * particular can clear the layer mid-seek, report `seeked` before the frame is painted, and slows
 * down when many elements hold a hardware decoder. Here each clip, already in memory, is demuxed
 * once, and ONE hardware decoder, created once under the loader, streams GOPs from every clip.
 * (Creating a decoder per scene stalled the GPU thread for ~170 ms per scene in Chrome on Windows,
 * and every new decoder allocates a fresh set of picture buffers.) The frames near the playhead
 * are copied into ImageBitmaps, so the engine draws any of them onto a canvas in the same frame
 * it asks for it. A canvas keeps its pixels until something new is drawn: it never goes black.
 *
 * One decoder can take any clip's GOP at any time because the bitstream is fed as Annex B with
 * the clip's parameter sets (SPS/PPS) in front of every keyframe, instead of being configured
 * per clip with that clip's avcC.
 */

const FRAME_US = 1e6 / FPS

/** GOPs fed to the decoder ahead of its output. Enough to keep the pipeline busy, few enough to stay current. */
const MAX_QUEUED = 2

type Sample = { offset: number; size: number; key: boolean }

type Track = {
  codec: string
  width: number
  height: number
  /** Presentation order. The clips are encoded without B-frames, so this is also decode order. */
  samples: Sample[]
  data: Uint8Array
  /** Bytes in each NAL unit's length prefix. */
  lengthSize: number
  /** SPS + PPS as Annex B (start codes), put in front of every keyframe. */
  params: Uint8Array
}

export const codecSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.VideoDecoder === 'function' &&
  typeof window.EncodedVideoChunk === 'function' &&
  typeof window.createImageBitmap === 'function'

// ───────────────────────────── MP4 (ISO BMFF): just enough to read one H.264 track

type Box = [type: string, start: number, end: number]

const START = [0, 0, 0, 1]

function demux(buf: Uint8Array): Track {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const fourcc = (p: number) => String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3])
  const u32 = (p: number) => view.getUint32(p)

  const children = (start: number, end: number) => {
    const out: Box[] = []
    for (let p = start; p + 8 <= end; ) {
      let size = u32(p)
      let head = 8
      if (size === 1) {
        size = Number(view.getBigUint64(p + 8))
        head = 16
      } else if (size === 0) size = end - p
      if (size < head || p + size > end) break
      out.push([fourcc(p + 4), p + head, p + size])
      p += size
    }
    return out
  }
  const find = (list: Box[], type: string) => list.find((b) => b[0] === type)
  const need = (list: Box[], type: string) => {
    const b = find(list, type)
    if (!b) throw new Error(`mp4: no ${type}`)
    return b
  }

  const moov = need(children(0, buf.length), 'moov')
  for (const trak of children(moov[1], moov[2]).filter((b) => b[0] === 'trak')) {
    const mdia = find(children(trak[1], trak[2]), 'mdia')
    if (!mdia) continue
    const m = children(mdia[1], mdia[2])
    const hdlr = find(m, 'hdlr')
    if (!hdlr || fourcc(hdlr[1] + 8) !== 'vide') continue
    const minf = need(m, 'minf')
    const stbl = need(children(minf[1], minf[2]), 'stbl')
    const t = children(stbl[1], stbl[2])

    // sample description: avc1 → avcC (profile, NAL length size, SPS / PPS)
    const stsd = need(t, 'stsd')
    const entry = children(stsd[1] + 8, stsd[2])[0]
    if (!entry || (entry[0] !== 'avc1' && entry[0] !== 'avc3')) throw new Error(`mp4: codec ${entry?.[0]}`)
    const [, c0, c1] = need(children(entry[1] + 78, entry[2]), 'avcC')
    const avcC = buf.subarray(c0, c1)
    const hex = (b: number) => b.toString(16).padStart(2, '0')
    const codec = `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`
    const lengthSize = (avcC[4] & 3) + 1
    const params: number[] = []
    let p = 6
    const take = (n: number) => {
      for (let k = 0; k < n; k++) {
        const len = (avcC[p] << 8) | avcC[p + 1]
        params.push(...START, ...avcC.subarray(p + 2, p + 2 + len))
        p += 2 + len
      }
    }
    take(avcC[5] & 0x1f) // SPS
    take(avcC[p++]) // PPS

    // A presentation offset that varies between samples means B-frames: frames would come out
    // of the decoder in a different order than they go in. The encode never makes those.
    const ctts = find(t, 'ctts')
    if (ctts) {
      const n = u32(ctts[1] + 4)
      for (let k = 1; k < n; k++) if (u32(ctts[1] + 12 + k * 8) !== u32(ctts[1] + 12)) throw new Error('mp4: B-frames')
    }

    const stsz = need(t, 'stsz')
    const fixed = u32(stsz[1] + 4)
    const count = u32(stsz[1] + 8)
    const size = (k: number) => fixed || u32(stsz[1] + 12 + k * 4)

    const co64 = find(t, 'co64')
    const stco = co64 ?? need(t, 'stco')
    const chunks = u32(stco[1] + 4)
    const chunkOffset = (c: number) => (co64 ? Number(view.getBigUint64(stco[1] + 8 + c * 8)) : u32(stco[1] + 8 + c * 4))

    const stsc = need(t, 'stsc')
    const runs = u32(stsc[1] + 4)
    const run = (r: number) => ({ first: u32(stsc[1] + 8 + r * 12) - 1, per: u32(stsc[1] + 12 + r * 12) })

    const stss = find(t, 'stss')
    const keys = new Set<number>()
    if (stss) for (let k = 0, n = u32(stss[1] + 4); k < n; k++) keys.add(u32(stss[1] + 8 + k * 4) - 1)

    const samples: Sample[] = []
    for (let r = 0, s = 0; r < runs; r++) {
      const { first, per } = run(r)
      const last = r + 1 < runs ? run(r + 1).first : chunks
      for (let c = first; c < last; c++) {
        let off = chunkOffset(c)
        for (let j = 0; j < per && s < count; j++, s++) {
          const sz = size(s)
          samples.push({ offset: off, size: sz, key: !stss || keys.has(s) })
          off += sz
        }
      }
    }
    if (!samples.length || !samples[0].key) throw new Error('mp4: no leading keyframe')

    return {
      codec,
      width: view.getUint16(entry[1] + 24),
      height: view.getUint16(entry[1] + 26),
      samples,
      data: buf,
      lengthSize,
      params: new Uint8Array(params),
    }
  }
  throw new Error('mp4: no video track')
}

/** One sample as Annex B: each length prefix becomes a start code; keyframes lead with SPS/PPS. */
function annexB(t: Track, f: number) {
  const s = t.samples[f]
  const src = t.data.subarray(s.offset, s.offset + s.size)
  const L = t.lengthSize
  let nals = 0
  for (let p = 0; p + L <= src.length; nals++) {
    let len = 0
    for (let k = 0; k < L; k++) len = len * 256 + src[p + k]
    p += L + len
  }
  const head = s.key ? t.params.length : 0
  const out = new Uint8Array(head + src.length + nals * (4 - L))
  if (head) out.set(t.params)
  for (let p = 0, o = head; p + L <= src.length; ) {
    let len = 0
    for (let k = 0; k < L; k++) len = len * 256 + src[p + k]
    out.set(START, o)
    out.set(src.subarray(p + L, p + L + len), o + 4)
    o += 4 + len
    p += L + len
  }
  return out
}

// ───────────────────────────── one clip: its frames and its frame cache

export class Clip {
  readonly frames: number
  /** Longest GOP, in frames. */
  readonly gop: number
  /** Frame the cache is centred on: the farthest frames are released first. */
  focus = 0
  /** Frames kept (each is a full-size bitmap, ~8 MB at 1080p). Set by the engine per role. */
  cap: number
  /** GOPs to have decoded, most urgent first. */
  want: number[] = []
  readonly keys: number[]
  readonly cache = new Map<number, ImageBitmap>()

  constructor(
    readonly track: Track,
    private store: FrameStore,
  ) {
    this.frames = track.samples.length
    this.keys = track.samples.flatMap((s, k) => (s.key ? [k] : []))
    this.gop = Math.max(...this.keys.map((_, g) => this.gopLength(g)))
    this.cap = 0
  }

  get lastGop() {
    return this.keys.length - 1
  }

  gopOf(frame: number) {
    let lo = 0
    let hi = this.keys.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.keys[mid] <= frame) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  gopLength(g: number) {
    return (this.keys[g + 1] ?? this.frames) - this.keys[g]
  }

  has(frame: number) {
    return this.cache.has(frame)
  }

  get(frame: number) {
    return this.cache.get(frame)
  }

  /** Nearest decoded frame to a (fractional) position, or -1. */
  nearest(at: number) {
    let best = -1
    let bestD = Infinity
    for (const k of this.cache.keys()) {
      const d = Math.abs(k - at)
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    return best
  }

  complete(g: number) {
    if (g < 0 || g > this.lastGop) return true
    for (let f = this.keys[g], end = f + this.gopLength(g); f < end; f++) if (!this.cache.has(f)) return false
    return true
  }

  setCap(frames: number) {
    this.cap = frames
    this.trim()
  }

  /** GOPs to have decoded, most urgent first. Replaces the previous list; queued GOPs always finish. */
  request(gops: number[]) {
    this.want = gops
    this.store.pump()
  }

  /** Releases the frames farthest from the focus until the cache fits (never a queued GOP's). */
  trim() {
    while (this.cache.size > this.cap) {
      let worst = -1
      let worstD = -1
      for (const k of this.cache.keys()) {
        const d = Math.abs(k - this.focus)
        if (d > worstD && !this.store.queuedFor(this, this.gopOf(k))) {
          worstD = d
          worst = k
        }
      }
      if (worst < 0) return
      this.cache.get(worst)!.close()
      this.cache.delete(worst)
    }
  }

  /** Frees every frame; anything still decoding for this clip is dropped on arrival. */
  release() {
    this.cap = 0
    this.want = []
    this.cache.forEach((b) => b.close())
    this.cache.clear()
  }
}

// ───────────────────────────── the one decoder

/** Decoding throughput, reported once per busy stretch: frames finished and the time it took. */
export type RateSample = (frames: number, ms: number) => void

type Job = { clip: Clip; g: number; left: number }

export class FrameStore {
  /** Clips in the order their wants are served (the engine puts the scene on screen first). */
  order: (Clip | null)[] = []
  private decoder: VideoDecoder | null = null
  private config: VideoDecoderConfig | null = null
  private queue: Job[] = []
  /** Decoder timestamps are a running sequence (always increasing): seq → [job, frame]. */
  private inflight = new Map<number, [Job, number]>()
  private seq = 0
  private flushTimer = 0
  private watchdog = 0
  private busySince = 0
  private busyFrames = 0
  private stretches = 0
  private produced = false
  private retries = 0
  private dead = false

  constructor(
    private onFrame: () => void,
    private onError: () => void,
    private onRate?: RateSample,
  ) {}

  /** Reads a downloaded clip. The first one also sets up the decoder. Rejects if it can't be decoded here. */
  async open(blob: Blob): Promise<Clip> {
    const track = demux(new Uint8Array(await blob.arrayBuffer()))
    if (!this.config) {
      const config: VideoDecoderConfig = {
        codec: track.codec,
        codedWidth: track.width,
        codedHeight: track.height,
        optimizeForLatency: true,
      }
      const { supported } = await VideoDecoder.isConfigSupported(config)
      if (!supported) throw new Error(`codec ${track.codec} unsupported`)
      if (!this.config) {
        this.config = config
        this.decoder = this.makeDecoder()
      }
    }
    return new Clip(track, this)
  }

  queuedFor(clip: Clip, g: number) {
    return this.queue.some((j) => j.clip === clip && j.g === g)
  }

  close() {
    if (this.dead) return
    this.dead = true
    clearTimeout(this.flushTimer)
    clearTimeout(this.watchdog)
    try {
      if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
    } catch {
      /* already gone */
    }
    this.queue = []
    this.inflight.clear()
  }

  private makeDecoder() {
    const dec: VideoDecoder = new VideoDecoder({
      output: (frame) => this.onOutput(frame),
      error: () => dec === this.decoder && this.fail(),
    })
    dec.configure(this.config!)
    return dec
  }

  /**
   * Feeds the most urgent wanted GOPs, clip by clip in priority order, each within its clip's
   * cache. The decoder is kept streaming: a flush drains its whole pipeline before it accepts
   * more, so flushing after every GOP would cut throughput to a quarter. Each GOP starts on a
   * keyframe that carries its parameter sets, so GOPs from any clip can be fed in any order. Only
   * once everything wanted has been fed does a flush release frames held back in the decoder.
   */
  pump() {
    const dec = this.decoder
    if (this.dead || !dec) return
    if (dec.state === 'closed') return this.fail()
    let more = false
    outer: for (const clip of this.order) {
      if (!clip) continue
      let budget = clip.cap
      for (const g of clip.want) {
        if (g < 0 || g > clip.lastGop) continue
        budget -= clip.gopLength(g)
        if (budget < 0) break // only what fits: otherwise two GOPs would evict each other forever
        if (this.queuedFor(clip, g) || clip.complete(g)) continue
        if (this.queue.length >= MAX_QUEUED) {
          more = true
          break outer
        }
        if (!this.feed(dec, clip, g)) return this.fail()
      }
    }
    clearTimeout(this.flushTimer)
    if (!more && this.queue.length) this.flushTimer = window.setTimeout(() => this.drain(dec), 60)
  }

  private feed(dec: VideoDecoder, clip: Clip, g: number) {
    const start = clip.keys[g]
    const n = clip.gopLength(g)
    const job: Job = { clip, g, left: n }
    try {
      for (let f = start; f < start + n; f++) {
        const seq = this.seq++
        this.inflight.set(seq, [job, f])
        dec.decode(
          new EncodedVideoChunk({
            type: f === start ? 'key' : 'delta',
            timestamp: Math.round(seq * FRAME_US),
            duration: Math.round(FRAME_US),
            data: annexB(clip.track, f),
          }),
        )
      }
    } catch {
      return false
    }
    if (!this.queue.length) {
      this.busySince = performance.now()
      this.busyFrames = 0
    }
    this.queue.push(job)
    this.arm()
    return true
  }

  /** A decoder that stops answering (GPU process reset, driver trouble) must not freeze the film. */
  private arm() {
    clearTimeout(this.watchdog)
    if (!this.queue.length) return
    const dec = this.decoder
    this.watchdog = window.setTimeout(() => dec === this.decoder && this.fail(), 4000)
  }

  /** Nothing new was fed for a moment: flush, so frames held back for reordering come out. */
  private drain(dec: VideoDecoder) {
    if (this.dead || dec !== this.decoder || !this.queue.length) return
    dec.flush().catch(() => dec === this.decoder && this.fail())
  }

  private onOutput(frame: VideoFrame) {
    const seq = Math.round(frame.timestamp / FRAME_US)
    const hit = this.inflight.get(seq)
    this.inflight.delete(seq)
    if (this.dead || !hit) return frame.close()
    const [job, f] = hit
    const { clip } = job
    // released (scrolled away) or already there: nothing to keep, but the GOP still counts down
    if (clip.cap === 0 || clip.cache.has(f)) {
      frame.close()
      return this.arrived(job)
    }
    const dec = this.decoder
    createImageBitmap(frame).then(
      (bmp) => {
        frame.close()
        if (this.dead || dec !== this.decoder) return bmp.close()
        if (clip.cap === 0 || clip.cache.has(f)) bmp.close()
        else clip.cache.set(f, bmp)
        this.produced = true
        this.arrived(job)
        clip.trim()
        this.onFrame()
      },
      () => {
        frame.close()
        this.fail(true) // no bitmaps from video frames in this browser: nothing to retry
      },
    )
  }

  /** Book-keeping for one finished frame; a GOP whose frames are all in leaves the queue. */
  private arrived(job: Job) {
    this.busyFrames++
    if (--job.left > 0) return
    this.queue = this.queue.filter((j) => j !== job)
    this.retries = 0
    this.arm()
    // The first busy stretch includes spinning the decoder up: not representative.
    if (!this.queue.length && this.stretches++ > 0) this.onRate?.(this.busyFrames, performance.now() - this.busySince)
    this.pump()
  }

  /**
   * Browsers reclaim idle hardware decoders (Chrome does it to background tabs). A decoder that has
   * worked before is rebuilt quietly; one that never produced a frame is reported to the engine.
   */
  private fail(fatal = false) {
    if (this.dead) return
    clearTimeout(this.flushTimer)
    clearTimeout(this.watchdog)
    this.queue = []
    this.inflight.clear()
    if (!fatal && this.produced && this.retries < 3) {
      this.retries++
      try {
        if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
      } catch {
        /* already gone */
      }
      this.decoder = this.makeDecoder()
      this.pump()
      return
    }
    this.close()
    this.onError()
  }
}
