/*****************************************************************
 *  Layra – Invisible Layout Guide  (Phase‑1 / Step‑1)
 *  - One‑file setup
 *  - Listens for selection of exactly ONE Frame
 *  - Clears previous Layra overlays
 *****************************************************************/

// ────────────────────────────────────────────────────────────────
// Launch Sidebar on Selection
figma.showUI(__html__, { width: 280, height: 500, themeColors: true });

// Helper: remove any node we previously tagged as a Layra panel
/** --> This functions removes amy extra visual elements
 * that Layra plugin added to the file  */
function clearLayraArtifacts() {
  // 1.) It finds all node (layers/frames) that have a special tag
  // 2.) this ensures that every time layra runs we never get duplicate or left over overlays.
  figma.currentPage
    .findAll((n) => n.getPluginData("layra") === "1")
    .forEach((n) => n.remove());
}

// Helper: Layer-order mismatch (orange alert)
function visualOrderMismatch(parent: FrameNode | GroupNode) {
  const kids = parent.children.filter((c) => c.visible);
  const visual = [...kids].sort((a, b) => a.y - b.y || a.x - b.x);
  return kids.some((n, i) => n.id !== visual[i].id);
}

// Utility: central colour palette (RGB 0-1)
const COLORS = {
  green: { r: 0, g: 0.8, b: 0.1 },
  yellow: { r: 1, g: 0.78, b: 0 },
  blue: { r: 0.18, g: 0.55, b: 1 },
} as const;

const layoutCache = new Map<string, LayoutAnalysis>();

type MarkColor = keyof typeof COLORS;

// Helper: generate breadcrumbs
function generateBreadcrumbs(node: SceneNode) {
  const breadcrumbs = [];
  let current: BaseNode | null = node;

  while (current && current.type !== "PAGE") {
    breadcrumbs.unshift({ id: current.id, name: current.name });
    current = current.parent;
  }

  return breadcrumbs;
}

// Helper: Refresh role funcion
// Helps go throguh all layers in the frames.
// Sets a tag saying if Auto Layout is already applied or should be suggested.
function refreshRoles(node: SceneNode) {
  // for frames, update their role sticker
  if (node.type === "FRAME") {
    const role = node.layoutMode !== "NONE" ? "applied" : "suggest";
    node.setPluginData("layra-role", role);
  }

  // Look inside boxes inside boxes
  if ("children" in node) {
    // recursion for children
    node.children.forEach((child) => {
      refreshRoles(child); // Check every toy in the box
    });
  }
}

//Helper: "runFixOrder"
async function runFixOrder(frame: FrameNode) {
  const sorted = [...frame.children].sort((a, b) => a.y - b.y || a.x - b.x);
  sorted.forEach((c) => frame.insertChild(0, c));
  clearLayraArtifacts();
  postToUI(frame);
}

function getChildrenBounds(nodes: readonly SceneNode[]) {
  return nodes.reduce(
    (acc, ch) => ({
      minX: Math.min(acc.minX, ch.x),
      maxX: Math.max(acc.maxX, ch.x + ch.width),
      minY: Math.min(acc.minY, ch.y),
      maxY: Math.max(acc.maxY, ch.y + ch.height),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}
// Helper: "ApplysmartAutoLayout"
function applySmartAutoLayout(frame: FrameNode) {
  if (frame.layoutMode !== "NONE") return; // already auto

  const b = getChildrenBounds(frame.children);
  const horizontal = b.maxX - b.minX > b.maxY - b.minY;

  frame.layoutMode = horizontal ? "HORIZONTAL" : "VERTICAL";
  frame.primaryAxisAlignItems = "MIN";
  frame.counterAxisAlignItems = "MIN";
  frame.itemSpacing = 8;

  refreshRoles(frame);
  postToUI(frame);
}

////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////
type LayoutType = "flex" | "grid" | "block";

interface LayoutAnalysis {
  type: LayoutType;
  gap?: number; // Only for flex/grid
  direction?: "row" | "column"; // Only for flexbox
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  border?: { width?: number; radius?: number };
}

interface NodeInfo {
  id: string;
  name: string;
  layout: string; // Only "auto", "suggest", or "" (empty string if irrelevant)
  badName: boolean;
  children: NodeInfo[];
  mismatch: boolean; // New property
  suggestGroup: boolean;
  parentRef?: NodeInfo;
}

interface AuditPayload {
  frameName: string;
  layers: NodeInfo[];
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
  const cached = layoutCache.get(node.id);
  if (cached) return cached;

  const base: LayoutAnalysis = { type: "block" };
  // Only frames/groups can be flex/grid
  if (!isFrameOrGroup(node)) {
    layoutCache.set(node.id, base);
    return base;
  }

  // Flex detection (Figma auto-layout)
  if (hasLayoutMode(node) && node.layoutMode !== "NONE") {
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

  layoutCache.set(node.id, base);
  return base;
}

////////////////////////////////////////////////////////
// Annotate Block
////////////////////////////////////////////////////////
async function annotateBlock(
  node: SceneNode,
  color: MarkColor,
  label: string,
  role?: "applied" | "suggest"
) {
  const [absX, absY] = [
    node.absoluteTransform[0][2],
    node.absoluteTransform[1][2],
  ];
  // -- Set role directly on original node (CRITICAL FIX) --
  if (role) {
    node.setPluginData("layra-role", role);
  }
  // -- Outline frame ---------------------------------------------------------
  const outline = figma.createFrame();
  outline.setPluginData("layra", "1");
  outline.setPluginData("layra-role", role || "");
  outline.setPluginData("layra-target", node.id);
  outline.name = `Layra: ${label}`;
  outline.x = absX;
  outline.y = absY;
  outline.resize(node.width, node.height);
  outline.fills = [
    {
      type: "SOLID",
      color: COLORS[color],
      opacity: 0.15,
    },
  ];
  outline.strokes = [
    {
      type: "SOLID",
      color: COLORS[color],
    },
  ];
  outline.strokeWeight = 2;
  outline.locked = true; // avoid accidental
  figma.currentPage.appendChild(outline);

  //-- Label text -------------------------------------------------------------
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const tag = figma.createText();
  tag.setPluginData("layra", "1");
  tag.characters = label;
  tag.fontSize = 12;
  tag.x = absX + 4;
  tag.y = absY - 16;
  tag.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
  tag.locked = true;
  figma.currentPage.appendChild(tag);
}

/*───────────────────────────────────────────────────────────────
  Layra ▶ sidebar bridge
───────────────────────────────────────────────────────────────*/
function nodeInfo(node: SceneNode, parent?: NodeInfo): NodeInfo {
  const sniffed = sniffLayout(node);
  const isAutoLayout = hasLayoutMode(node) && node.layoutMode !== "NONE";
  const info: NodeInfo = {
    id: node.id,
    name: node.name,
    layout: isAutoLayout
      ? "auto"
      : sniffed.type === "grid"
      ? "suggest"
      : isFrameOrGroup(node) && node.children.length > 1
      ? "suggest"
      : "",
    badName: /^(group|frame|rectangle|vector|text)\s?\d*$/i.test(
      node.name.trim()
    ),
    children: [],
    mismatch: isFrameOrGroup(node) ? visualOrderMismatch(node) : false,
    suggestGroup:
      isFrameOrGroup(node) &&
      node.children.length >= 2 &&
      (() => {
        const c = node.children.filter((ch) => ch.visible);
        if (c.length < 2) return false; // Add this check
        const aligned = c.every((ch) => Math.abs(ch.x - c[0].x) < 2);
        const gaps = c.slice(1).map((ch, i) => ch.y - (c[i].y + c[i].height));
        const uniform = gaps.every((g) => g >= 8 && g <= 24);
        return (
          aligned &&
          uniform &&
          (node.type === "FRAME" ? node.layoutMode === "NONE" : true)
        );
      })(),
  };

  if (isFrameOrGroup(node)) {
    info.children = node.children
      .filter((c) => c.visible)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((ch) => nodeInfo(ch, info));
  }
  return info;
}

// Extract the return type automatically

function buildAuditPayload(frame: FrameNode) {
  // contains the object we use for our audit
  const layers = [nodeInfo(frame)];

  // Count rename warnings
  let renameCount = 0;

  // capture badNames
  function countBadNames(node: NodeInfo) {
    if (node.badName) renameCount++;
    node.children.forEach(countBadNames);
  }
  layers.forEach(countBadNames);

  // Check for any issues
  const hasOrderWarning = layers.some((l) => l.mismatch);
  const hasGroupSuggestion = layers.some((l) => l.suggestGroup);

  // Create a flat list so the UI can iterate
  const checklist: { id: string; done: boolean }[] = [
    { id: "fix-order", done: !hasOrderWarning },
    { id: "group-layers", done: !hasGroupSuggestion },
    { id: "rename-layers", done: renameCount === 0 },
  ];

  return {
    frameName: frame.name,
    layers,
    summary: {
      hasOrderWarning,
      hasGroupSuggestion,
      renameCount,
    },
    checklist,
  };
}

/* this function analyzes a frame , find a problem and updates the sideba
  to show current audi summary for the user */
function postToUI(frame: FrameNode) {
  // This helps layput analysis results, so the next check is accurate and not stale
  layoutCache.clear();

  refreshRoles(frame);
  // handle buildAuditPayload
  figma.ui.postMessage({
    type: "AUDIT_DATA",
    payload: buildAuditPayload(frame),
  });
}


/*───────────────────────────────────────────────────────────────
  SECTION ▶ Lean-Json Extractor
───────────────────────────────────────────────────────────────*/
function buildSectionJSON(node: SceneNode) {
   // ---- helpers -------------------------------------------------
   const layout = sniffLayout(node);
   const isAuto = hasLayoutMode(node) && node.layoutMode!=="NONE";

   const padding = (isAuto && node.type==="FRAME") ? {
    top: (node as FrameNode).paddingTop,
    right: (node as FrameNode).paddingRight,
    bottom: (node as FrameNode).paddingBottom,
    left: (node as FrameNode).paddingLeft
   }: undefined;

   // ---- Object -------------------------------------------------
   const json:any = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible : node.visible,
    layout: {
      mode : node.type==="FRAME" ? node.layoutMode : "NONE",
      direction: layout.direction ?? null,
      gap: layout.gap ?? null,
      primary: (node as any).primaryAxisAlignItems ?? null,
      counter: (node as any).counterAxisAlignItems ?? null
    },
    boxModel: {
      width: node.width,
      height: node.height,
      x: node.x,
      y: node.y,
      padding // may be undefined
    },
    style: {
      fills : (node as any).fills ?? null,
      stokes : (node as any).strokes ?? null,
      effects: (node as any).effects ?? null,
      opacity : (node as any).opacity ?? null 
    }
   };

   // ----- recurse for children ---------------------------------
   if("children" in node) {
    json.children = node.children.filter(c => c.visible).map(ch =>buildSectionJSON(ch));
   }

   return json;


}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "SELECT_LAYER") {
    figma.getNodeByIdAsync(msg.id).then((node) => {
      if (node && node.type !== "PAGE") {
        const sceneNode = node as SceneNode;
        figma.currentPage.selection = [sceneNode];
        figma.viewport.scrollAndZoomIntoView([sceneNode]);
      }
    });
  }
  if (msg.type === "RENAME_LAYER") {
    figma.getNodeByIdAsync(msg.id).then((node) => {
      if (node && node.type !== "PAGE" && "name" in node) {
        const sceneNode = node as SceneNode;
        const parent = sceneNode.parent;
        if (parent && "children" in parent) {
          const index = parent.children.indexOf(sceneNode);
          node.name = msg.newName;
          parent.insertChild(index, sceneNode); // keeps position
        } else {
          sceneNode.name = msg.newName;
        }

        postToUI(figma.currentPage.selection[0] as FrameNode);
      }
    });
  }

  if (msg.type === "REQUEST_REFRESH") {
    if (figma.currentPage.selection.length === 1) {
      postToUI(figma.currentPage.selection[0] as FrameNode);
    }
  }
  if (msg.type === "FIX_ORDER") {
    const frame = figma.currentPage.selection[0] as FrameNode;
    if (frame) {
      // Create amutable copy of children
      const sortedChildren = [...frame.children].sort(
        (a, b) => a.y - b.y || a.x - b.x
      );
      // Reinsert in new order (this bypasses read-only restriction)
      sortedChildren.forEach((child, index) => {
        frame.insertChild(0, child);
      });

      //Force refresh
      clearLayraArtifacts();
      postToUI(frame);

      // Re-run annotations
      frame.children.forEach((child) => {
        if (child.visible) {
          const layout = sniffLayout(child);
          if (layout.type === "grid") {
            annotateBlock(child, "blue", "Grid ✓");
          } else if (isFrameOrGroup(child) && child.children.length > 1) {
            annotateBlock(child, "yellow", "Try Auto Layout", "suggest");
          }
        }
      });
    }
  }

  if (msg.type === "APPLY_AUTO" || msg.type === "REMOVE_AUTO") {
    figma.getNodeByIdAsync(msg.id).then(async (node) => {
      try {
        // Validate node
        if (!node || node.type !== "FRAME") return;

        // Handle cross-page nodes
        const originalPage = figma.currentPage;
        let changedPage = false;

        if (
          node.parent &&
          node.parent.type === "PAGE" &&
          node.parent !== originalPage
        ) {
          figma.currentPage = node.parent;
          changedPage = true;
          await new Promise((resolve) => setTimeout(resolve, 50)); // Allow page switch
        }

        // Perfrom layout operation
        if (msg.type === "APPLY_AUTO") {
          const bounds = node.children.reduce(
            (acc, child) => {
              return {
                minX: Math.min(acc.minX, child.x),
                maxX: Math.max(acc.maxX, child.x + child.width),
                minY: Math.min(acc.minY, child.y),
                maxY: Math.max(acc.maxY, child.y + child.height),
              };
            },
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
          );

          // Smart direction detection
          const isHorizontal =
            bounds.maxX - bounds.minX > bounds.maxY - bounds.minY;

          node.layoutMode = isHorizontal ? "HORIZONTAL" : "VERTICAL";
          node.primaryAxisAlignItems = "MIN";
          node.counterAxisAlignItems = "MIN";
          node.itemSpacing = 8;
        } else {
          node.layoutMode = "NONE";
        }

        // Restore original page context if changed
        if (changedPage) {
          figma.currentPage = originalPage;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Refresh UI
        if (figma.currentPage.selection.length === 1) {
          const selected = figma.currentPage.selection[0];
          if (selected && selected.type === "FRAME") {
            postToUI(selected);
          }
        }

        // Update roles recursively
        node.setPluginData(
          "layra-role",
          msg.type === "APPLY_AUTO" ? "applied" : ""
        );
        refreshRoles(node);
      } catch (error) {
        console.error("Auto Layout Error:", error);
      }
    });
  }

  if(msg.type === "REQUEST_JSON") {
    const sel = figma.currentPage.selection;
    if(sel.length!==1){ return;} // nothing selected
    const node = sel[0];

    const payload = buildSectionJSON(node);
    figma.ui.postMessage({ type: "SECTION_JSON", payload});
  }

  // -----------Dev-Checklist actions---------------------
  if (msg.type === "fix-order") {
    if (figma.currentPage.selection.length === 1) {
      figma.ui.postMessage({ type: "CLEAR" }); // optional visual feedback
      figma.ui.postMessage({ type: "BUSY", label: "Re-ordering..." }); // if you want

      await runFixOrder(figma.currentPage.selection[0] as FrameNode);
    }
  }

  if (msg.type === "group-layers") {
    const sel = figma.currentPage.selection;
    if (sel.length < 2) return;

    // Ensure a vlaid parent that can own children
    const parent = sel[0].parent as BaseNode & ChildrenMixin;

    // 1. Create a fresh frame
    const wrapper = figma.createFrame();
    wrapper.name = "Group";
    wrapper.layoutMode = "NONE";
    parent.appendChild(wrapper);

    //2. Move selected nodes into it (preserve visual position)
    sel.forEach((node) => {
      wrapper.appendChild(node);
      node.x -= wrapper.x;
      node.y -= wrapper.y;
    });

    // 3. Resize wrapper to fit children
    const b = getChildrenBounds(wrapper.children);
    wrapper.resize(b.maxX - b.minX, b.maxY - b.minY);
    wrapper.x = b.minX;
    wrapper.y = b.minY;

    // Smart-apply Auto-Layout
    applySmartAutoLayout(wrapper);

    // Select the new frame so user sees result
    figma.currentPage.selection = [wrapper];
  }

  if (msg.type === "rename-layers") {
    // simplest: jump to first bad name and open rename
    const frame = figma.currentPage.selection[0] as FrameNode;
    const first = frame.findOne((n) =>
      /^(group|frame|rectangle|vector|text)\s?\d*$/i.test(n.name?.trim() || "")
    ) as SceneNode | undefined;
    if (first) {
      figma.currentPage.selection = [first];
      figma.viewport.scrollAndZoomIntoView([first]);
      figma.ui.postMessage({ type: "OPEN_RENAME" }); // UI will focus the input
    }
  }

  if (msg.type === "MOVE_LAYER") {
    const dragged = figma.getNodeById(msg.nodeId) as SceneNode;
    const target = figma.getNodeById(msg.targetId) as SceneNode;
    if (!dragged || !target) return;

    if (msg.mode === "child") {
      if ("appendChild" in target) {
        target.appendChild(dragged);
      }
    } else {
      const parent = target.parent as ChildrenMixin;
      if (!parent) return;
      const idx = parent.children.indexOf(target);
      const insertAt = msg.mode === "after" ? idx + 1 : idx;
      parent.insertChild(insertAt, dragged);
    }

    // refresh overlay + sidebar
    clearLayraArtifacts();
    const root =
      dragged.parent?.type === "PAGE"
        ? (dragged as FrameNode)
        : ((dragged.parent as SceneNode).parent as FrameNode);
    postToUI(root);
  }
};

// ────────────────────────────────────────────────────────────────
// Main selection listener
/** 1. USER SELECTS A FRAME  */
figma.on("selectionchange", async () => {
  // Remove previously drawn overlay frames (So UI is always fresh)
  clearLayraArtifacts();

  const sel = figma.currentPage.selection;

  /**
   * 1.) Sends a message from plugin code to UI Script
   * 2.) To make sure the sidebar always shows the correct info
   * for the current selection and never mixes up old and new audits
   * 3.) the mesage is sent to if (msg.type === "CLEAR") {}
   * */
  figma.ui.postMessage({ type: "CLEAR" });

  // Check if only one item is selected
  if (sel.length === 1) {
    // Get the selected node
    const node = sel[0];
    // Is it a "root frame" -> (a frame directly on the page not nested inside a group or frame).
    const isRootFrame = node.type === "FRAME" && node.parent?.type === "PAGE"; // Check if direct child of page
    if (isRootFrame) {
      // Show only summary for root frame
      postToUI(node); // This will show summary panel
    } else {
      //Show section panel for nested elements
      const layout = sniffLayout(node);
      const role =
        node.getPluginData("layra-role") ||
        (layout.type === "flex"
          ? "applied"
          : layout.type === "grid"
          ? "suggest"
          : "");

      figma.ui.postMessage({
        type: "SECTION_CONTEXT",
        payload: {
          role: node.type === "FRAME" ? role : "", // Only show for frames
          targetId: node.id,
          targetName: node.name,
          breadcrumbs: generateBreadcrumbs(node),
          children: isFrameOrGroup(node) ? node.children.map(child => nodeInfo(child)) : [],
        },
      });
    }
  }

  // Only process frame annotations for root frames
  if (sel.length === 1 && sel[0].type === "FRAME") {
    const frame = sel[0] as FrameNode;

    // Annotation logic remains the same
    frame.children.forEach((child) => {
      // Skip invisible layers
      if (!child.visible) return;

      // If child is itself a frame with Auto Layout -> green
      if (child.type === "FRAME" && child.layoutMode !== "NONE") {
        annotateBlock(child, "green", "Auto Layout ✓", "applied");
        return;
      }

      // For everything else, run sniffLayput to see if it's a clean stack
      const layout = sniffLayout(child);
      const looksStackable =
        layout.type === "block" &&
        isFrameOrGroup(child) &&
        child.children.length > 1;

      if (layout.type === "grid") {
        annotateBlock(child, "green", "Auto Layout ✓", "applied");
        return;
      }

      if (looksStackable) {
        annotateBlock(child, "yellow", "Try Auto Layout", "suggest");
      }
    });
    postToUI(frame);
  }
});