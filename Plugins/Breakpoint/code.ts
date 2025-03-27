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
let breakpointsBoard: FrameNode | null = null; // Track our Board
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
  // 1.1) Required if you want to use 'documentchange" in incremental mode
  /** Figma doesn't automatically load all pages when a plugin starts so to be memort efficinet
   * we use this function , it allows our plugin to tracj changes across all pages without
   * loading everything at once.
   *
   */
  await figma.loadAllPagesAsync();
  
  figma.notify("🔹 Select a single frame to begin using Breakpoint.", { timeout: 4000 });
  // 1.2 -> 2 ) Register "selectionchange"
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
// 2.) SELECTION CHANGE HANDLER
////////////////////////////////////////////////////////



async function onSelectionChange() {
  const selection = figma.currentPage.selection;

  // If no pinned UI yet, exactly 1 Frame => create pinned UI
  if (!floatingUI && selection.length === 1 && selection[0].type === "FRAME") {
    console.log("[Selection] Creating Floating UI for:", selection[0].name);
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await createFloatingUI(selection[0] as FrameNode);
    return;
  }

  // If pinned UI exists, see if user clicked a tab / close / generateAll, etc.
  if (floatingUI) {
    // So we can detect if the user clicked outside pinned UI
    const floatingUIAndChildren: string[] = [floatingUI.id];
    floatingUI
      .findAll()
      .forEach((child) => floatingUIAndChildren.push(child.id));

    for (const node of selection) {
      // 1. Read plugin data from the clicked node
      let isTab = node.getPluginData("isTab") === "true";
      let isClose = node.getPluginData("isCloseButton") === "true";
      let isGenerateAll = node.getPluginData("isGenerateAll") === "true";
      let label = node.getPluginData("breakpoint");
      let widthStr = node.getPluginData("width");

      // ─────────────────────────────────────────────────────────────
      // 2. Parent check logic (in case user clicked on the text)
      // ─────────────────────────────────────────────────────────────
      if (!isTab && !isClose && !isGenerateAll && node.parent) {
        const parent = node.parent;
        if (parent.type === "FRAME") {
          const parentIsTab = parent.getPluginData("isTab") === "true";
          const parentIsClose =
            parent.getPluginData("isCloseButton") === "true";
          const parentIsGenerateAll =
            parent.getPluginData("isGenerateAll") === "true";

          if (parentIsTab) {
            isTab = true;
            label = parent.getPluginData("breakpoint");
            widthStr = parent.getPluginData("width");
          } else if (parentIsClose) {
            isClose = true;
          } else if (parentIsGenerateAll) {
            isGenerateAll = true;
          }
        }
      }

      console.log(
        "[Selection] Node:",
        node.name,
        "isTab?",
        isTab,
        "isClose?",
        isClose,
        "isGenerateAll?",
        isGenerateAll,
        "label:",
        label,
        "widthStr:",
        widthStr
      );

      // ─────────────────────────────────────────────────────────────
      // 3. Close button
      // ─────────────────────────────────────────────────────────────
      if (isClose) {
        console.log("[Selection] Close button clicked.");
        // Optionally arrange frames before leaving
        // Let them know everything ends here
        figma.notify(
          "Closing. Remember, this plugin doesn’t store data. Re-select if you need more changes."
        );
        // await arrangeFramesSideBySide();
        removeFloatingUI();
        figma.closePlugin();
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // 4. Generate All button
      // ─────────────────────────────────────────────────────────────
      if (isGenerateAll) {
        console.log("[Selection] Generate All clicked.");
        const defaultBPs = [
          { label: "Mobile", width: 375 },
          { label: "Tablet", width: 768 },
          { label: "Desktop", width: 1280 },
          { label: "Large Desktop", width: 1920 },
        ];
        for (const bp of defaultBPs) {
          if (!breakpointsMap.has(bp.label)) {
            await switchToBreakpoint(bp.label, bp.width);
          }
        }
       
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // 5. Single breakpoint tab
      // ─────────────────────────────────────────────────────────────
      if (isTab && label && widthStr) {
        console.log("[Selection] Switching to Breakpoint:", {
          label,
          widthStr,
        });
        const widthNum = parseInt(widthStr, 10);
        await switchToBreakpoint(label, widthNum);
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // 6. If user selected something else in pinned UI, do nothing
      // ─────────────────────────────────────────────────────────────
      if (floatingUIAndChildren.includes(node.id)) {
        return;
      }
    }


    // 7. 🆕 If the pinned frame is no longer selected, remove the floating UI
    if (pinnedFrameId) {
      const stillSelected = selection.find((node) => node.id === pinnedFrameId);
      if (!stillSelected) {
        console.log("[Selection] Pinned frame deselected. Removing floating UI.");
        figma.notify("Floating toolbar removed — reselect a frame to continue.");
        removeFloatingUI();
        return;
      }
    }

  }

  // If pinned UI is active & user picks random other stuff, we ignore it
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
// 3. CREATE THE PINNED UI
////////////////////////////////////////////////////////

async function createFloatingUI(targetFrame: FrameNode) {
  // 3.1.) Check if the target frame still exists
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

  // 3.2) Capture frame geometry to place the UI above
  const frameX = targetFrame.x;
  const frameY = targetFrame.y;
  const frameWidth = targetFrame.width;

  //3.3). Remove existing UI if any
  if (floatingUI && floatingUI.parent) {
    floatingUI.remove();
    floatingUI = null;
    pinnedFrameId = null;
  }

  //3.4) Create a new UI
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

  // Immediately let the user know about the ephemeral nature
  figma.notify(
    "✅ Floating toolbar added above your selected frame. Use it to generate breakpoints.",
    { timeout: 4000 }
  );

  pinnedFrameId = targetFrame.id;
  lastFrameX = targetFrame.x;
  lastFrameY = targetFrame.y;
  //3.5) Immediately add the pinnedFrame to the map
  breakpointsMap.set("Original", targetFrame);

  //3.6 -> 4) Build the segmented Menu
  await createSegmentedMenu(targetFrame);

  // Create/Retrieve the board
  const board = createOrGetBreakpointsBoard();

  // Optionally position the board near the pinned frame
  // Because the user might delete frames, etc.,
  // we won't anchor the board to the pinned frame with "documentchange" –
  // that can be overkill. You can if you want.
  board.x = targetFrame.x + targetFrame.width + 100; //e.g. 100px to the right
  board.y = targetFrame.y;
}

////////////////////////////////////////////////////////
// 4. CREATE THE SEGMENTED MENU (BREAKPOINT TABS + CLOSE)
////////////////////////////////////////////////////////



async function createSegmentedMenu(targetFrame: FrameNode) {
  if (!floatingUI) return;

  floatingUI.children.forEach((child) => child.remove());

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

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
  menuContainer.cornerRadius = 8;

  floatingUI.appendChild(menuContainer);

  //Default breakpoints
  const breakpoints = [
    { label: "Mobile", icon: "📱", width: 375 },
    { label: "Tablet", icon: "📊", width: 768 },
    { label: "Desktop", icon: "💻", width: 1280 },
    { label: "Large Desktop", icon: "🖥", width: 1920 },
  ];

  // Creat one tab for each breakpoint
  for (const { label, icon, width } of breakpoints) {
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

    //Mark it as a tab
    tab.setPluginData("isTab", "true");
    tab.setPluginData("breakpoint", label);
    tab.setPluginData("width", width.toString());

    const text = figma.createText();
    text.characters = `${icon} ${label}`;
    text.fontSize = 12;
    text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    tab.appendChild(text);

    menuContainer.appendChild(tab);
  }
  // Generate All button
  const generateAllBtn = figma.createFrame();
  generateAllBtn.name = "Generate All Button";
  generateAllBtn.layoutMode = "HORIZONTAL";
  generateAllBtn.primaryAxisSizingMode = "AUTO";
  generateAllBtn.counterAxisSizingMode = "AUTO";
  generateAllBtn.paddingLeft = 8;
  generateAllBtn.paddingRight = 8;
  generateAllBtn.paddingTop = 4;
  generateAllBtn.paddingBottom = 4;
  generateAllBtn.cornerRadius = 6;
  generateAllBtn.fills = [
    { type: "SOLID", color: { r: 0, g: 0, b: 1 }, opacity: 0.6 },
  ];
  generateAllBtn.setPluginData("isGenerateAll", "true");

  const genAllText = figma.createText();
  genAllText.characters = "Generate All";
  genAllText.fontSize = 12;
  genAllText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  generateAllBtn.appendChild(genAllText);
  menuContainer.appendChild(generateAllBtn);

  // Close button
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
// 5. REMOVE THE PINNED UI
///////////////////////////////////////////////////////

function removeFloatingUI() {
  if (floatingUI && floatingUI.parent) {
    floatingUI.remove();
  }
  floatingUI = null;
  pinnedFrameId = null;
  lastFrameX = null;
  lastFrameY = null;
}

////////////////////////////////////////////////////////
// 6. SWITCH TO BREAKPOINT (COPY LAYERS IF NEEDED)
////////////////////////////////////////////////////////

// async function switchToBreakpoint(label: string, width: number) {
//   if (!pinnedFrameId) {
//     console.warn("No pinned Frame to copy from.");
//     return;
//   }
//   console.log(Switching/Creating Breakpoint: ${label} (${width}px));
//   //6.1)  Retrieve pinned frame
//   const pinnedFrame = (await figma.getNodeByIdAsync(
//     pinnedFrameId
//   )) as FrameNode | null;

//   if (!pinnedFrame) {
//     console.warn("Pinned frame no longer exists.");
//     return;
//   }
//   if (!pinnedFrame) {
//     console.warn(
//       "⚠️ [switchToBreakpoint] Pinned frame no longer exists. Aborting switch."
//     );
//     return;
//   }

//   console.log(
//     ✅ [switchToBreakpoint] Pinned Frame Found: ${pinnedFrame.name}
//   );

//   // 6.2) If we already created it, show it & hide others
//   if (breakpointsMap.has(label)) {
//     const existingFrame = breakpointsMap.get(label)!;
//     existingFrame.visible = true;

//     //6.3) Hide all other breakpoints
//     breakpointsMap.forEach((f, k) => {
//       if (k !== label) f.visible = false;
//     });

//     //6.3) Also hide pinnedFrame so there's only one visible design

//     const originalFrame = breakpointsMap.get("Original");
//     if(originalFrame) {
//       originalFrame.visible = false;
//     }

//     return;
//   }

//   // 4.4) otherwise, create a new Frame & copy layers
//   const newFrame = figma.createFrame();
//   console.log("New frame:", newFrame, newFrame?.id, newFrame?.type);
//   newFrame.name = ${pinnedFrame.name} - ${label};
//   newFrame.resize(width, pinnedFrame.height);
//   newFrame.x = pinnedFrame.x + 300; // Offset so we can see it
//   newFrame.y = pinnedFrame.y;
//   newFrame.layoutMode = pinnedFrame.layoutMode;
//   newFrame.fills = JSON.parse(JSON.stringify(pinnedFrame.fills));

//   //4.5) Naive copy of children
//   pinnedFrame.children.forEach((child) => {
//     if ("clone" in child && typeof child.clone === "function") {
//       const clonedChild = child.clone() as SceneNode;
//       newFrame.appendChild(clonedChild);
//     }
//   });

//   // 4.6) Add newFrame to the current page
//   figma.currentPage.appendChild(newFrame);
// // 4.7) Store it in breakpointsMap
//   breakpointsMap.set(label, newFrame);
//   console.log("[Debug] breakpointsMap.set -> label:", label, " frame:",newFrame.id);

//   if (!breakpointsMap.has(label)) {
//     breakpointsMap.set(label, newFrame);
//     console.log("Map after set:", Array.from(breakpointsMap.entries()));
//   }

//   //4.8) Hide others
//   breakpointsMap.forEach((frame, key) => {
//     frame.visible = (key === label);
//   });

//   //4.9) Hide pinnedFrames so only the new breakpont is visible

//   pinnedFrame.visible = false;
// }

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

  console.log(`Switching/Creating Breakpoint: ${label} (${width}px)`);

  // If already in map, just confirm it's visible (we're not hiding anything anyway)
  if (breakpointsMap.has(label)) {
    const existingFrame = breakpointsMap.get(label)!;
    console.log(`Breakpoint '${label}' already exists, Not hiding anything.`);
    return;
  }

  // Otherwise create new frame beside pinnedFrame
  const newFrame = figma.createFrame();
  newFrame.name = `${pinnedFrame.name} - ${label}`;
  newFrame.resize(width, pinnedFrame.height);

  // Copy layout/fills from pinnedFrame if desired
  newFrame.layoutMode = pinnedFrame.layoutMode;
  newFrame.fills = JSON.parse(JSON.stringify(pinnedFrame.fills));

  // // Place it at pinnedFrame.x + some offset
  // newFrame.x = pinnedFrame.x + 300 + breakpointsMap.size * 400;
  // // ^ or any logic for offset you want
  // newFrame.y = pinnedFrame.y;
  // newFrame.layoutMode = pinnedFrame.layoutMode;
  // newFrame.fills = JSON.parse(JSON.stringify(pinnedFrame.fills));

  // Copy children
  pinnedFrame.children.forEach((child) => {
    if ("clone" in child && typeof child.clone === "function") {
      const clonedChild = child.clone() as SceneNode;
      newFrame.appendChild(clonedChild);
    }
  });

  // figma.currentPage.appendChild(newFrame);
  /**Instead of placing it on the page at absolute coords...
   * figma.currentPage.appendChild(newFrame);
   * we do this:
   */

  const board = createOrGetBreakpointsBoard();
  board.appendChild(newFrame);
  // Keep track of it
  breakpointsMap.set(label, newFrame);
  console.log(
    "[Debug] breakpointsMap.set -> label:",
    label,
    " frame:",
    newFrame.id
  );
  // **** Add this line so each new breakpoint is auto-arranged: ****
  // await arrangeFramesSideBySide();
}



////////////////////////////////////////////////////////
//  8.) Returns the existing board or creats a new one
// You can store plugin data on the board if needed.
////////////////////////////////////////////////////////

function createOrGetBreakpointsBoard(): FrameNode {
  // If we already have one that isn't removed, return it
  if (breakpointsBoard && !breakpointsBoard.removed) {
    return breakpointsBoard;
  }

  // otherwise, create a fresh board
  const board = figma.createFrame();
  board.name = "Breakpoints Board";
  board.layoutMode = "HORIZONTAL"; // or "Vetical"
  board.primaryAxisSizingMode = "AUTO";
  board.counterAxisSizingMode = "AUTO";
  board.itemSpacing = 40;
  board.paddingLeft = 20;
  board.paddingRight = 20;
  board.paddingTop = 20;
  board.paddingBottom = 20;

  // Make it transparent or style as you like
  board.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0 }];

  figma.currentPage.appendChild(board);
  breakpointsBoard = board;
  return breakpointsBoard;
}
