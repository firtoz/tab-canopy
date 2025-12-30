/**
 * Event types for the recording/replay system.
 * These represent both Chrome browser events and user interaction events.
 */

import type { Tab, Window } from "@/schema/src/schema";

// ============================================================================
// Chrome Browser Events (captured from background script)
// ============================================================================

export interface ChromeTabCreatedEvent {
	type: "chrome.tabs.onCreated";
	timestamp: number;
	data: {
		tab: Browser.tabs.Tab;
	};
}

export interface ChromeTabRemovedEvent {
	type: "chrome.tabs.onRemoved";
	timestamp: number;
	data: {
		tabId: number;
		removeInfo: Browser.tabs.OnRemovedInfo;
	};
}

export interface ChromeTabMovedEvent {
	type: "chrome.tabs.onMoved";
	timestamp: number;
	data: {
		tabId: number;
		moveInfo: Browser.tabs.OnMovedInfo;
	};
}

export interface ChromeTabUpdatedEvent {
	type: "chrome.tabs.onUpdated";
	timestamp: number;
	data: {
		tabId: number;
		changeInfo: Browser.tabs.OnUpdatedInfo;
		tab: Browser.tabs.Tab;
	};
}

export interface ChromeTabActivatedEvent {
	type: "chrome.tabs.onActivated";
	timestamp: number;
	data: {
		activeInfo: Browser.tabs.OnActivatedInfo;
	};
}

export interface ChromeTabDetachedEvent {
	type: "chrome.tabs.onDetached";
	timestamp: number;
	data: {
		tabId: number;
		detachInfo: Browser.tabs.OnDetachedInfo;
	};
}

export interface ChromeTabAttachedEvent {
	type: "chrome.tabs.onAttached";
	timestamp: number;
	data: {
		tabId: number;
		attachInfo: Browser.tabs.OnAttachedInfo;
	};
}

export interface ChromeWindowCreatedEvent {
	type: "chrome.windows.onCreated";
	timestamp: number;
	data: {
		window: Browser.windows.Window;
	};
}

export interface ChromeWindowRemovedEvent {
	type: "chrome.windows.onRemoved";
	timestamp: number;
	data: {
		windowId: number;
	};
}

export interface ChromeWindowFocusChangedEvent {
	type: "chrome.windows.onFocusChanged";
	timestamp: number;
	data: {
		windowId: number;
	};
}

export type ChromeEvent =
	| ChromeTabCreatedEvent
	| ChromeTabRemovedEvent
	| ChromeTabMovedEvent
	| ChromeTabUpdatedEvent
	| ChromeTabActivatedEvent
	| ChromeTabDetachedEvent
	| ChromeTabAttachedEvent
	| ChromeWindowCreatedEvent
	| ChromeWindowRemovedEvent
	| ChromeWindowFocusChangedEvent;

// ============================================================================
// User Interaction Events (captured from sidepanel UI)
// ============================================================================

export interface UserDragStartEvent {
	type: "user.dragStart";
	timestamp: number;
	data: {
		tabId: number;
		windowId: number;
		selectedTabIds: number[];
	};
}

export interface UserDragEndEvent {
	type: "user.dragEnd";
	timestamp: number;
	data: {
		tabId: number;
		windowId: number;
		selectedTabIds: number[];
		dropTarget:
			| {
					type: "sibling";
					windowId: number;
					tabId: number;
					ancestorId: number | null;
			  }
			| {
					type: "child";
					windowId: number;
					tabId: number;
			  }
			| {
					type: "gap";
					windowId: number;
					slot: number;
			  }
			| {
					type: "new-window";
			  }
			| null;
	};
}

export interface UserTabCloseEvent {
	type: "user.tabClose";
	timestamp: number;
	data: {
		tabId: number;
		windowId: number;
	};
}

export interface UserTabActivateEvent {
	type: "user.tabActivate";
	timestamp: number;
	data: {
		tabId: number;
		windowId: number;
	};
}

export interface UserToggleCollapseEvent {
	type: "user.toggleCollapse";
	timestamp: number;
	data: {
		tabId: number;
		windowId: number;
	};
}

export interface UserToggleWindowCollapseEvent {
	type: "user.toggleWindowCollapse";
	timestamp: number;
	data: {
		windowId: number;
	};
}

export interface UserSelectionChangeEvent {
	type: "user.selectionChange";
	timestamp: number;
	data: {
		/** The tab that was clicked/toggled */
		tabId: number;
		windowId: number;
		/** Action type: 'add', 'remove', 'set' (replace), 'range' (shift-click) */
		action: "add" | "remove" | "set" | "range";
		/** The new selection state (ordered - first selected is first in array) */
		selectedTabIds: number[];
	};
}

export interface UserWindowCloseEvent {
	type: "user.windowClose";
	timestamp: number;
	data: {
		windowId: number;
	};
}

// ============================================================================
// Chrome State Snapshot - captures actual browser tab order
// ============================================================================

export interface ChromeTabSnapshot {
	id: number;
	windowId: number;
	index: number;
	title?: string;
	url?: string;
}

export interface ChromeStateSnapshotEvent {
	type: "snapshot.chromeState";
	timestamp: number;
	data: {
		/** Label for this snapshot (e.g., "after drag", "initial") */
		label: string;
		/** Actual Chrome tab order from browser.tabs.query() */
		tabs: ChromeTabSnapshot[];
	};
}

export type UserEvent =
	| UserDragStartEvent
	| UserDragEndEvent
	| UserTabCloseEvent
	| UserTabActivateEvent
	| UserToggleCollapseEvent
	| UserToggleWindowCollapseEvent
	| UserSelectionChangeEvent
	| UserWindowCloseEvent
	| ChromeStateSnapshotEvent;

// ============================================================================
// Combined Event Type
// ============================================================================

export type RecordedEvent = ChromeEvent | UserEvent;

// ============================================================================
// Recording Session
// ============================================================================

export interface RecordingSession {
	id: string;
	startTime: number;
	events: RecordedEvent[];
	/** Initial state snapshot at the start of recording */
	initialState: {
		windows: Window[];
		tabs: Tab[];
	};
}

// ============================================================================
// Replay Assertion Types
// ============================================================================

export interface TabStateAssertion {
	type: "tabState";
	/** Browser tab ID to check */
	tabId: number;
	/** Expected properties (partial match) */
	expected: Partial<{
		browserWindowId: number;
		tabIndex: number;
		parentTabId: number | null;
		treeOrder: string;
		isCollapsed: boolean;
	}>;
}

export interface TabExistsAssertion {
	type: "tabExists";
	tabId: number;
	shouldExist: boolean;
}

export interface TabOrderAssertion {
	type: "tabOrder";
	windowId: number;
	/** Expected order of tab IDs (by browser index) */
	expectedOrder: number[];
}

export interface TreeStructureAssertion {
	type: "treeStructure";
	windowId: number;
	/** Expected parent-child relationships: { tabId: parentTabId } */
	expectedParents: Record<number, number | null>;
}

export type ReplayAssertion =
	| TabStateAssertion
	| TabExistsAssertion
	| TabOrderAssertion
	| TreeStructureAssertion;

export interface ReplayStep {
	eventIndex: number;
	assertions: ReplayAssertion[];
}

export interface ReplayTestCase {
	name: string;
	description?: string;
	session: RecordingSession;
	steps: ReplayStep[];
}

// ============================================================================
// Type Guards
// ============================================================================

export function isChromeEvent(event: RecordedEvent): event is ChromeEvent {
	return event.type.startsWith("chrome.");
}

export function isUserEvent(event: RecordedEvent): event is UserEvent {
	return event.type.startsWith("user.") || event.type.startsWith("snapshot.");
}

export function isSnapshotEvent(
	event: RecordedEvent,
): event is ChromeStateSnapshotEvent {
	return event.type === "snapshot.chromeState";
}
