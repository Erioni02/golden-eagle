/**
 * Clip sources + Blob buffering.
 *
 * Scrubbing a network-streamed clip turns every seek into an HTTP range request.
 * Each clip is small (2–10 MB), so we download it whole: the decoder reads it straight from
 * memory (or a <video> plays it from an object URL). Falls back to the plain URL if fetch fails.
 */

const BASE = (import.meta.env.VITE_MEDIA_BASE as string | undefined)?.replace(/\/$/, '') || '/media'

export type Variant = 'desktop' | 'mobile'

export function pickVariant(): Variant {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return 'mobile'
  // phones get 720p; tablets and up get 1080p (they have the pixels and the decoder headroom)
  const phone = Math.min(screen.width, screen.height) <= 600 && matchMedia('(pointer: coarse)').matches
  return phone ? 'mobile' : 'desktop'
}

export const clipUrl = (variant: Variant, file: string) => `${BASE}/${variant}/${file}.mp4`
export const posterUrl = (file: string, which: 'first' | 'last') => `${BASE}/posters/${file}-${which}.webp`

type Progress = (loaded: number, total: number) => void

export async function fetchClip(url: string, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  // The browser assembles the Blob natively (concatenating chunks in JS costs ~50 ms of main
  // thread per clip, a dropped frame mid-scroll). For progress, a tee'd copy of the stream is
  // only counted, never stored.
  if (!onProgress) return res.blob()
  const total = Number(res.headers.get('content-length')) || 0
  const [counted, kept] = res.body.tee()
  const blob = new Response(kept).blob()
  const reader = counted.getReader()
  let loaded = 0
  ;(async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      loaded += value.byteLength
      onProgress(loaded, total)
    }
  })().catch(() => {})
  return blob
}
