import type { ReactNode } from 'react'
import type { FilmEngine } from '../film/FilmEngine'

/**
 * Renders a headline where *wrapped* words are set in the italic serif accent.
 * With an engine, every word is wrapped in a clipping line and registered so the engine can
 * rise it into view on scroll. Without one, it renders plain (static sections).
 */
export function Title({ text, engine, id }: { text: string; engine?: FilmEngine; id?: string }) {
  const out: ReactNode[] = []
  let index = 0
  text
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .forEach((part, pi) => {
      const accent = part.startsWith('*') && part.endsWith('*')
      const clean = accent ? part.slice(1, -1) : part
      if (!engine || !id) {
        out.push(
          <span key={pi} className={accent ? 'accent' : undefined}>
            {clean}
          </span>,
        )
        return
      }
      clean.split(/(\s+)/).forEach((w, wi) => {
        if (!w) return
        if (/^\s+$/.test(w)) {
          out.push(' ')
          return
        }
        const k = index++
        out.push(
          <span key={`${pi}-${wi}`} className="word">
            <span ref={(el) => engine.registerWord(id, k, el)} className={accent ? 'accent' : undefined}>
              {w}
            </span>
          </span>,
        )
      })
    })
  return <>{out}</>
}
