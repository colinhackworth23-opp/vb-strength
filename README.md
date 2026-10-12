# VB Strength

Beach volleyball strength program, as a home-screen web app. Live at
`https://colinhackworth23-opp.github.io/vb-strength/vb-strength-app.html`.

## Files

| File | What it is |
|---|---|
| `vb-strength-app.html` | The page (the home-screen URL — keep this name) |
| `app.css` | Styles |
| `program.js` | Built-in program: weeks, percentages, exercise groups. Used to fill the sheet's Program tab the first time |
| `sync.js` | Google Sheets reads (kept on the phone) and the save outbox |
| `app.js` | Everything else |
| `sw.js` | Service worker: opens from the phone's copy when signal is bad |
| `apps-script/Code.gs` | The Google Apps Script behind the sheet (copy of what's deployed) |

After changing any of the app files, bump the `?v=` number on the three `<script>` tags and the stylesheet in `vb-strength-app.html` so phones pick up the new versions together.

## Google Sheet tabs

- **Sets** — the training log, one row per set (with a **Block** column saying which training block it belongs to). Created automatically from Log. Warm-ups, primers and cool-downs are checked off in the app but never logged.
- **Feedback** — one row per exercise per session: Easy / Right / Grind and an optional note, tapped at the end of each exercise.
- **Program** — exercises, cues and targets by week (`W1`…`W10`, sets separated by ` / `). Edit a cell to change the plan; the app picks it up next time it opens.
- **Log** — the old one-row-per-exercise log, kept as a backup. Nothing writes to it.
- **VB Sessions**, **Check-ins**, **Maxes** — unchanged.

## Deploying the Apps Script

Extensions → Apps Script → paste `apps-script/Code.gs` → Save → Deploy → **Manage deployments** → pencil → Version: **New version** → Deploy.
Never "New deployment": it creates a new web address and the app stops reaching the sheet.
