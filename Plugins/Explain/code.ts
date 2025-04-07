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
  className?: string;
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

function getUniqueClassName(layerName: string): string {
  const base = layerName
    .toLowerCase()
    .replace(/\s+/g, "-") // convert spaces to dashes
    .replace(/[^\w-]/g, ""); // strip any werid chars

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
      const cssCode = gatherAllCSS(layerInfo);

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

  // Handle layers without children (text, shapes, etc.)
  if (!("children" in layer)) {
    return {
      ...baseProps,
      children: [],
      isAutoLayout: false,
      padding: 0,
      spacing: 0,
    };
  }

  //Handle frames/groups with children
  return {
    ...baseProps,
    children: layer.children.map(getLayerInfo),
    isAutoLayout: "layoutMode" in layer && layer.layoutMode !== "NONE",
    padding: getPadding(layer),
    spacing: "itemSpacing" in layer ? layer.itemSpacing : 0,
    layoutMode: "layoutMode" in layer ? layer.layoutMode : undefined,
  };
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
function gatherAllCSS(layer: FigmaLayer): string {
  // Generate the current layer's CSS
  let css = generateCSS(layer);

  // Recursively gather the children's CSS
  for (const child of layer.children) {
    css += "\n" + gatherAllCSS(child);
  }

  return css;
}

function generateCSS(layer: FigmaLayer): string {
  // use layer.className if available 
  const selector = `.${layer.className || "unnamed"}`;
  const cssProps: string[] = [];

  // Box model
  cssProps.push(`width: ${layer.width}px`);
  cssProps.push(`height: ${layer.height}px`);

  // Auto-layout
  if (layer.isAutoLayout) {
    cssProps.push(`display: flex`);
    cssProps.push(
      `flex-direction: ${layer.layoutMode === "HORIZONTAL" ? "row" : "column"}`
    );

    if (layer.padding) {
      cssProps.push(`padding: ${Math.min(layer.padding, 24)}px`);
    }

    if (layer.spacing) {
      cssProps.push(`gap: ${layer.spacing}px`);
    }
  }

  // Text styling
  if (layer.type === "TEXT") {
    if (layer.fontSize) {
      cssProps.push(`font-size: ${layer.fontSize}px`);
    }

    if (layer.textColor) {
      cssProps.push(`color: ${layer.textColor}`);
    }
  }

  // Button styles
  if (layer.name.toLowerCase().includes("button")) {
    cssProps.push("cursor: pointer");
    cssProps.push("user-select: none");
  }

  // Return one "flat" CSS block
  // e.g. .button { width: 100px; height: 500px; ...}
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
