import { describe, expect, test } from "bun:test";
import type { Tab } from "@/schema/src/schema";
import {
	buildTree,
	calculateTreePositionFromBrowserMove,
	flattenTree,
	getExpectedBrowserOrder,
} from "./tree-sync";

// Helper to create mock tabs
function createMockTab(
	browserTabId: number,
	parentTabId: number | null = null,
	treeOrder = "n",
): Tab {
	return {
		id: `tab-${browserTabId}` as Tab["id"],
		browserTabId,
		browserWindowId: 1,
		tabIndex: browserTabId,
		parentTabId,
		treeOrder,
		isCollapsed: false,
		title: `Tab ${browserTabId}`,
		url: `https://example.com/${browserTabId}`,
		favIconUrl: null,
		active: false,
		pinned: false,
		highlighted: false,
		discarded: false,
		frozen: false,
		autoDiscardable: true,
		audible: false,
		mutedInfo: null,
		status: "complete",
		groupId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
	};
}

describe("buildTree and flattenTree", () => {
	test("flattens tree in depth-first order", () => {
		// Tree structure:
		// - a (1)
		//   - a.1 (2)
		//   - a.2 (3)
		// - b (4)
		//   - b.1 (5)
		//   - b.2 (6)
		const tabs = [
			createMockTab(1, null, "a"), // a
			createMockTab(2, 1, "a"), // a.1
			createMockTab(3, 1, "b"), // a.2
			createMockTab(4, null, "b"), // b
			createMockTab(5, 4, "a"), // b.1
			createMockTab(6, 4, "b"), // b.2
		];

		const tree = buildTree(tabs);
		const flat = flattenTree(tree);
		const order = flat.map((t) => t.browserTabId);

		expect(order).toEqual([1, 2, 3, 4, 5, 6]);
	});

	test("handles deeply nested tree", () => {
		// Tree structure:
		// - a (1)
		//   - a.1 (2)
		//     - a.1.1 (3)
		const tabs = [
			createMockTab(1, null, "a"),
			createMockTab(2, 1, "a"),
			createMockTab(3, 2, "a"),
		];

		const tree = buildTree(tabs);
		const flat = flattenTree(tree);
		const order = flat.map((t) => t.browserTabId);

		expect(order).toEqual([1, 2, 3]);
	});
});

describe("getExpectedBrowserOrder", () => {
	test("returns correct browser indices", () => {
		const tabs = [
			createMockTab(1, null, "a"),
			createMockTab(2, 1, "a"),
			createMockTab(3, 1, "b"),
			createMockTab(4, null, "b"),
		];

		const order = getExpectedBrowserOrder(tabs);

		expect(order.get(1)).toBe(0);
		expect(order.get(2)).toBe(1);
		expect(order.get(3)).toBe(2);
		expect(order.get(4)).toBe(3);
	});
});

describe("calculateTreePositionFromBrowserMove", () => {
	/**
	 * Original tree:
	 * - a (1)
	 *   - a.1 (2)
	 *   - a.2 (3)
	 * - b (4)
	 *   - b.1 (5)
	 *   - b.2 (6)
	 *
	 * Browser order: 1, 2, 3, 4, 5, 6
	 */
	function createExampleTabs() {
		return [
			createMockTab(1, null, "a"), // a - index 0
			createMockTab(2, 1, "a"), // a.1 - index 1
			createMockTab(3, 1, "b"), // a.2 - index 2
			createMockTab(4, null, "b"), // b - index 3
			createMockTab(5, 4, "a"), // b.1 - index 4
			createMockTab(6, 4, "b"), // b.2 - index 5
		];
	}

	test("move a.1 between b and b.1 - becomes child of b", () => {
		// Moving tab 2 (a.1) to position 4 (between b and b.1)
		// New browser order: 1, 3, 4, 2, 5, 6
		// Expected: a.1 becomes child of b (sibling of b.1)
		const tabs = createExampleTabs();
		const result = calculateTreePositionFromBrowserMove(tabs, 2, 4);

		expect(result.parentTabId).toBe(4); // parent is b
	});

	test("move a.1 after b.2 - becomes root level", () => {
		// Moving tab 2 (a.1) to position 6 (after b.2, at the very end)
		// New browser order: 1, 3, 4, 5, 6, 2
		// Expected: a.1 becomes root level (after b)
		const tabs = createExampleTabs();
		const result = calculateTreePositionFromBrowserMove(tabs, 2, 6);

		// When at the very end with no next tab, and prevTab (b.2) is a child,
		// the moved tab becomes a sibling of prevTab's parent (root level)
		expect(result.parentTabId).toBe(null); // root level, as user specified
	});

	test("move b.2 above b - becomes root level sibling", () => {
		// Moving tab 6 (b.2) to position 3 (between a.2 and b)
		// New browser order: 1, 2, 3, 6, 4, 5
		// Expected: b.2 becomes root level (between a and b)
		const tabs = createExampleTabs();
		const result = calculateTreePositionFromBrowserMove(tabs, 6, 3);

		// a.2 (3) is at position 2, b (4) is at position 3 (now 4 after removal)
		// prev = a.2 (parent=1), next = b (parent=null)
		// b is NOT a child of a.2, so b.2 gets same parent as b (null)
		expect(result.parentTabId).toBe(null); // root level
	});

	test("move to very beginning - becomes first root", () => {
		const tabs = createExampleTabs();
		const result = calculateTreePositionFromBrowserMove(tabs, 5, 0);

		// Moving b.1 to position 0 (before a)
		// prev = null, next = a
		// b.1 should become root level
		expect(result.parentTabId).toBe(null);
	});

	test("move between parent and first child - becomes sibling of child", () => {
		// Moving tab 6 (b.2) to position 4 (between b and b.1)
		// New browser order: 1, 2, 3, 4, 6, 5
		// prev = b (4), next = b.1 (5)
		// b.1's parent is b, so b.2 becomes sibling of b.1 (child of b)
		const tabs = createExampleTabs();
		const result = calculateTreePositionFromBrowserMove(tabs, 6, 4);

		expect(result.parentTabId).toBe(4); // child of b
	});

	test("move within same parent - stays under same parent", () => {
		// Moving a.2 (3) before a.1 (2)
		// New browser order: 1, 3, 2, 4, 5, 6
		// prev = a (1), next = a.1 (2)
		// a.1's parent is a, so a.2 becomes sibling of a.1 (stays child of a)
		const tabs = createExampleTabs();
		const result = calculateTreePositionFromBrowserMove(tabs, 3, 1);

		expect(result.parentTabId).toBe(1); // still child of a
	});
});

describe("user requirement scenarios", () => {
	/**
	 * Starting tree:
	 * - a
	 *   - a.1
	 *   - a.2
	 * - b
	 *   - b.1
	 *   - b.2
	 */
	function createUserExampleTabs() {
		return [
			createMockTab(1, null, "b"), // a - treeOrder b to come after potential insertions
			createMockTab(11, 1, "m"), // a.1
			createMockTab(12, 1, "t"), // a.2
			createMockTab(2, null, "d"), // b
			createMockTab(21, 2, "m"), // b.1
			createMockTab(22, 2, "t"), // b.2
		];
	}

	test("scenario 1: move a.1 between b and b.1", () => {
		// Result should be:
		// - a
		//   - a.2
		// - b
		//   - a.1 (moved here)
		//   - b.1
		//   - b.2
		const tabs = createUserExampleTabs();
		// Original browser order: 1, 11, 12, 2, 21, 22
		// After moving a.1 (11) between b (2) and b.1 (21):
		// New order: 1, 12, 2, 11, 21, 22
		// Position 3 is between b (at new pos 2) and b.1 (at new pos 4)
		const result = calculateTreePositionFromBrowserMove(tabs, 11, 3);

		expect(result.parentTabId).toBe(2); // a.1 becomes child of b
	});

	test("scenario 2: move a.1 after b.2", () => {
		// Result should be:
		// - a
		//   - a.2
		// - b
		//   - b.1
		//   - b.2
		// - a.1 (moved here, root level)
		const tabs = createUserExampleTabs();
		// After moving to end (position 5, after b.2)
		const result = calculateTreePositionFromBrowserMove(tabs, 11, 5);

		// At the end, prev = b.2 (parent=b), next = none
		// When there's no next tab, becomes sibling of prev's parent (root level)
		expect(result.parentTabId).toBe(null); // root level, as user specified
	});

	test("scenario 3: move b.2 above b", () => {
		// Result should be:
		// - a
		//   - a.2
		// - b.2 (moved here, root level)
		// - b
		//   - b.1
		const tabs = createUserExampleTabs();
		// Moving b.2 (22) to position 3 (between a.2 and b)
		// Original: 1, 11, 12, 2, 21, 22
		// After: 1, 11, 12, 22, 2, 21
		const result = calculateTreePositionFromBrowserMove(tabs, 22, 3);

		// prev = a.2 (12, parent=1), next = b (2, parent=null)
		// b is NOT a child of a.2, so b.2 gets same parent as b (null)
		expect(result.parentTabId).toBe(null); // root level
	});
});
