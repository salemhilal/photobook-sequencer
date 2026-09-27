# Photobook Sequencer

A tool for prototyping photo sequences.

**Try it:** https://photobook-sequencer.netlify.app

![Photos on the desk, with the book's spreads in the sidebar](docs/screenshot.jpg)

## Run locally

```bash
nvm use        # Node 24 (needs ≥ 20.19)
npm install
npm run dev    # → http://localhost:5173
```

## Test

```bash
npm test             # run once
npm run test:watch   # re-run on save
```

## Build

```bash
npm run build  # → dist/
```

Netlify runs `npm test && npm run build` for production, pull-request previews, and branch deploys (see `netlify.toml`).

## Shortcuts

| Action              | Mac     | Windows         |
| ------------------- | ------- | --------------- |
| Add photos          | ⌘I      | Ctrl+I          |
| Preview             | ⌘P      | Ctrl+P          |
| Settings            | ⌘,      | Ctrl+,          |
| Import project      | ⌘O      | Ctrl+O          |
| Export              | ⌘S      | Ctrl+S          |
| Save PDF            | ⇧⌘P     | Ctrl+Shift+P    |
| Show/hide spreads   | ⌘B      | Ctrl+B          |
| Copy / paste photos | ⌘C / ⌘V | Ctrl+C / Ctrl+V |
| Duplicate photos    | ⌘D      | Ctrl+D          |
| Quick Look          | Space   | Space           |
| Undo                | ⌘Z      | Ctrl+Z          |
| Redo                | ⇧⌘Z     | Ctrl+Y          |

Hold ⌘ / Ctrl to see them on screen.

Right-click the desk to tidy photos into a grid or change the desk color.

File → Take the tour walks through the app with a few sample photos (it also runs on your first visit). Your own project is set aside while it runs and comes back when it ends.

## Mac app

The same app also builds as a native Mac app with [Tauri](https://tauri.app): a menu
bar, Save dialogs, and projects as documents. `.photo-sequence` files open in it with a
double-click, File → Save keeps the project in its file, and the window's title shows
when there are unsaved changes.

```bash
npm run app         # run it, reloading on changes (needs Rust: https://rustup.rs)
npm run app:build   # → src-tauri/target/release/bundle/macos/
```

The website and the app share all their code; `__NATIVE_APP__` (set by `vite --mode app`)
switches the few places they differ, and the app-only code lives in `src/native.ts`,
`src/nativeMenu.ts` and `src/document.ts`.

## Offline and install

The deployed app works offline once it has loaded: a service worker keeps a copy of
the whole app, and your work stays in the browser. To use it like a desktop app,
install it from the browser (Chrome/Edge: install icon in the address bar; Safari:
File → Add to Dock). Installing also makes the browser less likely to clear stored
work; Settings → Storage shows whether it's protected. Export to keep a backup.

New versions download in the background; the app shows "A new version is available"
and switches when you reload.

## Project files

Export saves a `.photo-sequence` file (a ZIP inside) you can import anywhere:

```
photo-book-2026-09-26.photo-sequence
├── project.json   # layout + settings
├── images/        # your original files
└── thumbs/        # display copies
```

Drop a project on the desk to open it. Plain `.zip` files with the same contents work too.

## InDesign

File → Export for InDesign saves a ZIP with an `.idml` file and a `Links/` folder of
the placed photos. Unzip it and open the `.idml` in InDesign (or Affinity Publisher):
you get a facing-pages document at the book's size, the largest border guide as
margins, the other guides as ruler guides, and each photo in a frame, linked to its
original. If InDesign reports missing links, relink them to the `Links` folder.
