import { generateKeyBetween } from "fractional-indexing";
import type { Tab } from "@/schema/src/schema";

/**
 * Default tree order value for new root-level tabs
 * Using fractional indexing default midpoint ("a0")
 */
export const DEFAULT_TREE_ORDER = generateKeyBetween(null, null);

/**
 * Represents a tab node in the tree structure
 */
export interface TabTreeNode {
	tab: Tab;
	children: TabTreeNode[];
	depth: number;
	/** Ancestor IDs from root to parent, e.g. [grandparentId, parentId] */
	ancestorIds: number[];
}

/**
 * Flattened tree node for rendering (includes depth info)
 */
export interface FlatTreeNode {
	tab: Tab;
	depth: number;
	hasChildren: boolean;
	isLastChild: boolean;
	/** Array of booleans indicating which indent guides to show */
	indentGuides: boolean[];
	/** Ancestor IDs from root to parent, e.g. [grandparentId, parentId] */
	ancestorIds: number[];
}

/**
 * Drop position for tree-aware drag and drop
 */
export type TreeDropPosition =
	| { type: "before"; targetTabId: number }
	| { type: "after"; targetTabId: number }
	| { type: "child"; parentTabId: number }
	| { type: "root"; index: number };

/**
 * Compare treeOrder strings using ASCII/Unicode code point order.
 * Do NOT use localeCompare as it doesn't respect ASCII ordering
 * (e.g., uppercase letters may sort differently).
 */
export function compareTreeOrder(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * Build a tree structure from a flat list of tabs
 */
export function buildTabTree(tabs: Tab[]): TabTreeNode[] {
	// Create a map for quick lookup
	const tabMap = new Map<number, Tab>();
	for (const tab of tabs) {
		tabMap.set(tab.browserTabId, tab);
	}

	// Group tabs by parent
	const childrenMap = new Map<number | null, Tab[]>();
	for (const tab of tabs) {
		const parentId = tab.parentTabId;
		if (!childrenMap.has(parentId)) {
			childrenMap.set(parentId, []);
		}
		childrenMap.get(parentId)?.push(tab);
	}

	// Sort children by treeOrder (using ASCII order, not locale)
	for (const children of childrenMap.values()) {
		children.sort((a, b) => compareTreeOrder(a.treeOrder, b.treeOrder));
	}

	// Recursively build tree
	function buildNode(
		tab: Tab,
		depth: number,
		ancestorIds: number[],
	): TabTreeNode {
		const children = childrenMap.get(tab.browserTabId) ?? [];
		const childAncestorIds = [...ancestorIds, tab.browserTabId];
		return {
			tab,
			depth,
			ancestorIds,
			children: children.map((child) =>
				buildNode(child, depth + 1, childAncestorIds),
			),
		};
	}

	// Build root nodes
	const rootTabs = childrenMap.get(null) ?? [];
	return rootTabs.map((tab) => buildNode(tab, 0, []));
}

/**
 * Flatten a tree into a list suitable for rendering
 * Respects collapsed state - collapsed nodes don't show children
 */
export function flattenTree(
	nodes: TabTreeNode[],
	parentIndentGuides: boolean[] = [],
): FlatTreeNode[] {
	const result: FlatTreeNode[] = [];

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const isLast = i === nodes.length - 1;
		const hasChildren = node.children.length > 0;

		result.push({
			tab: node.tab,
			depth: node.depth,
			hasChildren,
			isLastChild: isLast,
			indentGuides: [...parentIndentGuides],
			ancestorIds: node.ancestorIds,
		});

		// Only show children if not collapsed
		if (hasChildren && !node.tab.isCollapsed) {
			// For children, add indent guide: true if parent is NOT last, false if parent IS last
			const childIndentGuides = [...parentIndentGuides, !isLast];
			result.push(...flattenTree(node.children, childIndentGuides));
		}
	}

	return result;
}

/**
 * Get all descendant tab IDs of a given tab
 */
export function getDescendantIds(tabs: Tab[], parentId: number): number[] {
	const descendants: number[] = [];
	const queue = [parentId];

	while (queue.length > 0) {
		const currentId = queue.shift();
		if (currentId === undefined) break;
		for (const tab of tabs) {
			if (tab.parentTabId === currentId) {
				descendants.push(tab.browserTabId);
				queue.push(tab.browserTabId);
			}
		}
	}

	return descendants;
}

/**
 * Check if a tab is an ancestor of another tab
 */
export function isAncestor(
	tabs: Tab[],
	potentialAncestorId: number,
	tabId: number,
): boolean {
	const tabMap = new Map<number, Tab>();
	for (const tab of tabs) {
		tabMap.set(tab.browserTabId, tab);
	}

	let current = tabMap.get(tabId);
	while (current) {
		if (current.parentTabId === potentialAncestorId) {
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
 * Get the depth of a tab in the tree
 */
export function getTabDepth(tabs: Tab[], tabId: number): number {
	const tabMap = new Map<number, Tab>();
	for (const tab of tabs) {
		tabMap.set(tab.browserTabId, tab);
	}

	let depth = 0;
	let current = tabMap.get(tabId);
	while (current?.parentTabId !== null && current?.parentTabId !== undefined) {
		depth++;
		current = tabMap.get(current.parentTabId);
	}
	return depth;
}

/**
 * Get siblings of a tab (tabs with the same parent)
 */
export function getSiblings(tabs: Tab[], tab: Tab): Tab[] {
	return tabs
		.filter(
			(t) =>
				t.parentTabId === tab.parentTabId &&
				t.browserWindowId === tab.browserWindowId,
		)
		.sort((a, b) => compareTreeOrder(a.treeOrder, b.treeOrder));
}

/**
 * Calculate where to insert a tab when moving it in the tree
 * Returns the new parentTabId and treeOrder
 */
export function calculateTreeMove(
	tabs: Tab[],
	_movingTabId: number,
	dropPosition: TreeDropPosition,
): { parentTabId: number | null; treeOrder: string } {
	const tabMap = new Map<number, Tab>();
	for (const tab of tabs) {
		tabMap.set(tab.browserTabId, tab);
	}

	switch (dropPosition.type) {
		case "child": {
			// Becoming a child of the target
			const parent = tabMap.get(dropPosition.parentTabId);
			if (!parent) {
				return { parentTabId: null, treeOrder: DEFAULT_TREE_ORDER };
			}

			// Get existing children
			const siblings = tabs
				.filter((t) => t.parentTabId === dropPosition.parentTabId)
				.sort((a, b) => compareTreeOrder(a.treeOrder, b.treeOrder));

			// Insert at the beginning of children
			const firstSibling = siblings[0];
			const treeOrder = generateKeyBetween(
				null,
				firstSibling?.treeOrder || null,
			);

			return { parentTabId: dropPosition.parentTabId, treeOrder };
		}

		case "before": {
			const target = tabMap.get(dropPosition.targetTabId);
			if (!target) {
				return { parentTabId: null, treeOrder: DEFAULT_TREE_ORDER };
			}

			// Same parent as target
			const siblings = getSiblings(tabs, target);
			const targetIndex = siblings.findIndex(
				(s) => s.browserTabId === target.browserTabId,
			);
			const prevSibling =
				targetIndex > 0 ? siblings[targetIndex - 1] : undefined;

			const treeOrder = generateKeyBetween(
				prevSibling?.treeOrder || null,
				target.treeOrder,
			);

			return { parentTabId: target.parentTabId, treeOrder };
		}

		case "after": {
			const target = tabMap.get(dropPosition.targetTabId);
			if (!target) {
				return { parentTabId: null, treeOrder: DEFAULT_TREE_ORDER };
			}

			// Same parent as target
			const siblings = getSiblings(tabs, target);
			const targetIndex = siblings.findIndex(
				(s) => s.browserTabId === target.browserTabId,
			);
			const nextSibling =
				targetIndex < siblings.length - 1
					? siblings[targetIndex + 1]
					: undefined;

			const treeOrder = generateKeyBetween(
				target.treeOrder,
				nextSibling?.treeOrder || null,
			);

			return { parentTabId: target.parentTabId, treeOrder };
		}

		case "root": {
			// Moving to root level
			const rootTabs = tabs
				.filter((t) => t.parentTabId === null)
				.sort((a, b) => compareTreeOrder(a.treeOrder, b.treeOrder));

			if (dropPosition.index <= 0) {
				const first = rootTabs[0];
				return {
					parentTabId: null,
					treeOrder: generateKeyBetween(null, first?.treeOrder || null),
				};
			}

			if (dropPosition.index >= rootTabs.length) {
				const last = rootTabs[rootTabs.length - 1];
				return {
					parentTabId: null,
					treeOrder: generateKeyBetween(last?.treeOrder || null, null),
				};
			}

			const before = rootTabs[dropPosition.index - 1];
			const after = rootTabs[dropPosition.index];
			return {
				parentTabId: null,
				treeOrder: generateKeyBetween(
					before?.treeOrder || null,
					after?.treeOrder || null,
				),
			};
		}
	}
}

/**
 * When moving a tab, determine if its children should move with it
 * Children always move with their parent
 */
export function getTabsToMove(tabs: Tab[], tabId: number): number[] {
	return [tabId, ...getDescendantIds(tabs, tabId)];
}
