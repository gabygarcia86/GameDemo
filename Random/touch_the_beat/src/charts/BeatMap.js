// Beat-map (chart) format, version 1.
//
// Canonical chord representation: a chord is several notes that share the
// exact same `time` value (rounded to the millisecond) in different lanes.
// There is no separate chord object.
//
// {
//   "version": 1,
//   "songId": "artist-title",
//   "title": "Title", "artist": "Artist",
//   "duration": 211.39,          // seconds
//   "bpm": 99.4,
//   "offset": 0.0,               // seconds, added to every note time at load
//   "difficulty": "normal",
//   "beatsPerBar": 4,
//   "beats": [0.52, 1.13, ...],   // optional beat grid (seconds)
//   "downbeat": 0,               // index into beats of the first downbeat
//   "sections": [{ "start": 0, "end": 18.2, "energy": 0.4 }],
//   "notes": [
//     { "time": 1.25, "lane": 0, "type": "tap",  "duration": 0,   "confidence": 0.92 },
//     { "time": 1.75, "lane": 2, "type": "hold", "duration": 0.9, "confidence": 0.86 }
//   ],
//   "confidence": { "overall": 0.8, "tempo": 0.9, ... },
//   "generator": { "name": "...", "version": "...", "settings": {...} },
//   "stats": { "noteCount": 300, ... }
// }

export const BEATMAP_VERSION = 1;
export const LANE_COUNT = 4;
export const NOTE_TYPES = ['tap', 'hold'];

const r3 = (v) => Math.round(v * 1000) / 1000;

export function createBeatMap(fields) {
  return {
    version: BEATMAP_VERSION,
    songId: fields.songId,
    title: fields.title,
    artist: fields.artist || '',
    duration: r3(fields.duration),
    bpm: Math.round((fields.bpm || 0) * 100) / 100,
    offset: r3(fields.offset || 0),
    difficulty: fields.difficulty,
    beatsPerBar: fields.beatsPerBar || 4,
    beats: (fields.beats || []).map(r3),
    downbeat: fields.downbeat || 0,
    sections: fields.sections || [],
    notes: fields.notes,
    confidence: fields.confidence || null,
    generator: fields.generator || null,
    stats: fields.stats || null,
  };
}

/**
 * Parse and sanity-check a beat map from untrusted JSON (fetched file,
 * IndexedDB record or user import). Throws with a readable message.
 */
export function parseBeatMap(data) {
  const obj = typeof data === 'string' ? JSON.parse(data) : data;
  if (!obj || typeof obj !== 'object') throw new Error('Beat map is not an object');
  if (obj.version !== BEATMAP_VERSION) throw new Error(`Unsupported beat map version ${obj.version}`);
  if (!Array.isArray(obj.notes)) throw new Error('Beat map has no notes array');
  const duration = Number(obj.duration);
  if (!(duration > 0)) throw new Error('Beat map duration is missing');
  const notes = [];
  for (const n of obj.notes) {
    const time = Number(n.time);
    const lane = Number(n.lane);
    if (!Number.isFinite(time) || !Number.isInteger(lane) || lane < 0 || lane >= LANE_COUNT) continue;
    const type = n.type === 'hold' && Number(n.duration) > 0 ? 'hold' : 'tap';
    notes.push({
      time: r3(time),
      lane,
      type,
      duration: type === 'hold' ? r3(Number(n.duration)) : 0,
      confidence: Number.isFinite(Number(n.confidence)) ? Number(n.confidence) : 1,
    });
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return {
    ...obj,
    duration,
    offset: Number(obj.offset) || 0,
    bpm: Number(obj.bpm) || 0,
    beatsPerBar: Number(obj.beatsPerBar) || 4,
    beats: Array.isArray(obj.beats) ? obj.beats.map(Number).filter(Number.isFinite) : [],
    downbeat: Number(obj.downbeat) || 0,
    sections: Array.isArray(obj.sections) ? obj.sections : [],
    notes,
  };
}

/** Group notes that share a timestamp. Returns arrays of note indices. */
export function chordGroups(notes) {
  const groups = [];
  let current = null;
  for (let i = 0; i < notes.length; i++) {
    if (current && Math.abs(notes[i].time - notes[current[0]].time) < 0.0015) current.push(i);
    else groups.push((current = [i]));
  }
  return groups;
}
