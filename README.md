# Mood Playlist Generator 🎧

Tell it how you feel ("**happy, genre rap**", "tired after the gym", "heartbroken but want to dance") and it builds a
playlist from **114,000 songs**, matched on their actual audio characteristics.

**Live:** https://ryanstormrage.github.io/mood-playlist-generator/ (after GitHub Pages is turned on)

## How it works

Every song in the dataset has Spotify **audio features**, which are scores from 0 to 1:

| feature | what it measures |
|---|---|
| valence | musical positivity: cheerful and euphoric ↔ sad or angry |
| energy | intensity: loud, fast, busy ↔ calm |
| danceability | steady, danceable rhythm |
| acousticness | acoustic ↔ electronic |
| instrumentalness | no vocals ↔ vocals |
| tempo | beats per minute |

1. **Mood → target.** Each of the 13 moods is a target point in that feature space (see `moods.js`). When you type
   a sentence, it finds the mood words in it and **blends** them, so "tired but happy" averages *Sleepy* and *Happy*.
   It also picks up a genre in the sentence: "rap" maps to the dataset's `hip-hop` genre.
2. **Score.** Each song in the genre gets a weighted distance to the target. Positivity and energy count most,
   tempo least. A popularity term handles the *Deep cuts ↔ Hits* slider.
3. **Pick.** It takes the closest ~100 songs and samples from them with a seeded random draw weighted toward the
   best matches. That lets **Shuffle** give a fresh list that still fits. No more than 2 songs per artist.
4. **Order.** Songs are sorted by energy so the playlist builds instead of jumping around.
5. **Lift my mood** mode moves the target toward brighter, slightly more energetic music than how you feel.

A scatter chart shows where the playlist sits among every song in the genre. The page address stores the settings
and random seed, so a shared link rebuilds the same playlist.

**Stack:** HTML, CSS, vanilla JavaScript (ES modules, no framework), Python for data prep, GitHub Actions + Pages

## Run it locally

```bash
python prepare_data.py          # downloads the dataset (~20 MB) and writes data/genres/*.json
python -m http.server 8000      # then open http://localhost:8000
```

(The page has to be served over http, because browsers block `fetch()` and module imports from `file://`.)

## Data

[Spotify Tracks Dataset](https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset) by Maharshi Pandya,
BSD licence: 114k tracks across 125 genres, collected with the Spotify Web API. `prepare_data.py` removes duplicate
copies of the same song (keeping the most popular one) and splits the data by genre, so the page only downloads
about 100 KB for the genre you pick.

## Ideas for next steps

- Sign in with Spotify and save the playlist straight to your account (Spotify Web API, `playlist-modify` scope)
- Combine two genres
- Let users rate songs 👍/👎 to tune the mood targets
