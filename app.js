import { MOODS, GENRE_ALIASES, detectMoods, blend } from "./moods.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  genres: [],
  cache: new Map(),       // genre key -> array of song objects
  moods: new Set(),
  slidersTouched: false,
  seed: Date.now() % 1e9,
  last: null,             // { songs, target, genreKey, all }
};

// ------------------------------------------------------------------ seeded RNG
function rng(seed) {   // mulberry32: same seed -> same "random" playlist, so links can be shared
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ data
async function loadGenres() {
  const res = await fetch("data/genres.json");
  if (!res.ok) throw new Error("data/genres.json not found. Run: python prepare_data.py");
  state.genres = await res.json();
  const popular = ["hip-hop", "pop", "r-n-b", "rock", "edm", "country", "latin", "indie", "k-pop", "jazz"];
  const top = popular.filter((k) => state.genres.some((g) => g.key === k));
  const opt = (g) => `<option value="${esc(g.key)}">${esc(g.label)} (${g.count.toLocaleString()})</option>`;
  $("#genre").innerHTML =
    `<optgroup label="Popular">${top.map((k) => opt(state.genres.find((g) => g.key === k))).join("")}</optgroup>` +
    `<optgroup label="All genres">${state.genres.map(opt).join("")}</optgroup>`;
}

async function loadGenre(key) {
  if (state.cache.has(key)) return state.cache.get(key);
  const res = await fetch(`data/genres/${encodeURIComponent(key)}.json`);
  if (!res.ok) throw new Error(`Couldn't load the ${key} songs.`);
  const { fields, tracks } = await res.json();
  const songs = tracks.map((t) => Object.fromEntries(fields.map((f, i) => [f, t[i]])));
  state.cache.set(key, songs);
  return songs;
}

// ------------------------------------------------------------------ mood UI
function renderMoodChips() {
  $("#moods").innerHTML = Object.entries(MOODS).map(([k, m]) =>
    `<button type="button" class="chip" data-mood="${k}" aria-pressed="${state.moods.has(k)}">${m.emoji} ${m.label}</button>`).join("");
  $("#moods").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.mood;
    if (state.moods.has(k)) state.moods.delete(k);
    else { if (state.moods.size >= 3) state.moods.delete(state.moods.values().next().value); state.moods.add(k); }
    state.slidersTouched = false;
    renderMoodChips(); syncSliders();
  }));
}

function currentTarget() {
  const keys = state.moods.size ? [...state.moods] : ["chill"];
  const t = blend(keys);
  if (state.slidersTouched) {
    t.valence = +$("#valence").value / 100;
    t.energy = +$("#energy").value / 100;
  }
  if (document.querySelector('input[name="goal"]:checked').value === "lift") {
    // nudge toward brighter, slightly more energetic music than how you feel now
    t.valence = Math.min(0.92, t.valence + 0.3);
    t.energy = Math.min(0.9, t.energy + (t.energy < 0.4 ? 0.2 : 0.05));
  }
  return t;
}

function syncSliders() {
  if (!state.slidersTouched) {
    const t = blend(state.moods.size ? [...state.moods] : ["chill"]);
    $("#valence").value = Math.round(t.valence * 100);
    $("#energy").value = Math.round(t.energy * 100);
  }
  $("#v-val").textContent = $("#valence").value + "%";
  $("#v-en").textContent = $("#energy").value + "%";
  const p = +$("#popularity").value;
  $("#v-pop").textContent = p < 34 ? "deep cuts" : p < 67 ? "a mix" : "hits";
}

function readText() {
  const text = $("#feel").value;
  const found = detectMoods(text);
  if (found.length) {
    state.moods = new Set(found.slice(0, 3));
    state.slidersTouched = false;
    renderMoodChips(); syncSliders();
  }
  // "genre rap", "some country", "k-pop" … pick the genre out of the sentence too
  const low = ` ${text.toLowerCase()} `;
  const keys = state.genres.map((g) => g.key);
  let genre = Object.entries(GENRE_ALIASES).find(([w]) => low.includes(` ${w} `) || low.includes(` ${w},`));
  let key = genre ? genre[1] : keys.find((k) => low.includes(` ${k} `) || low.includes(` ${k.replace(/-/g, " ")} `));
  if (key && keys.includes(key)) $("#genre").value = key;
}

// ------------------------------------------------------------------ the algorithm
const WEIGHTS = { valence: 1.5, energy: 1.3, danceability: 0.6, acousticness: 0.5, instrumentalness: 0.7, tempo: 0.35 };

function distance(song, t, popPref) {
  let d = 0;
  for (const [f, w] of Object.entries(WEIGHTS)) {
    if (t[f] === null || t[f] === undefined) continue;
    const a = f === "tempo" ? song.tempo / 200 : song[f];
    const b = f === "tempo" ? t.tempo / 200 : t[f];
    d += w * (a - b) ** 2;
  }
  d += 0.6 * (song.popularity / 100 - popPref) ** 2;   // hits vs deep cuts
  return Math.sqrt(d);
}

function generate(songs, t, { size, clean, popPref, seed }) {
  const rand = rng(seed);
  const pool = songs
    .filter((s) => !(clean && s.explicit) && s.duration > 60 && s.duration < 600)
    .map((s) => ({ s, d: distance(s, t, popPref) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(size * 5, 60));

  // pick from the best-matching pool with some randomness, so "Shuffle" gives a fresh but still fitting list
  const picked = [], perArtist = new Map();
  const remaining = [...pool];
  while (picked.length < size && remaining.length) {
    const weights = remaining.map((_, i) => Math.exp(-i / (size * 0.9)));
    let r = rand() * weights.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= weights[i]) > 0) i++;
    const [{ s, d }] = remaining.splice(Math.min(i, remaining.length - 1), 1);
    const lead = s.artists.split(",")[0].trim().toLowerCase();
    if ((perArtist.get(lead) || 0) >= 2) continue;          // at most 2 songs per artist
    perArtist.set(lead, (perArtist.get(lead) || 0) + 1);
    picked.push({ ...s, match: Math.max(0, Math.round(100 - d * 110)) });
  }
  // gentle flow: order by energy so the playlist builds rather than jumps around
  return picked.sort((a, b) => a.energy - b.energy);
}

// ------------------------------------------------------------------ render
const pct = (v) => Math.round(v * 100) + "%";
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function title(genreLabel) {
  const names = [...state.moods].map((k) => MOODS[k].label);
  const mood = names.length ? names.join(" + ") : "Chill";
  const lift = document.querySelector('input[name="goal"]:checked').value === "lift";
  return `${lift ? "Lifting you out of " + mood.toLowerCase() : mood} · ${genreLabel}`;
}

function renderPlaylist(songs, t, genreKey, all) {
  const g = state.genres.find((x) => x.key === genreKey);
  const total = songs.reduce((a, s) => a + s.duration, 0);
  $("#title").textContent = title(g ? g.label : genreKey);
  $("#meta").textContent = `${songs.length} songs · ${Math.floor(total / 3600) ? Math.floor(total / 3600) + " hr " : ""}${Math.round((total % 3600) / 60)} min · target positivity ${pct(t.valence)}, energy ${pct(t.energy)}`;
  $("#list").innerHTML = songs.map((s) => `
    <li>
      <div class="song" title="${esc(s.name)}">${esc(s.name)}${s.explicit ? '<span class="e">E</span>' : ""}</div>
      <div class="artist">${esc(s.artists)}</div>
      <div class="why"><span>${s.match}% match</span><span>positivity ${pct(s.valence)}</span><span>energy ${pct(s.energy)}</span><span>${s.tempo} bpm</span><span>${mmss(s.duration)}</span></div>
      <a class="play" href="https://open.spotify.com/track/${encodeURIComponent(s.id)}" target="_blank" rel="noopener">▶ Spotify</a>
    </li>`).join("");
  renderChart(songs, t, all);
  $("#result").hidden = false;
}

function renderChart(picks, t, all) {
  const box = $("#chart"), W = 360, H = 300, P = { l: 34, r: 10, t: 10, b: 34 };
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const x = (v) => P.l + v * (W - P.l - P.r), y = (v) => H - P.b - v * (H - P.t - P.b);
  const sample = all.length > 900 ? all.filter((_, i) => i % Math.ceil(all.length / 900) === 0) : all;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of songs by positivity and energy">`;
  for (const v of [0, 0.5, 1]) {
    s += `<line x1="${x(0)}" x2="${x(1)}" y1="${y(v)}" y2="${y(v)}" stroke="${css("--line")}"/>`;
    s += `<line x1="${x(v)}" x2="${x(v)}" y1="${y(0)}" y2="${y(1)}" stroke="${css("--line")}"/>`;
    s += `<text x="${P.l - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="${css("--muted")}">${v * 100}</text>`;
    s += `<text x="${x(v)}" y="${H - P.b + 14}" font-size="10" text-anchor="middle" fill="${css("--muted")}">${v * 100}</text>`;
  }
  s += `<text x="${(x(0) + x(1)) / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="${css("--ink2")}">Positivity →</text>`;
  s += `<text transform="translate(11 ${(y(0) + y(1)) / 2}) rotate(-90)" font-size="11" text-anchor="middle" fill="${css("--ink2")}">Energy →</text>`;
  for (const q of [["sad / angry", 0.02, 0.96, "start"], ["happy / hype", 0.98, 0.96, "end"], ["sad / calm", 0.02, 0.04, "start"], ["happy / calm", 0.98, 0.04, "end"]])
    s += `<text x="${x(q[1])}" y="${y(q[2])}" font-size="10" text-anchor="${q[3]}" fill="${css("--muted")}" opacity=".8">${q[0]}</text>`;
  for (const p of sample) s += `<circle cx="${x(p.valence)}" cy="${y(p.energy)}" r="2.2" fill="${css("--dot")}"/>`;
  s += `<circle cx="${x(t.valence)}" cy="${y(t.energy)}" r="16" fill="none" stroke="${css("--ink")}" stroke-width="2" stroke-dasharray="3 3"/>`;
  picks.forEach((p, i) => {
    s += `<circle cx="${x(p.valence)}" cy="${y(p.energy)}" r="5" fill="${css("--accent")}" stroke="${css("--panel")}" stroke-width="2"/>`;
    s += `<circle class="hit" data-i="${i}" cx="${x(p.valence)}" cy="${y(p.energy)}" r="10" fill="transparent"/>`;
  });
  box.innerHTML = s + `</svg><div class="tip"></div>`;
  const tip = box.querySelector(".tip");
  box.querySelectorAll(".hit").forEach((c) => {
    c.addEventListener("mouseenter", (ev) => {
      const p = picks[+c.dataset.i], r = box.getBoundingClientRect();
      tip.textContent = `${p.name} · ${p.artists.split(",")[0]}`;
      tip.style.left = Math.min(ev.clientX - r.left + 10, r.width - 200) + "px";
      tip.style.top = ev.clientY - r.top - 30 + "px";
      tip.style.opacity = 1;
    });
    c.addEventListener("mouseleave", () => (tip.style.opacity = 0));
  });
}

// ------------------------------------------------------------------ actions
async function run({ reshuffle = false } = {}) {
  readText();
  const key = $("#genre").value;
  if (!key) return;
  if (reshuffle) state.seed = (state.seed * 7919 + 13) % 1e9;
  $("#go").disabled = true;
  $("#status").textContent = "Finding songs…";
  try {
    const all = await loadGenre(key);
    const t = currentTarget();
    const songs = generate(all, t, {
      size: +$("#size").value, clean: $("#clean").checked, popPref: +$("#popularity").value / 100, seed: state.seed,
    });
    state.last = { songs, t, key };
    renderPlaylist(songs, t, key, all);
    $("#status").textContent = songs.length ? "" : "No songs matched. Try turning off Clean only or picking another genre.";
    writeHash();
    if (!reshuffle) $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    $("#status").textContent = e.message;
  } finally {
    $("#go").disabled = false;
  }
}

function writeHash() {
  const p = new URLSearchParams({
    m: [...state.moods].join(","), g: $("#genre").value, n: $("#size").value, s: state.seed,
    pop: $("#popularity").value, goal: document.querySelector('input[name="goal"]:checked').value,
    c: $("#clean").checked ? 1 : 0,
    ...(state.slidersTouched ? { v: $("#valence").value, e: $("#energy").value } : {}),
  });
  history.replaceState(null, "", "#" + p);
}

function readHash() {
  if (!location.hash) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  state.moods = new Set((p.get("m") || "").split(",").filter((k) => MOODS[k]));
  if (p.get("g")) $("#genre").value = p.get("g");
  if (p.get("n")) $("#size").value = p.get("n");
  if (p.get("s")) state.seed = +p.get("s");
  if (p.get("pop")) $("#popularity").value = p.get("pop");
  if (p.get("goal")) document.querySelector(`input[name="goal"][value="${p.get("goal")}"]`).checked = true;
  $("#clean").checked = p.get("c") === "1";
  if (p.get("v")) { state.slidersTouched = true; $("#valence").value = p.get("v"); $("#energy").value = p.get("e"); }
  return !!p.get("g");
}

function asText() {
  return state.last.songs.map((s, i) => `${i + 1}. ${s.name} by ${s.artists}  https://open.spotify.com/track/${s.id}`).join("\n");
}

async function flash(btn, msg) {
  const old = btn.textContent; btn.textContent = msg; setTimeout(() => (btn.textContent = old), 1400);
}

// ------------------------------------------------------------------ wire up
$("#form").addEventListener("submit", (e) => { e.preventDefault(); run(); });
$("#again").addEventListener("click", () => run({ reshuffle: true }));
$("#feel").addEventListener("change", readText);
for (const id of ["valence", "energy"]) $("#" + id).addEventListener("input", () => { state.slidersTouched = true; syncSliders(); });
$("#popularity").addEventListener("input", syncSliders);
$("#copy").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(asText()); flash(e.target, "Copied!"); } catch { flash(e.target, "Copy blocked"); }
});
$("#share").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(location.href); flash(e.target, "Link copied!"); } catch { flash(e.target, "Copy blocked"); }
});
$("#csv").addEventListener("click", () => {
  const rows = [["#", "title", "artists", "spotify_url", "positivity", "energy", "tempo_bpm"],
    ...state.last.songs.map((s, i) => [i + 1, s.name, s.artists, `https://open.spotify.com/track/${s.id}`, s.valence, s.energy, s.tempo])];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "playlist.csv",
  });
  a.click(); URL.revokeObjectURL(a.href);
});

(async () => {
  renderMoodChips();
  try {
    await loadGenres();
    $("#genre").value = "hip-hop";
    const fromLink = readHash();
    renderMoodChips(); syncSliders();
    if (fromLink) run();
  } catch (e) {
    $("#status").textContent = e.message;
  }
})();
