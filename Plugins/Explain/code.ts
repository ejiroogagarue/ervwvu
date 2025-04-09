////////////////////////////////////////////////////////
// 0.) Initialize Plugin UI (Required)
////////////////////////////////////////////////////////
// figma.showUI(__html__, { visible: false }); // Minimal UI

////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////
interface FigmaLayer {
  type: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  children: FigmaLayer[];
  isAutoLayout: boolean;
  padding: number;
  spacing: number;
  layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
  characters?: string; // For text content
  fontSize?: number; // For text styling
  textColor?: string; // For text color
  fontWeight?: number | string; 
  fontFamily?: string;
  textAlign?: "LEFT" | "CENTER" | "RIGHT";
  lineHeight?: {
    unit: "PIXELS" | "PERCENT";
    value: number;
  };
  className?: string;
  margin?: {top: number; right: number; bottom: number; left: number};
  border?: {weight: number; style: string; color?: string};
  computedWidth?: string; //e.g. "auto" or "200px"
  computedHeight?: string; // e.g. "auto" or "100px"
  parentOverlaps: boolean; 
  fills?: Array<{
    type: 'SOLID' | 'GRADIENT' | 'IMAGE';
    color?: RGB;
    visible?: boolean;
  }>;
  cornerRadius?: number;
}

type PaddableNode = SceneNode & {
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
};

////////////////////////////////////////////////////////
//Utility Functions
////////////////////////////////////////////////////////

const classNameCounters: Record<string, number> = {};

/**
 *
 * Slugify the name, then append a unqiue counter.
 * e.g. "Column" => "column-1"
 *
 */

// Generate unique class names from layer name 
function getUniqueClassName(layerName: string): string {
  let base = layerName
    .toLowerCase()
    .replace(/\s+/g, "-") // convert spaces to dashes
    .replace(/[^\w-]/g, "") // Remove special chars
    .replace(/^(\d+)/g, "c$1"); // Prefix numbers with 'c'


  // Ensure it starts with a letter 
  if(/^[0-9]/.test(base)) {
    base = "c" + base;
  }
  // Bump the counter for that base
  if (!classNameCounters[base]) {
    classNameCounters[base] = 0;
  }
  classNameCounters[base]++;

  return `${base}-${classNameCounters[base]}`;
}

function assignUniqueClassNames(layer: FigmaLayer): void {
  // Assign a unique className if not already set
  layer.className = getUniqueClassName(layer.name);

  // Recurse for children
  for (const child of layer.children) {
    assignUniqueClassNames(child);
  }
}

function computeMargin(node: SceneNode): {top: number; right: number; bottom: number;left: number} {
  // If the node has an auto-layout parent that uses "gap"
  // you might skip margin or do zero.
  if(node.parent && "layoutMode" in node.parent && node.parent.layoutMode !== "NONE") {
    return { top: 0, right: 0, bottom: 0, left: 0};
  }

  // For non-auto-layout elements
  if(node.parent && "children" in node.parent) {
    // measure sibling bounding box distances
   const siblings = node.parent.children.filter(c => c.id !== node.id);

   // If first child in container, use absolute position 
   if(siblings.length === 0) {
    return {
      top: node.y,
      left: node.x,
      right: 0,
      bottom: 0
    };
   }

   // Calculate responsive friendly margins
   return {
    top: node.y, // Margin from top of parent
    left: node.x, // Margin from left of parent 
    right: 0, // Let flexbox handle right spacing 
    bottom: 0 // let content flow naturally 
   };
  }

  return {top: 0, right: 0, bottom: 0, left: 0};
}

// function computeSiblingGaps(node: SceneNode): {top: number; right: number; bottom: number; left: number} {
//   const siblings = node.parent!.children.filter(s => s.id !== node.id && "width" in s && "height" in s);

//   let topGap = Infinity, bottomGap = Infinity, leftGap = Infinity, rightGap = Infinity;

//   const nodeLeft = node.x;
//   const nodeRight = node.x + node.width;
//   const nodeTop = node.y;
//   const nodeBottom = node.y + node.height;

//   for(const sib of siblings) {
//     if(!("width" in sib)) continue; // skip weird nodes 
//     const sibLeft = sib .x;
//     const sibRight = sib.x + sib.width;
//     const sibTop = sib.y;
//     const sibBottom = sib.y + sib.height;

//     // sibling above 
//     if(sibBottom <= nodeTop) {
//       topGap = Math.min(topGap, nodeTop - sibBottom);
//     }

//     // sibling below 
//     if (sibTop >= nodeBottom) {
//       bottomGap = Math.min(bottomGap, sibTop - nodeBottom);
//     }

//     // sibling left 
//     if(sibRight <= nodeLeft) {
//       leftGap = Math.min(leftGap, nodeLeft - sibRight);
//     }
//     // sibling right 
//     if(sibLeft >= nodeRight) {
//       rightGap = Math.min(rightGap, sibLeft - nodeRight);
//     }
//   }

//   return {
//     top: topGap === Infinity ? 0: topGap,
//     right: rightGap === Infinity ? 0: rightGap,
//     bottom: bottomGap === Infinity ? 0: bottomGap,
//     left: leftGap === Infinity ? 0 : leftGap
//   };
// }

// Border Logic
function computeBorder(node: SceneNode): {weight: number; style: string; color?: string} {
  // If there's no strokes, return zero border 
  if(!("strokes" in node) || !node.strokes || node.strokes.length === 0) {
    return { weight: 0, style: "none"};
  }

  // For simplicity, assume a single stroke 
  let strokeWeight = "strokeWeight" in node ? node.strokeWeight : 0;
  if(strokeWeight === figma.mixed) strokeWeight = 0;

  let dashPattern = "dashPattern" in node ? node.dashPattern: [];
  let style = "solid";
  if(dashPattern.length === 1) style="dotted";
  if(dashPattern.length === 2) style = "dashed";

  // Optionally read color from node.strokes[0].color
  let borderColor = "#000";
  const firstStroke = node.strokes[0];
  if(firstStroke.type === "SOLID" && firstStroke.visible !== false) {
    borderColor = rgbToHex(firstStroke.color);
  }

  return { weight: strokeWeight as number, style, color: borderColor};
}

// Compute width/height in px or "auto"
function computeWidth(node: SceneNode): string {
  // If it's text or "hug contents" horizontally, return "auto"
  if(node.type === "TEXT"){
    return "auto";
  }

  if("primaryAxisSizingMode" in node && node.primaryAxisSizingMode === "AUTO") {
    // or if it's a horizontal layout, you'd check "counterAxisSizing Mode"
    return "auto"
  }

  // Otherwise fallback to actual width in px
  return `${node.width}px`;
}

function computeHeight(node: SceneNode): string {
  // If it's text or "hug contents" vertically return "auto"
  if(node.type === "TEXT") {
    return "auto";
  }

  if("counterAxisSizingMode" in node && node.counterAxisSizingMode === "AUTO") {
    return "auto";
  }

  // Other wise fallback to actual height in px
  return `${node.height}px`;
}

function detectOverlapsInChildren(children: FigmaLayer[]): boolean {
  for(let i=0; i< children.length; i++) {
    const a = children[i];
    const ax1 = a.x, ax2 = a.x + a.width;
    const ay1 = a.y, ay2= a.y + a.height;

    for (let j=i+1; j < children.length; j++) {
      const b = children[j];
      const bx1 = b.x, bx2 = b.x + b.width;
      const by1 = b.y, by2 = b.y + b.height;

      // If bounding boxes intersect:
      // Overlap condition => they do not keep a gap horizontally or vertically
      const overlapH = !(bx1 >= ax2 || bx2 <= ax1);
      const overlapV = !(by1 >= ay2 || by2 <= ay1);

      if(overlapH && overlapV) {
        return true;// Found an overlap
      }
    }
  }
  return false; // No Paur overlapped 
}


function getTextColor(textNode: TextNode): string | undefined {
  if (!textNode.fills || !Array.isArray(textNode.fills)) return undefined;

  const solidFill = textNode.fills.find(
    (fill) => fill.type === "SOLID" && fill.visible !== false
  );

  return solidFill ? rgbToHex(solidFill.color) : undefined;
}

//Helper function for color conversion
function rgbToHex(color: RGB): string {
  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}
////////////////////////////////////////////////////////
// 1.) Main Plugin Function
////////////////////////////////////////////////////////

// -> This grabs all the currently selected layers in the Figma file.
function generateCode() {
  const selectedLayers = figma.currentPage.selection;

  if (selectedLayers.length === 0) {
    figma.notify("⚠️ Select a layer first!");
    return;
  }

  // Clear console for fresh output
  console.clear();

  // Reset counters so each run starts fresh
  for (let key in classNameCounters) {
    delete classNameCounters[key];
  }

  selectedLayers.forEach((layer) => {
    try {
      // Build your Figmalayer data
      const layerInfo = getLayerInfo(layer);

      // Assign unique class names to everything in the tree
      assignUniqueClassNames(layerInfo);
      // Generate HTML & CSS
      const htmlCode = generateHTML(layerInfo);
      const cssCode = gatherAllCSS(layerInfo, undefined);

      // Log it out
      console.log("------Layer DEBUG-------");
      console.log("Raw Layer: ", layer);
      console.log("Processed Info: ", layerInfo);
      console.log("Generated HTML:\n", htmlCode);
      console.log("Generated CSS:\n", cssCode);
    } catch (error) {
      console.error(`Failed to process ${layer.name}:`, error);
    }
  });

  figma.notify("✅ Code generated! Check console");
}

//Initialize and watch for selection changes
generateCode();
figma.on("selectionchange", generateCode);

////////////////////////////////////////////////////////
// 2.) Extract Figma Layer Data
////////////////////////////////////////////////////////

/**this function takes any selected Figma node (text, image, frame, group, etc.)
 * and returns a simpilified version of that node:
 * -> Basic properties (type,name, size, position)
 * -> If it has children -> recursively gets info about them too
 * -> Determine if it uses Auto Layout
 * -> Gerabs layout-related values like padding and spacing .
 */
// function getLayerInfo(layer: SceneNode): FigmaLayer {
//    // Check that layer is valid and has a width
//    // If not throw an error
//   if(!layer || !('width' in layer)) {
//     throw new Error("Invalid layer type");
//   }

//   const baseProps = {
//     type: layer.type,
//     name: layer.name,
//     width: layer.width,
//     height: layer.height,
//     x: layer.x,
//     y: layer.y,
//     // Add text content if available
//     Characters: layer.type === "TEXT" ? (layer as TextNode).characters: undefined,
//     fontSize: layer.type === "TEXT" ? (layer as TextNode).fontSize : undefined,
//     textColor: layer.type === "TEXT"
//   ? getTextColor(layer as TextNode)
//   : undefined
//   };

//   // Handle node that can't have children
//   if(!('children' in layer)) {
//     return {
//       ...baseProps,
//       children: [],
//       isAutoLayout: false,
//       padding: 0,
//       spacing: 0
//     };
//   }
//   return {
//     ...baseProps,
//     children: "children" in layer ? layer.children.map(getLayerInfo) : [],
//     isAutoLayout: "layoutMode" in layer && layer.layoutMode !== "NONE",
//     padding: "paddingLeft" in layer ? layer.paddingLeft : 0,
//     spacing: "itemSpacing" in layer ? layer.itemSpacing : 0,
//     layoutMode: 'layoutMode' in layer ? layer.layoutMode: undefined
//   };
// }

function getLayerInfo(layer: SceneNode): FigmaLayer {
  
  // Validate layer
  if (!layer || !("width" in layer)) {
    throw new Error("invalud layer type");
  }

  // Base properties for all layers
  const baseProps = {
    type: layer.type,
    name: layer.name,
    width: layer.width,
    height: layer.height,
    x: layer.x,
    y: layer.y,
    characters:
      layer.type === "TEXT" ? (layer as TextNode).characters : undefined,
    textColor:
      layer.type === "TEXT" ? getTextColor(layer as TextNode) : undefined,
  };



  // Recursively handle chidlren 
  // Using a "Depth-first recursive traversal"
  let children: FigmaLayer[] = [];

  if("children" in layer) {
    children = layer.children.map(getLayerInfo);
  }

  // If we have children, check overlap 
  let overlaps = false;
  if(children.length > 1) {
    overlaps = detectOverlapsInChildren(children);
  }

  // Construct the final FigmaLayer object 
  // Merges everything into one object 
  const figmaLayer: FigmaLayer = {
    ...baseProps,
    children,
    isAutoLayout: "layoutMode" in layer && layer.layoutMode !== "NONE",
    padding: getPadding(layer),
    spacing: ("itemSpacing" in layer && layer.itemSpacing) || 0,
    layoutMode: "layoutMode" in layer ? layer.layoutMode : undefined,
    // new box-model fields:
    margin: computeMargin(layer),
    border: computeBorder(layer),

    // computed dimension fields:
    computedWidth: computeWidth(layer),
    computedHeight: computeHeight(layer),

    // Store the overlap boolean 
    parentOverlaps: overlaps,
  };

  return figmaLayer;

}

// Helper function for consistent padding
function getPadding(layer: PaddableNode): number {
  // 1. Check if paddingLeft exists and is a number
  if (typeof layer.paddingLeft !== "number") {
    return 0;
  }

  // 2. TypeScript now knows paddingLeft is definitely a number
  const padding = layer.paddingLeft;

  // 3. Safely check other padding sides (if they exist)
  const right =
    "paddingRight" in layer && typeof layer.paddingRight === "number"
      ? layer.paddingRight
      : padding;

  const top =
    "paddingTop" in layer && typeof layer.paddingTop === "number"
      ? layer.paddingTop
      : padding;

  const bottom =
    "paddingBottom" in layer && typeof layer.paddingBottom === "number"
      ? layer.paddingBottom
      : padding;

  // 4. Return single value if symmetrical
  if (padding === right && padding === top && padding === bottom) {
    return padding;
  }

  // 5. Default to left padding
  return padding;
}


////////////////////////////////////////////////////////
// 3.) Map to HTML Tags
////////////////////////////////////////////////////////

function getHTMLTag(layer: ReturnType<typeof getLayerInfo>) {
  const { name, type } = layer;

  // Semantic tags
  if (type === "TEXT") {
    return name.toLowerCase().includes("button") ? "button" : "p";
  }

  if (name.match(/header|nav|footer/i)) return name.toLowerCase();
  if (type === "GROUP" && layer.children.length > 1) return "div";

  // Defaults
  const tagMap: Record<string, string> = {
    RECTANGLE: "div",
    ELLIPSE: "div",
    FRAME: "div",
  };
  return tagMap[type] || "div";
}

////////////////////////////////////////////////////////
// 4.) Generate CSS
////////////////////////////////////////////////////////
function gatherAllCSS(layer: FigmaLayer, parent?: FigmaLayer): string {
  // Generate the current layer's CSS
  let css = generateCSS(layer);

  // Recursively gather the children's CSS
  for (const child of layer.children) {
    css += "\n" + gatherAllCSS(child);
  }

  return css;
}

function generateCSS(layer: FigmaLayer, parent?: FigmaLayer): string {
  // use layer.className if available 
  const selector = `.${layer.className || "unnamed"}`;
  const cssProps: string[] = [];

  // CASE A: Auto-Layout 
  if(layer.isAutoLayout) {
    // Display flex
    cssProps.push("display: flex");
    const flexDir = layer.layoutMode === "HORIZONTAL" ? "row" : "column";
    cssProps.push(`flex-direction: ${flexDir}`);

    // Set Container size
    if(layer.computedWidth && layer.computedWidth !== "auto") {
      cssProps.push(`width: ${layer.computedWidth}`);
    } else {
      cssProps.push(`width: auto`);
    }

    if(layer.computedHeight && layer.computedHeight !== "auto") {
      cssProps.push(`height: ${layer.computedHeight}`);
    } else {
      cssProps.push(`height: auto`);
    }

    // Gap & padding (Figma's itemSpacing etc.)
    if(layer.padding) {
      cssProps.push(`padding: ${Math.min(layer.padding, 24)}px`);
    } 
    if(layer.spacing) {
      cssProps.push(`gap: ${layer.spacing}px`);
    }
  }

  // CASE B: Non-auto-layout container with children
  else if(layer.children.length > 0) {
    // if "parentOverlaps" is true 
    if(layer.parentOverlaps) {
      cssProps.push("position: relative");
      // Fix container dimensions in px to match Figma
      cssProps.push(`width: ${layer.width}px`);
      cssProps.push(`height: ${layer.height}px`);
    } else {
      // Responsive container styling   
      cssProps.push("display: block");
      // Set a container width if you want to match Figma 
      cssProps.push(`width: ${layer.computedWidth || '100%'}`); // Default to full width
      cssProps.push("max-width: 100%"); // Prevent overflow

      // Only set height if explicitly specified
      if(layer.computedHeight && layer.computedHeight !== "auto") {
        cssProps.push(`height: ${layer.computedHeight}`);
      }

      // Add flexbox as fallback for child arrangement 
      cssProps.push("display: flex");
      cssProps.push("flex-wrap: wrap");
    }
  }

  // CASE C: Leaf node (no children)
  else {
    // if parent is in overlap mode => absolute
    if(parent?.parentOverlaps) {
      cssProps.push("position: absolute");
      cssProps.push(`left: ${layer.x}px`);
      cssProps.push(`top: ${layer.y}px`);
      cssProps.push(`width: ${layer.width}px`);
      cssProps.push(`height: ${layer.height}px`);
    } else {
      // Responsive item styling 
      if(layer.computedWidth && layer.computedWidth !== "auto") {
        cssProps.push(`width: ${layer.computedWidth}`);
        cssProps.push("flex-shrink: 0"); // prevent shrinking
      } else {
        cssProps.push("width: auto");
        cssProps.push("flex-grow: 1"); // allow growing to fill space
      }

      if(layer.computedHeight && layer.computedHeight !== "auto") {
        cssProps.push(`height: ${layer.computedHeight}`);
      }
    }

    if(layer.type !== "TEXT") {
      // Handle fills (background color)
      if(layer.fills?.length) {
         const visibleFill = layer.fills.find(fill => fill.visible !== false);
         if(visibleFill?.type === "SOLID" && visibleFill.color) {
          cssProps.push(`background-color: ${rgbToHex(visibleFill.color)}`);
         }
      }

      // Handle corner radius
      if(typeof layer.cornerRadius === 'number') {
        cssProps.push(`border-radius: ${layer.cornerRadius}px`);
      }
    }
    
  }

  // Margin 
  if(layer.margin) {
    const {top, right, bottom, left} = layer.margin;
    cssProps.push(`margin: ${top}px ${right}px ${bottom}px ${left}px`);
  }

  // Border 
  if(layer.border && layer.border.weight > 0) {
    const {weight, style, color} = layer.border;
    cssProps.push(`border: ${weight}px ${style} ${color || "#000"}`);
  }

  // Text styling 
  if(layer.type === "TEXT") {
   
    
    // Font size
    if(layer.fontSize) {
      cssProps.push(`font-size: ${layer.fontSize}px`);
    }

    // Font weight 
    if(layer.fontWeight) {
      cssProps.push(`font-size: ${layer.fontWeight}`);
    }

    // Font family 
    if(layer.fontFamily) {
      cssProps.push(`font-family: ${layer.fontFamily}`);
    }

    // Text alignment 
    if(layer.textAlign) {
      cssProps.push(`text-align: ${layer.textAlign.toLowerCase()}`);
    }

    // Line height
   if(layer.lineHeight) {
    if(layer.lineHeight.unit === "PIXELS") {
      cssProps.push(`line-height: ${layer.lineHeight.value}px`);
    } else if (layer.lineHeight.unit === "PERCENT") {
      cssProps.push(`line-height: ${layer.lineHeight.value}%`);
    } 
   }


    if(layer.textColor) {
      cssProps.push(`color: ${layer.textColor}`);
    }
  }

  // Button heuristics 
  if(layer.name.toLowerCase().includes("button")) {
    cssProps.push("cursor: pointer");
    cssProps.push("user-select: none");
  }

  return `${selector} {\n ${cssProps.join(";\n ")}\n}`;
 
}

////////////////////////////////////////////////////////
// 5.) Generate HTML
////////////////////////////////////////////////////////
/**
 *
 *  Recursively walks thorugh your "FigmaLayer" tree
 *  and turns it into properly structured nested HTML code.
 */
function generateHTML(layer: FigmaLayer, depth = 0): string {
  const indent = "  ".repeat(depth);
  const tag = getHTMLTag(layer);

  // Use the unique className here
  // Fallback to something if it's missing
  const className = layer.className || "unnamed";
  const attrs = `class="${className}"`;

  let html = `${indent}<${tag} ${attrs}>`;

  if (layer.children.length > 0) {
    html +=
      "\n" +
      layer.children.map((child) => generateHTML(child, depth + 1)).join("\n") +
      `\n${indent}`;
  } else if (layer.type === 'TEXT' && layer.characters) {
    html += layer.characters;
  }

  return html + `</${tag}>`;
}
