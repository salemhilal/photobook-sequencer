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

| Action       | Mac   | Windows |
| ------------ | ----- | ------- |
| Add photos   | ⌘O    | Ctrl+O  |
| Preview      | ⌘P    | Ctrl+P  |
| Settings     | ⌘,    | Ctrl+,  |
| Import       | ⌘I    | Ctrl+I  |
| Export       | ⌘S    | Ctrl+S  |
| Save PDF     | ⇧⌘P   | Ctrl+Shift+P |
| Show/hide spreads | ⌘B | Ctrl+B |
| Undo         | ⌘Z    | Ctrl+Z  |
| Redo         | ⇧⌘Z   | Ctrl+Y  |

Hold ⌘ / Ctrl to see them on screen.

Right-click the desk to tidy photos into a grid or change the desk color.

## Project files

Export saves a `.zip` you can import anywhere:

```
photo-book-2026-09-26.zip
├── project.json   # layout + settings
├── images/        # your original files
└── thumbs/        # display copies
```

Drop a project `.zip` on the desk to open it.
