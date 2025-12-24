// SVG tree line components with fixed dimensions

export const TREE_W = 24; // Width of each tree segment (wider for better indentation)
export const TREE_H = 26; // Fixed height matching row height
export const MID_X = TREE_W / 2; // Center point for vertical lines
export const MID_Y = TREE_H / 2;
export const STROKE = 2; // Line thickness
// Expand/collapse indicator SVGs - same style as tree lines
export const ICON_SIZE = Math.min(TREE_W, TREE_H);
export const ICON_MID = ICON_SIZE / 2;
export const BOX_SIZE = ICON_SIZE - 2; // Size of the box
export const BOX_OFFSET = (ICON_SIZE - BOX_SIZE) / 2; // Center the box
export const BOX_Y = MID_Y - BOX_SIZE / 2; // Vertical center
