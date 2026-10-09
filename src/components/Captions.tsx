import { memo } from 'react'
import type { FilmEngine } from '../film/FilmEngine'
import { CHAPTERS, FLAVORS, FLAVOR_SCENES, type Caption, type Flavor } from '../film/scenes'
import { Title } from './Title'
import { ArrowDown, Replay } from './Icons'

/**
 * All copy that rides on top of the film. Each caption is rendered once; the engine owns its
 * opacity / transform / visibility and the word-by-word reveal. Outer wrappers position, inner
 * `.caption` elements animate, so engine transforms never fight layout transforms.
 *
 * Placement modes (see index.css):  default = wide frames · `stack:` = phones + portrait
 * tablets (copy docks to the bottom edge) · `short:` = landscape phones (compact).
 */
export const Captions = memo(function Captions({ engine }: { engine: FilmEngine }) {
  const captions = engine.scenes.flatMap((s) => s.captions)
  return (
    <div ref={engine.registerCaptionLayer} className="pointer-events-none fixed inset-0 z-10">
      {captions.map((c) => (
        <CaptionView key={c.id} caption={c} engine={engine} />
      ))}
    </div>
  )
})

export const scrollToRange = () => document.getElementById('range')?.scrollIntoView({ behavior: 'smooth' })

const size = (v: string) => ({ fontSize: `var(${v})` })

function CaptionView({ caption: c, engine }: { caption: Caption; engine: FilmEngine }) {
  const ref = (el: HTMLElement | null) => engine.registerCaption(c.id, el)

  if (c.layout === 'intro') {
    return (
      <div className="absolute inset-x-[var(--gutter)] bottom-[calc(var(--lb)+5vh)] stack:bottom-[calc(var(--lb)+24px+var(--safe-b))] short:bottom-[calc(var(--lb)+12px)]">
        <div ref={ref} className="caption">
          <p className="tag label shadow-text">{c.eyebrow}</p>
          <h1 className="display shadow-text mt-6 max-w-[21ch] stack:max-w-[11ch] short:mt-4" style={size('--t-hero')}>
            <Title text={c.title!} engine={engine} id={c.id} />
          </h1>
        </div>
      </div>
    )
  }

  if (c.layout === 'statement') {
    const accentOnly = /^\*[^*]+\*$/.test(c.title ?? '')
    const long = (c.title?.length ?? 0) > 26
    const dock = 'stack:inset-x-[var(--gutter)] stack:top-auto stack:bottom-[calc(28px+var(--safe-b))] stack:max-w-none'

    const place = accentOnly
      ? `inset-x-0 bottom-[max(5vh,var(--badge-clear,0px))] px-[var(--gutter)] text-center ${dock}`
      : c.side === 'center'
        ? `inset-x-0 bottom-[13vh] px-[var(--gutter)] text-center short:bottom-[8vh] ${dock}`
        : c.side === 'left-top'
          ? `left-[var(--gutter)] top-[calc(var(--safe-t)+124px)] max-w-[min(27vw,25rem)] short:top-[96px] ${dock}`
          : `left-[var(--gutter)] bottom-[12vh] max-w-[min(46rem,calc(100vw-2*var(--gutter)))] short:bottom-[7vh] ${dock}`

    const scale = accentOnly ? '--t-mega' : c.side === 'left-top' ? '--t-h2-side' : long ? '--t-h2-long' : '--t-h2'
    const measure = accentOnly ? '' : long ? 'max-w-[15ch]' : 'max-w-[12ch]'

    return (
      <div className={`absolute ${place}`}>
        <div ref={ref} className={`caption ${c.side === 'center' || accentOnly ? 'mx-auto flex w-fit flex-col items-center' : ''}`}>
          {c.eyebrow && <p className="tag label shadow-text">{c.eyebrow}</p>}
          <h2 className={`display shadow-text ${measure} ${c.eyebrow ? 'mt-6' : ''}`} style={size(scale)}>
            <Title text={c.title!} engine={engine} id={c.id} />
          </h2>
          {c.body && (
            <p className="shadow-text mt-5 max-w-[32ch] text-[1.0625rem] leading-relaxed tracking-[-0.012em] text-cream/78 short:hidden md:text-lg">
              {c.body}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (c.layout === 'flavor' && c.flavor) {
    return (
      <div className="absolute top-1/2 left-[var(--gutter)] -translate-y-1/2 stack:inset-x-[var(--gutter)] stack:top-auto stack:bottom-[calc(14px+var(--safe-b))] stack:translate-y-0 short:top-auto short:bottom-3 short:translate-y-0">
        {/* the ref sits on the bezel, which also owns the blur: an ancestor with opacity < 1 would disable it */}
        <section
          ref={ref}
          aria-label={`${c.flavor.name} flavor`}
          className="caption bezel mx-auto w-full max-w-[28rem] stack:max-w-[30rem] lg:w-[clamp(23rem,26vw,27.5rem)]"
        >
          <FlavorCard f={c.flavor} engine={engine} captionId={c.id} />
        </section>
      </div>
    )
  }

  if (c.layout === 'final') {
    return (
      <div className="absolute inset-x-[var(--gutter)] bottom-[max(6vh,var(--badge-clear,0px))] flex justify-center stack:bottom-[max(calc(20px+var(--safe-b)),var(--badge-clear,0px))] short:bottom-[max(12px,var(--badge-clear,0px))]">
        <section ref={ref} aria-label="Golden Eagle" className="caption bezel w-full max-w-[34rem]">
          <div className="core flex flex-col items-center px-6 pt-8 pb-6 text-center md:px-10 md:pt-10 md:pb-8 short:pt-5 short:pb-5">
            <img
              src="/brand/golden-eagle.webp"
              width={900}
              height={367}
              alt="Golden Eagle"
              className="h-auto w-[min(190px,46vw)] short:hidden"
            />
            <h2 className="display mt-7 short:mt-0" style={size('--t-card')}>
              <Title text={c.title!} engine={engine} id={c.id} />
            </h2>
            <p className="mt-4 max-w-[30ch] leading-relaxed text-cream/72 short:hidden">Six flavors, one summit. Golden Eagle Energy Drink.</p>
            <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row short:mt-4">
              <button type="button" onClick={scrollToRange} className="btn btn-gold">
                The Range
                <span className="btn-icon">
                  <ArrowDown />
                </span>
              </button>
              <button type="button" onClick={() => engine.jumpTo(0, 0)} className="btn btn-ghost">
                Replay the film
                <span className="btn-icon">
                  <Replay />
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return null
}

function FlavorCard({ f, engine, captionId }: { f: Flavor; engine: FilmEngine; captionId: string }) {
  const k = f.index - 1
  const nextFlavor = FLAVORS[k + 1]
  const next = () => {
    if (nextFlavor) engine.jumpTo(FLAVOR_SCENES[k + 1], 1.4)
    else {
      const energy = CHAPTERS.find((c) => c.label === 'Energy')!
      engine.jumpTo(energy.sceneIndex, energy.at)
    }
  }

  return (
    <div className="core overflow-hidden p-7 stack:px-4 stack:py-3.5 short:p-5">
      {/* the flavor's own colour, drawn as light along the top edge of the plate */}
      <span
        aria-hidden="true"
        className="absolute inset-x-6 top-0 h-px opacity-90"
        style={{ background: `linear-gradient(90deg, transparent, ${f.color}, transparent)` }}
      />

      <h2 className="display stack:!text-[2rem]" style={size('--t-card')}>
        <Title text={f.name} engine={engine} id={captionId} />
      </h2>
      <p className="accent mt-2 text-xl stack:mt-0.5 stack:text-base">{f.edition}</p>

      <p className="mt-5 text-[1.02rem] leading-snug font-medium tracking-[-0.015em] text-cream/92 stack:hidden short:hidden">
        {f.tagline}
      </p>
      <p className="mt-2 max-w-[34ch] text-[0.92rem] leading-relaxed tracking-[-0.01em] text-cream/62 stack:mt-1.5 stack:text-[0.82rem] stack:leading-snug short:mt-2 short:text-[0.84rem] short:leading-snug">
        {f.description}
      </p>

      <div className="mt-6 mb-4 h-px bg-gradient-to-r from-white/20 via-white/8 to-transparent stack:hidden short:hidden" />

      {/* the range at a glance: every swatch names its flavor on hover / focus */}
      <div className="-mx-1.5 flex items-center justify-between stack:mt-2 short:mt-3" role="group" aria-label="Choose a flavor">
        {FLAVORS.map((x, i) => {
          const active = x.index === f.index
          return (
            <button
              key={x.name}
              type="button"
              aria-label={`Show ${x.name}`}
              aria-current={active}
              onClick={() => engine.jumpTo(FLAVOR_SCENES[i], 1.4)}
              className="group relative grid size-9 place-items-center rounded-full"
            >
              <span
                className={`block rounded-full transition-transform duration-300 ease-[var(--ease-out)] group-active:scale-90 [@media(hover:hover)]:group-hover:scale-125 ${
                  active ? 'size-3 ring-[1.5px] ring-cream/90 ring-offset-[3px] ring-offset-[#0b0b0d]' : 'size-2.5 opacity-75'
                }`}
                style={{ background: x.color }}
              />
              <span className="label pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full bg-black/70 px-2.5 py-1 text-[0.6rem] text-cream opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-focus-visible:translate-y-0 group-focus-visible:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
                {x.name}
              </span>
            </button>
          )
        })}
      </div>

      <button type="button" onClick={next} className="btn btn-ghost mt-4 w-full !text-[0.84rem] stack:mt-1.5 stack:!py-1 stack:!text-[0.78rem]">
        <span className="truncate">
          <span className="text-cream/55">Next:</span> {nextFlavor ? nextFlavor.name : 'Energy'}
        </span>
        <span className="btn-icon !size-8 stack:!size-7">
          <ArrowDown />
        </span>
      </button>
    </div>
  )
}
