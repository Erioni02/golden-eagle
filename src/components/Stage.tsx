import { memo } from 'react'
import type { FilmEngine } from '../film/FilmEngine'
import { posterUrl } from '../film/media'

/** Fixed full-screen layer stack: one <video> per scene (or one still per scene in reduced motion). */
export const Stage = memo(function Stage({ engine }: { engine: FilmEngine }) {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-ink" aria-hidden="true">
      <div ref={engine.registerStage} className="absolute inset-0 will-change-transform">
        {engine.scenes.map((s, i) => {
          const objectPosition = `${(s.focusX ?? 0.5) * 100}% 50%`
          return engine.reduced ? (
            <img
              key={s.id}
              ref={(el) => engine.registerStill(i, el)}
              className="stage-video"
              style={{ objectPosition }}
              src={posterUrl(s.file, i === 0 ? 'first' : 'last')}
              alt=""
              decoding="async"
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          ) : (
            <video
              key={s.id}
              ref={(el) => engine.registerVideo(i, el)}
              className="stage-video"
              style={{ objectPosition }}
              poster={i === 0 ? posterUrl(s.file, 'first') : undefined}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              disableRemotePlayback
              tabIndex={-1}
            />
          )
        })}
      </div>
      {/* fallback still: shown only while the scene on screen has no decoded video frame yet */}
      {!engine.reduced && <img ref={engine.registerFallback} className="stage-video stage-still" alt="" decoding="async" />}
      <div className="stage-grade absolute inset-0" />
      {/* depth planes: far flakes, then near (out-of-focus) flakes in front of the footage */}
      <div ref={(el) => engine.registerSnow('far', el)} className="snow snow-far">
        <i />
      </div>
      <div ref={(el) => engine.registerSnow('near', el)} className="snow snow-near">
        <i />
      </div>
      {/* flavor light: the scene's colour spilling onto the interface side of the frame */}
      <div ref={engine.registerTone} className="tone-light absolute inset-0" />
      {/* grain sits above the footage, below all type, so copy stays sharp */}
      <div className="grain" />
    </div>
  )
})
