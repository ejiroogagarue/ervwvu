/*****************************************************************
 *  Layra – Invisible Layout Guide  (Phase‑1 / Step‑1)
 *  - One‑file setup
 *  - Listens for selection of exactly ONE Frame
 *  - Clears previous Layra overlays
 *****************************************************************/

// ────────────────────────────────────────────────────────────────
// Helper: remove any node we previously tagged as a Layra panel

function clearLayraArtifacts() {
  figma.currentPage
    .findAll((n) => n.getPluginData("layra") === "1")
    .forEach((n) => n.remove());
}


// Utility: central colour palette (RGB 0-1)
const COLORS = {
  green: {r: 0, g: 0.80, b: 0.10},
  yellow: {r: 1, g: 0.78, b: 0},
  blue: {r: 0.18, g: 0.55, b: 1},
} as const 

type MarkColor = keyof typeof COLORS;

////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////
type LayoutType = "flex" | "grid" | "stack";

interface LayoutAnalysis {
  type: LayoutType;
  gap?: number; // Only for flex/grid
  direction?: "row" | "column"; // Only for flexbox
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  border?: { width?: number; radius?: number };
}

////////////////////////////////////////////////////////
// Type Guards (SAFETY FIRST!)
////////////////////////////////////////////////////////

function isFrameOrGroup(node: SceneNode): node is FrameNode | GroupNode {
  return ["FRAME", "GROUP"].includes(node.type);
}

function hasLayoutMode(node: SceneNode): node is FrameNode {
  return node.type === "FRAME" && "layoutMode" in node;
}

////////////////////////////////////////////////////////
//Grid Detection
////////////////////////////////////////////////////////

function isGrid(node: SceneNode): node is FrameNode | GroupNode {
  if (!isFrameOrGroup(node) || node.children.length < 4) return false;

  // Check for uniform grid structure
  const result = analyzeGridStructure(node);
  return result.isGrid;
}

// Most complex need to review*****
function analyzeGridStructure(node: FrameNode | GroupNode): {
  isGrid: boolean;
  gap: number; // Always returns a number
} {
  const children = node.children;

  // Early exit for invalid grids
  if (children.length < 4) return { isGrid: false, gap: 0 };

  // Group children into rows (5px Y tolerance)
  const rows = new Map<number, SceneNode[]>();
  children.forEach((child) => {
    const rowKey = Math.round(child.y / 5) * 5;
    rows.set(rowKey, [...(rows.get(rowKey) || []), child]);
  });

  // validate grid structure
  const rowCount = rows.size;
  if (rowCount < 2) return { isGrid: false, gap: 0 };

  const columnCounts = Array.from(rows.values()).map((row) => row.length);
  const firstColCount = columnCounts[0];
  const isUniform = columnCounts.every((count) => count === firstColCount);
  if (!isUniform) return { isGrid: false, gap: 0 };

  // Calculate gaps safely
  let totalGap = 0;
  let gapCount = 0;

  // Horizontal gaps
  Array.from(rows.values()).forEach((row) => {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      totalGap += Math.max(0, row[i].x - (row[i - 1].x + row[i - 1].width));
      gapCount++;
    }
  });

  // Vertical gaps
  const sortedRows = Array.from(rows.keys()).sort((a, b) => a - b);
  for (let i = 1; i < sortedRows.length; i++) {
    const row1 = rows.get(sortedRows[i - 1])![0];
    const row2 = rows.get(sortedRows[i])![0];
    totalGap += Math.max(0, row2.y - (row1.y + row1.height));
    gapCount++;
  }

  return {
    isGrid: true,
    gap: gapCount > 0 ? Math.round(totalGap / gapCount) : 0,
  };
}

// Now this is SFAE because isGrid() guarantees ChildrenMixin
function guessGapBetweenChildren(node: FrameNode | GroupNode): number {
  return analyzeGridStructure(node).gap; // Simpler interface
}

////////////////////////////////////////////////////////
// Main Detector (FULLY SAFE)
////////////////////////////////////////////////////////
/**
 *
 * Idenitifes how selected elements are arranged:
 * -> Flexbox: Elements arranged horizontally or vertically using Figma's Auto Layout.
 * -> CSS Grid: ELements arranged in evenly spaced rows and columns.
 */
function sniffLayout(node: SceneNode): LayoutAnalysis {
  const base: LayoutAnalysis = { type: "stack" };
  // Only frames/groups can be flex/grid
  if (!isFrameOrGroup(node)) {
    return base;
  }

  // Flex detection (Figma auto-layout)
  if (hasLayoutMode(node)&& node.layoutMode !== "NONE") {
    // Special case: Auto-layout thats actually a grid
    const gridCheck = analyzeGridStructure(node);
    base.type = gridCheck.isGrid ? "grid" : "flex";
    if (base.type === "flex") {
      base.direction = node.layoutMode === "HORIZONTAL" ? "row" : "column";
      base.gap = node.itemSpacing || 0;
    } else {
      base.gap = gridCheck.gap;
    }
  } else if (isGrid(node)) {
    base.type = "grid";
    base.gap = guessGapBetweenChildren(node);
  }

  return base;
}

////////////////////////////////////////////////////////
// Annotate Block
////////////////////////////////////////////////////////
async function annotateBlock(
  node: SceneNode,
  color: MarkColor,
  label: string
) {
 const [absX, absY] = [node.absoluteTransform[0][2], node.absoluteTransform[1][2]];

 // -- Outline frame ---------------------------------------------------------
 const outline = figma.createFrame();
 outline.setPluginData("layra", "1");
 outline.name = `Layra: ${label}`;
 outline.x = absX;
 outline.y = absY;
 outline.resize(node.width, node.height);
 outline.fills = [{
  type: "SOLID",
  color: COLORS[color],
  opacity: 0.15,
 }];
 outline.strokes = [{
  type: "SOLID",
  color: COLORS[color],
 }];
 outline.strokeWeight = 2;
 outline.locked = true;  // avoid accidental
 figma.currentPage.appendChild(outline);

 //-- Label text -------------------------------------------------------------
 await figma.loadFontAsync({ family: "Inter", style: "Regular"});
 const tag = figma.createText();
 tag.setPluginData("layra", "1");
 tag.characters = label;
 tag.fontSize = 12;
 tag.x = absX + 4;
 tag.y = absY - 16;
 tag.fills = [{ type: "SOLID", color: {r: 0, g: 0, b: 0}}];
 tag.locked = true;
 figma.currentPage.appendChild(tag);

}

// ────────────────────────────────────────────────────────────────
// Main selection listener

figma.on("selectionchange", async () => {
  clearLayraArtifacts();

  const sel = figma.currentPage.selection;
  if (sel.length !== 1 || sel[0].type !== "FRAME") return;

  const frame = sel[0] as FrameNode;

  // Iterate over top-level children
  frame.children.forEach((child) => {
    // Skip invisible layers
    if (!child.visible) return;

    // If child is itself a frame with Auto Layout -> green
    if (child.type === "FRAME" && child.layoutMode !== "NONE") {
      annotateBlock(child, "green", "Auto Layout ✓");
      return;
    }

    // For everything else, run sniffLayput to see if it's a clean stack
    const layout = sniffLayout(child);
    const looksStackable =
      layout.type === "stack" &&
      isFrameOrGroup(child) &&
      child.children.length > 1;

    if (layout.type === "grid") {
      annotateBlock(child, "blue", "Grid ✓");
      return;
    }

    if (looksStackable) {
      annotateBlock(child, "yellow", "Try Auto Layout");
    }
  });
});

// ────────────────────────────────────────────────────────────────
// TEST AnnotateBlock
// ────────────────────────────────────────────────────────────────

// async function testAnnotation() {
//   const rect = figma.createRectangle();
//   rect.resize(100, 100);
//   rect.x = 500;
//   rect.y = 500;
//   figma.currentPage.appendChild(rect);

//   await annotateBlock(rect, "green", "Test Working!");
// }

// // testAnnotation();
