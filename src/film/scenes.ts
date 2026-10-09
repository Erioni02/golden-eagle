/**
 * The film, as data. Each scene is one encoded clip followed by an optional "hold"
 * (scroll distance where the clip rests on its last frame).
 *
 * Caption windows use scene-local units:  0 → 1 = the clip scrubs,  1 → 2 = the hold.
 * In titles, wrap a word in *asterisks* to set it in the italic gold accent.
 */

export const FPS = 24

/** Scroll distance per second of footage, in viewport heights. */
export const VH_PER_SECOND = 40

export type CaptionSide = 'left' | 'left-top' | 'center'

export type CaptionLayout = 'intro' | 'statement' | 'flavor' | 'final'

export interface Flavor {
  index: number
  name: string
  edition: string
  tagline: string
  /** One or two sentences on how it tastes / who it's for (shown on the film card and range tile). */
  description: string
  color: string
  /** Portrait still for the range grid (public/media/cards). */
  card: string
}

export interface Caption {
  id: string
  from: number
  to: number
  layout: CaptionLayout
  eyebrow?: string
  title?: string
  body?: string
  flavor?: Flavor
  /** Which side of the frame the copy sits on (desktop). */
  side?: CaptionSide
}

export interface Scene {
  id: string
  /** File stem in /media/{desktop|mobile}/ */
  file: string
  frames: number
  holdVh: number
  chapter?: string
  /** Horizontal focus (0–1) for object-position when the frame is cropped (portrait screens). */
  focusX?: number
  captions: Caption[]
}

export const FLAVORS: Flavor[] = [
  {
    index: 1,
    name: 'Original',
    edition: 'Energy Drink',
    tagline: 'The legend that started it all.',
    description: 'The classic Golden Eagle taste. Crisp, bright and best served ice-cold.',
    color: '#f2c230',
    card: '03',
  },
  {
    index: 2,
    name: 'Red',
    edition: 'Edition',
    tagline: 'Fierce by nature. Fired up by design.',
    description: 'A bolder, more intense take on the original, for the days that ask for more.',
    color: '#d3122f',
    card: '04',
  },
  {
    index: 3,
    name: 'Sugar Free',
    edition: 'Energy Drink',
    tagline: 'All of the wings. None of the sugar.',
    description: 'Everything you love about the original, without the sugar.',
    color: '#dfe9f3',
    card: '05',
  },
  {
    index: 4,
    name: 'Tropical',
    edition: 'Edition',
    tagline: 'Sunshine, carbonated.',
    description: 'Ripe mango and pineapple notes, bright and sun-warmed.',
    color: '#f59e0b',
    card: '06',
  },
  {
    index: 5,
    name: 'Strawberry',
    edition: 'Edition',
    tagline: 'Bold, bright and bursting.',
    description: 'Juicy strawberry flavour with a sweet, vivid finish.',
    color: '#c2185b',
    card: '07',
  },
  {
    index: 6,
    name: 'Coffee',
    edition: 'Edition',
    tagline: 'Roasted. Charged. Ready.',
    description: 'Smooth roasted coffee meets Golden Eagle energy. Made for early starts.',
    color: '#b08a4a',
    card: '08',
  },
]

const flavorCaption = (f: Flavor): Caption => ({
  id: `flavor-${f.index}`,
  from: 0.9,
  to: 2,
  layout: 'flavor',
  flavor: f,
})

export const SCENES: Scene[] = [
  {
    id: 'summit',
    file: '01',
    frames: 146,
    holdVh: 0,
    chapter: 'Summit',
    captions: [
      {
        id: 'intro',
        from: -1,
        to: 0.3,
        layout: 'intro',
        eyebrow: 'A film in seven chapters',
        title: 'Some energy can’t be *contained.*',
        side: 'left',
      },
      {
        id: 'summit-2',
        from: 0.45,
        to: 1,
        layout: 'statement',
        title: 'Sealed in ice. *Waiting.*',
        side: 'left',
      },
    ],
  },
  {
    id: 'ice',
    file: '02',
    frames: 97,
    holdVh: 0,
    captions: [
      {
        id: 'ice-1',
        from: 0.15,
        to: 1,
        layout: 'statement',
        title: 'The ice begins to *crack.*',
        side: 'left',
      },
    ],
  },
  {
    id: 'shatter',
    file: '03',
    frames: 146,
    holdVh: 90,
    chapter: 'Flavors',
    captions: [
      { id: 'unleashed', from: 0.3, to: 0.82, layout: 'statement', title: '*Unbound.*', side: 'center' },
      flavorCaption(FLAVORS[0]),
    ],
  },
  { id: 'red', file: '04', frames: 146, holdVh: 80, captions: [flavorCaption(FLAVORS[1])] },
  { id: 'sugarfree', file: '05', frames: 122, holdVh: 80, captions: [flavorCaption(FLAVORS[2])] },
  { id: 'tropical', file: '06', frames: 122, holdVh: 80, captions: [flavorCaption(FLAVORS[3])] },
  { id: 'strawberry', file: '07', frames: 122, holdVh: 80, captions: [flavorCaption(FLAVORS[4])] },
  { id: 'coffee', file: '08', frames: 122, holdVh: 80, captions: [flavorCaption(FLAVORS[5])] },
  {
    id: 'energy',
    file: '09',
    frames: 122,
    holdVh: 60,
    chapter: 'Energy',
    captions: [
      {
        id: 'energy-1',
        from: 0.55,
        to: 2,
        layout: 'statement',
        title: 'Pure, golden *energy.*',
        body: 'Charged like a storm. Smooth like liquid gold.',
        side: 'left',
      },
    ],
  },
  {
    id: 'movement',
    file: '10',
    frames: 122,
    holdVh: 60,
    chapter: 'Movement',
    focusX: 0.56,
    captions: [
      {
        id: 'movement-1',
        from: 0.86,
        to: 2,
        layout: 'statement',
        title: 'Made for *movement.*',
        body: 'For every sprint, every leap, every last minute.',
        side: 'left-top',
      },
    ],
  },
  {
    id: 'kosovo',
    file: '11',
    frames: 194,
    holdVh: 50,
    chapter: 'Kosovo',
    focusX: 0.62,
    captions: [
      {
        id: 'kosovo-1',
        from: 0.45,
        to: 2,
        layout: 'statement',
        title: 'Rooted in the mountains of *Kosovo.*',
        body: 'Where the eagle has always flown highest.',
        side: 'left',
      },
    ],
  },
  {
    id: 'world',
    file: '12',
    frames: 146,
    holdVh: 50,
    chapter: 'World',
    captions: [
      {
        id: 'world-1',
        from: 0.5,
        to: 2,
        layout: 'statement',
        title: 'Rising across the *world.*',
        side: 'center',
      },
    ],
  },
  {
    id: 'return',
    file: '13',
    frames: 146,
    holdVh: 130,
    chapter: 'Rise',
    captions: [{ id: 'final', from: 0.82, to: 2.2, layout: 'final', title: 'Rise *above.*', side: 'center' }],
  },
]

export interface Chapter {
  label: string
  sceneIndex: number
  /** Scene-local position to land on. */
  at: number
  /** Where the chapter starts along the whole film (0–1) - for the progress rail ticks. */
  fraction: number
}

const sceneVh = (s: Scene) => (s.frames / FPS) * VH_PER_SECOND + s.holdVh
const TOTAL_VH = SCENES.reduce((sum, s) => sum + sceneVh(s), 0)

export const CHAPTERS: Chapter[] = SCENES.flatMap((s, i) =>
  s.chapter
    ? [
        {
          label: s.chapter,
          sceneIndex: i,
          at: s.chapter === 'Flavors' ? 1.2 : s.chapter === 'Summit' ? 0 : 0.7,
          fraction: SCENES.slice(0, i).reduce((sum, x) => sum + sceneVh(x), 0) / TOTAL_VH,
        },
      ]
    : [],
)

/** Scene index of each flavor's hold, for direct jumps. */
export const FLAVOR_SCENES = SCENES.flatMap((s, i) => (s.captions.some((c) => c.layout === 'flavor') ? [i] : []))

/** Total running time of the footage, in seconds (holds don't advance the clock). */
export const RUNTIME = SCENES.reduce((sum, s) => sum + s.frames / FPS, 0)
