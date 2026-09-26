# Photo Sequencer

Lay out photos on book spreads, in inches.

**Try it:** https://photobook-sequencer.netlify.app

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
| Add photos          | ⌘O      | Ctrl+O          |
| Preview             | ⌘P      | Ctrl+P          |
| Settings            | ⌘,      | Ctrl+,          |
| Import              | ⌘I      | Ctrl+I          |
| Export              | ⌘S      | Ctrl+S          |
| Save PDF            | ⇧⌘P     | Ctrl+Shift+P    |
| Show/hide spreads   | ⌘B      | Ctrl+B          |
| Copy / paste photos | ⌘C / ⌘V | Ctrl+C / Ctrl+V |
| Duplicate photos    | ⌘D      | Ctrl+D          |
| Undo                | ⌘Z      | Ctrl+Z          |
| Redo                | ⇧⌘Z     | Ctrl+Y          |

Hold ⌘ / Ctrl to see them on screen.

Right-click the desk to tidy photos into a grid or change the desk color.

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
