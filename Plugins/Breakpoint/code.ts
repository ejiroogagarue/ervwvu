/* VERSION ONE PLUGIN – Pinned UI + Breakpoint Copy + Moves with Frame
   This code:
   1) Creates a pinned UI if exactly one Frame is selected.
   2) Copies layers for each new Breakpoint.
   3) Stays visible until the user clicks "Close".
   4) Uses a documentchange event to keep the pinned UI above the frame.
   5) No auto-scaling or highlight – user manually adjusts.

   In your tsconfig.json, ensure skipLibCheck or remove lib.dom to avoid conflicts.
*/

let floatingUI: FrameNode | null = null; // decalre global variable floatingUI
let pinnedFrameId: string | null = null; // declared Global variable piined frame
const breakpointsMap = new Map<string, FrameNode>(); //Stores newly-created frames for each Breakpoint

// Keep track of the frame's last known position for movement checks
let lastFrameX: number | null = null;
let lastFrameY: number | null = null;

////////////////////////////////////////////////////////
// 1.) PLUGIN ENTRY
////////////////////////////////////////////////////////
/**
 *  we declare an "async" function
 * -> this sort of function allows things to run in the background without blocking other code
 * -> So any tasks that takes time to complete can "wait"
 */
async function main() {
  // 2.) Required if you want to use 'documentchange" in incremental mode
  /** Figma doesn't automatically load all pages when a plugin starts so to be memort efficinet
   * we use this function , it allows our plugin to tracj changes across all pages without
   * loading everything at once.
   *
   */
  await figma.loadAllPagesAsync();

  // 3. Register "selectionchange"
  // figma.on("selectionchange", onSelectionChange);
  // Debug Test 3.1
  figma.on("selectionchange", async () => {
    console.log("[Debug] Selection changed");
    await onSelectionChange();
  });

  // 4. Register "documentchange" for pinned UI movement
  figma.on("documentchange", onDocumentChange);
}

main().catch((err) => {
  console.error("Error loading plugin:", err);
});

////////////////////////////////////////////////////////
// 5.) SELECTION CHANGE HANDLER
////////////////////////////////////////////////////////

async function onSelectionChange() {
  // 6.) record selection in figma
  const selection = figma.currentPage.selection;

  // 7) If no pinned UI, and user selected exactly 1 Frame => create pinned UI
  if (!floatingUI && selection.length === 1 && selection[0].type === "FRAME") {
    console.log("[Selection] Creating Floating UI for:", selection[0].name);
    // 8.) Create Floating ui function is called
    //Load font before UI creation
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await createFloatingUI(selection[0] as FrameNode);
    return;
  }

  // 19) If we do have a pinned UI, see if user clicked a tab or "Close" button
  if (floatingUI) {
    /**
     * 20) This code tracks the Floating UI and its children so we can tell
     * if a user is interacting with the plugin UI or the Figma canvas. */

    const floatingUIAndChildren: string[] = [floatingUI.id];

    floatingUI
      .findAll()
      .forEach((child) => floatingUIAndChildren.push(child.id));

    for (const node of selection) {
      //20.)  Is the node or its parent a tab?
      const isNodeTab = node.getPluginData("isTab") === "true";
      const isNodeClose = node.getPluginData("isCloseButton") === "true";

      let isTab = isNodeTab;
      let isClose = isNodeClose;
      let label: string | null = null;
      let widthStr: string | null = null;

      console.log(
        "[Selection] Node:",
        node.name,
        "isTab?",
        isTab,
        "isClose?",
        isClose,
        "label:",
        label,
        "widthStr:",
        widthStr
      );

      //21.) If node isn't a tab or close button, check parent
      /**
       * This code checks if the selected element is inside a Frame and inherits data from its parent.
        If the parent is a Breakpoint Tab, it retrieves its label and width.
         If the parent is the Close Button, it marks it as such.
       👉 This ensures that clicking on a tab's child element (like text) still counts as selecting the tab itself.
       */
      if (!isTab && !isClose && node.parent) {
        const parent = node.parent;
        if (parent.type === "FRAME") {
          const parentIsTab = parent.getPluginData("isTab") === "true";
          const parentIsClose =
            parent.getPluginData("isCloseButton") === "true";
          isTab = parentIsTab;
          isClose = parentIsClose;

          if (parentIsTab) {
            label = parent.getPluginData("breakpoint");
            widthStr = parent.getPluginData("width");
          } else if (parentIsClose) {
            // It's the close button if the parent says so
          }
        }
      } else if (isTab) {
        // The node itself is the tab
        label = node.getPluginData("breakpoint");
        widthStr = node.getPluginData("width");
      }
      // If user selected the close button
      if (isClose) {
        console.log("[Selection] Close button clicked. Removing Floating UI.");
        removeFloatingUI();
        return;
      }
      // If user selected a tab
      if (isTab && label && widthStr) {
        console.log("[Selection] Switching to Breakpoint:", {
          label,
          widthStr,
        });
        const widthNum = parseInt(widthStr, 10);
        // 22.) this triggers the switchToBreakpoint function
        await switchToBreakpoint(label, widthNum);
        return;
      }

      // If user selected something else in the UI, do nothing
      if (floatingUIAndChildren.includes(node.id)) {
        return;
      }
    }
  }
  // In this pinned approach, we do not remove the UI if the user selects something else.
  // The UI only goes away if "Close" is selected.
}

////////////////////////////////////////////////////////
// DOCUMENT CHANGE HANDLER - move pinned UI if the frame moves
////////////////////////////////////////////////////////

async function onDocumentChange(changes: DocumentChangeEvent) {
  // If there's no inned frame, or no floating UI, we skip
  if (!pinnedFrameId || !floatingUI) return;

  // Get the pinned frame
  const pinnedFrame = (await figma.getNodeByIdAsync(
    pinnedFrameId
  )) as FrameNode | null;
  if (!pinnedFrame) return; // The pinned frame might be gone

  // If we haven't tracked position before, store it
  if (lastFrameX === null || lastFrameY === null) {
    lastFrameX = pinnedFrame.x;
    lastFrameY = pinnedFrame.y;
    return;
  }

  // Check if pinnedFrame.x / pinnedFrame.y changed
  if (pinnedFrame.x !== lastFrameX || pinnedFrame.y !== lastFrameY) {
    // Update floatingUI position
    floatingUI.x = pinnedFrame.x;
    floatingUI.y = pinnedFrame.y - 50;

    // Update last known coords
    lastFrameX = pinnedFrame.x;
    lastFrameY = pinnedFrame.y;
  }
}

////////////////////////////////////////////////////////
// CREATE THE PINNED UI
////////////////////////////////////////////////////////

async function createFloatingUI(targetFrame: FrameNode) {
  // 9.) Check if the target frame still exists
  /**
   * i.) TargetFrame.id -> Retrieves the unique ID of the frame the suer selected.
   * ii.) figma.getNodeByIdAsync(id) -> Finds a node asynchronously by its ID.
   * iii.) await -> Ensures the function waits for Figma to return the node before continuing
   */
  const checkNode = await figma.getNodeByIdAsync(targetFrame.id);
  if (!checkNode) {
    console.error("[FloatingUI] Target frame no longer in document.");
    return;
  }

  // 10.) Capture frame geometry to place the UI above
  const frameX = targetFrame.x;
  const frameY = targetFrame.y;
  const frameWidth = targetFrame.width;

  //11. Remove existing UI if any
  if (floatingUI && floatingUI.parent) {
    floatingUI.remove();
    floatingUI = null;
    pinnedFrameId = null;
    breakpointsMap.clear();
  }

  //12.) Create a new UI
  floatingUI = figma.createFrame();
  floatingUI.name = "Floating UI (Pinned)";
  floatingUI.resize(frameWidth, 40);
  floatingUI.x = frameX;
  floatingUI.y = frameY - 50;
  floatingUI.fills = [
    { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.9 },
  ];
  floatingUI.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
  floatingUI.cornerRadius = 8;

  figma.currentPage.appendChild(floatingUI);
  pinnedFrameId = targetFrame.id;
  lastFrameX = targetFrame.x;
  lastFrameY = targetFrame.y;

  //13.) Build the segmented Menu
  await createSegmentedMenu(targetFrame);
}

////////////////////////////////////////////////////////
// CREATE THE SEGMENTED MENU (BREAKPOINT TABS + CLOSE)
////////////////////////////////////////////////////////

async function createSegmentedMenu(targetFrame: FrameNode) {
  if (!floatingUI) return;

  //14.)Clear prior children
  floatingUI.children.forEach((child) => child.remove());

  // 15.) Menu Container
  const menuContainer = figma.createFrame();
  menuContainer.name = "Menu Container";
  menuContainer.layoutMode = "HORIZONTAL";
  menuContainer.primaryAxisSizingMode = "AUTO";
  menuContainer.counterAxisSizingMode = "AUTO";
  menuContainer.paddingLeft = 10;
  menuContainer.paddingRight = 10;
  menuContainer.itemSpacing = 10;
  menuContainer.fills = [
    { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0 },
  ];
  menuContainer.strokes = [
    { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.2 },
  ];
  menuContainer.cornerRadius = 8;
  floatingUI.appendChild(menuContainer);

  // 16. Breakpoints data
  const breakpoints = [
    { label: "Mobile", icon: "📱", width: 375 },
    { label: "Tablet", icon: "📊", width: 768 },
    { label: "Desktop", icon: "💻", width: 1280 },
    { label: "Large Desktop", icon: "🖥", width: 1920 },
  ];
  // 17.) Show breakpoints in menu
  breakpoints.forEach(({ label, icon, width }) => {
    const tab = figma.createFrame();
    tab.name = `${label} Tab`;
    tab.layoutMode = "HORIZONTAL";
    tab.primaryAxisSizingMode = "AUTO";
    tab.counterAxisSizingMode = "AUTO";
    tab.paddingLeft = 8;
    tab.paddingRight = 8;
    tab.paddingTop = 4;
    tab.paddingBottom = 4;
    tab.cornerRadius = 6;
    tab.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
    tab.resize(100, 30);
    tab.setPluginData("isTab", "true");
    tab.setPluginData("breakpoint", label);
    tab.setPluginData("width", width.toString());

    const text = figma.createText();
    text.characters = `${icon} ${label}`;
    text.fontSize = 12;
    text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    // text.setPluginData("isTab", "true");
    // text.setPluginData("breakpoint", label);
    // text.setPluginData("width", width.toString());
    tab.appendChild(text);

    menuContainer.appendChild(tab);
    console.log("[createSegmentedMenu] Tab Created:", label, "Width:", width);
  });

  // 18.) Close Button for floating ui
  const closeBtn = figma.createFrame();
  closeBtn.name = "Close Button";
  closeBtn.layoutMode = "HORIZONTAL";
  closeBtn.primaryAxisSizingMode = "AUTO";
  closeBtn.counterAxisSizingMode = "AUTO";
  closeBtn.paddingLeft = 8;
  closeBtn.paddingRight = 8;
  closeBtn.paddingTop = 4;
  closeBtn.paddingBottom = 4;
  closeBtn.cornerRadius = 6;
  closeBtn.fills = [
    { type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.6 },
  ];
  closeBtn.setPluginData("isCloseButton", "true");

  const closeText = figma.createText();
  closeText.characters = "Close";
  closeText.fontSize = 12;
  closeText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  closeBtn.appendChild(closeText);

  menuContainer.appendChild(closeBtn);
}

////////////////////////////////////////////////////////
// REMOVE THE PINNED UI
///////////////////////////////////////////////////////

function removeFloatingUI() {
  if (floatingUI && floatingUI.parent) {
    floatingUI.remove();
  }
  floatingUI = null;
  pinnedFrameId = null;
  breakpointsMap.clear();

  lastFrameX = null;
  lastFrameY = null;
}

////////////////////////////////////////////////////////
// SWITCH TO BREAKPOINT (COPY LAYERS IF NEEDED)
////////////////////////////////////////////////////////

async function switchToBreakpoint(label: string, width: number) {
  if (!pinnedFrameId) {
    console.warn("No pinned Frame to copy from.");
    return;
  }
  console.log(`Switching/Creating Breakpoint: ${label} (${width}px)`);
  const pinnedFrame = (await figma.getNodeByIdAsync(
    pinnedFrameId
  )) as FrameNode | null;
  if (!pinnedFrame) {
    console.warn("Pinned frame no longer exists.");
    return;
  }
  if (!pinnedFrame) {
    console.warn(
      "⚠️ [switchToBreakpoint] Pinned frame no longer exists. Aborting switch."
    );
    return;
  }

  console.log(
    `✅ [switchToBreakpoint] Pinned Frame Found: ${pinnedFrame.name}`
  );

  // 1) If we already created it, show it & hide others
  if (breakpointsMap.has(label)) {
    const existingFrame = breakpointsMap.get(label)!;
    existingFrame.visible = true;

    // Hide others
    breakpointsMap.forEach((f, k) => {
      if (k !== label) f.visible = false;
    });

 
    return;
  }

  // 2) otherwise, create a new Frame & copy layers
  const newFrame = figma.createFrame();
  newFrame.name = `${pinnedFrame.name} - ${label}`;
  newFrame.resize(width, pinnedFrame.height);
  newFrame.x = pinnedFrame.x + 300; // Offset so we can see it
  newFrame.y = pinnedFrame.y;
  newFrame.layoutMode = pinnedFrame.layoutMode;
  newFrame.fills = JSON.parse(JSON.stringify(pinnedFrame.fills));

  // Naive copy of children
  pinnedFrame.children.forEach((child) => {
    if ("clone" in child && typeof child.clone === "function") {
      const clonedChild = child.clone() as SceneNode;
      newFrame.appendChild(clonedChild);
    }
  });
  // Remove pinnedFrame from the canvas 
 
  figma.currentPage.appendChild(newFrame);
  archiveFrame(pinnedFrame); // Moves it out of sight 
  breakpointsMap.set(label, newFrame);

  //Hide others
  breakpointsMap.forEach((f, k) => {
    if (k !== label) f.visible = false;
  });
}

function archiveFrame(pinnedFrame: FrameNode) {
  const hiddenPage = ensureHiddenPage();
  hiddenPage.appendChild(pinnedFrame)
}

function ensureHiddenPage(): PageNode {
  // Find if we alread created a hidden page
  const hiddenPage = figma.root.children.find(
    (child) => child.type === "PAGE" && child.name === "_Archived"
  ) as PageNode | undefined;

  if(hiddenPage) {
    return hiddenPage;
  }

  //Otherwise, create a new one
  const newPage = figma.createPage();
  newPage.name="_Archived";
  return newPage;
}

// //------------------------------------
// // 5) Listen for selectionchange
// //   - Create UI if exactly 1 frame is selected
// //   - If user selected a tab => switchToBreakpoint
// //   - If user selected Close => remove UI
// //   - Otherwise do nothing
// //------------------------------------
// figma.on("selectionchange", async () => {
//   const selection = figma.currentPage.selection;

//   // If no UI yet, exactly 1 frame => create pinned UI
//   if (!floatingUI && selection.length === 1 && selection[0].type === "FRAME") {
//     await createFloatingUI(selection[0] as FrameNode);
//     return;
//   }

//   // if we do have a floating UI , check if user clicked tab or close
//   if (floatingUI) {
//     const ids: string[] = [floatingUI.id];
//     floatingUI.findAll().forEach((child) => ids.push(child.id));

//     for (const node of selection) {
//       if (ids.includes(node.id)) {
//         // 1) Close Button
//         if (node.getPluginData("isCloseButton") === "true") {
//           removeFloatingUI();
//           return;
//         }
//         // 2) Tab
//         if (node.getPluginData("isTab") === "true") {
//           const label = node.getPluginData("breakpoint");
//           const widthStr = node.getPluginData("width");
//           if (label && widthStr) {
//             const widthNum = parseInt(widthStr, 10);
//             await switchToBreakpoint(label, widthNum);
//           }
//         }
//         return; // end of for-loop
//       }
//     }
//   }
// });

// //------------------------------------
// // 6) Keep Floating UI pinned above the selected Frame
// //    Using "documentchange" event
// //------------------------------------

// figma.on("documentchange", () => {
//   if (!floatingUI || !pinnedFrameId) return;

//   const pinnedFrame = figma.getNodeById(pinnedFrameId) as FrameNode | null;
//   if (!pinnedFrame) return;

//   // If the frame moved, update the floatingUI
//   const curX = pinnedFrame.x;
//   const curY = pinnedFrame.y;

//   if (curX !== lastFrameX || curY !== lastFrameY) {
//     floatingUI.x = curX;
//     floatingUI.y = curY - 50;
//     lastFrameX = curX;
//     lastFrameY = curY;
//   }
// });

/**
 *
 * <--------------version One ---> close Button with floatingUi no logic  -------------------->
 */
// let floatingUI: FrameNode | null = null;
// let pinnedFrameId: string | null = null; // we'll store the Frame ID  to remeber whihc Frame the Ui was made for

// /**
//  * Creates the segments menu (tabs) inside the floating UI.
//  * This function is called from createFloatingUI().
//  */

// async function createSegmentedMenu(targetFrame: FrameNode) {

//   if(!floatingUI) return;
//   console.log(`Creating segmented menu for:${targetFrame.name}`);

//   // Remove exisiting content inside floatingUI
//   floatingUI.children.forEach((child)=> child.remove());

//   //Load font before creating text
//   await figma.loadFontAsync({ family: "Inter", style: "Regular"});

//   // Create container for segmented menu
//   const menuContainer = figma.createFrame();
//   menuContainer.name = "Segemented Menu";
//   menuContainer.layoutMode="HORIZONTAL";
//   menuContainer.primaryAxisSizingMode= "AUTO";
//   menuContainer.counterAxisSizingMode = "AUTO";
//   menuContainer.paddingLeft = 10;
//   menuContainer.paddingRight = 10;
//   menuContainer.itemSpacing = 10;
//   menuContainer.fills = [
//     {type: "SOLID", color: {r: 1, g: 1, b: 1}, opacity: 0},
//   ];
//   menuContainer.strokes = [
//     {type: "SOLID", color: { r: 0, g: 0, b: 0}, opacity: 0.2},
//   ];
//   menuContainer.cornerRadius = 8;
//   floatingUI.appendChild(menuContainer);

//   // Define breakpoints
//   const breakpoints = [
//     { label: "Mobile", icon: "📱", width: 375 },
//     { label: "Tablet", icon: "📊", width: 768 },
//     { label: "Desktop", icon: "💻", width: 1280 },
//     { label: "Large Desktop", icon: "🖥", width: 1920 },
//   ];

//   // Create one tab for each breakpoint
//   breakpoints.forEach(({label, icon, width}) => {
//     const tab = figma.createFrame();
//     tab.name = `${label} Tab`;
//     tab.layoutMode= "HORIZONTAL";
//     tab.primaryAxisSizingMode= "AUTO";
//     tab.counterAxisSizingMode = "AUTO";
//     tab.paddingLeft = 8;
//     tab.paddingRight = 8;
//     tab.paddingTop = 4;
//     tab.paddingBottom = 4;
//     tab.cornerRadius = 6;
//     tab.fills = [{ type: "SOLID", color: {r: 0.9, g: 0.9, b: 0.9}}];

//     // Store metadata
//     tab.setPluginData("isTab", "true");
//     tab.setPluginData("breakpoint", label);
//     tab.setPluginData("width", width.toString());

//     // Create text label for the tab
//     const text = figma.createText();
//     text.characters = `${icon} ${label}`;
//     text.fontSize = 12;
//     text.fills = [{type: "SOLID", color: {r: 0, g: 0, b: 0}}];
//     tab.appendChild(text);

//      // (Optional) On-click logic would go here, e.g.:
//     // tab.onClick = () => switchToBreakpoint(label, width);

//     // Finally, add the tab to the container

//     menuContainer.appendChild(tab);
//   });

//   // Finally, add a 'Close" button so user can remove the UI
//   const closeButton = figma.createFrame();
//   closeButton.name = "Close Button";
//   closeButton.layoutMode = "HORIZONTAL";
//   closeButton.primaryAxisSizingMode = "AUTO";
//   closeButton.counterAxisSizingMode = "AUTO";
//   closeButton.paddingLeft = 8;
//   closeButton.paddingRight = 8;
//   closeButton.paddingTop = 4;
//   closeButton.paddingBottom = 4;
//   closeButton.cornerRadius = 6;
//   closeButton.fills = [{type: "SOLID", color: {r: 1, g: 0, b: 0}, opacity: 0.6}];
//   closeButton.setPluginData("isCloseButton", "true");

//   const closeText = figma.createText();
//   closeText.characters = "Close";
//   closeText.fontSize = 12;
//   closeText.fills = [{type: "SOLID", color: {r: 1, g: 1, b: 1}}];
//   closeButton.appendChild(closeText);

//   menuContainer.appendChild(closeButton);
// }

// /**
//  * Switches layout to the specified breakpoint.
//  * (Currently just logs info; real logic TBD.)
//  */
// function switchToBreakpoint(label: string, width: number) {
//   console.log(`Switching to: ${label} (${width}px)`);
// }

// /**
//  * Creates the floating UI above the selected Frame,
//  * then calls createSegmentedMenu() to populate it with tabs.
//  */
// async function createFloatingUI(targetFrame: FrameNode) {
//   // Ensure the target frame still exists
//   const checkNode = await figma.getNodeByIdAsync(targetFrame.id);
//   if(!checkNode) {
//     console.error("Error: Target Frame does not exist in the document.");
//     return;
//   }

//   // Capture geometry from the target Frame right away
//   const frameX = targetFrame.x;
//   const frameY = targetFrame.y;
//   const frameWidth = targetFrame.width;

//   // Remove exisiting floating Ui if present (optional; ca only have one pinned UI)

//   if(floatingUI && floatingUI.parent) {
//     floatingUI.remove();
//     floatingUI = null;
//     pinnedFrameId= null;
//   }

//   // Create a new floating UI frame
//   floatingUI = figma.createFrame();
//   floatingUI.name = "Floating UI (pinned)";
//   floatingUI.resize(frameWidth, 40);
//   floatingUI.x = frameX;
//   floatingUI.y = frameY - 50;
//   floatingUI.fills = [
//     {type: "SOLID", color: {r:1, g: 1, b: 1}, opacity: 0.9},
//   ];
//   floatingUI.strokes = [{type: "SOLID", color: {r: 0, g: 0, b: 0}}];
//   floatingUI.cornerRadius = 8;

//   // Append to the page
//   figma.currentPage.appendChild(floatingUI);

//   //Store whihc frame the UI is pinned to
//   pinnedFrameId = targetFrame.id;

//   // Create the segmented menu inside the floating UI
//   await createSegmentedMenu(targetFrame);
// }

// /**
//  * Remove the floating UI if it exists on the canvas.
//  */
// function removeFloatingUI() {
//   if(floatingUI && floatingUI.parent) {
//     floatingUI.remove();

//   }
//   floatingUI = null;
//   pinnedFrameId = null;
// }

// /**
//  * SINGLE selectionchange listener that:
//  * 1) Creates floating UI if exactly one frame is selected.
//  * 2) Leaves the UI if the user selects the floating Ui or its children.
//  * 3) Removes the UI otherwise.
//  */
// figma.on("selectionchange", async()=> {
//   const selection = figma.currentPage.selection;

//   // 1) If exactly one Frame is selected, create the floating UI
//   if(!floatingUI && selection.length === 1 && selection[0].type === "FRAME"){
//     await createFloatingUI(selection[0] as FrameNode);
//     return;
//   }

//   // 2) if the selection includes the floating UI or any of its descendants, do Not remove it
//   if (floatingUI) {
//     // Gather all nodes under floatingUI (including floatingUI itself)
//     const floatingUIAndChildren: string[]= [floatingUI.id];
//     floatingUI.findAll().forEach((child) => floatingUIAndChildren.push(child.id));

//     // Check if user selected the close button
//     for (const node of selection) {
//       if(floatingUIAndChildren.includes(node.id)) {
//         // If the node has pluginData 'isCloseButton', remove UI
//         if(node.getPluginData('isCloseButton')=== "true") {
//           removeFloatingUI();
//           return;
//         }
//                 // (If we want tabs to trigger something else, we do it here)
//         // E.g. if (node.getPluginData('isTab') === 'true') => switchToBreakpoint...
//       }
//     }
//   }

//   // In this pinned approach, we do NOT remove the UI automatically.
//   // The user can click anywhere, the UI remains until 'Close' is pressed.

// });

// // let floatingUI: FrameNode | null = null;
// // // <---------- 1.)Code to Show Floating UI Above the Selected Frame ------->

// // // 3.) Create the Segmented Menu with Icons Inside Floating UI
// // async function createSegmentedMenu(targetFrame: FrameNode) {
// //   if (!floatingUI) return;
// //   console.log(`Creating segmented menu for: ${targetFrame.name}`);

// //   // Remove existing segmented menu if present
// //   floatingUI.children.forEach((child) => child.remove());

// //   // Load Font BEFORE creating text elements
// //   await figma.loadFontAsync({ family: "Inter", style: "Regular" });

// //   // Create container for segmented menu
// //   const menuContainer = figma.createFrame();
// //   menuContainer.name = "Segmented Menu";
// //   menuContainer.layoutMode = "HORIZONTAL";
// //   menuContainer.primaryAxisSizingMode = "AUTO";
// //   menuContainer.counterAxisSizingMode = "AUTO";
// //   menuContainer.paddingLeft = 10;
// //   menuContainer.paddingRight = 10;
// //   menuContainer.itemSpacing = 10;
// //   menuContainer.fills = [
// //     { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0 },
// //   ];
// //   menuContainer.strokes = [
// //     { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.2 },
// //   ];
// //   menuContainer.cornerRadius = 8;
// //   floatingUI.appendChild(menuContainer);

// //   //Breakpoints Data
// //   const Breakpoints = [
// //     { label: "Mobile", icon: "📱", width: 375 },
// //     { label: "Tablet", icon: "📊", width: 768 },
// //     { label: "Desktop", icon: "💻", width: 1280 },
// //     { label: "Large Desktop", icon: "🖥", width: 1920 },
// //   ];

// //   Breakpoints.forEach(({ label, icon, width }) => {
// //     const tab = figma.createFrame();
// //     tab.name = `${label} Tab`;
// //     tab.layoutMode = "HORIZONTAL";
// //     tab.primaryAxisSizingMode = "AUTO";
// //     tab.counterAxisSizingMode = "AUTO";
// //     tab.paddingLeft = 8;
// //     tab.paddingRight = 8;
// //     tab.paddingTop = 4;
// //     tab.paddingBottom = 4;
// //     tab.cornerRadius = 6;
// //     tab.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
// //     tab.setPluginData("isTab", "true");
// //     tab.setPluginData("breakpoint", label);
// //     tab.setPluginData("width", width.toString());

// //     const text = figma.createText();
// //     text.characters = `${icon} ${label}`;
// //     text.fontSize = 12;
// //     text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
// //     tab.appendChild(text);

// //     // Simulating Hover effect

// //     menuContainer.appendChild(tab);
// //   });
// // }

// // function switchToBreakpoint(label: string, width: number) {
// //   console.log(`Switching to: ${label} (${width}px)`);
// // }

// // // 2) Calls the createFloatingUI function, passing that Frame as an argument.
// // async function createFloatingUI(targetFrame: FrameNode) {
// //   if (!await figma.getNodeByIdAsync(targetFrame.id)) {
// //     console.error("Error: Target Frame does no exist in the document.");
// //     return;
// //   }

// //   // ✅ Ensure the original frame stays visible
// //   targetFrame.visible = true; // This prevents it from disappearing

// //   if (floatingUI && floatingUI.parent) floatingUI.remove(); // 2.1) Remove existing UI if already present

// //   //2.2 this block of code creates the frame giving it necessary properties
// //   floatingUI = figma.createFrame();
// //   floatingUI.name = "Floating UI";
// //   floatingUI.resize(targetFrame.width, 40); // Match width of selected Frame
// //   floatingUI.x = targetFrame.x;
// //   floatingUI.y = targetFrame.y - 50; // Position above the Frame
// //   floatingUI.fills = [
// //     { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.9 },
// //   ];
// //   floatingUI.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
// //   floatingUI.cornerRadius = 8;
// //   // 2.3) Adds the floatingUI Frame to the Figma canvas.
// //   // -> Without this, the Floating UI would not appear on the Figma workspace.
// //   figma.currentPage.appendChild(floatingUI);

// //   // 2.4.) Create the segmented menu inside Floating UI
// //   createSegmentedMenu(targetFrame);
// // }

// // // Function to remove Floating UI when no Frame is selected
// // function removeFloatingUI() {
// //   if (floatingUI && floatingUI.parent) {
// //     floatingUI.remove();
// //     floatingUI = null;
// //   }
// // }

// // //1.) Listen for selection changes in Figma
// // figma.on("selectionchange", () => {
// //   //1.1) Get all the layers that the user has selected on the current Figma page.
// //   const selection = figma.currentPage.selection; // 1.2) store in the selection variable

// //   //1.3) If a frame is selected, create Floating UI
// //   if (selection.length === 1 && selection[0].type === "FRAME") {
// //     //1.4) Calls the createFloatingUI function, passing that Frame as an argument.
// //     createFloatingUI(selection[0] as FrameNode);
// //     return;
// //   }
// //   if (floatingUI && selection.some((node) => node.id === floatingUI!.id)) {
// //     return;
// //   }

// //   removeFloatingUI();
// //   // else {
// //   //   removeFloatingUI(); // Hide UI wehn no Frame is selected
// //   // }
// // });

// // figma.on("selectionchange", async () => {
// //   const selection = figma.currentPage.selection;
// //   selection.forEach(node => {
// //     if(node.type === "FRAME" && !figma.getNodeById(node.id)) {
// //       console.error("Frame has been deleted!");
// //     }
// //   })
// // })
// // // // Simulate Hover Effect
// // // figma.on("selectionchange", () => {
// // //   const selection = figma.currentPage.selection.filter(
// // //     (node) => node.type === "FRAME"
// // //   ) as FrameNode[];
// // //   selection.forEach((node) => {
// // //     if (node.getPluginData("isTab") === "true") {
// // //       node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
// // //     } else {
// // //       node.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
// // //     }
// // //   });
// // // });

// // // figma.ui.onmessage = (msg) => {
// // //   if (msg.type === "breakpointSelected") {
// // //     const selectedBreakpoint = msg.breakpoint;
// // //     const width = parseInt(msg.width, 10);
// // //     switchToBreakpoint(selectedBreakpoint, width);
// // //   }
// // // };
