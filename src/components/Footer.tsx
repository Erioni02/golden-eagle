import { useEffect, useRef } from 'react'
import type { FilmEngine } from '../film/FilmEngine'
import { FLAVORS, FLAVOR_SCENES, type Flavor } from '../film/scenes'
import { Title } from './Title'
import { ArrowUpRight, Replay } from './Icons'

/**
 * Bento placement per flavor (desktop/tablet). Six items, six cells: one hero tile, two
 * stacked beside it, three across the bottom. Phones collapse to one column.
 */
const SPANS = [
  'md:col-span-7 md:row-span-2',
  'md:col-span-5',
  'md:col-span-5',
  'md:col-span-4',
  'md:col-span-4',
  'md:col-span-4',
]

/**
 * After the film: the range as a bento grid, then the close.
 * Entry reveals are CSS transitions toggled once by a single IntersectionObserver.
 */
export function Footer({ engine }: { engine: FilmEngine }) {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('.reveal')
    if (!els?.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <footer ref={root} className="relative z-20 overflow-hidden bg-ink">
      {/* soft gold light spilling down from the last frame of the film */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(60%_100%_at_50%_0%,rgb(242_194_48/0.1),transparent_70%)]"
      />

      <section
        id="range"
        aria-labelledby="range-title"
        className="relative mx-auto max-w-[96rem] scroll-mt-6 px-[var(--gutter)] pt-28 pb-20 md:pt-44 md:pb-24"
      >
        <p className="tag label reveal">The Range</p>
        <h2 id="range-title" className="display reveal mt-8 max-w-[12ch] [--d:80ms]" style={{ fontSize: 'var(--t-section)' }}>
          <Title text="Six flavors. *One summit.*" />
        </h2>
        <p className="reveal mt-8 max-w-[44ch] text-lg leading-relaxed tracking-[-0.012em] text-cream/70 [--d:160ms]">
          Every can carries the same eagle. Choose yours, then watch it break out of the ice.
        </p>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-24 md:auto-rows-[clamp(17rem,24vw,26rem)] md:grid-cols-12 md:gap-5">
          {FLAVORS.map((f, k) => (
            <FlavorTile
              key={f.name}
              f={f}
              span={SPANS[k]}
              hero={k === 0}
              wide={k === 0 || k === FLAVORS.length - 1}
              delay={(k % 3) * 70}
              onOpen={() => engine.jumpTo(FLAVOR_SCENES[k], 1.4)}
            />
          ))}
        </div>
      </section>

      <section aria-label="Closing" className="relative mx-auto max-w-[96rem] px-[var(--gutter)] pt-10 md:pt-20">
        <div className="flex flex-col items-start justify-between gap-10 border-t border-white/8 pt-14 md:flex-row md:items-end">
          <p className="display reveal max-w-[17ch] text-[clamp(2.2rem,4.4vw,4.6rem)]">
            <Title text="From a frozen summit to every corner of the *world.*" />
          </p>
          <button type="button" onClick={() => engine.jumpTo(0, 0)} className="btn btn-ghost reveal shrink-0 [--d:120ms]">
            Replay the film
            <span className="btn-icon">
              <Replay />
            </span>
          </button>
        </div>

        {/* the wordmark, cropped by the bottom edge of the page */}
        <div aria-hidden="true" className="reveal mt-20 select-none overflow-hidden [--d:100ms] md:mt-32">
          <p className="display translate-y-[18%] text-center text-[15.4vw] leading-[0.86] tracking-[-0.07em] whitespace-nowrap text-cream/90">
            Golden <span className="accent">Eagle</span>
          </p>
        </div>
      </section>

      <div className="relative border-t border-white/8 bg-ink">
        <div className="mx-auto flex max-w-[96rem] flex-col items-start justify-between gap-5 px-[var(--gutter)] py-7 pb-[calc(28px+var(--safe-b))] sm:flex-row sm:items-center">
          <p className="label text-cream/45">© {new Date().getFullYear()} Golden Eagle Energy Drink</p>
          <div className="flex items-center gap-6">
            <img src="/brand/eagle-emblem.webp" width={192} height={164} alt="Golden Eagle" className="h-7 w-auto" />
            <img src="/brand/frutex-on-dark.svg" width={209} height={44} alt="Frutex" className="h-[18px] w-auto opacity-90" />
          </div>
        </div>
      </div>
    </footer>
  )
}

function FlavorTile({
  f,
  span,
  hero,
  wide,
  delay,
  onOpen,
}: {
  f: Flavor
  span: string
  hero: boolean
  /** spans both columns in the 2-column (small tablet) grid so no cell is left empty */
  wide: boolean
  delay: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${f.name}: watch its scene in the film`}
      className={`reveal group bezel bezel-flat block text-left ${span} aspect-[4/5] md:aspect-auto ${wide ? 'sm:col-span-2 sm:aspect-[16/10] md:aspect-auto' : ''}`}
      style={{ ['--d' as string]: `${delay}ms` }}
    >
      <div className="core relative h-full overflow-hidden !bg-ink">
        <img
          src={`/media/cards/${f.card}.webp`}
          alt=""
          loading="lazy"
          decoding="async"
          className="media-zoom absolute inset-0 size-full object-cover object-[72%_50%] md:object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.82),rgb(0_0_0/0.1)_45%,transparent),linear-gradient(to_right,rgb(0_0_0/0.45),transparent_55%)]" />

        <span className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-black/35 text-cream ring-1 ring-white/15 transition-transform duration-500 ease-[var(--ease-out)] [@media(hover:hover)]:group-hover:translate-x-0.5 [@media(hover:hover)]:group-hover:-translate-y-0.5 [@media(hover:hover)]:group-hover:scale-105">
          <ArrowUpRight />
        </span>

        <div className="absolute inset-x-0 bottom-0 p-6 md:p-7">
          <h3 className={`display ${hero ? 'text-[clamp(2.8rem,5.4vw,6rem)]' : 'text-[clamp(2.2rem,3vw,3.2rem)]'}`}>{f.name}</h3>
          <p className="accent mt-1.5 text-xl">{f.edition}</p>
          {hero && <p className="mt-4 max-w-[30ch] text-cream/75">{f.tagline}</p>}
        </div>
      </div>
    </button>
  )
}
