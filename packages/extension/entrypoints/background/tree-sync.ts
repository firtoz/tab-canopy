import { generateKeyBetween } from "fractional-indexing";
import type { Tab } from "@/schema/src/schema";

/**
 * Tree structure for a tab node
 */
interface TreeNode {
	tab: Tab;
	children: TreeNode[];
}

/**
 * Build a tree structure from a flat list of tabs
 */
export function buildTree(tabs: Tab[]): TreeNode[] {
	const tabMap = new Map<number, Tab>();
	for (const tab of tabs) {
		tabMap.set(tab.browserTabId, tab);
	}

	const childrenMap = new Map<number | null, Tab[]>();
	for (const tab of tabs) {
		const parentId = tab.parentTabId;
		let parent = childrenMap.get(parentId);
		if (!parent) {
			parent = [];
			childrenMap.set(parentId, parent);
		}
		parent.push(tab);
	}

	// Sort children by treeOrder (using ASCII order, not locale)
	for (const children of childrenMap.values()) {
		children.sort((a, b) =>
			a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
		);
	}

	function buildNode(tab: Tab): TreeNode {
		const children = childrenMap.get(tab.browserTabId) ?? [];
		return {
			tab,
			children: children.map(buildNode),
		};
	}

	const rootTabs = childrenMap.get(null) ?? [];
	return rootTabs.map(buildNode);
}

/**
 * Flatten a tree into depth-first order (for browser tab ordering)
 */
export function flattenTree(nodes: TreeNode[]): Tab[] {
	const result: Tab[] = [];

	function visit(node: TreeNode) {
		result.push(node.tab);
		for (const child of node.children) {
			visit(child);
		}
	}

	for (const node of nodes) {
		visit(node);
	}

	return result;
}

/**
 * Get the expected browser index for each tab based on tree structure
 */
export function getExpectedBrowserOrder(tabs: Tab[]): Map<number, number> {
	const tree = buildTree(tabs);
	const flat = flattenTree(tree);
	const order = new Map<number, number>();
	flat.forEach((tab, index) => {
		order.set(tab.browserTabId, index);
	});
	return order;
}

/**
 * Generate a treeOrder value between two existing values.
 * Uses the fractional-indexing library (battle-tested by Figma).
 */
function generateTreeOrder(before?: string, after?: string): string {
	// The library uses null/undefined for boundaries
	const result = generateKeyBetween(before ?? null, after ?? null);
	return result;
}

/**
 * Get all descendants of a tab (recursive)
 */
function getAllDescendants(allTabs: Tab[], parentId: number): Set<number> {
	const descendants = new Set<number>();
	const queue = [parentId];

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		const children = allTabs.filter((t) => t.parentTabId === currentId);
		for (const child of children) {
			descendants.add(child.browserTabId);
			queue.push(child.browserTabId);
		}
	}

	return descendants;
}

/**
 * Determine the new tree position for a tab that was moved in the browser.
 *
 * Rules:
 * - If the tab is placed between a parent P and its child C, it becomes a sibling of C (child of P)
 * - Otherwise, it becomes a sibling of the tab after it
 * - If at the end, it becomes root-level
 * - Special case: If a parent tab is moved and any of its descendants end up before it,
 *   those descendants should be flattened (become siblings at the same level as the parent)
 */
export function calculateTreePositionFromBrowserMove(
	allTabs: Tab[],
	movedTabId: number,
	newBrowserIndex: number,
): {
	parentTabId: number | null;
	treeOrder: string;
	childrenToFlatten?: number[];
} {
	// Build tree and flatten to get current logical order
	const tree = buildTree(allTabs);
	const flatList = flattenTree(tree);

	// Find the moved tab
	const movedTab = allTabs.find((t) => t.browserTabId === movedTabId);
	if (!movedTab) {
		return { parentTabId: null, treeOrder: "n" };
	}

	// Check if the moved tab has any descendants
	const descendants = getAllDescendants(allTabs, movedTabId);

	// Remove the moved tab (and its descendants) from flat list to see what's at each position
	const withoutMovedAndDescendants = flatList.filter(
		(t) => t.browserTabId !== movedTabId && !descendants.has(t.browserTabId),
	);

	// Check if any descendants would end up before the parent after the move
	// If so, those descendants need to be flattened
	// This happens when a parent tab is moved to a position that breaks the tree invariant:
	// "a parent must always appear before its children in the flat browser tab list"
	const childrenToFlatten: number[] = [];
	if (descendants.size > 0) {
		// Get the current browser index of each descendant in the flat list
		for (const descendantId of descendants) {
			const descendantTab = allTabs.find(
				(t) => t.browserTabId === descendantId,
			);
			if (!descendantTab) continue;

			// Find where the descendant appears in the current flat list (tree order)
			const descendantTreeIndex = flatList.findIndex(
				(t) => t.browserTabId === descendantId,
			);

			// Find where the moved tab appears in the current flat list
			const movedTabTreeIndex = flatList.findIndex(
				(t) => t.browserTabId === movedTabId,
			);

			if (descendantTreeIndex < 0 || movedTabTreeIndex < 0) continue;

			// After the move, if the new browser index is >= the descendant's current position
			// in the tree, the parent will end up at or after the descendant, breaking the tree structure
			// We need to flatten this descendant
			if (newBrowserIndex >= descendantTreeIndex) {
				childrenToFlatten.push(descendantId);
			}
		}
	}

	// Get prev and next tabs at the new position (excluding moved tab and its descendants)
	// We need to look at the BROWSER order, not tree order, to find adjacent tabs
	// Build a map of browser index to tab for tabs that aren't the moved tab or its descendants
	const tabsByBrowserIndex = new Map<number, Tab>();
	for (const tab of allTabs) {
		if (tab.browserTabId !== movedTabId && !descendants.has(tab.browserTabId)) {
			tabsByBrowserIndex.set(tab.tabIndex, tab);
		}
	}

	// Find the prev tab (highest browser index < newBrowserIndex)
	let prevTab: Tab | null = null;
	for (let i = newBrowserIndex - 1; i >= 0; i--) {
		if (tabsByBrowserIndex.has(i)) {
			prevTab = tabsByBrowserIndex.get(i)!;
			break;
		}
	}

	// Find the next tab (lowest browser index > newBrowserIndex)
	let nextTab: Tab | null = null;
	for (let i = newBrowserIndex + 1; i < allTabs.length + 10; i++) {
		// +10 buffer for safety
		if (tabsByBrowserIndex.has(i)) {
			nextTab = tabsByBrowserIndex.get(i)!;
			break;
		}
	}

	// Determine new parent
	let newParentId: number | null = null;
	let siblings: Tab[] = [];

	if (prevTab && nextTab && nextTab.parentTabId === prevTab.browserTabId) {
		// nextTab is a child of prevTab - insert as sibling of nextTab (child of prevTab)
		newParentId = prevTab.browserTabId;
	} else if (nextTab) {
		// Insert as sibling of nextTab (same parent)
		newParentId = nextTab.parentTabId;
	} else if (prevTab) {
		// At the end (no nextTab) - "break out" to be a sibling of prevTab's parent
		// This means if prevTab is a child, we become a sibling of prevTab's parent (go up one level)
		// Find prevTab's parent in the tree
		const prevTabParent = allTabs.find(
			(t) => t.browserTabId === prevTab.parentTabId,
		);
		if (prevTabParent) {
			// prevTab has a parent, so we become a sibling of that parent
			newParentId = prevTabParent.parentTabId;
		} else {
			// prevTab is already root level, so we become root level too
			newParentId = null;
		}
	} else {
		// Empty list or at beginning
		newParentId = null;
	}

	// Get siblings at the new parent level (excluding children that will be flattened)
	siblings = allTabs
		.filter(
			(t) =>
				t.parentTabId === newParentId &&
				t.browserTabId !== movedTabId &&
				!childrenToFlatten.includes(t.browserTabId),
		)
		.sort((a, b) =>
			a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
		);

	// Find where to insert among siblings based on browser order
	// We want to maintain the same relative position as in the browser
	let insertIndex = 0;
	for (let i = 0; i < siblings.length; i++) {
		const siblingBrowserIndex = withoutMovedAndDescendants.findIndex(
			(t) => t.browserTabId === siblings[i].browserTabId,
		);
		if (siblingBrowserIndex < newBrowserIndex) {
			insertIndex = i + 1;
		}
	}

	// Generate treeOrder
	const prevSibling = insertIndex > 0 ? siblings[insertIndex - 1] : null;
	const nextSibling =
		insertIndex < siblings.length ? siblings[insertIndex] : null;
	const treeOrder = generateTreeOrder(
		prevSibling?.treeOrder,
		nextSibling?.treeOrder,
	);

	return {
		parentTabId: newParentId,
		treeOrder,
		childrenToFlatten:
			childrenToFlatten.length > 0 ? childrenToFlatten : undefined,
	};
}

/**
 * Check if a tab is an ancestor of another tab
 */
export function isAncestor(
	tabs: Tab[],
	ancestorId: number,
	descendantId: number,
): boolean {
	const tabMap = new Map<number, Tab>();
	for (const tab of tabs) {
		tabMap.set(tab.browserTabId, tab);
	}

	let current = tabMap.get(descendantId);
	while (current) {
		if (current.parentTabId === ancestorId) {
			return true;
		}
		if (current.parentTabId === null) {
			return false;
		}
		current = tabMap.get(current.parentTabId);
	}
	return false;
}
