import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FilmEngine } from '../film/FilmEngine'
import { CHAPTERS, FLAVORS, FLAVOR_SCENES } from '../film/scenes'
import { ArrowDown } from './Icons'
import { scrollToRange } from './Captions'

/**
 * Floating "island" navigation + full-screen chapter menu.
 * Re-renders only when the chapter changes (a handful of times per visit) or the menu toggles.
 */
export function Nav({ engine }: { engine: FilmEngine }) {
  const [chapter, setChapter] = useState(0)
  const [open, setOpen] = useState(false)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pillRef = useRef<HTMLSpanElement>(null)

  useEffect(() => engine.on('chapter', setChapter), [engine])

  // Slide the active-chapter pill under the current item (measured on change only).
  useLayoutEffect(() => {
    const place = () => {
      const el = itemRefs.current[chapter]
      const pill = pillRef.current
      if (!el || !pill) return
      pill.style.width = `${el.offsetWidth}px`
      pill.style.transform = `translate3d(${el.offsetLeft}px,0,0)`
    }
    place()
    document.fonts?.ready.then(place) // label widths settle once Geist has loaded
  }, [chapter])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
    }
  }, [open])

  const go = (i: number) => {
    const c = CHAPTERS[i]
    setOpen(false)
    engine.jumpTo(c.sceneIndex, c.at)
  }

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30">
      {/* full-screen chapter menu (rendered first so the island stays on top of it) */}
      <div
        id="chapter-menu"
        aria-hidden={!open}
        className={`fixed inset-0 bg-ink/75 backdrop-blur-2xl transition-opacity ${
          open ? 'pointer-events-auto opacity-100 duration-500' : 'invisible opacity-0 duration-200'
        }`}
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col justify-between overflow-y-auto px-[var(--gutter)] pt-[calc(var(--safe-t)+112px)] pb-[calc(var(--safe-b)+36px)] short:pt-[88px]">
          <nav aria-label="Chapters">
            <ol className="flex flex-col">
              {CHAPTERS.map((c, i) => (
                <li
                  key={c.label}
                  className={`transition-[transform,opacity] ${
                    open ? 'translate-y-0 opacity-100 duration-700 ease-[var(--ease-drawer)]' : 'translate-y-10 opacity-0 duration-200'
                  }`}
                  style={{ transitionDelay: open ? `${80 + i * 55}ms` : '0ms' }}
                >
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => go(i)}
                    className="group flex w-full items-baseline gap-5 border-b border-white/8 py-3 text-left md:gap-8 md:py-4"
                  >
                    <span className="label w-8 text-cream/40">{String(i + 1).padStart(2, '0')}</span>
                    <span
                      className={`display text-[clamp(2rem,min(6.5vw,7.5vh),4.6rem)] transition-colors duration-300 ${
                        i === chapter ? 'text-gold-soft' : 'text-cream group-hover:text-gold-soft'
                      }`}
                    >
                      {c.label}
                    </span>
                    {i === chapter && <span className="label ml-auto self-center text-gold-soft">Now playing</span>}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div
            className={`flex flex-wrap items-center justify-between gap-6 transition-[transform,opacity] ${
              open ? 'translate-y-0 opacity-100 delay-500 duration-700 ease-[var(--ease-drawer)]' : 'translate-y-6 opacity-0 duration-150'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {FLAVORS.map((f, k) => (
                <button
                  key={f.name}
                  type="button"
                  tabIndex={open ? 0 : -1}
                  onClick={() => {
                    setOpen(false)
                    engine.jumpTo(FLAVOR_SCENES[k], 1.4)
                  }}
                  className="label flex items-center gap-2 text-cream/70 transition-colors hover:text-cream"
                >
                  <span className="size-2 rounded-full" style={{ background: f.color }} />
                  {f.name}
                </button>
              ))}
            </div>
            <img src="/brand/frutex-on-dark.svg" width={209} height={44} alt="Frutex" className="h-5 w-auto opacity-80" />
          </div>
        </div>
      </div>

      {/* the island */}
      <div className="flex justify-center px-[var(--gutter)] pt-[calc(var(--safe-t)+18px)]">
        <nav aria-label="Primary" className="bezel pointer-events-auto [--bz:5px] [--r:999px] max-lg:w-full">
          <div className="core core-light flex h-12 items-center gap-1 pr-1.5 pl-1.5">
            <button
              type="button"
              onClick={() => go(0)}
              className="flex items-center gap-2.5 rounded-full py-1 pr-4 pl-1 transition-transform duration-150 active:scale-[0.97]"
              aria-label="Golden Eagle, back to the summit"
            >
              <img src="/brand/eagle-emblem.webp" width={192} height={164} alt="" className="h-8 w-auto" />
              <span className="text-[0.95rem] font-semibold tracking-[-0.03em]">Golden Eagle</span>
            </button>

            <span className="mx-1 hidden h-5 w-px bg-white/12 lg:block" />

            <div className="relative hidden items-center lg:flex">
              <span
                ref={pillRef}
                aria-hidden="true"
                className="absolute top-0 left-0 h-full rounded-full bg-white/12 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-[transform,width] duration-500 ease-[var(--ease-drawer)]"
              />
              {CHAPTERS.map((c, i) => (
                <button
                  key={c.label}
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={chapter === i ? 'step' : undefined}
                  className={`relative rounded-full px-3.5 py-2 text-[0.82rem] font-medium tracking-[-0.01em] transition-colors duration-300 ${
                    chapter === i ? 'text-cream' : 'text-cream/55 hover:text-cream'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5 lg:ml-2">
              <button
                type="button"
                onClick={scrollToRange}
                className="btn btn-gold !gap-3 !py-1.5 !pr-1.5 !pl-4 !text-[0.8rem] max-sm:hidden"
              >
                The Range
                <span className="btn-icon !size-7">
                  <ArrowDown />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls="chapter-menu"
                aria-label={open ? 'Close menu' : 'Open menu'}
                className="grid size-9 place-items-center rounded-full bg-white/8 transition-transform duration-150 active:scale-[0.94] lg:hidden"
              >
                <span className="relative block h-2.5 w-4">
                  <span
                    className={`absolute inset-x-0 top-0 h-px bg-cream transition-transform duration-500 ease-[var(--ease-drawer)] ${
                      open ? 'translate-y-[5px] rotate-45' : ''
                    }`}
                  />
                  <span
                    className={`absolute inset-x-0 bottom-0 h-px bg-cream transition-transform duration-500 ease-[var(--ease-drawer)] ${
                      open ? '-translate-y-[4px] -rotate-45' : ''
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
