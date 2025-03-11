// THINGS TO NOTE 
// figma.ui -> Refers to the user interface window of the plugin.
// .resize(width, height) -> Changes the width and height of the UI window.
// figma.on(...) -> This tells figma to wathc for an event 
// "selectionchange" -> the event we're watching for:
// figma.currentPage -> Refers to the current Figma page the user is working on.
// .selection -> Gets all layers (objects) the user has selected on the canvas.
// figma.currentPage.selection; -> this is a readonly array. That stores all the layers the user has selected in a special figma array.
// SceneNode -> represents any layer (object) in a Figma file—like a rectangle, text, image, frame, or group. When you select something in Figma, each selected item is a SceneNode object. very layer in Figma is a SceneNode


figma.showUI(__html__) // this opens the figma plugin UI (in this case a small window in Figma )
figma.ui.resize(500,500);// this line changes the size of the plugin window inside Figma 



let selectedLayers: SceneNode[] = [];// empty variable that accesses figmas SceneNode object
figma.on("selectionchange", () => {
  const currentSelection = Array.from(figma.currentPage.selection);
  // remove layers that are no longer selected
  selectedLayers = selectedLayers.filter(layer => currentSelection.some(s=> s.id === layer.id));

  // Add newly selected layers to the list
  currentSelection.forEach(layer => {
    if(!selectedLayers.some(s => s.id === layer.id)) {
      selectedLayers.push(layer);
    }
  });

  // Send the updated list to the UI
  figma.ui.postMessage({
    layers: selectedLayers.map(layer => `${layer.name} (X:${layer.x}, Y:${layer.y}, W:${layer.width}, H:${layer.height})`)
  });
});

//Handle reset selection 
figma.ui.onmessage = (msg) => {
  if(msg === "resetSelection") {
    selectedLayers = [];
    figma.ui.postMessage({layers: []});
    figma.currentPage.selection = []; //Clear selection
  }
}
// Version three "Select any layers "
// figma.on("selectionchange", () => {
//   const selection = figma.currentPage.selection;
//   if(selection.length === 0) {
//     figma.ui.postMessage({ message: "No layers selected. Please select at least one layer."});
//     return;
//   }

//   let layerDetails = selection.map(layer => `Name: ${layer.name}, Type: ${layer.type}, X: ${layer.x}, Y: ${layer.y}, Width: ${layer.width}, Height: ${layer.height}`).join("\n");
//   figma.ui.postMessage({ message: `Selected Layers:\n${layerDetails}`});
// });

// // Reset slection if the user clicks "Reset"
// figma.ui.onmessage = (msg) => {
//   if(msg === "resetSelection") {
//     figma.currentPage.selection = []; // Clear selection
//     figma.ui.postMessage({ message: " Selection reset. Please select layers again."})
//   }
// }





// Version two "Select layer store in box select next layer "

// these two lines are empty variables to store the user's selected layers in figma.
// they are memory slots to save the layers you select 
// let layerOne: SceneNode | null = null;
// let layerTwo: SceneNode | null = null;

// // this line listens for when the user selects something in figma and run code whenever the selection changes.
// figma.on("selectionchange", () => {
//   // this gets the layers that the user has currenlty selected in Figma and stores them in a variable called "selection"
//   const selection = figma.currentPage.selection;
//   if(selection.length === 1) {
//     const selectedLayer = selection[0];
    
//     if(!layerOne) {
//       layerOne = selectedLayer;
//       figma.ui.postMessage({ message: `Layer 1 selected: ${layerOne.name}, ${layerOne.type}, ${layerOne.x}, ${layerOne.y}, ${layerOne.width}, ${layerOne.height}. Now select Layer 2.`});
//     } else if(!layerTwo && selectedLayer !== layerOne) {
//       layerTwo = selectedLayer;
//       figma.ui.postMessage({message: `Layer 2 selected: ${layerTwo.name}. Both layers selected!`})
//     }
//   }
// });

// figma.ui.onmessage = (msg) => {
//   console.log("Received message from UI:", msg); // Debugging log

//   if(msg === "resetSelection") {
//     layerOne = null;
//     layerTwo=null;
//     figma.ui.postMessage({message: "Selection reset. Select Layer 1 again."})
//   }
// }




// Version One Single Selection

// let selectedNode: SceneNode | null = null;
// figma.on("selectionchange", () => {
//   const selection = figma.currentPage.selection;
//   if(selection.length === 1) {
//     selectedNode = selection[0]; // Store selected layer
//     figma.ui.postMessage(`✅ Selected: ${selectedNode.name}`);
//   } else {
//     selectedNode = null;
//     figma.ui.postMessage("❌ Select layer One.");
//   }
// })