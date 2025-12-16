/**
 * Replay Engine - Simulates recorded events against initial state
 * Used for testing tab tree behavior without a browser
 */

import type { Tab, Window } from "@/schema/src/schema";
import {
	buildTabTree,
	calculateTreeMove,
	flattenTree,
	getDescendantIds,
	type TreeDropPosition,
} from "../tree";
import type {
	RecordedEvent,
	RecordingSession,
	UserDragEndEvent,
	UserSelectionChangeEvent,
} from "./event-types";

// ============================================================================
// Simulated State
// ============================================================================

export interface SimulatedState {
	windows: Window[];
	tabs: Tab[];
	/** Current selection (ordered - first selected is first in array) */
	selectedTabIds: number[];
}

// ============================================================================
// Apply Events to State
// ============================================================================

/**
 * Apply a single event to the state and return the new state
 */
export function applyEvent(
	state: SimulatedState,
	event: RecordedEvent,
): SimulatedState {
	const newState = {
		windows: [...state.windows],
		tabs: state.tabs.map((t) => ({ ...t })),
		selectedTabIds: [...state.selectedTabIds],
	};

	switch (event.type) {
		// Chrome events that affect tab state
		case "chrome.tabs.onCreated": {
			const newTab = event.data.tab;
			if (newTab.id === undefined || newTab.windowId === undefined) break;
			newState.tabs.push({
				id: `tab-${newTab.id}` as Tab["id"],
				browserTabId: newTab.id,
				browserWindowId: newTab.windowId,
				tabIndex: newTab.index,
				parentTabId: null,
				treeOrder: "z9999", // Will be recalculated
				isCollapsed: false,
				title: newTab.title ?? null,
				url: newTab.url ?? null,
				favIconUrl: newTab.favIconUrl ?? null,
				active: newTab.active ?? false,
				pinned: newTab.pinned ?? false,
				highlighted: newTab.highlighted ?? false,
				discarded: newTab.discarded ?? false,
				frozen: false,
				autoDiscardable: newTab.autoDiscardable ?? true,
				audible: newTab.audible ?? false,
				mutedInfo: newTab.mutedInfo ? JSON.stringify(newTab.mutedInfo) : null,
				status: (newTab.status as Tab["status"]) ?? "complete",
				groupId: newTab.groupId ?? null,
				createdAt: new Date(),
				updatedAt: new Date(),
				deletedAt: null,
			});
			break;
		}

		case "chrome.tabs.onRemoved": {
			newState.tabs = newState.tabs.filter(
				(t) => t.browserTabId !== event.data.tabId,
			);
			newState.selectedTabIds = newState.selectedTabIds.filter(
				(id) => id !== event.data.tabId,
			);
			break;
		}

		case "chrome.tabs.onMoved": {
			const tab = newState.tabs.find(
				(t) => t.browserTabId === event.data.tabId,
			);
			if (tab) {
				tab.tabIndex = event.data.moveInfo.toIndex;
			}
			break;
		}

		case "chrome.tabs.onDetached": {
			// Tab detached from window - update window ID to -1 temporarily
			const tab = newState.tabs.find(
				(t) => t.browserTabId === event.data.tabId,
			);
			if (tab) {
				tab.browserWindowId = -1;
			}
			break;
		}

		case "chrome.tabs.onAttached": {
			const tab = newState.tabs.find(
				(t) => t.browserTabId === event.data.tabId,
			);
			if (tab) {
				tab.browserWindowId = event.data.attachInfo.newWindowId;
				tab.tabIndex = event.data.attachInfo.newPosition;
			}
			break;
		}

		case "chrome.windows.onCreated": {
			const win = event.data.window;
			if (win.id === undefined) break;
			newState.windows.push({
				id: `window-${win.id}` as Window["id"],
				browserWindowId: win.id,
				focused: win.focused ?? false,
				state: (win.state as Window["state"]) ?? "normal",
				incognito: win.incognito ?? false,
				type: (win.type as Window["type"]) ?? "normal",
				createdAt: new Date(),
				updatedAt: new Date(),
				deletedAt: null,
			});
			break;
		}

		case "chrome.windows.onRemoved": {
			newState.windows = newState.windows.filter(
				(w) => w.browserWindowId !== event.data.windowId,
			);
			newState.tabs = newState.tabs.filter(
				(t) => t.browserWindowId !== event.data.windowId,
			);
			break;
		}

		// User events
		case "user.selectionChange": {
			newState.selectedTabIds = event.data.selectedTabIds;
			break;
		}

		case "user.dragEnd": {
			applyDragEnd(newState, event);
			break;
		}

		// Other events don't affect simulation state (they're informational)
		default:
			break;
	}

	return newState;
}

/**
 * Apply a drag end event to update tree structure
 */
function applyDragEnd(state: SimulatedState, event: UserDragEndEvent): void {
	const { dropTarget, selectedTabIds: draggedTabIds } = event.data;
	if (!dropTarget) return;

	const targetWindowId =
		dropTarget.type === "new-window"
			? Math.max(...state.windows.map((w) => w.browserWindowId)) + 1
			: dropTarget.windowId;

	// Handle new-window drop
	if (dropTarget.type === "new-window") {
		state.windows.push({
			id: `window-${targetWindowId}` as Window["id"],
			browserWindowId: targetWindowId,
			focused: true,
			state: "normal",
			incognito: false,
			type: "normal",
			createdAt: new Date(),
			updatedAt: new Date(),
			deletedAt: null,
		});
		for (const tabId of draggedTabIds) {
			const tab = state.tabs.find((t) => t.browserTabId === tabId);
			if (tab) {
				tab.browserWindowId = targetWindowId;
				tab.parentTabId = null;
			}
		}
		return;
	}

	// Get window tabs for tree calculation
	const windowTabs = state.tabs.filter(
		(t) => t.browserWindowId === targetWindowId,
	);

	// Determine tree drop position
	let treeDropPosition: TreeDropPosition;

	if (dropTarget.type === "gap") {
		treeDropPosition = { type: "root", index: dropTarget.slot };
	} else if (dropTarget.type === "child") {
		treeDropPosition = { type: "child", parentTabId: dropTarget.tabId };
	} else if (dropTarget.type === "sibling") {
		const ancestorId = dropTarget.ancestorId;
		const targetTab = windowTabs.find(
			(t) => t.browserTabId === dropTarget.tabId,
		);
		if (!targetTab) return;

		if (ancestorId === null) {
			// Root sibling
			let rootAncestor = targetTab;
			while (rootAncestor.parentTabId !== null) {
				const parent = windowTabs.find(
					(t) => t.browserTabId === rootAncestor.parentTabId,
				);
				if (!parent) break;
				rootAncestor = parent;
			}
			treeDropPosition = {
				type: "after",
				targetTabId: rootAncestor.browserTabId,
			};
		} else {
			// Child of ancestor
			const ancestorChain: Tab[] = [];
			let current: Tab | undefined = targetTab;
			while (current && current.browserTabId !== ancestorId) {
				ancestorChain.unshift(current);
				if (current.parentTabId === null) break;
				current = windowTabs.find(
					(t) => t.browserTabId === current?.parentTabId,
				);
			}
			if (ancestorChain.length > 0) {
				treeDropPosition = {
					type: "after",
					targetTabId: ancestorChain[0].browserTabId,
				};
			} else {
				treeDropPosition = { type: "after", targetTabId: dropTarget.tabId };
			}
		}
	} else {
		return;
	}

	// Calculate new tree position
	const { parentTabId: newParentId, treeOrder: newTreeOrder } =
		calculateTreeMove(windowTabs, draggedTabIds[0], treeDropPosition);

	// Update dragged tabs
	for (let i = 0; i < draggedTabIds.length; i++) {
		const tabId = draggedTabIds[i];
		const tab = state.tabs.find((t) => t.browserTabId === tabId);
		if (!tab) continue;

		const orderSuffix = i > 0 ? String.fromCharCode(97 + i) : "";
		tab.parentTabId = newParentId;
		tab.treeOrder = newTreeOrder + orderSuffix;
		tab.browserWindowId = targetWindowId;
	}

	// Recalculate tab indices to match tree order
	const updatedWindowTabs = state.tabs.filter(
		(t) => t.browserWindowId === targetWindowId,
	);
	const tree = buildTabTree(updatedWindowTabs);
	const flatOrder = flattenTree(tree);
	for (let i = 0; i < flatOrder.length; i++) {
		const tab = state.tabs.find(
			(t) => t.browserTabId === flatOrder[i].tab.browserTabId,
		);
		if (tab) {
			tab.tabIndex = i;
		}
	}
}

// ============================================================================
// Replay Session
// ============================================================================

/**
 * Replay a full session and return state after each event
 */
export function replaySession(
	session: RecordingSession,
): { state: SimulatedState; event: RecordedEvent | null }[] {
	const results: { state: SimulatedState; event: RecordedEvent | null }[] = [];

	// Initial state
	let state: SimulatedState = {
		windows: session.initialState.windows.map((w) => ({ ...w })),
		tabs: session.initialState.tabs.map((t) => ({ ...t })),
		selectedTabIds: [],
	};

	results.push({ state: { ...state }, event: null });

	// Apply each event
	for (const event of session.events) {
		state = applyEvent(state, event);
		results.push({
			state: {
				windows: state.windows.map((w) => ({ ...w })),
				tabs: state.tabs.map((t) => ({ ...t })),
				selectedTabIds: [...state.selectedTabIds],
			},
			event,
		});
	}

	return results;
}

/**
 * Get final state after replaying all events
 */
export function getFinalState(session: RecordingSession): SimulatedState {
	const results = replaySession(session);
	return results[results.length - 1].state;
}

// ============================================================================
// State Assertions
// ============================================================================

export interface TreeAssertion {
	tabId: number;
	parentTabId: number | null;
}

export interface OrderAssertion {
	windowId: number;
	/** Tab IDs in expected order (by tree traversal) */
	expectedOrder: number[];
}

/**
 * Assert that tabs have expected parent relationships
 */
export function assertTreeStructure(
	state: SimulatedState,
	assertions: TreeAssertion[],
): { pass: boolean; errors: string[] } {
	const errors: string[] = [];

	for (const { tabId, parentTabId } of assertions) {
		const tab = state.tabs.find((t) => t.browserTabId === tabId);
		if (!tab) {
			errors.push(`Tab ${tabId} not found`);
			continue;
		}
		if (tab.parentTabId !== parentTabId) {
			errors.push(
				`Tab ${tabId}: expected parent=${parentTabId}, got parent=${tab.parentTabId}`,
			);
		}
	}

	return { pass: errors.length === 0, errors };
}

/**
 * Assert that tabs are in expected tree order
 */
export function assertTreeOrder(
	state: SimulatedState,
	windowId: number,
	expectedOrder: number[],
): { pass: boolean; errors: string[] } {
	const windowTabs = state.tabs.filter((t) => t.browserWindowId === windowId);
	const tree = buildTabTree(windowTabs);
	const flatOrder = flattenTree(tree);
	const actualOrder = flatOrder.map((n) => n.tab.browserTabId);

	if (actualOrder.length !== expectedOrder.length) {
		return {
			pass: false,
			errors: [
				`Order length mismatch: expected ${expectedOrder.length}, got ${actualOrder.length}`,
				`Expected: [${expectedOrder.join(", ")}]`,
				`Actual: [${actualOrder.join(", ")}]`,
			],
		};
	}

	const errors: string[] = [];
	for (let i = 0; i < expectedOrder.length; i++) {
		if (actualOrder[i] !== expectedOrder[i]) {
			errors.push(
				`Position ${i}: expected ${expectedOrder[i]}, got ${actualOrder[i]}`,
			);
		}
	}

	if (errors.length > 0) {
		errors.push(`Expected: [${expectedOrder.join(", ")}]`);
		errors.push(`Actual: [${actualOrder.join(", ")}]`);
	}

	return { pass: errors.length === 0, errors };
}

/**
 * Assert that selection is in expected order
 */
export function assertSelection(
	state: SimulatedState,
	expectedSelection: number[],
): { pass: boolean; errors: string[] } {
	const actual = state.selectedTabIds;

	if (actual.length !== expectedSelection.length) {
		return {
			pass: false,
			errors: [
				`Selection length mismatch: expected ${expectedSelection.length}, got ${actual.length}`,
				`Expected: [${expectedSelection.join(", ")}]`,
				`Actual: [${actual.join(", ")}]`,
			],
		};
	}

	const errors: string[] = [];
	for (let i = 0; i < expectedSelection.length; i++) {
		if (actual[i] !== expectedSelection[i]) {
			errors.push(
				`Position ${i}: expected ${expectedSelection[i]}, got ${actual[i]}`,
			);
		}
	}

	if (errors.length > 0) {
		errors.push(`Expected: [${expectedSelection.join(", ")}]`);
		errors.push(`Actual: [${actual.join(", ")}]`);
	}

	return { pass: errors.length === 0, errors };
}
