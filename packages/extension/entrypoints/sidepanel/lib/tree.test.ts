import { describe, expect, test } from "bun:test";
import { generateKeyBetween } from "fractional-indexing";
import type { Tab } from "@/schema/src/schema";
import {
	buildTabTree,
	calculateTreeMove,
	compareTreeOrder,
	flattenTree,
	getDescendantIds,
	getSiblings,
	isAncestor,
} from "./tree";

// Helper to create mock tabs
function createMockTab(
	browserTabId: number,
	parentTabId: number | null = null,
	treeOrder = "a0",
	isCollapsed = false,
): Tab {
	return {
		id: `tab-${browserTabId}` as Tab["id"],
		browserTabId,
		browserWindowId: 1,
		tabIndex: browserTabId,
		parentTabId,
		treeOrder,
		isCollapsed,
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

describe("compareTreeOrder", () => {
	test("sorts using ASCII order, not locale", () => {
		// 'H' (72) < 'a' (97) in ASCII, but localeCompare may differ
		expect(compareTreeOrder("H", "a0000")).toBe(-1);
		expect(compareTreeOrder("a0000", "H")).toBe(1);
	});

	test("handles digits before letters", () => {
		// '0' (48) < 'a' (97)
		expect(compareTreeOrder("0", "a")).toBe(-1);
		expect(compareTreeOrder("00", "a0")).toBe(-1);
	});

	test("equal values return 0", () => {
		expect(compareTreeOrder("abc", "abc")).toBe(0);
	});
});

describe("generateKeyBetween (fractional-indexing)", () => {
	test("generates default when no bounds", () => {
		const result = generateKeyBetween(null, null);
		expect(result).toBe("a0");
	});

	test("generates order before first", () => {
		const first = "a1";
		const result = generateKeyBetween(null, first);
		expect(result < first).toBe(true);
	});

	test("generates order before a0001", () => {
		const first = "a0001";
		const result = generateKeyBetween(null, first);
		expect(result < first).toBe(true);
	});

	test("generates order after last", () => {
		const last = "a0";
		const result = generateKeyBetween(last, null);
		expect(result > last).toBe(true);
	});

	test("generates order between two values", () => {
		const result = generateKeyBetween("a0", "a2");
		expect(result > "a0").toBe(true);
		expect(result < "a2").toBe(true);
	});

	test("handles close values", () => {
		const result = generateKeyBetween("a0", "a1");
		expect(result > "a0").toBe(true);
		expect(result < "a1").toBe(true);
	});

	test("can generate many values in order", () => {
		// Test that we can keep generating values in sequence
		let current = "a0";
		const values = [current];
		for (let i = 0; i < 10; i++) {
			const next = generateKeyBetween(current, null);
			expect(next > current).toBe(true);
			values.push(next);
			current = next;
		}
		// Verify all values are in order
		for (let i = 1; i < values.length; i++) {
			expect(values[i] > values[i - 1]).toBe(true);
		}
	});

	test("can insert between adjacent values", () => {
		const before = "a0";
		const after = "a1";
		const middle = generateKeyBetween(before, after);
		expect(middle > before).toBe(true);
		expect(middle < after).toBe(true);
	});
});

describe("buildTabTree", () => {
	test("builds tree from flat list", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, null, "a1"),
			createMockTab(3, 1, "a0"), // child of 1
			createMockTab(4, 1, "a1"), // child of 1
		];

		const tree = buildTabTree(tabs);

		expect(tree.length).toBe(2); // 2 root nodes
		expect(tree[0].tab.browserTabId).toBe(1);
		expect(tree[0].children.length).toBe(2);
		expect(tree[0].children[0].tab.browserTabId).toBe(3);
		expect(tree[0].children[1].tab.browserTabId).toBe(4);
		expect(tree[1].tab.browserTabId).toBe(2);
		expect(tree[1].children.length).toBe(0);
	});

	test("populates ancestorIds correctly", () => {
		const tabs = [
			createMockTab(1, null, "a0"), // root
			createMockTab(2, 1, "a0"), // child of 1
			createMockTab(3, 2, "a0"), // grandchild of 1, child of 2
			createMockTab(4, 3, "a0"), // great-grandchild
		];

		const tree = buildTabTree(tabs);

		// Root has empty ancestorIds
		expect(tree[0].ancestorIds).toEqual([]);
		// Child has parent's id
		expect(tree[0].children[0].ancestorIds).toEqual([1]);
		// Grandchild has [grandparent, parent]
		expect(tree[0].children[0].children[0].ancestorIds).toEqual([1, 2]);
		// Great-grandchild has [great-grandparent, grandparent, parent]
		expect(tree[0].children[0].children[0].children[0].ancestorIds).toEqual([
			1, 2, 3,
		]);
	});

	test("sorts by ASCII order, not locale order", () => {
		// 'H' (72) < 'a' (97) in ASCII
		// This tests that we use ASCII comparison, not localeCompare
		const tabs = [
			createMockTab(1, null, "a0000"), // Should come second
			createMockTab(2, null, "H"), // Should come first (H < a in ASCII)
		];

		const tree = buildTabTree(tabs);

		expect(tree.length).toBe(2);
		expect(tree[0].tab.browserTabId).toBe(2); // 'H' comes first
		expect(tree[1].tab.browserTabId).toBe(1); // 'a0000' comes second
	});

	test("handles deeply nested tree", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"), // child of 1
			createMockTab(3, 2, "a0"), // child of 2 (grandchild of 1)
		];

		const tree = buildTabTree(tabs);

		expect(tree.length).toBe(1);
		expect(tree[0].children.length).toBe(1);
		expect(tree[0].children[0].children.length).toBe(1);
		expect(tree[0].children[0].children[0].tab.browserTabId).toBe(3);
	});

	test("sorts children by treeOrder", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(4, 1, "a2"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 1, "a1"),
		];

		const tree = buildTabTree(tabs);

		expect(tree[0].children[0].tab.browserTabId).toBe(2); // a0
		expect(tree[0].children[1].tab.browserTabId).toBe(3); // b0
		expect(tree[0].children[2].tab.browserTabId).toBe(4); // c0
	});
});

describe("flattenTree", () => {
	test("flattens tree to list with correct depth", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 2, "a0"),
		];

		const tree = buildTabTree(tabs);
		const flat = flattenTree(tree);

		expect(flat.length).toBe(3);
		expect(flat[0].depth).toBe(0);
		expect(flat[1].depth).toBe(1);
		expect(flat[2].depth).toBe(2);
	});

	test("respects collapsed state", () => {
		const tabs = [
			createMockTab(1, null, "a0", true), // collapsed
			createMockTab(2, 1, "a0"),
			createMockTab(3, 1, "a1"),
		];

		const tree = buildTabTree(tabs);
		const flat = flattenTree(tree);

		// Only root should be visible when collapsed
		expect(flat.length).toBe(1);
		expect(flat[0].tab.browserTabId).toBe(1);
	});

	test("marks hasChildren correctly", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, null, "a1"),
		];

		const tree = buildTabTree(tabs);
		const flat = flattenTree(tree);

		expect(flat[0].hasChildren).toBe(true); // tab 1 has children
		expect(flat[1].hasChildren).toBe(false); // tab 2 has no children
		expect(flat[2].hasChildren).toBe(false); // tab 3 has no children
	});

	test("propagates ancestorIds to flat nodes", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 2, "a0"),
		];

		const tree = buildTabTree(tabs);
		const flat = flattenTree(tree);

		expect(flat[0].ancestorIds).toEqual([]); // tab 1 at root
		expect(flat[1].ancestorIds).toEqual([1]); // tab 2, child of 1
		expect(flat[2].ancestorIds).toEqual([1, 2]); // tab 3, child of 2, grandchild of 1
	});
});

describe("getDescendantIds", () => {
	test("gets all descendants", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 2, "a0"),
			createMockTab(4, 1, "a1"),
			createMockTab(5, null, "a1"),
		];

		const descendants = getDescendantIds(tabs, 1);

		expect(descendants).toContain(2);
		expect(descendants).toContain(3);
		expect(descendants).toContain(4);
		expect(descendants).not.toContain(1); // not self
		expect(descendants).not.toContain(5); // not a descendant
	});

	test("returns empty for leaf nodes", () => {
		const tabs = [createMockTab(1, null, "a0"), createMockTab(2, 1, "a0")];

		const descendants = getDescendantIds(tabs, 2);
		expect(descendants.length).toBe(0);
	});
});

describe("isAncestor", () => {
	test("returns true for direct parent", () => {
		const tabs = [createMockTab(1, null, "a0"), createMockTab(2, 1, "a0")];

		expect(isAncestor(tabs, 1, 2)).toBe(true);
	});

	test("returns true for grandparent", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 2, "a0"),
		];

		expect(isAncestor(tabs, 1, 3)).toBe(true);
	});

	test("returns false for non-ancestor", () => {
		const tabs = [createMockTab(1, null, "a0"), createMockTab(2, null, "a1")];

		expect(isAncestor(tabs, 1, 2)).toBe(false);
	});

	test("returns false for self", () => {
		const tabs = [createMockTab(1, null, "a0")];

		expect(isAncestor(tabs, 1, 1)).toBe(false);
	});
});

describe("getSiblings", () => {
	test("gets siblings with same parent", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, 1, "a0"),
			createMockTab(3, 1, "a1"),
			createMockTab(4, 1, "a2"),
		];

		const siblings = getSiblings(tabs, tabs[1]);

		expect(siblings.length).toBe(3);
		expect(siblings[0].browserTabId).toBe(2);
		expect(siblings[1].browserTabId).toBe(3);
		expect(siblings[2].browserTabId).toBe(4);
	});

	test("gets root level siblings", () => {
		const tabs = [
			createMockTab(1, null, "a0"),
			createMockTab(2, null, "a1"),
			createMockTab(3, 1, "a0"),
		];

		const siblings = getSiblings(tabs, tabs[0]);

		expect(siblings.length).toBe(2);
		expect(siblings[0].browserTabId).toBe(1);
		expect(siblings[1].browserTabId).toBe(2);
	});
});

describe("calculateTreeMove", () => {
	describe("child drop", () => {
		test("inserting as first child", () => {
			const tabs = [createMockTab(1, null, "a0"), createMockTab(2, null, "a1")];

			const result = calculateTreeMove(tabs, 2, {
				type: "child",
				parentTabId: 1,
			});

			expect(result.parentTabId).toBe(1);
			expect(result.treeOrder).toBeDefined();
		});

		test("inserting as child when parent has children", () => {
			const tabs = [
				createMockTab(1, null, "a0"),
				createMockTab(2, 1, "a1"),
				createMockTab(3, null, "a2"),
			];

			const result = calculateTreeMove(tabs, 3, {
				type: "child",
				parentTabId: 1,
			});

			expect(result.parentTabId).toBe(1);
			expect(result.treeOrder < "a1").toBe(true); // inserted before first child
		});
	});

	describe("sibling drop - before", () => {
		test("inserting before sibling", () => {
			const tabs = [
				createMockTab(1, null, "a0"),
				createMockTab(2, null, "a1"),
				createMockTab(3, null, "a2"),
			];

			const result = calculateTreeMove(tabs, 3, {
				type: "before",
				targetTabId: 2,
			});

			expect(result.parentTabId).toBe(null);
			expect(result.treeOrder > "a0").toBe(true);
			expect(result.treeOrder < "a1").toBe(true);
		});

		test("inserting before first sibling", () => {
			const tabs = [createMockTab(1, null, "a1"), createMockTab(2, null, "a2")];

			const result = calculateTreeMove(tabs, 2, {
				type: "before",
				targetTabId: 1,
			});

			expect(result.parentTabId).toBe(null);
			expect(result.treeOrder < "a1").toBe(true);
		});
	});

	describe("sibling drop - after", () => {
		test("inserting after sibling", () => {
			const tabs = [
				createMockTab(1, null, "a0"),
				createMockTab(2, null, "a1"),
				createMockTab(3, null, "a2"),
			];

			const result = calculateTreeMove(tabs, 3, {
				type: "after",
				targetTabId: 1,
			});

			expect(result.parentTabId).toBe(null);
			expect(result.treeOrder > "a0").toBe(true);
			expect(result.treeOrder < "a1").toBe(true);
		});

		test("inserting after last sibling", () => {
			const tabs = [createMockTab(1, null, "a0"), createMockTab(2, null, "a1")];

			const result = calculateTreeMove(tabs, 1, {
				type: "after",
				targetTabId: 2,
			});

			expect(result.parentTabId).toBe(null);
			expect(result.treeOrder > "a1").toBe(true);
		});
	});

	describe("root drop", () => {
		test("inserting at root start", () => {
			const tabs = [createMockTab(1, null, "a1"), createMockTab(2, 1, "a0")];

			const result = calculateTreeMove(tabs, 2, {
				type: "root",
				index: 0,
			});

			expect(result.parentTabId).toBe(null);
			expect(result.treeOrder < "a1").toBe(true);
		});

		test("inserting at root end", () => {
			const tabs = [createMockTab(1, null, "a0"), createMockTab(2, 1, "a0")];

			const result = calculateTreeMove(tabs, 2, {
				type: "root",
				index: 999, // beyond length
			});

			expect(result.parentTabId).toBe(null);
			expect(result.treeOrder > "a0").toBe(true);
		});
	});
});

describe("tree movement scenarios from user requirements", () => {
	/**
	 * Example from user:
	 * - a
	 * - b
	 * - c
	 *    - c.1
	 *    - c.2
	 * - d
	 */
	function createExampleTree() {
		return [
			createMockTab(1, null, "a0"), // a
			createMockTab(2, null, "a1"), // b
			createMockTab(3, null, "a2"), // c
			createMockTab(31, 3, "a0"), // c.1
			createMockTab(32, 3, "a1"), // c.2
			createMockTab(4, null, "a3"), // d
		];
	}

	test("move b between c and c.1 - should become child of c", () => {
		// User scenario: "if we move b between c and c.1, it will be added inside c before c.1"
		const tabs = createExampleTree();
		const c1Order = tabs.find((t) => t.browserTabId === 31)?.treeOrder;
		if (!c1Order) throw new Error("c1Order not found");

		// Moving b (tab 2) to be a child of c (tab 3), inserted at beginning of children
		const result = calculateTreeMove(tabs, 2, {
			type: "child",
			parentTabId: 3,
		});

		expect(result.parentTabId).toBe(3);
		expect(result.treeOrder < c1Order).toBe(true); // before c.1
	});

	test("move c.1 after c.2 - stays child of c", () => {
		const tabs = createExampleTree();
		const c2Order = tabs.find((t) => t.browserTabId === 32)?.treeOrder;
		if (!c2Order) throw new Error("c2Order not found");

		// Moving c.1 (tab 31) after c.2 (tab 32)
		const result = calculateTreeMove(tabs, 31, {
			type: "after",
			targetTabId: 32,
		});

		expect(result.parentTabId).toBe(3); // still child of c
		expect(result.treeOrder > c2Order).toBe(true); // after c.2
	});

	test("move c.1 after d - breaks out of c, becomes root sibling", () => {
		// User scenario: "if it's moved after d, it will no longer be under c because d being outside of c 'breaks' it out"
		const tabs = createExampleTree();
		const dOrder = tabs.find((t) => t.browserTabId === 4)?.treeOrder;
		if (!dOrder) throw new Error("dOrder not found");

		// Moving c.1 (tab 31) after d (tab 4) as sibling
		const result = calculateTreeMove(tabs, 31, {
			type: "after",
			targetTabId: 4,
		});

		expect(result.parentTabId).toBe(null); // becomes root level
		expect(result.treeOrder > dOrder).toBe(true); // after d
	});
});

describe("buildTabTree - orphaned tabs", () => {
	test("treats tabs with non-existent parent as root-level tabs", () => {
		// Simulate what happens when a parent tab is deleted
		// but its children still reference it
		const tabs = [
			createMockTab(1, null, "a0"), // root tab
			createMockTab(2, 999, "a0"), // orphan - parent 999 doesn't exist
			createMockTab(3, null, "b0"), // another root tab
		];

		const tree = buildTabTree(tabs);

		// All three tabs should be visible as root-level tabs
		expect(tree.length).toBe(3);
		expect(tree[0].tab.browserTabId).toBe(1);
		expect(tree[1].tab.browserTabId).toBe(2); // orphan should appear
		expect(tree[2].tab.browserTabId).toBe(3);
	});

	test("deeply nested orphaned tabs are promoted to root", () => {
		// Tab C was a grandchild of A, but both A and B are gone
		const tabs = [
			createMockTab(1, null, "a0"), // root tab
			createMockTab(3, 999, "a0"), // orphan - parent 999 doesn't exist
			createMockTab(4, 3, "a0"), // child of orphan should still work
		];

		const tree = buildTabTree(tabs);

		// Should have 2 root nodes: tab 1 and orphan tab 3
		expect(tree.length).toBe(2);
		expect(tree[0].tab.browserTabId).toBe(1);
		expect(tree[1].tab.browserTabId).toBe(3); // orphan as root
		expect(tree[1].children.length).toBe(1); // orphan's child still works
		expect(tree[1].children[0].tab.browserTabId).toBe(4);
	});
});
