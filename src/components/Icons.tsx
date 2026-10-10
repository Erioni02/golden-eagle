import {
  ArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowUpRight as PhArrowUpRight,
  WifiHigh,
  WifiLow,
  type IconProps,
} from '@phosphor-icons/react'

/** One icon family (Phosphor), one weight, one size — sized for the nested button circles. */
const base: IconProps = { size: 15, weight: 'regular', 'aria-hidden': true }

export const ArrowUpRight = (p: IconProps) => <PhArrowUpRight {...base} {...p} />
export const ArrowDown = (p: IconProps) => <PhArrowDown {...base} {...p} />
export const Replay = (p: IconProps) => <ArrowCounterClockwise {...base} {...p} />
/** Weak-signal glyph: the full Wi-Fi shape dimmed, with only the lowest bars lit. */
export const SlowSignal = ({ size = 18 }: { size?: number }) => (
  <span className="relative grid place-items-center" aria-hidden="true">
    <WifiHigh size={size} weight="bold" className="opacity-25" />
    <WifiLow size={size} weight="bold" className="net-icon absolute inset-0" />
  </span>
)
