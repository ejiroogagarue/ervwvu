
figma.showUI(__html__);
figma.ui.resize(500,500);

function getMargin(node:SceneNode) {
  if(!node.parent || !("children" in node.parent)) return {top: 0, right:0, bottom: 0, left:0};
  const parent = node.parent;
}
//Detect when a user selects a layer 
figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  if(selection.length !== 1) {
    figma.ui.postMessage(null);
    return;
  }

  const node = selection[0];
  console.log("Selected Node:", node); // Debugging - see full node properties
  // Check if `type` exists
  if(!("type" in node)) {
    console.error("Error: node.type is undefined. Node details:", node);
    figma.ui.postMessage({error: "Selected layer has no type."});
    return;
    
  }
  // Send basic info to UI
  figma.ui.postMessage({
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
  });
});



// <<<<<------- VERSION 01 ------->>>>>>>>
// let selectedUnit = "px"; //Default to pixels (Later, update dynamically from UI)

// function convertUnits(value: number, parentSize: number, unit: string, node?: SceneNode): string {
//   let rootFontSize = 16;// Default root font size
//   let parentFontSize = 16;// Default for em
//   let computedParentSize = parentSize; // Ensure we're referencing the correct parent width 

//   // Find the closet root-levle frame for rem (avoiding DocumentNode issues)

//   let root: SceneNode | null = node || null;
//   while(root?.parent && root.parent.type !== "DOCUMENT") {
    
//     if("fontSize" in root.parent && typeof root.parent.fontSize === "number") {
//         rootFontSize = root.parent.fontSize;
//         break;
//     }
//     root = root.parent as SceneNode; // Ensure we only assign valid SceneNode
//   }

//   // Find the parent font size for em (if applicable)
//   if(node?.parent && "fontSize" in node.parent && typeof node.parent.fontSize === "number") {
//     parentFontSize = node.parent.fontSize;
//   }

//   // Ensure parent size for % calculations is valid
//   if(computedParentSize || computedParentSize <=0 ) {
//     computedParentSize = value; // Fallback: prevent division by zero
//   }

//   switch(unit) {
//     case "px":
//       return `${value}px`;
//     case "%":
//       return `${((value/ computedParentSize) * 100).toFixed(2)}%`;
//     case "rem":
//       return `${(value/rootFontSize).toFixed(2)}rem`;// Assuming base font size = 16px;
//     case "em":
//       return `${(value / parentFontSize).toFixed(2)}em`;// Relative to element font size
//     default:
//       return `${value}px`; // Fallback to pixels 

//   }
// }
// function getPadding(node: SceneNode) {
//   //Auto Layout Frames: Use built-in padding values
//   if("layoutMode" in node && node.layoutMode !== "NONE") {
//       return {
//         top: node.paddingTop || 0,
//         right: node.paddingRight || 0,
//         bottom: node.paddingBottom || 0,
//         left: node.paddingBottom || 0,
//       };
//   }

//   // Frames & Groups: Measure padding by finding space between children and parent edges
//   if("children" in node && node.children.length >0) {
//     let minX = Infinity, minY=Infinity, maxX = -Infinity, maxY= -Infinity;

//     node.children.forEach(child => {
//       if("x" in child && "y" in child && "width" in child && "height" in child) {
//         minX = Math.min(minX, child.x);
//         minY = Math.min(minY, child.y);
//         maxX= Math.max(maxX, child.x + child.width);
//         maxY = Math.max(maxY, child.y + child.height);
//       }
//     });

//     return {
//       top: Math.max(0,minY),
//       right: Math.max(0, node.width - maxX),
//       bottom: Math.max(0, node.height - maxY),
//       left: Math.max(0, minX)
//     };
//   }

//   // Default: no padding for floating elements
//   return { top: 0, right: 0, bottom: 0, left: 0};
// }


// // 7.)  function getMargin is passed a value node -> with object "SceneNode" from figma
// function getMargin(node: SceneNode) {

//   // 8.)  if node has no parent or children in node parent return "top: 0, right: 0, bottom: 0, left:0"
//   if(!node.parent || !("children" in node.parent)) return {top: 0, right: 0, bottom: 0, left:0};
//   //9. )  pass the node.parent object property to a "parent" variable 
//   const parent = node.parent;
//   // 10.) if the parent.children id's are not equal they will be saved in the "Parent.children array "
//   const siblings = parent.children.filter(n => n.id !== node.id && "x" in n && "y" in n);
//   // 11.) This line sets up varaiables to store the smallest margin values we find when checking a layer's spacing
//   // we start at infintiy because we need to find the smallest margin
//   // If we started at 0 the margin would always stay 0
//   let topMargin = Infinity, bottomMargin= Infinity, leftMargin=Infinity, rightMargin=Infinity;
  

// // 12.) -> It loops through every "sibling" block (other layers in the same Figma group or frame).
// // -> It checks their position compared to the selected block.
// // -> It calculates the smallest margin (distance) in all four directions:
//   siblings.forEach(sibling => {
//     if("x" in siblings && "y" in sibling && "width" in sibling && "height" in sibling) {
//       if (sibling.y + sibling.height <= node.y) {
//         topMargin = Math.min(topMargin, node.y -(sibling.y + sibling.height));
//       }
//       if(sibling.y >= node.y + node.height) {
//         bottomMargin = Math.min(bottomMargin, sibling.y - (node.y + node.height));
//       }
//       if(sibling.x + sibling.width <= node.x) {
//         leftMargin = Math.min(leftMargin, node.x - (sibling.x + sibling.width));
//       }
//       if(sibling.x >= node.x + node.width) {
//         rightMargin = Math.min(rightMargin, sibling.x - (node.x + node.width));
//       }
//     }
//   });

//   return {
//     top: topMargin === Infinity ? 0 : topMargin,
//     bottom: bottomMargin === Infinity ? 0 : bottomMargin,
//     left: leftMargin === Infinity ? 0 : leftMargin,
//     right : rightMargin === Infinity ? 0 : rightMargin
//   };
// }

// //13.) This function takes a SceneNode (the selected layer) as an input and returns its margin relative to its parent frame.
// //  magine you have a picture frame 🖼 and you place a smaller photo inside it.
// // getMarginToFrame(node) measures the distance between the edges of the photo and the edges of the frame.
// // If the photo touches one side, the margin is 0 on that side.
// // If the photo is shifted to the center, there is space (margin) on all sides
// function getMarginToFrame(node:SceneNode) {
//   if (!("width" in node) || !("height" in node) || !node.parent || !("width" in node.parent)) return null;

//   const parent = node.parent;
//   return {
//     top: Math.max(0, node.y - parent.y),
//     right: Math.max(0,(parent.x + parent.width) - (node.x + node.width)),
//     bottom: Math.max(0,(parent.y + parent.height) - (node.y + node.height)),
//     left: Math.max(0, node.x - parent.x)
//   };
// }

// // 1.) This line of code tells figma to run a function whenever the user selects or deselects a layer
// // User selects a layer in Figma -> Figma detects the selection change. -> The function inside {...} runs automatically.
// function updateSelection() {
//   console.log("Selection changed! Running update...")
//   // 2.) This line of code gets all the layers currently selected in Figma and stores them in a varaible called "Selection"
//   // i.) "figma.currentPage" -> Referes to the page you're currently working on in Figma
//   // ii.) "".selection" -> Retrieves all the layers that are currently selected on that page.
//   // iii.) "const selection= ..." -> Saves the selected layers into a variable called selction so we can use them in our code.
//   // It produces an Array Like Below |
//   //                                 v
//   // 
//   // [                               
//   //   { id: "123", name: "Rectangle 1", width: 100, height: 50 },
//   //   { id: "456", name: "Rectangle 2", width: 200, height: 100 }
//   // ]
//   const selection = figma.currentPage.selection;
//   // 3.) this checks the length of the array and returns null 
//   if(selection.length !== 1) {
//     // This line sends a message from the Figma plugin’s main code (backend) to the UI (frontend), but with a null value
//     figma.ui.postMessage(null);
//     return;
//   }
//    // 4.) this takes the first node value selected 
//   const node = selection[0];
//    // 5.) This code section  determines what type of layer is selected in Figma and stores it in the layerType variable
//    // The  code section is important becaue the plugin needs to know what type of layer it’s working with to measure margins correctly.
//   let layerType = "Other";// default value in case it's not a Frame Group or Auto Layout
//   if (node.type === "FRAME") layerType = "Frame"; // Check to see if the layer is a "Frame". 
//   if(node.type === "GROUP") layerType = "Group"; // Check to see if the layer is a "Group".
//   if("layoutMode" in node && node.layoutMode !== "NONE") layerType = "Auto Layout"; // f the layer has layoutMode and it's not "NONE", it means Auto Layout is enabled

//   // 6.) run getMargin(...) function pass the node value 
//   const margin = getMargin(node);
//   const marginToFrame = getMarginToFrame(node);
 
// // 14.) Ensures that if a layer is inside a frame, we use the correct frame-based margin.
// // If a layer is floating or grouped, it still gets valid sibling-based margin values.
// // Prevents errors where the margin calculation might return null
// // Note: It prioritizes marginToFrame, but if that’s unavailable, it falls back to margin.

//   const finalMargin = marginToFrame || margin;

//   //Apply margin collapsing (like Webflow)
//   // This modifies the finalMargin values to prevent negative margins and ensure correct behavior when two margins collapse.
//   // In CSS/Webflow, when two margins touch (e.g., margin-bottom of one element and margin-top of another), only the largest margin applies, instead of adding them together.
//   // Instead of adding both margins together, CSS takes only the largest margin.
//   const collapsedMargin = {
//     top: Math.max(finalMargin.top,0),
//     right: Math.max(finalMargin.right, 0),
//     bottom: Math.max(finalMargin.bottom, 0),
//     left: Math.max(finalMargin.left,0),
//   };



//   // convert margin and padding to selected unit 
//   const convertedMargin = {
//     top: convertUnits(collapsedMargin.top,node.width, selectedUnit, node),
//     right:  convertUnits(collapsedMargin.right, node.width,selectedUnit, node),
//     bottom: convertUnits(collapsedMargin.bottom, node.width,selectedUnit, node),
//     left: convertUnits(collapsedMargin.left,node.width,selectedUnit, node),
//   };

//   const convertedPadding = {
//     top: convertUnits(getPadding(node).top, node.width, selectedUnit, node),
//     right: convertUnits(getPadding(node).right, node.width, selectedUnit, node),
//     bottom: convertUnits(getPadding(node).bottom, node.width,selectedUnit, node),
//     left: convertUnits(getPadding(node).left, node.width, selectedUnit, node),
//   }
//   // final marginData 
//   const marginData = {
//     name: node.name,
//     layerType: layerType,
//     width: node.width,
//     height: node.height,
//     x: node.x,
//     y: node.y,
//     margin: convertedMargin,
//     padding: convertedPadding,
//     unit: selectedUnit,
//   };
  
//   console.log("Sending Data to UI:", marginData);
//   figma.ui.postMessage(marginData);
// };


// figma.on("selectionchange", updateSelection);

// //Reset button clears selection 
// figma.ui.onmessage = (msg) => {

//   console.log("Message received from UI:", msg);

//   if(msg.type === "updateUnit") {

//     selectedUnit= msg.unit; // update unit globally
//     figma.notify(`Unit changed to: ${selectedUnit}`);
//     updateSelection(); // Ensure selection is updated immediately
//   }

//   // if(msg=== "refreshSelection") {
//   //   //Trigger selection update immediately
//   //   figma.on("selectionchange", updateSelection);
//   // }

//   if(msg==="resetSelection") {
//     figma.currentPage.selection = [];
//     figma.ui.postMessage(null);
//   }
// };































// // <-----BOX MODEL------->
// // function getBoxModel(node: SceneNode) {
// //   if(!("width" in node) || !("height" in node)) return null;

// //   let padding = { top: 0, right: 0, bottom:0, left: 0};
// //   let margin = {top:0, right: 0, bottom:0, left:0} ;
// //   let border = ("strokeWeight" in node) ? node.strokeWeight : 0;

// //   // Detect layer Type
// //   let layerType = "Other";
// //   if (node.type === "FRAME") layerType = "Frame";
// //   if (node.type === "GROUP") layerType = "Group";
// //   if("layoutMode" in node && node.layoutMode !== "NONE") layerType = "Auto Layout";
// //   if(node.type === "COMPONENT") layerType = "Component";

// //   //Extract Padding (if Auto Layout)
// //   if("paddingTop" in node) {
// //     padding = {
// //       top: node.paddingTop,
// //       right: node.paddingRight,
// //       bottom: node.paddingBottom,
// //       left: node.paddingLeft
// //     }; 
// //   }

// //   // Extract Margin (Calculate distance from nearest siblings)
// //   if (node.parent && "children" in node.parent) {
// //     const siblings = node.parent.children.filter(n=> n.id !== node.id && "x" in n && "y" in n);
// //     let topMargin = Infinity,bottomMargin= Infinity, leftMargin=Infinity, rightMargin=Infinity;

// //     siblings.forEach(sibling => {
// //       if("x" in sibling && "y" in sibling && "width" in sibling && "height" in sibling) {
// //         if(sibling.y + sibling.height <= node.y) {
// //           topMargin = Math.min(topMargin, node.y - (sibling.y + sibling.height));
// //         }
// //         if (sibling.y >= node.y + node.height) {
// //           bottomMargin = Math.min(leftMargin, node.x - (sibling.x + sibling.width));
// //         }
// //         if (sibling.x >= node.x + node.width) {
// //           rightMargin = Math.min(rightMargin, sibling.x - (node.x + node.width));
// //         }
// //       }
// //     });

// //     margin = {
// //       top: topMargin === Infinity ? 0 : topMargin,
// //       bottom: bottomMargin === Infinity ? 0 : bottomMargin,
// //       left: leftMargin === Infinity ? 0 : leftMargin,
// //       right: rightMargin === Infinity ? 0 : rightMargin
// //     };
// //   }
// //   return {
// //     name: node.name,
// //     layerType: layerType,
// //     width: node.width,
// //     height: node.height,
// //     padding: padding,
// //     margin: margin,
// //     border: border
// //   };

// // }

// // figma.on("selectionchange", () => {
// //   const selection = figma.currentPage.selection;
// //   if(selection.length !== 1) {
// //     figma.ui.postMessage(null);
// //     return;
// //   }

// //   const boxModel = getBoxModel(selection[0]);
// //   figma.ui.postMessage(boxModel);
// // });

// // // Handle Reset Selction 
// // figma.ui.onmessage = (msg) => {
// //   if(msg === "resetSelection") {
// //     figma.currentPage.selection = [];
// //     figma.ui.postMessage(null);
// //   }
// // };

// // Layer Type IDENTIFIER 

// // function getLayerType(node: SceneNode) {
// //   if(node.type === "GROUP") return "Group";
// //   if(node.type === "FRAME") return "Frame";
// //   if("layoutMode" in node && node.layoutMode !== "NONE") return "Auto Layout";
// //   if(node.type === "COMPONENT") return "Component";
// //   if(node.type === "INSTANCE") return "Component Instance";
// //   if (node.type === "TEXT") return "Text";
// //   return "Other"; // default fallback for unsupported types 
// // }

// // figma.on("selectionchange", () => {
// //   const selection = figma.currentPage.selection;

// //   if(selection.length !== 1) {
// //     figma.ui.postMessage(null);
// //     return;
// //   }

// //   const node = selection[0];

// //   const layerData = {
// //     name: node.name,
// //     type: node.type,
// //     layerCategory: getLayerType(node),
// //     width: node.width,
// //     height: node.height
// //   };

// //   figma.ui.postMessage(layerData);
// // });

// // // Handle reset button 
// // figma.ui.onmessage = (msg) => {
// //   if(msg === "resetSelection") {
// //     figma.currentPage.selection = [];
// //     figma.ui.postMessage(null);
// //   }
// // }

// // // Unit Converter 
// // const BASE_FONT_SIZE =16; // 1rem = 16px
// // const VIEWPORT_WIDTH = 1920; // Default viewport width for vw 
// // const VIEWPORT_HEIGHT = 1080; // Default viewport height for vh

// // function convertUnits(node: SceneNode) {
// //   if(!("width" in node) || !("height" in node)) return null;

// //   const parent = node.parent as FrameNode | null;
// //   const parentWidth = parent ? parent.width : VIEWPORT_WIDTH;
// //   const parentHeight = parent ? parent.height : VIEWPORT_HEIGHT;

// //   return {
// //     name: node.name,
// //     type: node.type,
// //     px: `${node.width}px, ${node.height}px`,
// //     "%": `${((node.width / parentWidth)*100).toFixed(2)}%, ${((node.height/parentHeight)*100).toFixed(2)}%`,
// //     rem: `${(node.width / BASE_FONT_SIZE).toFixed(2)}rem, ${(node.height/ BASE_FONT_SIZE).toFixed(2)}rem`,
// //     em:  `${(node.width / BASE_FONT_SIZE).toFixed(2)}em, ${(node.height / BASE_FONT_SIZE).toFixed(2)}em`,
// //     vw: `${((node.width / VIEWPORT_WIDTH) * 100).toFixed(2)}vw, ${(node.height / VIEWPORT_HEIGHT * 100).toFixed(2)}vh`,
// //     vh: `${((node.height / VIEWPORT_HEIGHT)* 100).toFixed(2)}vh`

// //   };
// // }

// // figma.on("selectionchange", () => {
// //   const selection = figma.currentPage.selection;
// //   if(selection.length === 1) {
// //     figma.ui.postMessage(convertUnits(selection[0]));
// //   } else {
// //     figma.ui.postMessage(null);
// //   }
// // });

// // figma.ui.onmessage = (msg) => {
// //   if(msg === 'resetSelection') {
// //     figma.currentPage.selection = [];
// //     figma.ui.postMessage(null);
// //   }
// // }
