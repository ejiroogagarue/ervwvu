



/* 

VERSION PLUGIN "REFLOW" – Pinned UI + Breakpoint Copy + Moves with Frame
   This code:
   1) Creates a pinned UI if exactly one Frame is selected.
   2) Copies layers for each new Breakpoint.
   3) Stays visible until the user clicks "Close".
   4) Uses a documentchange event to keep the pinned UI above the frame.
   5) No auto-scaling or highlight – user manually adjusts.

*/

/**
 * ______________________________________________
 * 
 * GLOBAL VARIABLES 
 * _______________________________________________
 */
let floatingUI: FrameNode | null = null; 
let pinnedFrameId: string | null = null; 
const breakpointsMap = new Map<string, FrameNode>(); 
let breakpointsBoard: FrameNode | null = null;
let lastFrameX: number | null = null;
let lastFrameY: number | null = null;
const FLOATING_UI_HEIGHT = 80; 
const FLOATING_UI_GAP = 10; 
let lastFrameWidth: number | null = null; 


////////////////////////////////////////////////////////
// 1.) PLUGIN ENTRY
////////////////////////////////////////////////////////
/**
 *  we declare an "async" function
 * -> this sort of function allows things to run in the background without blocking other code
 * -> So any tasks that takes time to complete can "wait"
 */
async function main() {
  
  /** 
   * 1.1) Figma.loadAllPagesAsync() - **************FLAGGEDDDDDDDDD******************(Potentially a performance hit)
   * -> It Loads all the pages in the Figma file into memory, so your plugin can see and work with everything , not just the current page."
   * -> we are using this to Track when a pinned frame moves, even if the user switches pages
   * -> Make sure the floating UI doesn’t break due to page changes
   */

  await figma.loadAllPagesAsync();

  /** 
   *   1.2)  This gives the user a clear, friendly prompt right after the plugin launches, so they know what to do next, instead of being confused..
   *   -> figma.notify(...):  Displays a message in Figma's UI (plugin area).
   *   -> "🔹 Select a single frame...": This is the actual text shown to the user.
   *   -> { timeout: 4000 }: The message auto-hides after 4000ms (4 seconds).
  */
 
  figma.notify("🔹 Select a single frame to begin using Breakpoint.", {
    timeout: 4000,
  });


   /** 
   *   1.3) This line ensures that your plugin stays reactive to the user's actions. 
   *   As soon as they select a frame, your plugin can: 
   *   -> Check what was selected.
   *   -> Update the floating UI.
   *   -> Remove it if nothing is selected 
   *   *********BREAKDOWN OF PARTS*************
   *   ->"figma.on("selectionchange", ...)": 
   *    * This sets up a listener for whenever the user changes their selection in the figma file.
   *   ->"async () => { await onSelectionChange(); }"
   *    * This is an anonymous async function that gets triggered whenever the selection changes
   *    CALL FUNCTION "onSelectionChange()"" -----> "NUMBER 2 IN FILE " 
  */

  figma.on("selectionchange", async () => {
    await onSelectionChange();
  });
   
  /**
   *  1.4)  It allows your UI to follow the selected frame.
   *  -> If the user moves the frame, the floating UI moves with it.
   *  -> If the frame gets deleted, you can remove or hide the Ui 
   *  *********BREAKDOWN OF PARTS*************
   *  -> "figma.on(...)": This sets up an event listener. 
   *  * In simple terms you are asking figma "HEY LET ME KNOW WHEN THIS HAPPENS".
   *  -> "documentchange": This is the event. 
   *  * It's triggered anytime the document is edited
   *  => Position/size changes 
   *  => Layer additions/removals
   *  => Property Updates (name, fills, etc.)  
   */
  // 
  figma.on("documentchange", onDocumentChange);
}

main().catch((err) => {
  console.error("Error loading plugin:", err);
});

////////////////////////////////////////////////////////
// 2.) SELECTION CHANGE HANDLER
////////////////////////////////////////////////////////

async function onSelectionChange() {

   /**
    * 2.1) This line gets whatever the user has currently selected on the figma canvas
    *  and stores it in a variable called "selection"
    *  -> "selection" is used for operations such as 
    *  => Has the suer selected a frame ?
    *  => Did they select exactly one item 
    *  => What kind of element is selected? (frame, text, group)
    * 
    */
  const selection = figma.currentPage.selection;

  /**
   * 2.2) If no floating UI exists yet, and the user has selected exactly one frame,
   * Then the plugin will load the font and create a floating UI above the selected frame.
   *  *********BREAKDOWN OF PARTS*************
   * -> "!floatingUI": There is no floating toolbar yet on the canvas.
   * -> "selection.length === 1": The user has selected exactly one item.
   * -> "selection[0].type === "FRAME": The selected item is a frame (not a shape, text or group).
   * Note: "if all 3 are true access the if statement"
   */
  if (!floatingUI && selection.length === 1 && selection[0].type === "FRAME") {
    //2.2 -> 1.) Load the "Inter font before creating text in the floatingUI"
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    /**
     * 2.2 -> 2.) Call the function "CreateFloatingUI()"
     *     -> Passes in the selected frame 
     *  *********BREAKDOWN OF PARTS*************
     *     -> "selection[0]": is the first (and only) selected item.
     *     -> "as FrameNode": tells Typescript: "Trust me, this is definitely a frame."
     * 
     */
    
    await createFloatingUI(selection[0] as FrameNode);
    // 2.2 -> 3.) This immediately stops the rest of the function from running 
    //              after we've created the floating UI. (Important operation) 
    return;
  }

  // 2.3 ) This block only runs if your floating UI exists 
  // If FloatingUI exists, see if user clicked a tab / close / generateAll, etc.
  // ********CAN BE SIMPLIFIED BUT FIRST LETS UNDERSTAND**************
  if (floatingUI) {
    // So we can detect if the user clicked outside pinned UI

    /**
     * 2.3 -> 1.) Know what belongs to the floating UI
     *     -> this collects a list of all node IDs in your floating UI.
     *     -> "Did the user click something inside the floating toolbar 
     *     or somewhere else?"
     */    
    const floatingUIAndChildren: string[] = [floatingUI.id];
    floatingUI
      .findAll()
      .forEach((child) => floatingUIAndChildren.push(child.id));
    
    /** 2.4 -> 2.) Loop over whatever the user clicked on in the canvas 
     *      -> "selection": This reads from "figma.currentPage.selection" -> Line 2.1
     *      -> the array contains all selected nodes on the canvas frame,group,textbox etc.
     */
    for (const node of selection) {
      /*
       2.4 -> 3.) Read plugin data from the clicked node 
           -> In simple terms "node.getPluginData("") is a getter"
           -> if set earlier it will return "true"
           -> If it was never set it will return "" an empty string
           "setPluginData" and "getPluginData" 
           * Let you store and retrieve hidden metadata.
           -> in our case we get the node to perform actions on our floatinUI
      **/
      let isTab = node.getPluginData("isTab") === "true";
      let isClose = node.getPluginData("isCloseButton") === "true";
      let isGenerateAll = node.getPluginData("isGenerateAll") === "true";
      let label = node.getPluginData("breakpoint");
      let widthStr = node.getPluginData("width");
      /**
       * 2.4 -> 4.)   This block is smart fallback logic for handling when the user clicks on the text inside a button, not the button itself
       *     -> If the current node is not already identified as a tab, close, or generateAll button,
       *     but it has a parent, let’s check the parent.      
       */
    
      if (!isTab && !isClose && !isGenerateAll && node.parent) {
        // 2.4 -> 4 -> 1.) pass parent node  to a variable 
        const parent = node.parent;
        // 2.4 -> 4 -> 2.) We only care if parent is a "Frame"
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
        console.log(
          "[Selection] Pinned frame deselected. Removing floating UI."
        );
        figma.notify(
          "Floating toolbar removed — reselect a frame to continue."
        );
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

  // Check for both position and size changes
  const didMove = pinnedFrame.x !== lastFrameX || pinnedFrame.y !== lastFrameY;
  const didResize = pinnedFrame.width !== lastFrameWidth;

  if (didMove || didResize) {
    // Update floating UI position
    floatingUI.x = pinnedFrame.x;
    floatingUI.y = pinnedFrame.y - FLOATING_UI_HEIGHT - FLOATING_UI_GAP;

    // Resize floating UI if frame width changed
    if (didResize) {
      floatingUI.resize(pinnedFrame.width, FLOATING_UI_HEIGHT);
      updateButtonSizes(pinnedFrame.width); // Update button sizes
      lastFrameWidth = pinnedFrame.width; // Store new width
    }

    // Update last known position
    lastFrameX = pinnedFrame.x;
    lastFrameY = pinnedFrame.y;
  }
}

function updateButtonSizes(toolbarWidth: number) {
  if (!floatingUI) return;

  // Resize action buttons (top row)
  const actionRow = floatingUI.findOne(
    (node) => node.name === "Action Row"
  ) as FrameNode;
  if (actionRow) {
    actionRow.children.forEach((btn) => {
      if (btn.type === "FRAME") {
        const isActionBtn = ["isGenerateAll", "isCloseButton"].some(
          (type) => btn.getPluginData(type) === "true"
        );
        btn.resize(
          Math.max(
            isActionBtn ? 100 : 80,
            toolbarWidth * (isActionBtn ? 0.2 : 0.15)
          ),
          32
        );
      }
    });
  }

  // Resize breakpoint tabs (bottom row)
  const tabsRow = floatingUI.findOne(
    (node) => node.name === "Tabs Row"
  ) as FrameNode;
  if (tabsRow) {
    tabsRow.children.forEach((tab) => {
      if (tab.type === "FRAME") {
        tab.resize(Math.max(80, toolbarWidth * 0.15), 32);
      }
    });
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
  lastFrameWidth = targetFrame.width;
  const floatingUIHeight = 80;
  //3.3). Remove existing UI if any
  if (floatingUI && floatingUI.parent) {
    floatingUI.remove();
    floatingUI = null;
    pinnedFrameId = null;
  }

  // Create status bar with brand color (#FFCC32)
  const statusBar = figma.createFrame();
  statusBar.name = "Status Bar";
  statusBar.resize(frameWidth, 24); //Matches toolbar width
  statusBar.fills = [
    {
      type: "SOLID",
      color: { r: 1, g: 0.8, b: 0.196 }, // #FFCC32 in RGB
    },
  ];

  const statusText = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  statusText.characters = "⏺ Working on: 1 frame";
  statusText.fontSize = 11;
  statusText.x = 8; // Left Padding
  statusText.y = 6; // Vertical center
  statusText.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
  statusBar.appendChild(statusText);
  

  


  //3.4) Create a new UI
  floatingUI = figma.createFrame();
  floatingUI.name = "Floating UI (Pinned)";

  floatingUI.resize(frameWidth, floatingUIHeight);
  floatingUI.layoutMode = "VERTICAL"; // Key change: swith to vertical layput
  floatingUI.paddingTop = 8;
  floatingUI.paddingBottom = 8;
  floatingUI.itemSpacing = 8;

  floatingUI.x = frameX;
  floatingUI.y = frameY - FLOATING_UI_HEIGHT - FLOATING_UI_GAP; // 10px extra gap
  // 2. Add glow to the FLOATING UI (your toolbar)
  floatingUI.effects = [
    // Outer glow (brand color)
    {
      type: "DROP_SHADOW",
      color: { r: 1, g: 0.8, b: 0.196, a: 0.4 }, // Subtler than frame glow
      offset: { x: 0, y: 2 }, // Slight downward offset
      radius: 12,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
    // Inner highlight
    {
      type: "INNER_SHADOW",
      color: { r: 1, g: 1, b: 1, a: 0.2 }, // White highlight
      offset: { x: 0, y: 0 },
      radius: 2,
      spread: 1,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
  floatingUI.fills = [
    { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.95 }, // Soft white base
  ];

  // floatingUI.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
  floatingUI.cornerRadius = 12;

  figma.currentPage.appendChild(floatingUI);

  // Add resize handler for dynamic button scaling
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

  //───────────────────────
  // Row 1: Actions (Generate All + Close)
  //───────────────────────
  const actionRow = figma.createFrame();
  actionRow.name = "Action Row";
  actionRow.layoutMode = "HORIZONTAL";
  actionRow.primaryAxisSizingMode = "AUTO";
  actionRow.counterAxisSizingMode = "AUTO";
  actionRow.paddingLeft = 8;
  actionRow.paddingRight = 8;
  actionRow.itemSpacing = 40;
  actionRow.fills = [];
  floatingUI.appendChild(actionRow);

  // Add "Generate All" button (same as before)
  const generateAllBtn = createButton("Generate All", "isGenerateAll", {
    color: { r: 0, g: 0.4, b: 1 },
    isActionButton: true, // Flag as action button
  });

  actionRow.appendChild(generateAllBtn);

  // Add "Close" button (right-aligned)
  const closeBtn = createButton("Close ❌", "isCloseButton", {
    color: { r: 1, g: 0.2, b: 0.2 },
    isActionButton: true,
  });

  actionRow.appendChild(closeBtn);

  //───────────────────────
  // Row 2: Breakpoint Tabs
  //───────────────────────
  const tabsRow = figma.createFrame();
  tabsRow.name = "Tabs Row";
  tabsRow.layoutMode = "HORIZONTAL";
  tabsRow.primaryAxisSizingMode = "AUTO";
  tabsRow.counterAxisSizingMode = "AUTO";
  tabsRow.paddingLeft = 8;
  tabsRow.paddingRight = 8;
  tabsRow.itemSpacing = 8;
  tabsRow.fills = [];
  floatingUI.appendChild(tabsRow);

  // Add breakpoint tabs (same as before)
  const breakpoints = [
    { label: "Mobile", icon: "📱", width: 375 },
    { label: "Tablet", icon: "🔲", width: 768 },
    { label: "Desktop", icon: "💻", width: 1280 },
    { label: "Large Desktop", icon: "🖥", width: 1920 },
  ];

  breakpoints.forEach((bp) => {
    const tab = createButton(`${bp.icon} ${bp.label}`, "isTab", {
      color: { r: 0.9, g: 0.9, b: 0.9 },
    });
    tab.setPluginData("breakpoint", bp.label);
    tab.setPluginData("width", bp.width.toString());
    tabsRow.appendChild(tab);
  });
}

// Helper: Reusable button creator
function createButton(
  label: string,
  type: string,
  opts?: { color?: RGB; isActionButton?: boolean }
): FrameNode {
  const btn = figma.createFrame();
  btn.name = `${label} Button`;
  btn.layoutMode = "HORIZONTAL";
  btn.primaryAxisSizingMode = "FIXED"; // Allows dynamic resizing
  btn.counterAxisSizingMode = "AUTO";
  btn.paddingLeft = 12;
  btn.paddingRight = 12;
  btn.paddingTop = 6;
  btn.paddingBottom = 6;
  btn.cornerRadius = 4;
  btn.fills = [
    {
      type: "SOLID",
      color: opts?.color || { r: 0.9, g: 0.9, b: 0.9 },
      opacity: 0.8,
    },
  ];

  // Responsive width logic (key addition)
  const minWidth = opts?.isActionButton ? 100 : 80; // wider for action buttons
  const ratio = opts?.isActionButton ? 0.2 : 0.15;
  btn.resize(
    Math.max(minWidth, (floatingUI?.width || 300) * ratio), // 20% or 15% of toolbar
    32 // Fixed height
  );

  const text = figma.createText();
  text.characters = optimizeLabelForWidth(label, btn.width);
  // Dynamic font sizing (no separate helper needed)
  const baseSize = 12;
  const widthScale = Math.min(4, Math.floor((btn.width - 100) / 20)); // Scales 12->16px
  text.fontSize = baseSize + widthScale + (hasEmoji(label) ? 2 : 0); // Emojo get + 2px
  text.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
  btn.appendChild(text);
  btn.setPluginData(type, "true"); // Keep this critical line!
  return btn;
}

// Helper to detect and handle emoji/icon cases
function hasEmoji(text: string): boolean {
  const emojiRegex = /\p{Emoji}/u;
  return emojiRegex.test(text);
}

// Optional: Replace long labels with icons on narrow buttons
function optimizeLabelForWidth(label: string, width: number): string {
  if (width >= 100) return label; // kepp full text if space allows

  // Icon-only mode for narrow buttons
  const iconMap: Record<string, string> = {
    Mobile: "📱",
    Tablet: "📊",
    Desktop: "💻",
    "Large Desktop": "🖥",
    "Generate All": "⚡",
    "Close ❌": "❌",
  };
  return iconMap[label] || label.split(" ")[0]; // Fallback to first word
}
////////////////////////////////////////////////////////
// 5. REMOVE THE PINNED UI
///////////////////////////////////////////////////////

async function removeFloatingUI() {
  if (floatingUI?.parent) floatingUI.remove();
  // Clean ONLY the glow effect from target frame
  
  // Reset State
  floatingUI = null;
  pinnedFrameId = null;
}

////////////////////////////////////////////////////////
// 6. SWITCH TO BREAKPOINT (COPY LAYERS IF NEEDED)
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
