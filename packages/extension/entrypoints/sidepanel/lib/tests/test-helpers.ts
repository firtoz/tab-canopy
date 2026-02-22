/**
 * Test helpers for exposing internal state to e2e tests
 * This module provides utilities to expose tree structure and tab information
 * to Playwright tests via window.__tabCanopyTestHelpers
 */

import { browser } from "wxt/browser";
import type * as schema from "@/schema/src/schema";
import type { TabCreatedEvent } from "../db/createIDBTransportAdapter";

// Types for test helpers
export interface TabTreeNode {
	browserTabId: number;
	parentTabId: number | null;
	depth: number;
	hasChildren: boolean;
	isCollapsed: boolean;
	childrenIds: number[];
	title: string;
	url: string;
	browserWindowId: number;
	tabIndex: number;
	treeOrder: string;
}

export interface WindowInfo {
	id: number;
	tabIds: number[];
	focused: boolean;
}

export interface TreeTestHelpers {
	/**
	 * Get all tabs as a flat array with tree metadata
	 */
	getAllTabs: () => TabTreeNode[];

	/**
	 * Get a specific tab by its browser tab ID
	 */
	getTabById: (tabId: number) => TabTreeNode | undefined;

	/**
	 * Get all children of a tab (direct children only)
	 */
	getChildren: (tabId: number) => TabTreeNode[];

	/**
	 * Get all descendants of a tab (recursive)
	 */
	getDescendants: (tabId: number) => TabTreeNode[];

	/**
	 * Get the parent of a tab
	 */
	getParent: (tabId: number) => TabTreeNode | undefined;

	/**
	 * Get all root-level tabs (no parent) in a window
	 */
	getRootTabs: (windowId?: number) => TabTreeNode[];

	/**
	 * Get all windows with their tab IDs
	 */
	getWindows: () => WindowInfo[];

	/**
	 * Get the tree structure as a nested hierarchy
	 */
	getTreeHierarchy: (windowId?: number) => TabTreeNode[];

	/**
	 * Check if a tab is an ancestor of another tab
	 */
	isAncestor: (ancestorId: number, descendantId: number) => boolean;
}

/**
 * Build tab nodes with tree metadata
 */
function buildTabNodes(tabs: schema.Tab[]): TabTreeNode[] {
	const tabMap = new Map(tabs.map((t) => [t.browserTabId, t]));

	return tabs.map((tab) => {
		// Find children
		const children = tabs.filter((t) => t.parentTabId === tab.browserTabId);

		// Calculate depth
		let depth = 0;
		let currentTab = tab;
		while (currentTab.parentTabId !== null) {
			depth++;
			const parent = tabMap.get(currentTab.parentTabId);
			if (!parent) break;
			currentTab = parent;
		}

		return {
			browserTabId: tab.browserTabId,
			parentTabId: tab.parentTabId,
			depth,
			hasChildren: children.length > 0,
			isCollapsed: tab.isCollapsed ?? false,
			childrenIds: children.map((c) => c.browserTabId),
			title: tab.title ?? "",
			url: tab.url ?? "",
			browserWindowId: tab.browserWindowId,
			tabIndex: tab.tabIndex,
			treeOrder: tab.treeOrder ?? "",
		} satisfies TabTreeNode;
	});
}

/**
 * Create test helpers for the current state
 */
export function createTestHelpers(
	windows: schema.Window[],
	tabs: schema.Tab[],
): TreeTestHelpers {
	const nodes = buildTabNodes(tabs);
	const nodeMap = new Map(nodes.map((n) => [n.browserTabId, n]));

	return {
		getAllTabs: () => [...nodes],

		getTabById: (tabId: number) => nodeMap.get(tabId),

		getChildren: (tabId: number) => {
			return nodes.filter((n) => n.parentTabId === tabId);
		},

		getDescendants: (tabId: number) => {
			const result: TabTreeNode[] = [];
			const queue = [tabId];

			while (queue.length > 0) {
				const currentId = queue.shift();
				if (currentId === undefined) break;
				const children = nodes.filter((n) => n.parentTabId === currentId);
				result.push(...children);
				queue.push(...children.map((c) => c.browserTabId));
			}

			return result;
		},

		getParent: (tabId: number) => {
			const node = nodeMap.get(tabId);
			if (!node || node.parentTabId === null) return undefined;
			return nodeMap.get(node.parentTabId);
		},

		getRootTabs: (windowId?: number) => {
			let rootTabs = nodes.filter((n) => n.parentTabId === null);
			if (windowId !== undefined) {
				rootTabs = rootTabs.filter((n) => n.browserWindowId === windowId);
			}
			return rootTabs.sort((a, b) => a.tabIndex - b.tabIndex);
		},

		getWindows: () => {
			return windows.map((win) => ({
				id: win.browserWindowId,
				tabIds: nodes
					.filter((n) => n.browserWindowId === win.browserWindowId)
					.map((n) => n.browserTabId),
				focused: win.focused ?? false,
			}));
		},

		getTreeHierarchy: (windowId?: number) => {
			const rootTabs =
				windowId !== undefined
					? nodes.filter(
							(n) => n.parentTabId === null && n.browserWindowId === windowId,
						)
					: nodes.filter((n) => n.parentTabId === null);

			return rootTabs.sort((a, b) => a.tabIndex - b.tabIndex);
		},

		isAncestor: (ancestorId: number, descendantId: number) => {
			let current = nodeMap.get(descendantId);
			while (
				current?.parentTabId !== null &&
				current?.parentTabId !== undefined
			) {
				if (current.parentTabId === ancestorId) return true;
				current = nodeMap.get(current.parentTabId);
				if (!current) break;
			}
			return false;
		},
	};
}

export type InjectBrowserEvent =
	| { eventType: "tabs.onCreated"; eventData: Browser.tabs.Tab }
	| {
			eventType: "tabs.onUpdated";
			eventData: {
				tabId: number;
				changeInfo: Browser.tabs.OnUpdatedInfo;
				tab: Browser.tabs.Tab;
			};
	  }
	| {
			eventType: "tabs.onMoved";
			eventData: { tabId: number; moveInfo: Browser.tabs.OnMovedInfo };
	  }
	| {
			eventType: "tabs.onRemoved";
			eventData: { tabId: number; removeInfo: Browser.tabs.OnRemovedInfo };
	  }
	| { eventType: "tabs.onActivated"; eventData: Browser.tabs.OnActivatedInfo }
	| {
			eventType: "tabs.onDetached";
			eventData: { tabId: number; detachInfo: Browser.tabs.OnDetachedInfo };
	  }
	| {
			eventType: "tabs.onAttached";
			eventData: { tabId: number; attachInfo: Browser.tabs.OnAttachedInfo };
	  }
	| { eventType: "windows.onCreated"; eventData: Browser.windows.Window }
	| { eventType: "windows.onRemoved"; eventData: number }
	| { eventType: "windows.onFocusChanged"; eventData: number };

/**
 * User action types that can be programmatically triggered in tests
 */
export type UserAction =
	| {
			type: "dragTabToTab";
			sourceTabId: number;
			targetTabId: number;
	  }
	| {
			type: "dragTabToNewWindow";
			sourceTabId: number;
	  }
	| {
			type: "dragTabAfterTab";
			sourceTabId: number;
			targetTabId: number;
	  }
	| {
			type: "dragTabToWindowTitle";
			sourceTabId: number;
			/** Root slot (0 = first position). Default 0 */
			slot?: number;
	  }
	| {
			type: "makeTabChildren";
			parentTabId: number;
			childTabIds: number[];
	  };

/**
 * Browser API test actions interface
 */
export interface BrowserTestActions {
	/**
	 * Move a tab to a new position in its window or to a different window
	 */
	moveTab: (
		tabId: number,
		moveProperties: { windowId?: number; index: number },
	) => Promise<void>;

	/**
	 * Create a tab with specific properties (for testing openerTabId scenarios)
	 */
	createTab: (createProperties: {
		url?: string;
		openerTabId?: number;
		index?: number;
	}) => Promise<number>; // Returns the new tab ID

	/**
	 * Inject a fake browser event for testing (only works in test mode)
	 */
	injectBrowserEvent: (event: InjectBrowserEvent) => Promise<void>;

	/**
	 * Get tab created events from background script (for testing)
	 */
	getTabCreatedEvents: () => Promise<TabCreatedEvent[]>;

	/**
	 * Clear tab created events from background script (for testing)
	 */
	clearTabCreatedEvents: () => Promise<void>;

	/**
	 * Programmatically trigger a user action (for testing without UI interaction)
	 * This directly calls the underlying logic, bypassing mouse movements
	 */
	sendUserAction: (action: UserAction) => Promise<void>;

	/**
	 * Wait for the next sync batch from the background to be applied (so in-memory state is up to date).
	 * Use instead of polling; resolves when sync is applied or after timeoutMs.
	 */
	waitForSync: (timeoutMs?: number) => Promise<void>;
}

/**
 * Report current tree state to Playwright tests if callback is available
 * This is called whenever windows/tabs change to keep test data fresh
 */
export function exposeCurrentTreeStateForTests(
	windows: schema.Window[],
	tabs: schema.Tab[],
): void {
	if (typeof window === "undefined") return;

	// Check if Playwright exposed a reporting function
	const reportFn = (
		window as Window & { __reportTabTreeState?: (state: unknown) => void }
	).__reportTabTreeState;

	if (reportFn) {
		// In test mode - report state to Playwright
		reportFn({ windows, tabs });
	}
}

/**
 * Expose browser API test actions to Playwright tests
 * This allows tests to trigger actual browser API calls
 */
export function exposeBrowserTestActions(
	testActions?: {
		enableTestMode: () => void;
		injectBrowserEvent: (event: InjectBrowserEvent) => void;
		getTabCreatedEvents: () => Promise<TabCreatedEvent[]>;
		clearTabCreatedEvents: () => void;
		waitForNextSync: (timeoutMs?: number) => Promise<void>;
	},
	userActionHandler?: (action: UserAction) => Promise<void>,
): void {
	if (typeof window === "undefined") return;

	// Check if we're in test mode
	const isTestMode =
		(window as Window & { __reportTabTreeState?: unknown })
			.__reportTabTreeState !== undefined;

	if (!isTestMode) return;

	// Enable test mode in background if test actions are available
	if (testActions) {
		console.log("[Sidepanel] Enabling test mode via test actions");
		testActions.enableTestMode();
	}

	// Expose browser API actions
	const actions: BrowserTestActions = {
		moveTab: async (tabId: number, moveProperties) => {
			await browser.tabs.move(tabId, moveProperties);
		},

		createTab: async (createProperties) => {
			const tab = await browser.tabs.create(createProperties);
			if (!tab.id) {
				throw new Error("Created tab has no ID");
			}
			return tab.id;
		},

		injectBrowserEvent: testActions
			? async (event) => {
					testActions.injectBrowserEvent(event);
				}
			: async () => {},

		getTabCreatedEvents: testActions?.getTabCreatedEvents || (async () => []),
		clearTabCreatedEvents: testActions
			? async () => {
					testActions.clearTabCreatedEvents();
				}
			: async () => {},

		waitForSync: testActions?.waitForNextSync
			? (timeoutMs?: number) => testActions.waitForNextSync(timeoutMs)
			: async () => {},

		sendUserAction: userActionHandler
			? async (action) => {
					await userActionHandler(action);
				}
			: async () => {
					console.error("[test-helpers] User action handler not registered!");
					throw new Error("User action handler not registered");
				},
	};

	(
		window as Window & { __tabCanopyBrowserActions?: BrowserTestActions }
	).__tabCanopyBrowserActions = actions;

	// Set up message listener to receive debug logs from background script
	browser.runtime.onMessage.addListener((message) => {
		if (message.type === "TEST_DEBUG_LOG" && message.log) {
			const logFn = (
				window as Window & { __backgroundDebugLog?: (message: string) => void }
			).__backgroundDebugLog;
			if (logFn) {
				logFn(message.log);
			}
		}
	});
}
