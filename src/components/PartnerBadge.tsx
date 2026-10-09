import { memo } from 'react'
import type { FilmEngine } from '../film/FilmEngine'

/**
 * Golden Eagle × Frutex badge. The engine pins it over the (already blurred) watermark area of the
 * footage, recomputed on resize only. Starts hidden until the first measurement.
 */
export const PartnerBadge = memo(function PartnerBadge({ engine }: { engine: FilmEngine }) {
  return (
    <div
      ref={engine.registerBadge}
      className="bezel invisible fixed top-0 left-0 z-20 opacity-0 transition-opacity duration-500 [--bz:4px] [--r:999px]"
      role="group"
      aria-label="Golden Eagle and Frutex"
    >
      <div className="core core-light flex h-11 items-center justify-center gap-3.5 px-4 md:h-12 md:gap-4 md:px-5">
        <span className="flex items-center gap-2">
          <img src="/brand/eagle-emblem.webp" width={192} height={164} alt="Golden Eagle" className="h-7 w-auto" />
          <span className="text-[0.8rem] font-semibold tracking-[-0.025em] md:text-[0.85rem]">Golden Eagle</span>
        </span>
        <span className="h-5 w-px bg-white/20" />
        <img src="/brand/frutex-on-dark.svg" width={209} height={44} alt="Frutex" className="h-4 w-auto md:h-[18px]" />
      </div>
    </div>
  )
})
