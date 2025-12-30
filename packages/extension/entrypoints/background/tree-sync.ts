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
