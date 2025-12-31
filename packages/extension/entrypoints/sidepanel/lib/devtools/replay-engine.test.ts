import { describe, expect, test } from "bun:test";
import type { RecordingSession } from "./event-types";
import {
	assertSelection,
	assertTreeOrder,
	assertTreeStructure,
	getFinalState,
} from "./replay-engine";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Parse a recording session from JSON (as copied from DevTools panel)
 */
function _parseSession(json: string): RecordingSession {
	return JSON.parse(json);
}

// ============================================================================
// Example: Selection Order Tests
// ============================================================================

describe("Selection Order", () => {
	test("selection order is preserved when selecting multiple tabs", () => {
		// This test demonstrates that selecting tabs 3, 2, 1 in that order
		// should result in selection [3, 2, 1], not [1, 2, 3]
		const session: RecordingSession = {
			id: "test-selection-order",
			startTime: Date.now(),
			events: [
				{
					type: "user.selectionChange",
					timestamp: Date.now(),
					data: {
						tabId: 3,
						windowId: 1,
						action: "set",
						selectedTabIds: [3],
					},
				},
				{
					type: "user.selectionChange",
					timestamp: Date.now() + 100,
					data: {
						tabId: 2,
						windowId: 1,
						action: "add",
						selectedTabIds: [3, 2],
					},
				},
				{
					type: "user.selectionChange",
					timestamp: Date.now() + 200,
					data: {
						tabId: 1,
						windowId: 1,
						action: "add",
						selectedTabIds: [3, 2, 1],
					},
				},
			],
			initialState: {
				windows: [
					{
						id: "window-1" as never,
						browserWindowId: 1,
						focused: true,
						state: "normal",
						incognito: false,
						type: "normal",
						isCollapsed: false,
						titleOverride: null,
						createdAt: new Date(),
						updatedAt: new Date(),
						deletedAt: null,
					},
				],
				tabs: [
					{
						id: "tab-1" as never,
						browserTabId: 1,
						browserWindowId: 1,
						tabIndex: 0,
						parentTabId: null,
						treeOrder: "a0",
						isCollapsed: false,
						title: "Tab 1",
						url: "about:blank?1",
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
					},
					{
						id: "tab-2" as never,
						browserTabId: 2,
						browserWindowId: 1,
						tabIndex: 1,
						parentTabId: null,
						treeOrder: "a1",
						isCollapsed: false,
						title: "Tab 2",
						url: "about:blank?2",
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
					},
					{
						id: "tab-3" as never,
						browserTabId: 3,
						browserWindowId: 1,
						tabIndex: 2,
						parentTabId: null,
						treeOrder: "a2",
						isCollapsed: false,
						title: "Tab 3",
						url: "about:blank?3",
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
					},
				],
			},
		};

		const finalState = getFinalState(session);

		// Selection should be [3, 2, 1] - the order they were selected
		const result = assertSelection(finalState, [3, 2, 1]);
		expect(result.pass).toBe(true);
	});
});

// ============================================================================
// Example: Tree Structure Tests
// ============================================================================

describe("Tree Structure", () => {
	test("dragging tab as child creates correct parent relationship", () => {
		const session: RecordingSession = {
			id: "test-drag-child",
			startTime: Date.now(),
			events: [
				{
					type: "user.dragEnd",
					timestamp: Date.now(),
					data: {
						tabId: 2,
						windowId: 1,
						selectedTabIds: [2],
						dropTarget: {
							type: "child",
							windowId: 1,
							tabId: 1, // Dropping onto tab 1
						},
					},
				},
			],
			initialState: {
				windows: [
					{
						id: "window-1" as never,
						browserWindowId: 1,
						focused: true,
						state: "normal",
						incognito: false,
						type: "normal",
						isCollapsed: false,
						titleOverride: null,
						createdAt: new Date(),
						updatedAt: new Date(),
						deletedAt: null,
					},
				],
				tabs: [
					{
						id: "tab-1" as never,
						browserTabId: 1,
						browserWindowId: 1,
						tabIndex: 0,
						parentTabId: null,
						treeOrder: "a0",
						isCollapsed: false,
						title: "Tab 1",
						url: "about:blank?1",
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
					},
					{
						id: "tab-2" as never,
						browserTabId: 2,
						browserWindowId: 1,
						tabIndex: 1,
						parentTabId: null,
						treeOrder: "a1",
						isCollapsed: false,
						title: "Tab 2",
						url: "about:blank?2",
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
					},
				],
			},
		};

		const finalState = getFinalState(session);

		// Tab 2 should now be a child of Tab 1
		const result = assertTreeStructure(finalState, [
			{ tabId: 1, parentTabId: null },
			{ tabId: 2, parentTabId: 1 },
		]);
		expect(result.pass).toBe(true);

		// Order should be [1, 2] (parent first, then child)
		const orderResult = assertTreeOrder(finalState, 1, [1, 2]);
		expect(orderResult.pass).toBe(true);
	});
});

// ============================================================================
// Template for Recorded Session Tests
// ============================================================================

// Paste your recorded sessions here and write tests against them
// Example:
//
// const recordedSession = parseSession(`{
//   "id": "session-123",
//   "startTime": 1234567890,
//   "events": [...],
//   "initialState": {...}
// }`);
//
// describe("Recorded Session: [description]", () => {
//   test("expected behavior", () => {
//     const finalState = getFinalState(recordedSession);
//     // Assert expected state
//   });
// });
