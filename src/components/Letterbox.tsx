import { memo } from 'react'
import type { FilmEngine } from '../film/FilmEngine'

/**
 * Opening-frame letterbox (≈2.39:1). The engine slides the bars off-screen over the first
 * stretch of scroll, so the frame literally opens up as the film starts. No labels, no cue:
 * the visitor is looking at the hero and already knows how to scroll.
 */
export const Letterbox = memo(function Letterbox({ engine }: { engine: FilmEngine }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12]">
      <div ref={(el) => engine.registerLetterbox('top', el)} className="absolute inset-x-0 top-0 h-[var(--lb)] bg-ink" />
      <div ref={(el) => engine.registerLetterbox('bottom', el)} className="absolute inset-x-0 bottom-0 h-[var(--lb)] bg-ink" />
    </div>
  )
})
