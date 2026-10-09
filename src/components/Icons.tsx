import {
  ArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowUpRight as PhArrowUpRight,
  type IconProps,
} from '@phosphor-icons/react'

/** One icon family (Phosphor), one weight, one size — sized for the nested button circles. */
const base: IconProps = { size: 15, weight: 'regular', 'aria-hidden': true }

export const ArrowUpRight = (p: IconProps) => <PhArrowUpRight {...base} {...p} />
export const ArrowDown = (p: IconProps) => <PhArrowDown {...base} {...p} />
export const Replay = (p: IconProps) => <ArrowCounterClockwise {...base} {...p} />
