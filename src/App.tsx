import { useEffect, useState } from 'react'
import { FilmEngine } from './film/FilmEngine'
import { Stage } from './components/Stage'
import { Captions } from './components/Captions'
import { Nav } from './components/Nav'
import { Rail } from './components/Rail'
import { PartnerBadge } from './components/PartnerBadge'
import { Loader } from './components/Loader'
import { Footer } from './components/Footer'
import { Letterbox } from './components/Letterbox'

export default function App() {
  // One engine for the lifetime of the page. React renders structure; the engine animates it.
  const [engine] = useState(() => new FilmEngine())

  useEffect(() => {
    engine.mount()
    if (import.meta.env.DEV) Object.assign(window, { __film: engine }) // console access while developing
    return () => engine.destroy()
  }, [engine])

  return (
    <>
      <Stage engine={engine} />
      <Captions engine={engine} />
      <Letterbox engine={engine} />
      <Rail engine={engine} />
      <PartnerBadge engine={engine} />
      <Nav engine={engine} />
      <Loader engine={engine} />

      <main>
        {/* Scroll track: film length + one viewport, so the last frame lands with the viewport filled. */}
        <div
          ref={engine.registerSpacer}
          className="film-spacer"
          style={{ ['--film-vh' as string]: String(engine.totalVh + 100) }}
          aria-hidden="true"
        />
      </main>

      <Footer engine={engine} />
    </>
  )
}
