/**
 * Clip sources + Blob buffering.
 *
 * Scrubbing a network-streamed <video> turns every seek into an HTTP range request.
 * Each clip is small (2–10 MB), so we download it whole and play it from an object URL:
 * seeks then hit memory only. Falls back to the plain URL if fetch fails (CORS, offline…).
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

export async function fetchClip(url: string, onProgress?: Progress, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  // Without a progress listener, let the browser assemble the Blob natively: reading chunks in JS
  // and concatenating them costs ~50 ms of main thread per clip — a dropped frame mid-scroll.
  if (!onProgress) return URL.createObjectURL(await res.blob())
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.(loaded, total)
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'video/mp4' }))
}
