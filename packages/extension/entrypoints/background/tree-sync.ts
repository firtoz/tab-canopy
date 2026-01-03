import { generateKeyBetween } from "fractional-indexing";
import {
	DEFAULT_TREE_ORDER,
	treeOrderSort,
} from "@/entrypoints/sidepanel/lib/tree";
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

	for (const children of childrenMap.values()) {
		children.sort(treeOrderSort);
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
 * Get all descendants of a tab (recursive)
 */
function getAllDescendants(allTabs: Tab[], parentId: number): Set<number> {
	const descendants = new Set<number>();
	const queue = [parentId];

	while (queue.length > 0) {
		const currentId = queue.shift();
		if (currentId === undefined) break;
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
	inputTabs: Tab[],
	movedTabId: number,
	newBrowserIndex: number,
): {
	parentTabId: number | null;
	treeOrder: string;
	childrenToFlatten: number[];
} {
	// Find the moved tab in the original list, if it's not here, it came from another window
	const movedTab = inputTabs.find((t) => t.browserTabId === movedTabId);
	if (!movedTab) {
		// This should never happen, but if it does, we can't calculate the new tree position
		return {
			parentTabId: null,
			treeOrder: DEFAULT_TREE_ORDER,
			childrenToFlatten: [],
		};
	}

	// Have a copy of the tab list, but with the moved tab removed
	const tempTabs = inputTabs.map((t) => {
		if (t.browserTabId === movedTabId) {
			return null;
		}
		return t;
	});

	// Check if the moved tab has any descendants
	const descendants = getAllDescendants(inputTabs, movedTabId);

	tempTabs.splice(newBrowserIndex, 0, {
		...movedTab,
	});
	const newAllTabs = tempTabs.filter((t) => t !== null);

	// Remove the moved tab (and its descendants) from flat list to see what's at each position
	const withoutMovedAndDescendants = newAllTabs.filter(
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
			const descendantTab = newAllTabs.find(
				(t) => t.browserTabId === descendantId,
			);
			if (!descendantTab) continue;

			// Find where the descendant appears in the current flat list (tree order)
			const descendantIndex = newAllTabs.findIndex(
				(t) => t.browserTabId === descendantId,
			);

			// Find where the moved tab appears in the current flat list
			const movedTabIndex = newAllTabs.findIndex(
				(t) => t.browserTabId === movedTabId,
			);

			if (descendantIndex < 0 || movedTabIndex < 0) continue;

			// After the move, if the new browser index is >= the descendant's current position
			// in the tree, the parent will end up at or after the descendant, breaking the tree structure
			// We need to flatten this descendant
			if (newBrowserIndex >= descendantIndex) {
				childrenToFlatten.push(descendantId);
			}
		}
	}

	const nextTab = newAllTabs[newBrowserIndex + 1] ?? null;

	// Determine new parent
	let newParentId: number | null = null;
	let siblings: Tab[] = [];

	if (nextTab) {
		newParentId = nextTab.parentTabId;
	}

	// Get siblings at the new parent level (excluding children that will be flattened)
	siblings = newAllTabs.filter(
		(t) =>
			t.parentTabId === newParentId &&
			t.browserTabId !== movedTabId &&
			!childrenToFlatten.includes(t.browserTabId),
	);
	// .sort(treeOrderSort);

	console.log(
		JSON.stringify(
			{
				siblings: siblings.map((t) => ({
					title: t.title,
					browserTabId: t.browserTabId,
					parentTabId: t.parentTabId,
					treeOrder: t.treeOrder,
					tabIndex: t.tabIndex,
				})),
				newParentId,
			},
			null,
			2,
		),
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

	const treeOrder = generateKeyBetween(
		prevSibling?.treeOrder ?? null,
		nextSibling?.treeOrder ?? null,
	);

	console.log(
		JSON.stringify(
			{
				prevSibling: prevSibling
					? {
							title: prevSibling.title,
							browserTabId: prevSibling.browserTabId,
							parentTabId: prevSibling.parentTabId,
							treeOrder: prevSibling.treeOrder,
							tabIndex: prevSibling.tabIndex,
						}
					: null,
				nextSibling: nextSibling
					? {
							title: nextSibling.title,
							browserTabId: nextSibling.browserTabId,
							parentTabId: nextSibling.parentTabId,
							treeOrder: nextSibling.treeOrder,
							tabIndex: nextSibling.tabIndex,
						}
					: null,
				insertIndex,
				newParentId,
				newBrowserIndex,
				treeOrder,
			},
			null,
			2,
		),
	);

	return {
		parentTabId: newParentId,
		treeOrder,
		childrenToFlatten,
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

/**
 * Determine the tree position for a new tab based on its browser index.
 *
 * This is used when:
 * - A new tab is created (handleTabCreated)
 * - A tab is attached to a window (handleTabAttached)
 *
 * The logic is: look at the tab that will be AFTER the new tab.
 * If that tab has a parent, the new tab should have the same parent
 * (becoming a sibling of that tab).
 *
 * @param existingTabs - All existing tabs in the window (from DB)
 * @param browserTabs - All browser tabs in the window with their current indices
 * @param newTabIndex - The browser index where the new tab is being inserted
 * @param newTabId - The ID of the new tab (to exclude from lookups)
 */
export function calculateTreePositionForNewTab(
	existingTabs: Tab[],
	browserTabs: Array<{ id: number; index: number }>,
	newTabIndex: number,
	newTabId: number,
): {
	parentTabId: number | null;
	treeOrder: string;
} {
	// Create a map from browserTabId to Tab for quick lookup
	const existingMap = new Map<number, Tab>();
	for (const tab of existingTabs) {
		existingMap.set(tab.browserTabId, tab);
	}

	// Sort browser tabs by index (excluding the new tab)
	const sortedBrowserTabs = browserTabs
		.filter((t) => t.id !== newTabId)
		.sort((a, b) => a.index - b.index);

	// Find the tab that will be AFTER the new tab
	// We need to account for the fact that if the new tab is at index N,
	// other tabs at index >= N have been shifted
	let tabAfterIndex = -1;
	for (let i = 0; i < sortedBrowserTabs.length; i++) {
		const bt = sortedBrowserTabs[i];
		// If the browser tab's index is >= newTabIndex, it's at or after our position
		// (tabs shift when a new one is inserted)
		if (bt.index >= newTabIndex) {
			tabAfterIndex = i;
			break;
		}
	}

	// Determine parent based on what's after the new tab
	let parentTabId: number | null = null;

	if (tabAfterIndex >= 0 && tabAfterIndex < sortedBrowserTabs.length) {
		const tabAfterId = sortedBrowserTabs[tabAfterIndex].id;
		const tabAfter = existingMap.get(tabAfterId);
		if (tabAfter) {
			// New tab gets the same parent as the tab after it
			parentTabId = tabAfter.parentTabId;
		}
	}

	// Calculate treeOrder - find siblings at the same level
	const siblings = existingTabs
		.filter((t) => t.parentTabId === parentTabId)
		.sort(treeOrderSort);

	// Find insertion point: which siblings are before/after the new tab in browser order?
	// Use the browserTabs array directly to get current indices
	let insertAfterSibling: Tab | null = null;
	let insertBeforeSibling: Tab | null = null;

	// For each sibling, find their current browser index from browserTabs
	for (const sibling of siblings) {
		// Look up the sibling's current browser index
		const browserTab = browserTabs.find((bt) => bt.id === sibling.browserTabId);
		const currentIndex = browserTab?.index ?? sibling.tabIndex;

		if (currentIndex < newTabIndex) {
			// This sibling is before the new tab in browser order
			// Keep updating - we want the LAST one before (highest treeOrder among those before)
			if (
				insertAfterSibling === null ||
				sibling.treeOrder > insertAfterSibling.treeOrder
			) {
				insertAfterSibling = sibling;
			}
		} else {
			// This sibling is at or after the new tab in browser order
			// Keep the FIRST one after (lowest treeOrder among those after)
			if (
				insertBeforeSibling === null ||
				sibling.treeOrder < insertBeforeSibling.treeOrder
			) {
				insertBeforeSibling = sibling;
			}
		}
	}

	// Generate treeOrder to place new tab between the siblings
	const treeOrder = generateKeyBetween(
		insertAfterSibling?.treeOrder ?? null,
		insertBeforeSibling?.treeOrder ?? null,
	);

	return {
		parentTabId,
		treeOrder,
	};
}
