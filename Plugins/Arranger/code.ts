const nodes = Array.from(figma.currentPage.selection);
if(nodes.length !== 2) {
  figma.notify("Please select exactly two layers!");
  figma.closePlugin();
}


// Check if layers have Auto Layout (we can't move them manually)
for (const node of nodes) {
  if("layoutMode" in node && node.layoutMode !== "NONE") {
    figma.notify("Auto Layout detected! Remove it before aligning.");
    figma.closePlugin
  }
}

// Sort by X positon for horizontal alginment
nodes.sort((a,b) => a.x - b.x);

let left =0, right =nodes.length -1;
while(left< right) {
  let midX = (nodes[left].x + nodes[right].x) / 2;
  nodes[left].x = midX;
  nodes[right].x = midX;
  left++;
  right--;
}

figma.notify("Layers aligned using Two-pointer method!")
figma.closePlugin();