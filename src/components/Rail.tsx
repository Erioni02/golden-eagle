import { useEffect, useState } from 'react'
import type { FilmEngine } from '../film/FilmEngine'
import { CHAPTERS } from '../film/scenes'

/**
 * Film HUD: running timecode, progress rail with chapter ticks, current chapter.
 * Fill (scaleY) and timecode text are written by the engine; React only re-renders on chapter change.
 */
export function Rail({ engine }: { engine: FilmEngine }) {
  const [chapter, setChapter] = useState(0)
  useEffect(() => engine.on('chapter', setChapter), [engine])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-1/2 right-[var(--gutter)] z-20 hidden -translate-y-1/2 flex-col items-end gap-5 lg:flex short:!hidden"
    >
      <span className="label text-cream/55">
        <Timecode engine={engine} />
      </span>

      <div className="relative mr-[3px] h-56 w-px bg-white/15">
        <div
          ref={engine.registerRail}
          className="absolute inset-0 origin-top bg-[var(--tone)] transition-[background-color] duration-700"
          style={{ transform: 'scaleY(0)' }}
        />
        {CHAPTERS.map((c, i) => (
          <span
            key={c.label}
            className={`absolute right-0 h-px transition-[width,background-color] duration-500 ease-[var(--ease-out)] ${
              i === chapter ? 'w-3 bg-cream' : i < chapter ? 'w-2 bg-cream/55' : 'w-2 bg-cream/25'
            }`}
            style={{ top: `${c.fraction * 100}%` }}
          />
        ))}
      </div>

      <span className="label text-right text-cream/80">{CHAPTERS[chapter]?.label}</span>
    </div>
  )
}

const DIGITS = '0123456789'.split('')

/** HH:MM:SS:FF as eight rolling digit strips — the engine slides each strip with a transform. */
function Timecode({ engine }: { engine: FilmEngine }) {
  let d = 0
  return (
    <span className="flex h-[1.25em] items-start leading-[1.25em]">
      {[0, 1, 2, 3].map((group) => (
        <span key={group} className="flex">
          {group > 0 && <span className="px-[0.12em] text-cream/35">:</span>}
          {[0, 1].map((k) => {
            const index = d++
            return (
              <span key={k} className="relative h-[1.25em] w-[1ch] overflow-hidden">
                <span
                  ref={(el) => engine.registerTimecodeDigit(index, el)}
                  className="absolute inset-x-0 top-0 flex flex-col tracking-normal will-change-transform"
                >
                  {DIGITS.map((n) => (
                    <span key={n} className="h-[1.25em] text-center">
                      {n}
                    </span>
                  ))}
                </span>
              </span>
            )
          })}
        </span>
      ))}
    </span>
  )
}
