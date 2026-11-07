# Invoice Catalogue (offline Android PWA)

Imports a CSV invoice/stock list, shows it as searchable product cards, lets you group products and export each group as its own PDF. Fully offline; no server, account or internet needed after the first load. Data is stored on the device in IndexedDB.

## Project structure
| File | Purpose |
|---|---|
| `index.html` | App shell |
| `app.js` | UI, screens, storage (IndexedDB), search/sort/filter, groups, export |
| `core.js` | CSV parser (delimiter detection, quotes, encodings), number formatting, built-in PDF writer. No dependencies |
| `style.css` | Styling, light/dark themes |
| `sw.js` | Service worker (offline caching) |
| `manifest.webmanifest`, `icons/` | Installability |
| `sample.csv` | Test dataset (comma-separated, quoted fields) |

## Installing on Android
A PWA must be served over **HTTPS** (or localhost) once so Chrome can install it. After that it runs offline.
1. Host the folder on any static HTTPS host (GitHub Pages, Netlify drop, Cloudflare Pages, your own web server). All are free options.
2. Open the URL in **Chrome on Android**, wait a few seconds for it to load fully.
3. Menu (⋮) → **Install app** / **Add to Home screen**.
4. Open it once while online, then it works in airplane mode.

Testing on a PC: `python3 -m http.server 8000` in this folder, then open http://localhost:8000.
Note: opening `index.html` directly from storage (file://) will not work because service workers and installation need http(s).

## Importing a CSV
Home → **Import CSV** → choose the file from Android storage (Downloads, Drive, etc.). Delimiter (comma, semicolon, tab, pipe), UTF-8/Windows-1252 text, quoted fields, padded headers and decimal commas (`3,99`) are handled automatically. Columns are whatever your file contains. Importing again asks before replacing; groups are kept and matched by the **first column** (e.g. Stock Code).

## Grouping and PDFs
1. **Products** tab: search, sort, Filter, Columns (show/hide).
2. Tap cards to select (tick appears). **All results** selects everything matching the current search.
3. **Add to group** → pick a group or create one. A product can be in many groups.
4. **Groups** tab: open a group to remove items, rename, delete.
5. **Export** tab: choose group, tick PDF columns, choose ordering, then **Save PDF**, **Open / Share** (any PDF app, WhatsApp, Drive, print service) or **Print**.

## Known limitations
- Android's web layer has no direct print API for generated PDFs. Use *Open / Share* → PDF viewer → Print.
- This is a PWA, not an APK. To get an APK, wrap the hosted URL with Bubblewrap/PWABuilder (free, uses the same code).
- Unicode characters outside Windows-1252 (e.g. emoji) print as `?` in PDFs.
- Data lives in the browser's storage for this app: use Settings → Export backup before clearing browser data or uninstalling.
