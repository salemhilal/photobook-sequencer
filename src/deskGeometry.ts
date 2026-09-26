/** Screen pixels per inch on the desk at zoom 1. */
export const DESK_PPI = 48;

/**
 * Converts between screen and desk coordinates. The Desk component registers the
 * real implementations when it mounts; these defaults stand in before that (and in tests).
 */
export const deskGeometry = {
  toDesk: (clientX: number, clientY: number): { x: number; y: number } => ({ x: clientX, y: clientY }),
  /** Visible desk area in desk inches. */
  visible: (): { x: number; y: number; w: number; h: number } => ({ x: 0, y: 0, w: 20, h: 12 }),
};
