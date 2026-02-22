import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import {
	DEFAULT_TREE_ORDER,
	treeOrderSort,
} from "@/entrypoints/sidepanel/lib/tree";
import type { Tab } from "@/schema/src/schema";

/** Tree-only update for a tab (parentTabId + treeOrder) */
export type TreeUpdate = { parentTabId: number | null; treeOrder: string };

/** Result of inferTreeFromBrowserMove: all tab updates and which IDs were flattened */
export type InferTreeFromBrowserMoveResult = {
	updates: Map<number, TreeUpdate>;
	childrenToFlatten: number[];
};

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
 * Return tab IDs in depth-first tree order (order they should appear in the browser).
 * Used when calling tabs.move so we pass the right index per tab.
 */
export function flattenTreeToBrowserOrder(tabs: Tab[]): number[] {
	const tree = buildTree(tabs);
	const flat = flattenTree(tree);
	return flat.map((t) => t.browserTabId);
}

/**
 * Given a removed tab, return tree updates for direct children only:
 * they are promoted to the removed tab's parent with new treeOrder between siblings.
 * Grandchildren and deeper descendants are unchanged (they stay under promoted children).
 */
export function promoteOnRemove(
	tabs: Tab[],
	removedTabId: number,
): Map<number, TreeUpdate> {
	const removedTab = tabs.find((t) => t.browserTabId === removedTabId);
	if (!removedTab) return new Map();

	const directChildren = tabs
		.filter((t) => t.parentTabId === removedTabId)
		.sort(treeOrderSort);
	if (directChildren.length === 0) return new Map();

	const siblings = tabs
		.filter(
			(t) =>
				t.parentTabId === removedTab.parentTabId &&
				t.browserTabId !== removedTabId,
		)
		.sort(treeOrderSort);

	let prevSibling: Tab | undefined;
	let nextSibling: Tab | undefined;
	for (let i = 0; i < siblings.length; i++) {
		if (siblings[i].treeOrder < removedTab.treeOrder) {
			prevSibling = siblings[i];
		} else if (siblings[i].treeOrder > removedTab.treeOrder && !nextSibling) {
			nextSibling = siblings[i];
			break;
		}
	}

	const newTreeOrders = generateNKeysBetween(
		prevSibling?.treeOrder ?? null,
		nextSibling?.treeOrder ?? null,
		directChildren.length,
	);

	const updates = new Map<number, TreeUpdate>();
	for (let i = 0; i < directChildren.length; i++) {
		updates.set(directChildren[i].browserTabId, {
			parentTabId: removedTab.parentTabId,
			treeOrder: newTreeOrders[i],
		});
	}
	return updates;
}

/**
 * Get all descendants of a tab (recursive). Exported for use in reconciler fallback.
 */
export function getAllDescendants(
	allTabs: Tab[],
	parentId: number,
): Set<number> {
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
 * Infer full tree updates for a browser-native tab move.
 * Returns a map of tabId -> { parentTabId, treeOrder } for the moved tab and any
 * descendants that end up before the parent (flattened to the same level as the moved tab).
 *
 * Rules:
 * - New parent for moved tab = parent of the tab immediately after it in the new order (or root at end).
 * - If a descendant ends up before the moved parent in the flat list, flatten it (same parent as moved tab).
 */
export function inferTreeFromBrowserMove(
	inputTabs: Tab[],
	movedTabId: number,
	newBrowserIndex: number,
): InferTreeFromBrowserMoveResult {
	const updates = new Map<number, TreeUpdate>();
	const childrenToFlatten: number[] = [];

	const movedTab = inputTabs.find((t) => t.browserTabId === movedTabId);
	if (!movedTab) {
		return { updates, childrenToFlatten };
	}

	const descendants = getAllDescendants(inputTabs, movedTabId);

	const tabsWithoutMoved = inputTabs.filter(
		(t) => t.browserTabId !== movedTabId,
	);
	const newAllTabs = [...tabsWithoutMoved];
	newAllTabs.splice(newBrowserIndex, 0, movedTab);

	// Which descendants end up before the parent after the move
	if (descendants.size > 0) {
		for (const descendantId of descendants) {
			const descendantIndex = newAllTabs.findIndex(
				(t) => t.browserTabId === descendantId,
			);
			const movedTabIndex = newAllTabs.findIndex(
				(t) => t.browserTabId === movedTabId,
			);
			if (descendantIndex < 0 || movedTabIndex < 0) continue;
			if (newBrowserIndex >= descendantIndex) {
				childrenToFlatten.push(descendantId);
			}
		}
	}

	// New parent = parent of the tab immediately after the moved tab (or root at end).
	// If the next tab is a descendant of the moved tab, skip to the first non-descendant so we don't set moved tab's parent to itself.
	let newParentId: number | null = null;
	for (let i = newBrowserIndex + 1; i < newAllTabs.length; i++) {
		const afterTab = newAllTabs[i];
		if (!descendants.has(afterTab.browserTabId)) {
			newParentId = afterTab.parentTabId;
			break;
		}
	}

	// Use immediate prev/next in browser order so "move parent between child and next" gets correct order (b, a, c).
	// When prev/next have inconsistent treeOrders (e.g. moving under a parent), fall back to sibling-based logic.
	const prevInOrder = newAllTabs[newBrowserIndex - 1] ?? null;
	const nextInOrder = newAllTabs[newBrowserIndex + 1] ?? null;
	const prevTreeOrder =
		prevInOrder && !childrenToFlatten.includes(prevInOrder.browserTabId)
			? prevInOrder.treeOrder
			: null;
	const nextTreeOrder = nextInOrder?.treeOrder ?? null;

	let movedTreeOrder: string;
	if (
		prevTreeOrder != null &&
		nextTreeOrder != null &&
		prevTreeOrder >= nextTreeOrder
	) {
		// Invalid bounds (e.g. moving tab under a parent); use siblings at new parent
		const siblings = newAllTabs.filter(
			(t) =>
				t.parentTabId === newParentId &&
				t.browserTabId !== movedTabId &&
				!childrenToFlatten.includes(t.browserTabId),
		);
		const withoutMovedAndDescendants = newAllTabs.filter(
			(t) => t.browserTabId !== movedTabId && !descendants.has(t.browserTabId),
		);
		let insertIndex = 0;
		for (let i = 0; i < siblings.length; i++) {
			const idx = withoutMovedAndDescendants.findIndex(
				(t) => t.browserTabId === siblings[i].browserTabId,
			);
			if (idx >= 0 && idx < newBrowserIndex) insertIndex = i + 1;
		}
		const prevSib = insertIndex > 0 ? siblings[insertIndex - 1] : null;
		const nextSib =
			insertIndex < siblings.length ? siblings[insertIndex] : null;
		movedTreeOrder = generateKeyBetween(
			prevSib?.treeOrder ?? null,
			nextSib?.treeOrder ?? null,
		);
	} else {
		movedTreeOrder = generateKeyBetween(
			prevTreeOrder ?? null,
			nextTreeOrder ?? null,
		);
	}

	updates.set(movedTabId, {
		parentTabId: newParentId,
		treeOrder: movedTreeOrder,
	});

	// Flattened descendants: same parent as moved tab, treeOrder before the moved tab (in browser order)
	const flattenedSorted = [...childrenToFlatten].sort((a, b) => {
		const idxA = newAllTabs.findIndex((t) => t.browserTabId === a);
		const idxB = newAllTabs.findIndex((t) => t.browserTabId === b);
		return idxA - idxB;
	});

	let lastTreeOrder: string | null = prevTreeOrder;
	for (let i = 0; i < flattenedSorted.length; i++) {
		const childId = flattenedSorted[i];
		const childTreeOrder = generateKeyBetween(lastTreeOrder, movedTreeOrder);
		updates.set(childId, {
			parentTabId: newParentId,
			treeOrder: childTreeOrder,
		});
		lastTreeOrder = childTreeOrder;
	}

	return { updates, childrenToFlatten };
}

/**
 * Legacy entry point: returns only the moved tab's position and childrenToFlatten.
 * Prefer inferTreeFromBrowserMove in new code.
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
	const { updates, childrenToFlatten } = inferTreeFromBrowserMove(
		inputTabs,
		movedTabId,
		newBrowserIndex,
	);
	const moved = updates.get(movedTabId);
	return {
		parentTabId: moved?.parentTabId ?? null,
		treeOrder: moved?.treeOrder ?? DEFAULT_TREE_ORDER,
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

/**
 * Infer tree position for a new tab inserted at newTabIndex in the window.
 * When browserTabs is provided (current indices from browser), uses them; otherwise uses tabIndex from tabsInWindow.
 */
export function inferTreeFromBrowserCreate(
	tabsInWindow: Tab[],
	newTabIndex: number,
	newTabId: number,
	browserTabs?: Array<{ id: number; index: number }>,
): { parentTabId: number | null; treeOrder: string } {
	const indices =
		browserTabs ??
		tabsInWindow.map((t) => ({ id: t.browserTabId, index: t.tabIndex }));
	return calculateTreePositionForNewTab(
		tabsInWindow,
		indices,
		newTabIndex,
		newTabId,
	);
}
