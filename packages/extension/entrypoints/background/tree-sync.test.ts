import { describe, expect, test } from "bun:test";
import type { Tab } from "@/schema/src/schema";
import {
	buildTree,
	flattenTree,
	flattenTreeToBrowserOrder,
	getExpectedBrowserOrder,
	inferTreeFromBrowserMove,
	promoteOnRemove,
} from "./tree-sync";

// Helper to create mock tabs
function createMockTab(
	browserTabId: number,
	parentTabId: number | null = null,
	treeOrder = "a0",
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
		url: `about:blank?${browserTabId}`,
		favIconUrl: null,
		titleOverride: null,
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
			createMockTab(1, null, "a0"), // a
			createMockTab(2, 1, "a0"), // a.1
			createMockTab(3, 1, "a1"), // a.2
			createMockTab(4, null, "a1"), // b
			createMockTab(5, 4, "a0"), // b.1
			createMockTab(6, 4, "a1"), // b.2
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
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 2, "a0"),
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
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 1, "a1"),
			createMockTab(4, null, "a1"),
		];

		const order = getExpectedBrowserOrder(tabs);

		expect(order.get(1)).toBe(0);
		expect(order.get(2)).toBe(1);
		expect(order.get(3)).toBe(2);
		expect(order.get(4)).toBe(3);
	});
});

describe("flattenTreeToBrowserOrder", () => {
	test("returns tab IDs in depth-first order", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 1, "a1"),
			createMockTab(4, null, "a1"),
		];
		expect(flattenTreeToBrowserOrder(tabs)).toEqual([1, 2, 3, 4]);
	});
});

describe("promoteOnRemove", () => {
	test("promotes only direct children; grandchildren stay under promoted child", () => {
		// grandparent(1) -> parent(2) -> child(3) -> grandchild(4)
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 2, "a0"),
			createMockTab(4, 3, "a0"),
		];
		const updates = promoteOnRemove(tabs, 2);
		// Only tab 3 (direct child of 2) is promoted to parent 1
		expect(updates.size).toBe(1);
		expect(updates.get(3)).toEqual({
			parentTabId: 1,
			treeOrder: expect.any(String),
		});
		// Tab 4 not in updates (stays child of 3)
		expect(updates.has(4)).toBe(false);
	});

	test("promotes multiple direct children with treeOrder between siblings", () => {
		// root(1) -> a(2), b(3). Remove 1 -> promote 2 and 3 to root
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 1, "a1"),
		];
		const updates = promoteOnRemove(tabs, 1);
		expect(updates.size).toBe(2);
		expect(updates.get(2)?.parentTabId).toBeNull();
		expect(updates.get(3)?.parentTabId).toBeNull();
		const order2 = updates.get(2)?.treeOrder;
		const order3 = updates.get(3)?.treeOrder;
		expect(order2).toBeDefined();
		expect(order3).toBeDefined();
		expect(order2 && order3 && order2 < order3).toBe(true);
	});

	test("returns empty map when tab has no children", () => {
		const tabs = [createMockTab(1, null, "a0"), createMockTab(2, null, "a1")];
		expect(promoteOnRemove(tabs, 1).size).toBe(0);
	});
});

describe("inferTreeFromBrowserMove", () => {
	test("parent moved after child flattens child and maintains order", () => {
		// a(1), b(2), c(3) with c child of b -> browser order 1,2,3. Move b to after c -> 1,3,2.
		// c must flatten to root (sibling of b), b gets new position at end
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, null, "a1"),
			createMockTab(3, 2, "a0"),
		];
		// Simulate: move tab 2 to index 2. New order: 1, 3, 2.
		const { updates, childrenToFlatten } = inferTreeFromBrowserMove(tabs, 2, 2);
		expect(childrenToFlatten).toContain(3);
		// Tab 2 at end -> root, treeOrder after tab 3 (which is now root)
		expect(updates.get(2)?.parentTabId).toBeNull();
		// Tab 3 flattened to root, before tab 2
		expect(updates.get(3)?.parentTabId).toBeNull();
		const t2 = updates.get(2)?.treeOrder;
		const t3 = updates.get(3)?.treeOrder;
		expect(t2).toBeDefined();
		expect(t3).toBeDefined();
		expect(t3 && t2 && t3 < t2).toBe(true);
	});

	test("child moved before parent flattens only that child", () => {
		// a(1), b(2), c(3) with c child of b. Move a (in browser) between b and c -> b, a, c.
		// a becomes child of b; c stays child of b.
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, null, "a1"),
			createMockTab(3, 2, "a0"),
		];
		// Move tab 1 to index 1. New order: 2, 1, 3. Tab after 1 is 3 (parent 2) -> new parent of 1 is 2.
		const { updates, childrenToFlatten } = inferTreeFromBrowserMove(tabs, 1, 1);
		expect(childrenToFlatten).toEqual([]);
		expect(updates.get(1)?.parentTabId).toBe(2);
		expect(updates.size).toBe(1);
	});

	test("moving tab back left from between parent and child flattens only that tab", () => {
		// b(2), a(1), c(3) with a and c children of b. Move a to index 0 -> a, b, c. a flattens to root.
		const tabs = [
			createMockTab(1, 2, "a0"),
			createMockTab(2, null, "a1"),
			createMockTab(3, 2, "a1"),
		];
		// New order: a, b, c. Move tab 1 to index 0.
		const { updates, childrenToFlatten } = inferTreeFromBrowserMove(tabs, 1, 0);
		expect(childrenToFlatten).toEqual([]);
		expect(updates.get(1)?.parentTabId).toBeNull();
		expect(updates.size).toBe(1);
	});
});
