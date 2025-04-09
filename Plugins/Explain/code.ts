
figma.showUI(__html__, { width: 300, height: 200});


// Update on selection change 
figma.on('selectionchange', () => {
 if(figma.currentPage.selection.length > 0) {
  const layout = sniffLayout(figma.currentPage.selection[0]);
  figma.ui.postMessage({ type: 'LAYOUT_ANALYSIS', layout});
 }
});


////////////////////////////////////////////////////////
// Interface
////////////////////////////////////////////////////////
type LayoutType = 'flex' | 'grid' | 'stack';

interface LayoutAnalysis {
  type: LayoutType;
  gap?: number; // Only for flex/grid 
  direction?: 'row' | 'column'; // Only for flexbox
}


////////////////////////////////////////////////////////
// Type Guards (SAFETY FIRST!)
////////////////////////////////////////////////////////

function isFrameOrGroup(node: SceneNode): node is FrameNode | GroupNode {
 return ['FRAME', 'GROUP'].includes(node.type);
}

function hasLayoutMode(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME' && 'layoutMode' in node;
}


////////////////////////////////////////////////////////
// Main Detector (FULLY SAFE)
////////////////////////////////////////////////////////


function sniffLayout(node: SceneNode): LayoutAnalysis {
  // Only frames/groups can be flex/grid
  if(!isFrameOrGroup(node)) {
    return {type: 'stack'};
  }

  // Flex detection (Figma auto-layout)
  if(hasLayoutMode(node)) {
    return {
      type: 'flex',
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: node.itemSpacing || 0,
    };
  }

  // Grid detection
  if(isGrid(node)) {
    return {
      type: 'grid',
      gap: guessGapBetweenChildren(node),
    }
  }
  
  // Default to stack 
  return {type: 'stack'}
 
}

////////////////////////////////////////////////////////
//Grid Detection
////////////////////////////////////////////////////////

// Make isGrid() return type predicate to narrow the type
function isGrid(node: SceneNode): node is FrameNode | GroupNode {
   if(!isFrameOrGroup(node)) return false;
   if(node.children.length < 2) return false;
   
   const first = node.children[0];
   const second = node.children[1];

   return (
    Math.abs(second.x - first.x) > 5 &&
    Math.abs(second.y - first.y) > 5
   )
}

// Now this is SFAE because isGrid() guarantees ChildrenMixin
function guessGapBetweenChildren(node: FrameNode | GroupNode): number {
  return node.children[1].x - node.children[0].x - node.children[0].width;
}



