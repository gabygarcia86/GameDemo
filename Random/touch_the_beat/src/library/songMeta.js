// Shared song metadata helpers (used by the browser importer and the Node compiler).

export const AUDIO_TYPES = Object.freeze({
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  weba: 'audio/webm',
});

export function extensionOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function mimeFor(name) {
  return AUDIO_TYPES[extensionOf(name)] || '';
}

export function isAudioFileName(name) {
  return Boolean(mimeFor(name));
}

/** "Artist - Title.mp3" -> { artist, title }. Falls back to the bare name. */
export function parseSongFileName(name) {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const idx = base.indexOf(' - ');
  if (idx > 0) return { artist: base.slice(0, idx).trim(), title: base.slice(idx + 3).trim() };
  return { artist: 'Unknown Artist', title: base };
}

/** Case- and accent-insensitive text order ("ADÉLA" sits with "Adela"). */
export function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric: true });
}

export function slugify(text) {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'song'
  );
}

export function songIdFor(artist, title) {
  return slugify(`${artist} ${title}`);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
