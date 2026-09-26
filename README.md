# Photo Sequencer

A browser tool for mocking up photo book sequences. Photos sit in a loose pile on a desk; drag them onto page spreads in the sidebar, then open a spread to fine-tune layout with snapping guides. All measurements are in inches.

## Run

```bash
npm install
npm run dev
```

Work is saved automatically in the browser (IndexedDB).

## Controls

- **Desk:** scroll to pan, pinch or ⌘-scroll to zoom, Space-drag to pan. Drag on empty space to select; Shift/⌘-click to add. Drag corners to resize (Shift for free aspect). Delete removes selected photos from the project.
- **Sidebar:** drop photos on a page to place them (centered, fit to the largest border guide). Hover between spreads to add one; drag ⠿ to reorder; × deletes a spread and returns its photos to the desk. First and last pages are fixed.
- **Spread editor:** click a spread. Photos snap to page edges, the gutter, center lines, and border guides (Alt disables). Arrow keys nudge 1/16" (Shift: 1/2"). Drag photos to or from the strip at the bottom.
- **Everywhere:** ⌘Z / ⇧⌘Z undo and redo.
