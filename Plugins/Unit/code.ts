figma.showUI(__html__);
figma.ui.resize(500, 500);

let selectedUnit = "px"; //Default unit (can be changed from UI)



//26.) Function to convert units (px, %, rem,em)
function convertUnits(value: number, parentSize: number, unit: string, fontSize: number =16): string {
  switch (unit) {
    case "px":
      return `${value}px`;
    case "%":
      return `${((value / parentSize) * 100).toFixed(2)}%`;
    case "rem":
      return `${(value / 16).toFixed(2)}rem`; // Assuming base font size =16px
    case "em":
      return `${(value / fontSize).toFixed(2)}em`; //Relative to element font size
    default:
      return `${value}px`; //Fallback to pixels
  }
}

// 24.) this passes values and strategy from the getPadding function
// his code correctly handles figma.mixed by filtering it out
function resolveMinValues(values: any[]) {
  const filteredValues = values.filter((v) => v !== figma.mixed);
  if (filteredValues.length === 0) return 0; // Default if all are mixed
  return Math.min(...filteredValues);
}

// 9.) Function to get margin (distance from sibling elements)
function getMargin(node: SceneNode) {
  // 10.) if no node.parent and "children" -> (An array of all child nodes inside this parent)
  // return a zero sum node
  if (!node.parent || !("children" in node.parent))
    return { top: 0, right: 0, bottom: 0, left: 0 };
  // 11.) pass the node.parent property to a varaible parent
  // this value doesn't change when given its initial value
  const parent = node.parent;
  // 12.) this passes all child odes inside the parent to sibling variable
  // ---> Filters out node that don't meet certain conditions
  // ---> Ensures we exclude the selected node itself
  // "x" in n && "y" in n --> Checks if the node has X and Y position values
  const siblings = parent.children.filter(
    (n) => n.id !== node.id && "x" in n && "y" in n
  );
  // 13.) Setting these margin values to Infinity means we don’t know the actual margin yet
  // -->  we want to find the smallest margin during calculations.
  let topMargin = Infinity,
    bottomMargin = Infinity,
    leftMargin = Infinity,
    rightMargin = Infinity;
  // 14.) this checks all siblings within the array for x,y , widht and height
  siblings.forEach((sibling) => {
    if (
      "x" in sibling &&
      "y" in sibling &&
      "width" in sibling &&
      "height" in sibling
    ) {
      // 15.) This checks if the sibling is fully above the node in figma
      // sibling.y -> The top position of the sibling
      // sibling.height -> the height of the sibling.
      // sibling.y + sibling.height -> This calcualtes the bottom edge of the sibling.
      if (sibling.y + sibling.height <= node.y) {
        // 16.) If the sibling is above the node, calculate the gap between the sibling's bottom and the node's top.
        topMargin = Math.min(topMargin, node.y - (sibling.y + sibling.height));
      }

      if (sibling.y >= node.y + node.height) {
        // 17.) If the sibling is below the node, calculate the gap between the node’s bottom and the sibling’s top.
        bottomMargin = Math.min(
          bottomMargin,
          sibling.y - (node.y + node.height)
        );
      }
      if (sibling.x + sibling.width <= node.x) {
        // 18.) If the sibling is to the left of the node, calculate the gap between the sibling's right edge and the node’s left.
        leftMargin = Math.min(leftMargin, node.x - (sibling.x + sibling.width));
      }
      if (sibling.x >= node.x + node.width) {
        // 19.) If the sibling is to the right of the node, calculate the gap between the node’s right edge and the sibling’s left edge.
        rightMargin = Math.min(rightMargin, sibling.x - (node.x + node.width));
      }
    }
  });

  return {
    // 20.) This ensures we don't return any infinity value
    top: topMargin === Infinity ? 0 : topMargin,
    right: rightMargin === Infinity ? 0 : rightMargin,
    bottom: bottomMargin === Infinity ? 0 : bottomMargin,
    left: leftMargin === Infinity ? 0 : leftMargin,
  };
}

// 21.) Function to get padding (Auto Layout + manual for non-Auto Layout)
function getPadding(node: SceneNode) {
  // 22.) This checks if the node has Auto Layout enabled.
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    //23.) Pass value to resolveMinValues --->
    return {
      top: resolveMinValues([node.paddingTop]),
      right: resolveMinValues([node.paddingRight]),
      bottom: resolveMinValues([node.paddingBottom]),
      left: resolveMinValues([node.paddingLeft],),
    };
  }

  //24.) If not Auto Layout, manually calculate padding based on child positioning
  if ("children" in node && node.children.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    node.children.forEach((child) => {
      if ("x" in child && "y" in child) {
        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
      }
    });
    return {
      top: Math.max(0, minY),
      right: Math.max(0, node.width - maxX),
      bottom: Math.max(0, node.height - maxY),
      left: Math.max(0, minX),
    };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

//25.) Function to get border thickness (stroke weight)
function getBorder(node: SceneNode): {weight: number; style: string} {
  if(!("strokes" in node) || node.strokes.length === 0) {
    return {weight:0, style: "none"};// No stroke
  }
  let strokeWeight = "strokeWeight" in node ? node.strokeWeight: 0;
  // Handle mixed stroke weights
  if(strokeWeight === figma.mixed) {
    return { weight:0, style: "mixed"}; // Indicate mixed stroke weights
  }

  const dashPattern = "dashPattern" in node ? node.dashPattern : [];
  let borderStyle = "solid"; //Default to solid

  if(dashPattern.length === 1) {
    borderStyle = "dotted";
  } else if (dashPattern.length === 2) {
    borderStyle = "dashed";
  }

  return {weight: strokeWeight as number, style:borderStyle};
  // return resolveMinValues(
  //   ["strokeWeight" in node ? node.strokeWeight : 0]
  // );
}

// 7.) defines a function named getParentSize that:
//Takes one input → a node of type SceneNode (a Figma layer like a frame, group, or rectangle).
//Returns an object with: width (a number) and height (a number)
function getParentSize(node: SceneNode): { width: number; height: number ; fontSize: number} {
  //If theres's no parent, use a reasonable fallback
  if (!node.parent || node.parent.type === "PAGE") {
    return { width: 1440, height: 1024 , fontSize: 16}; // Default to a standard desktop width/height
  }
  let parentFontSize = 16; // Default font size
  let currentParent: SceneNode | null = node.parent as SceneNode | null;
  // property for fontsize used in em calculation 
  while (currentParent) {
    if ("fontSize" in currentParent) {
      parentFontSize = currentParent.fontSize as number; // Found a valid fontSize
      break;
    }
    currentParent = currentParent.parent as SceneNode | null;
  }
  return {
    width: "width" in node.parent ? node.parent.width : node.width,
    height: "height" in node.parent ? node.parent.height : node.height,
    fontSize: parentFontSize,
  };
}

// 2.) Most important function deal with the bulk of operation for the plugin
// this detects selction and triggers the ---> HandleSlectionChange function
function handleSelectionChange() {
  //3.)  This line of code gets the currently selected layers in Figma.
  //  figma.currentPage → Refers to the current page in Figma.
  // figma.currentPage.selection → Gives you an array of selected layers (frames, groups, text, shapes, etc.).
  // const selection = ... → Stores the selected layers in a variable called selection.
  const selection = figma.currentPage.selection;

  //4. safety if no slection made returns no value so our ui won't update
  if (selection.length === 0) {
    figma.ui.postMessage(null);
    return;
  }
  // 5.) figma.currentpage.selection is an array of values so we take the first value in the selection only to keep the tool simple
  const node = selection[0];

  //6.) this line calls a function "getParentSize(node)" which returns the width and height values
  const { width: parentWidth, height: parentHeight , fontSize: parentFontSize} = getParentSize(node);

  //8.) this obejct contains the boxModel properties for our plugin
  const boxModel = {
    name: node.name,
    type: node.type,
    width: convertUnits(node.width, parentWidth, selectedUnit, parentFontSize),
    height: convertUnits(node.height, parentHeight, selectedUnit, parentFontSize),
    margin: {
      top: convertUnits(getMargin(node).top, parentHeight, selectedUnit, parentFontSize),
      right: convertUnits(getMargin(node).right, parentWidth, selectedUnit, parentFontSize),
      bottom: convertUnits(getMargin(node).bottom, parentHeight, selectedUnit, parentFontSize),
      left: convertUnits(getMargin(node).left, parentWidth, selectedUnit, parentFontSize),
    },
    padding: {
      top: convertUnits(getPadding(node).top, parentHeight, selectedUnit, parentFontSize),
      right: convertUnits(getPadding(node).right, parentWidth, selectedUnit, parentFontSize),
      bottom: convertUnits(getPadding(node).bottom, parentHeight, selectedUnit, parentFontSize),
      left: convertUnits(getPadding(node).left, parentWidth, selectedUnit, parentFontSize),
    },
    border: {
      weight:convertUnits(getBorder(node).weight, parentHeight, selectedUnit, parentFontSize),
      style:getBorder(node).style
    },
  };
  // 26.) This sends data from the Figma plugin's backend (code.ts) to the frontend (UI panel).
  figma.ui.postMessage(boxModel);
}

// 1.) Detect selection changes
// this detects selction and triggers the ---> HandleSlectionChange function
figma.on("selectionchange", handleSelectionChange);

//33.) Listen for unit change messages from the UI
figma.ui.onmessage = (msg) => {
  //34.) based on unit selected from tab menu
  if (msg.type === "updateUnit") {
   selectedUnit = msg.unit; // Update unit globally
    // 35.) trigger selection change function 
    // figma.notify(`Unit changed to ${selectedUnit}`);
    handleSelectionChange();
  }
  if(msg === "resetSelection") {
    console.log("<<<<<------Reset Message Received------->>>")
    figma.currentPage.selection = [];
    figma.ui.postMessage({type: "resetSelection"});
  }

};



