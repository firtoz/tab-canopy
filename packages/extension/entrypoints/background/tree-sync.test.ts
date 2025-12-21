import { describe, expect, test } from "bun:test";
import type { Tab } from "@/schema/src/schema";
import { buildTree, flattenTree, getExpectedBrowserOrder } from "./tree-sync";

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
