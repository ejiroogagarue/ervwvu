////////////////////////////////////////////////////////
// High-Level System Overview
////////////////////////////////////////////////////////
/**
 * The current plugin verion performs two main roles 
 * 1.) Layout Detection (sniffer)
 * -> Checks a selected Figma element, identifies its layout patterm
 * -> (Flexbox, Grid or Stack) and summarizes it
 * 2.) HTML Gemeration (BuilderRobot)
 * -> Turns the identified layout strucutre into clean HTML code.
 */
figma.showUI(__html__, { width: 300, height: 200 });


////////////////////////////////////////////////////////
// 1.) Listen For User Selection 
////////////////////////////////////////////////////////
/**
 * 1.) It checks if there's a selected node.
 * 2.) Analyzes the selected node's layout (flex, grid, stack),
 * 3.) Generates HTML code if the selection is a Frame or Group.
 * 4.) Send the generated HTML to the plugin UI for the user to view and copy.
 */
figma.on("selectionchange", () => {
  if (figma.currentPage.selection.length > 0) {
    const node = figma.currentPage.selection[0];
    console.log("Selected node:", node.name, node.type); // Debug 2

    const layout = sniffLayout(node);
    console.log("Layout analysis:", layout); // Debug 3
    if (isFrameOrGroup(node)) {
      const html = BuilderRobot.generateHTML(node);
      console.log("Generated HTML:\n", html); // Debug 4
      figma.ui.postMessage({
        type: "HTML_GENERATED",
        payload: {html},
      });
    }
  }
});

////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////
type LayoutType = "flex" | "grid" | "stack";

interface LayoutAnalysis {
  type: LayoutType;
  gap?: number; // Only for flex/grid
  direction?: "row" | "column"; // Only for flexbox
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
// 2.) Main Detector (FULLY SAFE)
////////////////////////////////////////////////////////
/**
 * 
 * Idneitifes how selected elements are arranged: 
 * -> Flexbox: Elements arranged horizontally or vertically using Figma's Auto Layout.
 * -> CSS Grid: ELements arranged in evenly spaced rows and columns.
 */
function sniffLayout(node: SceneNode): LayoutAnalysis {
  // Only frames/groups can be flex/grid
  if (!isFrameOrGroup(node)) {
    return { type: "stack" };
  }

  // Flex detection (Figma auto-layout)
  if (hasLayoutMode(node)) {
    // Special case: Auto-layout thats actually a grid
    const gridCheck = analyzeGridStructure(node);
    if (gridCheck.isGrid) {
      return {
        type: "grid",
        gap: gridCheck.gap, // Use direct gap value
      };
    }

    return {
      type: "flex",
      direction: node.layoutMode === "HORIZONTAL" ? "row" : "column",
      gap: node.itemSpacing || 0,
    };
  }

  // Grid detection
  if (isGrid(node)) {
    return {
      type: "grid",
      gap: guessGapBetweenChildren(node),
    };
  }

  // Default to stack
  return { type: "stack" };
}

////////////////////////////////////////////////////////
// Code Generator Core
////////////////////////////////////////////////////////

class BuilderRobot {
  static generateHTML(node: FrameNode | GroupNode): string {
    return this.generateNodeTree(node);
  }

  private static generateNodeTree(node: SceneNode, depth: number = 0): string {
    const indent = "  ".repeat(depth);
    const className = this.sanitizeClassName(node.name);

    // Base case: Non-container elements
    if (!isFrameOrGroup(node)) {
      return `${indent}<div class="${className}">${node.name}</div>`;
    }

    // Recursive case: Process all visible children
    const childrenHTML = node.children
      .filter((child) => child.visible)
      .map((child) => this.generateNodeTree(child, depth + 1))
      .join("\n");

    return `${indent}<div class="${className}">\n${childrenHTML}\n${indent}</div>`;
  }

  private static sanitizeClassName(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "untitled"
    );
  }
}
