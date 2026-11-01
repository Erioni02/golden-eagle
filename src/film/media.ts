/** Public Mux playback IDs resolve to adaptive HLS playlists. */
export const clipUrl = (playbackId: string) => `https://stream.mux.com/${playbackId}.m3u8`

/** Local posters remain instant and available even while a Mux stream is seeking. */
export const posterUrl = (file: string, which: 'first' | 'last') => `/media/posters/${file}-${which}.webp`
