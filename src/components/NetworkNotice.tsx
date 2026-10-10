import { useEffect, useState } from 'react'
import type { FilmEngine } from '../film/FilmEngine'
import { SlowSignal } from './Icons'

/**
 * Tells the visitor, plainly, when the footage is waiting on *their* connection, so a slow
 * network isn't mistaken for a broken site. The engine raises it only after the scene on screen
 * has waited 0.7 s for footage, and clears it once real frames arrive.
 * Re-renders only when it toggles or the download crosses a whole percent.
 */
export function NetworkNotice({ engine }: { engine: FilmEngine }) {
  const [slow, setSlow] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(
    () =>
      engine.on('network', (on, p) => {
        setSlow(on)
        setProgress(p)
      }),
    [engine],
  )

  const pct = progress === null ? null : Math.round(progress * 100)

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-t)+86px)] z-[25] flex justify-center px-[var(--gutter)] short:top-[76px]">
      {/* announced once per episode; the changing percentage below is not read out */}
      <span role="status" aria-live="polite" className="sr-only">
        {slow ? 'Your connection is slow. The film is still loading.' : ''}
      </span>

      <div data-on={slow} aria-hidden="true" className="net-notice bezel [--bz:4px] [--r:999px]">
        <div className="core core-light relative flex items-center gap-3 overflow-hidden py-1.5 pr-5 pl-1.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-gold-soft">
            <SlowSignal size={18} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[0.82rem] font-semibold tracking-[-0.01em] text-cream">Your connection is slow</span>
            <span className="text-[0.72rem] tracking-[-0.005em] text-cream/65 tabular-nums">
              {pct === null ? 'The film is still loading' : `Loading footage ${pct}%`}
            </span>
          </span>
          {pct !== null && (
            <span className="absolute inset-x-5 bottom-0 h-px overflow-hidden bg-white/10">
              <span
                className="block h-full origin-left bg-gold-soft transition-transform duration-300 ease-[var(--ease-out)]"
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
