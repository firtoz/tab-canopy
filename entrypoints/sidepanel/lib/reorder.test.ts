import { describe, expect, test } from "bun:test";
import {
	calculateSequentialMoves,
	hoverToPosition,
	type ReorderPosition,
	reorderItems,
	reorderTabIds,
	resolvePosition,
	simulateSequentialMoves,
} from "./reorder";

describe("resolvePosition", () => {
	const items = [0, 1, 2, 3, 4, 5];
	const selection = [2, 3];

	test("start returns 0", () => {
		expect(resolvePosition(items, selection, "start")).toBe(0);
	});

	test("end returns length - selection.length", () => {
		expect(resolvePosition(items, selection, "end")).toBe(4);
	});

	test("before returns the index", () => {
		expect(resolvePosition(items, selection, { before: 3 })).toBe(3);
	});

	test("after returns index + 1", () => {
		expect(resolvePosition(items, selection, { after: 3 })).toBe(4);
	});
});

describe("hoverToPosition", () => {
	test("above returns before", () => {
		expect(hoverToPosition(3, "above")).toEqual({ before: 3 });
	});

	test("below returns after", () => {
		expect(hoverToPosition(3, "below")).toEqual({ after: 3 });
	});
});

describe("reorderItems", () => {
	describe("single item moves", () => {
		test("move item to start", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [3], "start");
			expect(result.result).toEqual([3, 0, 1, 2, 4]);
			expect(result.targetIndex).toBe(0);
		});

		test("move item to end", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [1], "end");
			expect(result.result).toEqual([0, 2, 3, 4, 1]);
			expect(result.targetIndex).toBe(4);
		});

		test("move item before another", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [4], { before: 1 });
			expect(result.result).toEqual([0, 4, 1, 2, 3]);
			expect(result.targetIndex).toBe(1);
		});

		test("move item after another", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [0], { after: 3 });
			expect(result.result).toEqual([1, 2, 3, 0, 4]);
			expect(result.targetIndex).toBe(3);
		});
	});

	describe("multi-item moves", () => {
		test("move multiple items to start", () => {
			const items = [0, 1, 2, 3, 4, 5];
			const result = reorderItems(items, [3, 4], "start");
			expect(result.result).toEqual([3, 4, 0, 1, 2, 5]);
			expect(result.targetIndex).toBe(0);
		});

		test("move multiple items to end", () => {
			const items = [0, 1, 2, 3, 4, 5];
			const result = reorderItems(items, [1, 2], "end");
			expect(result.result).toEqual([0, 3, 4, 5, 1, 2]);
			expect(result.targetIndex).toBe(4);
		});

		test("move non-contiguous items (preserves order)", () => {
			const items = [0, 1, 2, 3, 4, 5];
			// Select items 1 and 4 (non-contiguous)
			const result = reorderItems(items, [1, 4], "start");
			expect(result.result).toEqual([1, 4, 0, 2, 3, 5]);
			expect(result.targetIndex).toBe(0);
		});

		test("move 0, 1, 2 to after 5 (user's example)", () => {
			const items = [0, 1, 2, 3, 4, 5];
			const result = reorderItems(items, [0, 1, 2], { after: 5 });
			expect(result.result).toEqual([3, 4, 5, 0, 1, 2]);
			expect(result.targetIndex).toBe(3);
		});

		test("move 0, 1, 2 before 5", () => {
			const items = [0, 1, 2, 3, 4, 5];
			const result = reorderItems(items, [0, 1, 2], { before: 5 });
			expect(result.result).toEqual([3, 4, 0, 1, 2, 5]);
			expect(result.targetIndex).toBe(2);
		});
	});

	describe("edge cases", () => {
		test("empty selection returns original array", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [], "start");
			expect(result.result).toEqual([0, 1, 2, 3, 4]);
			expect(result.moves).toEqual([]);
		});

		test("move all items to start (no change)", () => {
			const items = [0, 1, 2];
			const result = reorderItems(items, [0, 1, 2], "start");
			expect(result.result).toEqual([0, 1, 2]);
		});

		test("move all items to end (no change)", () => {
			const items = [0, 1, 2];
			const result = reorderItems(items, [0, 1, 2], "end");
			expect(result.result).toEqual([0, 1, 2]);
		});

		test("move first item to start (no change)", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [0], "start");
			expect(result.result).toEqual([0, 1, 2, 3, 4]);
		});

		test("move last item to end (no change)", () => {
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [4], "end");
			expect(result.result).toEqual([0, 1, 2, 3, 4]);
		});
	});

	describe("index adjustment", () => {
		test("target adjusts when selection is before target", () => {
			// Moving [0, 1] to after index 4
			// Original: [0, 1, 2, 3, 4]
			// After removing [0, 1]: [2, 3, 4]
			// Index 4 becomes index 2 (adjusted by 2 removed items)
			// Insert after index 2: [2, 3, 4, 0, 1]
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [0, 1], { after: 4 });
			expect(result.result).toEqual([2, 3, 4, 0, 1]);
		});

		test("target adjusts when selection is partially before target", () => {
			// Moving [1, 3] to after index 4
			// Original: [0, 1, 2, 3, 4]
			// After removing [1, 3]: [0, 2, 4]
			// Index 4 had 2 items before it removed, so becomes index 2
			const items = [0, 1, 2, 3, 4];
			const result = reorderItems(items, [1, 3], { after: 4 });
			expect(result.result).toEqual([0, 2, 4, 1, 3]);
		});
	});

	describe("move operations", () => {
		test("returns correct move operations", () => {
			const items = ["a", "b", "c", "d", "e"];
			const result = reorderItems(items, ["b", "d"], "start");

			expect(result.moves).toEqual([
				{ item: "b", fromIndex: 1, toIndex: 0 },
				{ item: "d", fromIndex: 3, toIndex: 1 },
			]);
		});
	});
});

describe("reorderTabIds", () => {
	test("works with tab IDs", () => {
		const allTabIds = [101, 102, 103, 104, 105];
		const selectedTabIds = [103, 104];

		const result = reorderTabIds(allTabIds, selectedTabIds, "start");
		expect(result.result).toEqual([103, 104, 101, 102, 105]);
	});

	test("preserves order from original array (not selection order)", () => {
		const allTabIds = [101, 102, 103, 104, 105];
		// Selection in different order than they appear in allTabIds
		const selectedTabIds = [104, 102];

		const result = reorderTabIds(allTabIds, selectedTabIds, "start");
		// Should use order from allTabIds: 102 comes before 104
		expect(result.result).toEqual([102, 104, 101, 103, 105]);
	});
});

describe("realistic drag scenarios", () => {
	test("drag item 11 to end in 13-item list", () => {
		// User has 13 items [0-12], drags item 11 to after item 12
		const tabs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
		const result = reorderItems(tabs, [11], hoverToPosition(12, "below"));
		expect(result.result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 11]);
		expect(result.targetIndex).toBe(12);
	});

	test("drag single tab down", () => {
		// User drags tab 1 to after tab 3
		const tabs = [0, 1, 2, 3, 4];
		const result = reorderItems(tabs, [1], hoverToPosition(3, "below"));
		expect(result.result).toEqual([0, 2, 3, 1, 4]);
	});

	test("drag single tab up", () => {
		// User drags tab 3 to before tab 1
		const tabs = [0, 1, 2, 3, 4];
		const result = reorderItems(tabs, [3], hoverToPosition(1, "above"));
		expect(result.result).toEqual([0, 3, 1, 2, 4]);
	});

	test("drag multiple tabs down", () => {
		// User selects 0, 1, 2 and drags to after 5
		const tabs = [0, 1, 2, 3, 4, 5];
		const result = reorderItems(tabs, [0, 1, 2], hoverToPosition(5, "below"));
		expect(result.result).toEqual([3, 4, 5, 0, 1, 2]);
	});

	test("drag multiple tabs up", () => {
		// User selects 3, 4, 5 and drags to before 1
		const tabs = [0, 1, 2, 3, 4, 5];
		const result = reorderItems(tabs, [3, 4, 5], hoverToPosition(1, "above"));
		expect(result.result).toEqual([0, 3, 4, 5, 1, 2]);
	});

	test("drag non-contiguous selection", () => {
		// User selects 1 and 4, drags to start
		const tabs = [0, 1, 2, 3, 4, 5];
		const result = reorderItems(tabs, [1, 4], hoverToPosition(0, "above"));
		expect(result.result).toEqual([1, 4, 0, 2, 3, 5]);
	});
});

describe("calculateSequentialMoves", () => {
	describe("basic moves", () => {
		test("single item to end", () => {
			const tabs = [0, 1, 2, 3, 4];
			const ops = calculateSequentialMoves(tabs, [1], "end");
			expect(ops).toHaveLength(1);
			expect(simulateSequentialMoves(tabs, [1], "end")).toEqual([
				0, 2, 3, 4, 1,
			]);
		});

		test("single item to start", () => {
			const tabs = [0, 1, 2, 3, 4];
			const ops = calculateSequentialMoves(tabs, [3], "start");
			expect(ops).toHaveLength(1);
			expect(simulateSequentialMoves(tabs, [3], "start")).toEqual([
				3, 0, 1, 2, 4,
			]);
		});
	});

	describe("multiple contiguous items", () => {
		test("move 0,1,2 to end", () => {
			const tabs = [0, 1, 2, 3, 4, 5];
			const ops = calculateSequentialMoves(tabs, [0, 1, 2], "end");
			expect(ops).toHaveLength(3);

			// Verify each operation
			const finalState = simulateSequentialMoves(tabs, [0, 1, 2], "end");
			expect(finalState).toEqual([3, 4, 5, 0, 1, 2]);

			// Verify it matches reorderItems
			const expected = reorderItems(tabs, [0, 1, 2], "end");
			expect(finalState).toEqual(expected.result);
		});

		test("move 3,4,5 to start", () => {
			const tabs = [0, 1, 2, 3, 4, 5];
			const finalState = simulateSequentialMoves(tabs, [3, 4, 5], "start");
			expect(finalState).toEqual([3, 4, 5, 0, 1, 2]);

			const expected = reorderItems(tabs, [3, 4, 5], "start");
			expect(finalState).toEqual(expected.result);
		});
	});

	describe("non-contiguous items - the tricky case", () => {
		test("move items from top, middle, bottom to end", () => {
			// User's example: 3 items - 1 from top, 1 middle, 1 bottom -> below bottom
			const tabs = [0, 1, 2, 3, 4, 5, 6, 7];
			const selected = [1, 4, 6]; // top-ish, middle, bottom-ish

			const finalState = simulateSequentialMoves(tabs, selected, "end");
			// Expected: [0, 2, 3, 5, 7, 1, 4, 6]
			expect(finalState).toEqual([0, 2, 3, 5, 7, 1, 4, 6]);

			// Verify matches reorderItems
			const expected = reorderItems(tabs, selected, "end");
			expect(finalState).toEqual(expected.result);
		});

		test("move items 0, 4 to end", () => {
			const tabs = [0, 1, 2, 3, 4, 5];
			const selected = [0, 4];

			const finalState = simulateSequentialMoves(tabs, selected, "end");
			expect(finalState).toEqual([1, 2, 3, 5, 0, 4]);

			const expected = reorderItems(tabs, selected, "end");
			expect(finalState).toEqual(expected.result);
		});

		test("move items 1, 3, 5 to start", () => {
			const tabs = [0, 1, 2, 3, 4, 5];
			const selected = [1, 3, 5];

			const finalState = simulateSequentialMoves(tabs, selected, "start");
			expect(finalState).toEqual([1, 3, 5, 0, 2, 4]);

			const expected = reorderItems(tabs, selected, "start");
			expect(finalState).toEqual(expected.result);
		});
	});

	describe("move to middle positions", () => {
		test("move first item to after third", () => {
			const tabs = [0, 1, 2, 3, 4];
			const selected = [0];

			const finalState = simulateSequentialMoves(tabs, selected, { after: 2 });
			expect(finalState).toEqual([1, 2, 0, 3, 4]);

			const expected = reorderItems(tabs, selected, { after: 2 });
			expect(finalState).toEqual(expected.result);
		});

		test("move last item to before second", () => {
			const tabs = [0, 1, 2, 3, 4];
			const selected = [4];

			const finalState = simulateSequentialMoves(tabs, selected, { before: 1 });
			expect(finalState).toEqual([0, 4, 1, 2, 3]);

			const expected = reorderItems(tabs, selected, { before: 1 });
			expect(finalState).toEqual(expected.result);
		});

		test("move multiple items to middle", () => {
			const tabs = [0, 1, 2, 3, 4, 5];
			const selected = [0, 5];

			const finalState = simulateSequentialMoves(tabs, selected, { after: 2 });
			expect(finalState).toEqual([1, 2, 0, 5, 3, 4]);

			const expected = reorderItems(tabs, selected, { after: 2 });
			expect(finalState).toEqual(expected.result);
		});
	});

	describe("edge cases", () => {
		test("empty selection returns empty operations", () => {
			const tabs = [0, 1, 2, 3, 4];
			const ops = calculateSequentialMoves(tabs, [], "end");
			expect(ops).toEqual([]);
		});

		test("move item that is already at target", () => {
			const tabs = [0, 1, 2, 3, 4];
			// Moving item 4 to end should be effectively no-op
			const finalState = simulateSequentialMoves(tabs, [4], "end");
			expect(finalState).toEqual([0, 1, 2, 3, 4]);
		});

		test("move all items to end (no change)", () => {
			const tabs = [0, 1, 2];
			const finalState = simulateSequentialMoves(tabs, [0, 1, 2], "end");
			expect(finalState).toEqual([0, 1, 2]);
		});
	});

	describe("operations match reorderItems for all cases", () => {
		const testCases: {
			name: string;
			tabs: number[];
			selected: number[];
			position: ReorderPosition;
		}[] = [
			{
				name: "single to end",
				tabs: [0, 1, 2, 3, 4],
				selected: [2],
				position: "end",
			},
			{
				name: "single to start",
				tabs: [0, 1, 2, 3, 4],
				selected: [2],
				position: "start",
			},
			{
				name: "pair to end",
				tabs: [0, 1, 2, 3, 4],
				selected: [1, 3],
				position: "end",
			},
			{
				name: "pair to start",
				tabs: [0, 1, 2, 3, 4],
				selected: [1, 3],
				position: "start",
			},
			{
				name: "triple to end",
				tabs: [0, 1, 2, 3, 4, 5],
				selected: [0, 2, 4],
				position: "end",
			},
			{
				name: "triple to start",
				tabs: [0, 1, 2, 3, 4, 5],
				selected: [1, 3, 5],
				position: "start",
			},
			{
				name: "move down",
				tabs: [0, 1, 2, 3, 4],
				selected: [1],
				position: { after: 3 },
			},
			{
				name: "move up",
				tabs: [0, 1, 2, 3, 4],
				selected: [3],
				position: { before: 1 },
			},
			{
				name: "non-contiguous to middle",
				tabs: [0, 1, 2, 3, 4, 5, 6, 7],
				selected: [1, 5],
				position: { after: 3 },
			},
		];

		for (const tc of testCases) {
			test(tc.name, () => {
				const sequential = simulateSequentialMoves(
					tc.tabs,
					tc.selected,
					tc.position,
				);
				const expected = reorderItems(tc.tabs, tc.selected, tc.position);
				expect(sequential).toEqual(expected.result);
			});
		}
	});
});
