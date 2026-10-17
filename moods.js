// Mood → audio-feature targets.
//
// Spotify's audio features are 0–1 scores:
//   valence       musical positivity (cheerful, euphoric ↔ sad, angry)
//   energy        intensity and activity (loud, fast, busy ↔ calm)
//   danceability  how suitable for dancing (steady beat, rhythm)
//   acousticness  confidence the track is acoustic
//   instrumental  likelihood of no vocals
// plus tempo in beats per minute.
//
// `null` means "this mood doesn't care about that feature".

export const MOODS = {
  happy:      { emoji: "😄", label: "Happy",      valence: .85, energy: .70, danceability: .70, acousticness: .20, instrumentalness: null, tempo: 120 },
  hype:       { emoji: "🔥", label: "Hype",       valence: .65, energy: .92, danceability: .75, acousticness: .05, instrumentalness: null, tempo: 135 },
  confident:  { emoji: "😎", label: "Confident",  valence: .70, energy: .78, danceability: .80, acousticness: .10, instrumentalness: null, tempo: 112 },
  party:      { emoji: "🎉", label: "Party",      valence: .78, energy: .85, danceability: .88, acousticness: .05, instrumentalness: null, tempo: 124 },
  chill:      { emoji: "🌊", label: "Chill",      valence: .55, energy: .35, danceability: .58, acousticness: .45, instrumentalness: null, tempo: 95 },
  romantic:   { emoji: "💕", label: "Romantic",   valence: .58, energy: .42, danceability: .60, acousticness: .40, instrumentalness: null, tempo: 98 },
  nostalgic:  { emoji: "📼", label: "Nostalgic",  valence: .50, energy: .50, danceability: .55, acousticness: .35, instrumentalness: null, tempo: 105 },
  focused:    { emoji: "🎯", label: "Focused",    valence: .45, energy: .40, danceability: .45, acousticness: .45, instrumentalness: .60, tempo: 100 },
  sad:        { emoji: "😢", label: "Sad",        valence: .15, energy: .30, danceability: .40, acousticness: .55, instrumentalness: null, tempo: 85 },
  heartbroken:{ emoji: "💔", label: "Heartbroken",valence: .12, energy: .40, danceability: .45, acousticness: .45, instrumentalness: .05, tempo: 90 },
  angry:      { emoji: "😤", label: "Angry",      valence: .22, energy: .92, danceability: .50, acousticness: .03, instrumentalness: null, tempo: 140 },
  anxious:    { emoji: "😰", label: "Anxious",    valence: .30, energy: .60, danceability: .45, acousticness: .25, instrumentalness: null, tempo: 115 },
  tired:      { emoji: "😴", label: "Sleepy",     valence: .30, energy: .15, danceability: .30, acousticness: .80, instrumentalness: .50, tempo: 75 },
};

// words people actually type → a mood (or several, which get blended)
export const KEYWORDS = {
  happy: ["happy", "good", "great", "glad", "joy", "joyful", "cheerful", "sunny", "blessed", "grateful", "excited", "amazing", "upbeat", "positive"],
  hype: ["hype", "hyped", "pumped", "gym", "workout", "lifting", "run", "running", "energetic", "turnt", "lit", "motivated", "beast"],
  confident: ["confident", "boss", "swag", "flex", "unstoppable", "powerful", "cocky", "winning", "drip"],
  party: ["party", "dance", "dancing", "club", "friday", "weekend", "celebrate", "celebrating", "birthday", "pregame"],
  chill: ["chill", "relaxed", "relax", "calm", "mellow", "vibe", "vibing", "lazy", "sunday", "cozy", "peaceful", "laid", "easy"],
  romantic: ["romantic", "love", "loved", "crush", "date", "flirty", "in love", "smitten", "sexy"],
  nostalgic: ["nostalgic", "nostalgia", "throwback", "memories", "reminiscing", "old", "childhood", "miss"],
  focused: ["focus", "focused", "study", "studying", "work", "working", "coding", "homework", "productive", "concentrate", "reading"],
  sad: ["sad", "down", "blue", "depressed", "low", "crying", "cry", "gloomy", "unhappy", "lonely", "alone", "empty", "rainy", "bummed"],
  heartbroken: ["heartbroken", "breakup", "broke up", "dumped", "ex", "betrayed", "hurt", "heartbreak", "cheated"],
  angry: ["angry", "mad", "furious", "pissed", "rage", "annoyed", "frustrated", "salty", "irritated", "hate"],
  anxious: ["anxious", "stressed", "nervous", "worried", "overwhelmed", "restless", "tense", "panicking"],
  tired: ["tired", "sleepy", "exhausted", "drained", "sleep", "bed", "bedtime", "late night", "insomnia", "burnt out"],
};

// typed genre words → dataset genre keys
export const GENRE_ALIASES = {
  rap: "hip-hop", "hip hop": "hip-hop", hiphop: "hip-hop", trap: "hip-hop", drill: "hip-hop",
  rnb: "r-n-b", "r&b": "r-n-b", "r and b": "r-n-b", soul: "soul",
  edm: "edm", electronic: "electronic", house: "house", techno: "techno", dubstep: "dubstep",
  kpop: "k-pop", "k pop": "k-pop", jpop: "j-pop", latin: "latin", reggaeton: "reggaeton",
  metal: "metal", rock: "rock", indie: "indie", country: "country", jazz: "jazz", classical: "classical",
  "lo-fi": "chill", lofi: "chill", gospel: "gospel", afrobeat: "afrobeat", afrobeats: "afrobeat",
};

// Turn free text ("tired but happy after the gym") into a blend of moods.
export function detectMoods(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-z' ]/g, " ")} `;
  const hits = [];
  for (const [mood, words] of Object.entries(KEYWORDS)) {
    if (words.some(w => t.includes(` ${w} `) || (w.length > 4 && t.includes(` ${w}`)))) hits.push(mood);
  }
  return hits;
}

// Average several mood targets into one.
export function blend(moodKeys) {
  const feats = ["valence", "energy", "danceability", "acousticness", "instrumentalness", "tempo"];
  const out = {};
  for (const f of feats) {
    const vals = moodKeys.map(k => MOODS[k][f]).filter(v => v !== null && v !== undefined);
    out[f] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}
