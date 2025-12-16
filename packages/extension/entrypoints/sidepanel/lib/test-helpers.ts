/**
 * Test helpers for exposing internal state to e2e tests
 * This module provides utilities to expose tree structure and tab information
 * to Playwright tests via window.__tabCanopyTestHelpers
 */

import type * as schema from "@/schema/src/schema";

// Types for test helpers
export interface TabTreeNode {
	id: number;
	parentId: number | null;
	depth: number;
	hasChildren: boolean;
	isCollapsed: boolean;
	childrenIds: number[];
	title: string;
	url: string;
	windowId: number;
	index: number;
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
			id: tab.browserTabId,
			parentId: tab.parentTabId,
			depth,
			hasChildren: children.length > 0,
			isCollapsed: tab.isCollapsed ?? false,
			childrenIds: children.map((c) => c.browserTabId),
			title: tab.title ?? "",
			url: tab.url ?? "",
			windowId: tab.browserWindowId,
			index: tab.tabIndex,
		};
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
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

	return {
		getAllTabs: () => [...nodes],

		getTabById: (tabId: number) => nodeMap.get(tabId),

		getChildren: (tabId: number) => {
			return nodes.filter((n) => n.parentId === tabId);
		},

		getDescendants: (tabId: number) => {
			const result: TabTreeNode[] = [];
			const queue = [tabId];

			while (queue.length > 0) {
				const currentId = queue.shift();
				if (currentId === undefined) break;
				const children = nodes.filter((n) => n.parentId === currentId);
				result.push(...children);
				queue.push(...children.map((c) => c.id));
			}

			return result;
		},

		getParent: (tabId: number) => {
			const node = nodeMap.get(tabId);
			if (!node || node.parentId === null) return undefined;
			return nodeMap.get(node.parentId);
		},

		getRootTabs: (windowId?: number) => {
			let rootTabs = nodes.filter((n) => n.parentId === null);
			if (windowId !== undefined) {
				rootTabs = rootTabs.filter((n) => n.windowId === windowId);
			}
			return rootTabs.sort((a, b) => a.index - b.index);
		},

		getWindows: () => {
			return windows.map((win) => ({
				id: win.browserWindowId,
				tabIds: nodes
					.filter((n) => n.windowId === win.browserWindowId)
					.map((n) => n.id),
				focused: win.focused ?? false,
			}));
		},

		getTreeHierarchy: (windowId?: number) => {
			const rootTabs =
				windowId !== undefined
					? nodes.filter((n) => n.parentId === null && n.windowId === windowId)
					: nodes.filter((n) => n.parentId === null);

			return rootTabs.sort((a, b) => a.index - b.index);
		},

		isAncestor: (ancestorId: number, descendantId: number) => {
			let current = nodeMap.get(descendantId);
			while (current?.parentId !== null && current?.parentId !== undefined) {
				if (current.parentId === ancestorId) return true;
				current = nodeMap.get(current.parentId);
				if (!current) break;
			}
			return false;
		},
	};
}

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
export function exposeBrowserTestActions(): void {
	if (typeof window === "undefined") return;

	// Check if we're in test mode
	const isTestMode = (
		window as Window & { __reportTabTreeState?: unknown }
	).__reportTabTreeState !== undefined;

	if (!isTestMode) return;

	// Expose browser API actions
	const actions: BrowserTestActions = {
		moveTab: async (tabId: number, moveProperties) => {
			await browser.tabs.move(tabId, moveProperties);
		},
	};

	(window as Window & { __tabCanopyBrowserActions?: BrowserTestActions }).__tabCanopyBrowserActions = actions;

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
