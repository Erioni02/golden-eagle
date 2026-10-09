import { useEffect, useState } from 'react'
import type { FilmEngine } from '../film/FilmEngine'

/**
 * Opening slate. Waits for the first clip to be in memory (or 6 s), then lifts like a curtain.
 * Re-renders only on whole-percent changes.
 */
export function Loader({ engine }: { engine: FilmEngine }) {
  const [pct, setPct] = useState(0)
  const [ready, setReady] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(
    () =>
      engine.on('load', (p, r) => {
        setPct(Math.round(p * 100))
        if (r) setReady(true)
      }),
    [engine],
  )

  useEffect(() => {
    const html = document.documentElement
    if (!ready) {
      html.classList.add('is-loading')
      return
    }
    html.classList.remove('is-loading')
    const t = window.setTimeout(() => setGone(true), engine.reduced ? 0 : 1300)
    return () => window.clearTimeout(t)
  }, [ready, engine])

  if (gone) return null
  const shown = ready ? 100 : pct

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 flex flex-col justify-between bg-ink px-[var(--gutter)] pt-[calc(var(--safe-t)+28px)] pb-[calc(var(--safe-b)+28px)] transition-transform duration-[1200ms] ease-[var(--ease-in-out)] ${
        ready ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <p className="label text-cream/50">Golden Eagle</p>

      <div className="flex flex-col items-center">
        <img src="/brand/eagle-emblem.webp" width={192} height={164} alt="" className="h-12 w-auto" />
        <p className="accent mt-6 text-2xl">Thawing the summit</p>
      </div>

      <div>
        <div className="flex items-end justify-between">
          <span className="label text-cream/45">Loading footage</span>
          <span className="display text-[clamp(4.5rem,13vw,12rem)] leading-[0.8] tabular-nums">
            {String(shown).padStart(3, '0')}
          </span>
        </div>
        <div className="mt-6 h-px w-full overflow-hidden bg-white/12">
          <div
            className="h-full origin-left bg-gold transition-transform duration-500 ease-[var(--ease-out)]"
            style={{ transform: `scaleX(${shown / 100})` }}
          />
        </div>
      </div>
      <span className="sr-only">Loading the film</span>
    </div>
  )
}
