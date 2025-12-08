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
 * Handles mixed alphanumeric strings (digits sort before letters in ASCII).
 * ASCII order: '0'-'9' (48-57) < 'A'-'Z' (65-90) < 'a'-'z' (97-122)
 */
function generateTreeOrder(before?: string, after?: string): string {
	// Default midpoint
	// if (!before && !after) {
	// 	return "n"; // middle of alphabet
	// }

	if (!before) {
		if (!after) {
			return "n";
		}
		// Insert before `after` - we need something that sorts before it
		const firstChar = after.charCodeAt(0);

		// Try to find a character that sorts before the first character
		// '0' is ASCII 48, which is a safe lower bound for printable chars
		if (firstChar > 48) {
			// There's room before the first character
			const midChar = Math.floor((48 + firstChar) / 2);
			if (midChar < firstChar && midChar >= 48) {
				return String.fromCharCode(midChar);
			}
		}

		// First char is already at or near the minimum ('0')
		// Prepend '0' and recurse on the rest
		if (after.length > 1) {
			return `0${generateTreeOrder(undefined, after.slice(1))}`;
		}
		// Single character at minimum - just prepend '0'
		return "0";
	}

	if (!after) {
		if (!before) {
			return "n";
		}

		// Insert after `before` - we need something that sorts after it
		// Append a character to make it larger
		return `${before}n`;
	}

	// Insert between two values
	// Find common prefix
	let i = 0;
	while (i < before.length && i < after.length && before[i] === after[i]) {
		i++;
	}
	const commonPrefix = before.slice(0, i);

	// Get the differing parts
	const beforeSuffix = before.slice(i);
	const afterSuffix = after.slice(i);

	// Get first differing character (or use boundaries)
	// Use ASCII 47 ('/') as lower bound and 127 (DEL) as upper bound
	const beforeChar = beforeSuffix.length > 0 ? beforeSuffix.charCodeAt(0) : 47;
	const afterChar = afterSuffix.length > 0 ? afterSuffix.charCodeAt(0) : 127;

	if (afterChar - beforeChar > 1) {
		// There's room for a character in between
		const midChar = String.fromCharCode(
			Math.floor((beforeChar + afterChar) / 2),
		);
		return commonPrefix + midChar;
	}

	// Characters are adjacent (e.g., '0' and '1', or 'a' and 'b')
	// We need to extend the `before` value
	if (beforeSuffix.length === 0) {
		// before ended at common prefix, after has more
		// Insert between common prefix and afterSuffix
		const midChar = Math.floor((47 + afterChar) / 2);
		if (midChar > 47 && midChar < afterChar) {
			return commonPrefix + String.fromCharCode(midChar);
		}
	}

	// Append to before to make it slightly larger but still less than after
	return `${before}n`;
}

/**
 * Determine the new tree position for a tab that was moved in the browser.
 *
 * Rules:
 * - If the tab is placed between a parent P and its child C, it becomes a sibling of C (child of P)
 * - Otherwise, it becomes a sibling of the tab after it
 * - If at the end, it becomes root-level
 */
export function calculateTreePositionFromBrowserMove(
	allTabs: Tab[],
	movedTabId: number,
	newBrowserIndex: number,
): { parentTabId: number | null; treeOrder: string } {
	// Build tree and flatten to get current logical order
	const tree = buildTree(allTabs);
	const flatList = flattenTree(tree);

	// Find the moved tab
	const movedTab = allTabs.find((t) => t.browserTabId === movedTabId);
	if (!movedTab) {
		return { parentTabId: null, treeOrder: "n" };
	}

	// Remove the moved tab from flat list to see what's at each position
	const withoutMoved = flatList.filter((t) => t.browserTabId !== movedTabId);

	// Get prev and next tabs at the new position
	const prevTab =
		newBrowserIndex > 0 ? withoutMoved[newBrowserIndex - 1] : null;
	const nextTab =
		newBrowserIndex < withoutMoved.length
			? withoutMoved[newBrowserIndex]
			: null;

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

	// Get siblings at the new parent level
	siblings = allTabs
		.filter(
			(t) => t.parentTabId === newParentId && t.browserTabId !== movedTabId,
		)
		.sort((a, b) =>
			a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
		);

	// Find where to insert among siblings based on browser order
	// We want to maintain the same relative position as in the browser
	let insertIndex = 0;
	for (let i = 0; i < siblings.length; i++) {
		const siblingBrowserIndex = withoutMoved.findIndex(
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

	return { parentTabId: newParentId, treeOrder };
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
