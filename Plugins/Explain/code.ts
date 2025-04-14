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
      const { html, css } = BuilderRobot.generateCode(node);
      console.log("Generated HTML:\n", html); // Debug 4
      console.log("Generated CSS:\n", css);
      figma.ui.postMessage({
        type: "CODE_GENERATED",
        payload: { html, css },
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
// 2.) Main Detector (FULLY SAFE)
////////////////////////////////////////////////////////
/**
 *
 * Idneitifes how selected elements are arranged:
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
  if (hasLayoutMode(node)) {
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

  // Add box model properties (only for container nodes)
  if (isFrameOrGroup(node)) {
    return {
      ...base,
      ...BuilderRobot.getBoxModelProperties(node, base.type),
    };
  }
  return base;
}

////////////////////////////////////////////////////////
// Code Generator Core
////////////////////////////////////////////////////////

class BuilderRobot {
  static generateCode(node: FrameNode | GroupNode): {
    html: string;
    css: string;
  } {
    // <----- Code Entry Point ----->
    // Creates a map to track class names (to avoid duplicates)
    const seenNames = new Map<string, number>();
    // Generates the HTML structure and CSS rules
    const html = this.generateHTML(node, 0, "", 0, seenNames);
    const css = this.generateFlatCSS(node, "", seenNames); // Share the same map
    return { html, css };
  }

  /**
 * Builds the nested <div>s
 *  EXAMPLE 
 * <------------------------------------------>
 * <div class="product-section">
    <div class="product-card">
     <div class="product-image">Image</div>
     <div class="product-title">Title</div>
   </div>
  </div>
 * <------------------------------------------->

  FUNCTION SIGNATURE 
  ---> "node": "The current Figma Layer".
  ---> "depth": How deep it is in the layer tree (for indentation)
  ---> "parentName": used for generating scoped class names.
  ---> "siblingIndex": tracks position among siblings (for uniqueness).
  ---> "seenNames": a map that tracks how many times a class name has been used.
 */
  private static generateHTML(
    node: SceneNode,
    depth: number = 0,
    parentName: string = "",
    siblingIndex: number = 0,
    seenNames: Map<string, number>
  ): string {
    // Adds space to the start of the line for readability in final HTML
    const indent = "  ".repeat(depth);

    /**
     * Build a unique class anem for the current node using:
     * ---> Its own name
     * ---> its parent name (to scope it),
     * --> its index (to handle duplicates)
     * --> Its type (e.g., "frame", "group").
     * keeps HTML classes clean and predictable.
     */
    const className = this.getUniqueClassName(
      node.name,
      parentName,
      siblingIndex,
      node.type.toLowerCase()
    );

    // If the node doesn't have children return a single div with the calss and name inside it. No nesting needed
    if (!isFrameOrGroup(node)) {
      return `${indent}<div class="${className}">${node.name}</div>`;
    }

    /**
     * Filters out any invisible children, only include visible layers in the final output.
     * FOR EACH CHILD:
     * Get its name or make a fallback e.g. (unnamed-text, unnamed-rectangle, etc.)
     * Count how many times we've seen this name already.
     * Update the seenNames map to track how many duplicates we've handled so far
     */

    const childrenHTML = node.children
      .filter((child) => child.visible)
      .map((child, index) => {
        const childBaseName =
          child.name || `unnamed-${child.type.toLowerCase()}`;
        const count = (seenNames.get(childBaseName) || 0) + 1;
        seenNames.set(childBaseName, count);

        // This ensures each child gets a unique class name
        // Also recursively calls "generateHTML()"
        return this.generateHTML(
          child,
          depth + 1,
          node.name,
          count - 1,
          new Map()
        );
      })
      .join("\n"); // joins them with newlines so it formats nicely in final output

    return `${indent}<div class="${className}">\n${childrenHTML}\n${indent}</div>`;
  }

  /**
   * This function creates a unique and readable class anme for an HTML element based on:
   * -> The node's name,
   * -> Its parent's name (for context),
   * -> Its position in the sibling list,
   * -> Its type (like frame, group, etc.).
   * It helps avoid duplicate class anmes and makes the generated HTML clear and structured
   */
  private static getUniqueClassName(
    name: string,
    parentName: string = "",
    index: number = 0,
    elementType: string = ""
  ): string {
    // Get the base class name
    // If the node has a name -> sanitize it e.g. "Hero Section" -> hero-section
    // If no name -> generate on like parent-unnamed-frame-1
    // It ensures every element has a valid base name.
    const baseName = name
      ? this.sanitizeClassName(name)
      : this.generateDefaultName(parentName, index, elementType);

    // Add the parent name as a prefix
    // This helps namespace class names, especially when layers have similiar names in different groups
    const parentPrefix = parentName
      ? `${this.sanitizeClassName(parentName)}-`
      : "";

    // Only add suffix for duplicates (index > 0)
    const suffix = index > 0 ? `-${index + 1}` : "";

    // Final class name
    return `${parentPrefix}${baseName}${suffix}`;
  }

  /** This function creates CSS rules for a fimga node (like a Frame or Group) based on how its laid out  */

  private static generateFlatCSS(
    node: SceneNode,
    parentName: string = "",
    seenNames: Map<string, number> = new Map()
  ): string {
    // Empty String
    let css = "";
    /**
     * Generate a unique class name for this node
     * -> Use its name
     * -> Include its parent name for context
     * -> Use seenNames to avoid duplicate class names.
     */
    const className = this.getUniqueClassName(
      node.name || `unnamed-${node.type.toLowerCase()}`,
      parentName,
      seenNames.get(node.name || node.type) || 0
    );

    // Detect Layput
    const layout = sniffLayout(node);

    // Generate CSS for current node
    css += `.${className} {\n ${this.getLayoutRules(layout)}\n}\n`;

    // Generate margin rules for stack children
    if (layout.type === "stack" && isFrameOrGroup(node)) {
      css += `.${className} > * {\n margin-bottom: ${layout.gap || 16}px;\n}\n`;
      css += `.${className} > *:last-child {\n margin-bottom: 0;\n}\n`;
    }

    // Recursively generate CSS for children
    if (isFrameOrGroup(node)) {
      const childCounts = new Map<string, number>();
      node.children.forEach((child) => {
        const childBaseName =
          child.name || `unnamed-${child.type.toLowerCase()}`;
        const count = (childCounts.get(childBaseName) || 0) + 1;
        childCounts.set(childBaseName, count);
        css += this.generateFlatCSS(child, node.name, childCounts);
      });
    }

    return css;
  }

  // Layout rules based on layout pattern
  private static getLayoutRules(layout: LayoutAnalysis): string {
    let rules = `display: ${this.getDisplayValue(layout)};`;

    // Flex/Grid specific
    if (layout.gap) rules += `gap: ${layout.gap}px;`;
    if (layout.direction) rules += `flex-direction: ${layout.direction};`;

    // Box model properties
    if (layout.padding) {
      rules += ` padding: ${Object.values(layout.padding).join("px ")}px;`;
    }
    if (layout.margin) {
      rules += ` margin: ${Object.values(layout.margin).join("px ")}px;`;
    }
    if (layout.border) {
      rules += ` border: ${layout.border.width}px solid;`;
      if (layout.border.radius)
        rules += ` border-radius: ${layout.border.radius}px;`;
    }

    return rules;
  }

  private static getDisplayValue(layout: LayoutAnalysis): string {
    return {
      flex: "flex",
      grid: "grid",
      stack: "block",
    }[layout.type];
  }

  // This function cleans and standardizes any text into a CSS-safe, hyphenated class name. It strips out symbols, spaces, and uppercase letters ,
  // ensuring you don’t end up with broken or unreadable HTML.
  private static sanitizeClassName(name: string): string {
    return (
      name
        .toLowerCase() // Converts name to lowercase
        .replace(/\s+/g, "-") // Replaces spaces with hyphens
        .replace(/[^a-z0-9-]/g, "") // Removes everything except lowercase letters, numbers and hyphens
        .replace(/-+/g, "-") // it there are multiple dashes in a row, collapse them into one
        .replace(/^-|-$/g, "") || "untitled" // Removes hyphens from the start or end of the name
    );
  }

  // Generates default name for unanamed layer
  private static generateDefaultName(
    parentName: string,
    index: number,
    elementType: string
  ): string {
    const parentPart = parentName
      ? `${this.sanitizeClassName(parentName)}-`
      : "";
    return `${parentPart}unnamed-${elementType || "element"}-${index + 1}`;
  }

  ////////////////////////////////////////////////////////
  // Box Model Property Extractors
  ////////////////////////////////////////////////////////

  public static getBoxModelProperties(
    node: FrameNode | GroupNode,
    layoutType: LayoutType
  ): Partial<LayoutAnalysis> {
    return {
      padding: BuilderRobot.getPadding(node),
      margin: BuilderRobot.getMargin(node, layoutType),
      border: BuilderRobot.getBorder(node),
    };
  }

  private static getPadding(node: FrameNode | GroupNode) {
    if (!("paddingLeft" in node)) return undefined;
    return {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
  }

  private static getMargin(
    node: FrameNode | GroupNode,
    layoutType: LayoutType
  ) {
    // Only extract margins relevant to the layout type
    switch (layoutType) {
      case "flex":
        // Only FrameNode has constraints, so skip for GroupNode
        if (node.type === "FRAME" && node.constraints?.horizontal === "MIN") {
          return { left: Math.round(node.x) };
        }
        return undefined;
      case "stack":
        return { bottom: Math.round(node.y) };
      default:
        return undefined; // Grid ignores margins
    }
  }

  private static getBorder(
    node: FrameNode | GroupNode
  ): LayoutAnalysis["border"] {
    // Only FrameNodes can have borders 
    if(node.type !== "FRAME") return undefined;

    // Type assertion - we know it's a frameNode at this point 
    const frame = node as FrameNode;

    // Handle stroke width safely 
    let strokeWidth: number | undefined;
    try{
      strokeWidth = Number(frame.strokeWeight) || undefined;
    } catch {
      strokeWidth = undefined;
    }

    if(!strokeWidth) return undefined;

    // Handle corner radius - simplest possible approach 
    let cornerRadius: number | undefined;

    // First try unified cornerRadius
    if('cornerRadius' in frame) {
      try {
        cornerRadius = Number(frame.cornerRadius) || undefined;
      } catch {
        cornerRadius = undefined;
      }
    }

    // If no unified radius, check individual corners 
    if(!cornerRadius) {
      const radii: number[] = [];

      // Safely check each corner 
      ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(prop => {
        if(prop in frame) {
          try {
            const value = Number(frame[prop as keyof FrameNode]);
            if(value) radii.push(value);
          } catch {}
        }
      });

      if(radii.length) cornerRadius = Math.max(...radii);
    }

    return {
     width: strokeWidth,
     radius: cornerRadius
    };
    
  }


}
