"""
Prepare the song data for the Mood Playlist Generator.

Downloads the open "Spotify Tracks Dataset" (114k tracks, 125 genres, BSD
licence) and splits it into one small JSON file per genre so the web app
only loads the genre you pick.

    python prepare_data.py                  # download + build data/
    python prepare_data.py --csv dataset.csv

Output:
    data/genres.json          [{key, label, count}, ...]
    data/genres/<key>.json    {"fields": [...], "tracks": [[...], ...]}

Dataset: https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset
"""

from __future__ import annotations

import argparse
import csv
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

URL = "https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset/resolve/main/dataset.csv"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data"

FIELDS = ["id", "name", "artists", "popularity", "explicit",
          "valence", "energy", "danceability", "acousticness", "instrumentalness", "tempo", "duration"]

# nicer names for the dataset's genre keys
LABELS = {
    "hip-hop": "Hip-Hop / Rap", "r-n-b": "R&B", "edm": "EDM", "k-pop": "K-Pop", "j-pop": "J-Pop",
    "j-rock": "J-Rock", "j-idol": "J-Idol", "j-dance": "J-Dance", "mpb": "MPB", "idm": "IDM",
    "drum-and-bass": "Drum & Bass", "singer-songwriter": "Singer-Songwriter", "show-tunes": "Show Tunes",
    "hard-rock": "Hard Rock", "alt-rock": "Alt Rock", "death-metal": "Death Metal", "black-metal": "Black Metal",
    "heavy-metal": "Heavy Metal", "deep-house": "Deep House", "progressive-house": "Progressive House",
    "chicago-house": "Chicago House", "detroit-techno": "Detroit Techno", "minimal-techno": "Minimal Techno",
    "pop-film": "Pop (Film)", "power-pop": "Power Pop", "psych-rock": "Psych Rock", "punk-rock": "Punk Rock",
    "rock-n-roll": "Rock 'n' Roll", "trip-hop": "Trip-Hop", "world-music": "World Music",
}


def label(key: str) -> str:
    return LABELS.get(key, key.replace("-", " ").title())


def f2(v) -> float:
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, help="use a local copy of dataset.csv")
    args = ap.parse_args()

    path = args.csv
    if path is None:
        path = OUT / "raw" / "dataset.csv"
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            print(f"Downloading {URL} …")
            req = urllib.request.Request(URL, headers={"User-Agent": "mood-playlist-generator (student project)"})
            with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
                f.write(r.read())

    by_genre: dict[str, dict[tuple, list]] = defaultdict(dict)
    rows = 0
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            rows += 1
            genre = (r.get("track_genre") or "").strip()
            if not genre or not r.get("track_id") or not r.get("track_name"):
                continue
            artists = (r.get("artists") or "").replace(";", ", ")
            rec = [
                r["track_id"], r["track_name"].strip(), artists, int(float(r.get("popularity") or 0)),
                1 if str(r.get("explicit")).lower() == "true" else 0,
                f2(r.get("valence")), f2(r.get("energy")), f2(r.get("danceability")),
                f2(r.get("acousticness")), f2(r.get("instrumentalness")), round(float(r.get("tempo") or 0)),
                round(float(r.get("duration_ms") or 0) / 1000),
            ]
            # the same song often appears on several albums; keep the most popular copy
            key = (rec[1].lower(), rec[2].lower())
            old = by_genre[genre].get(key)
            if old is None or rec[3] > old[3]:
                by_genre[genre][key] = rec

    (OUT / "genres").mkdir(parents=True, exist_ok=True)
    index = []
    for genre, songs in sorted(by_genre.items()):
        tracks = sorted(songs.values(), key=lambda t: -t[3])
        (OUT / "genres" / f"{genre}.json").write_text(
            json.dumps({"fields": FIELDS, "tracks": tracks}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        index.append({"key": genre, "label": label(genre), "count": len(tracks)})
    (OUT / "genres.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    total = sum(g["count"] for g in index)
    print(f"Read {rows:,} rows → {total:,} unique songs in {len(index)} genres → {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
