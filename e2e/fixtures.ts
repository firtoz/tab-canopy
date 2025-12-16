import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type BrowserContext,
	test as base,
	chromium,
	type Page,
} from "@playwright/test";
import type {
	TabTreeNode,
	TreeTestHelpers,
	WindowInfo,
} from "../packages/extension/entrypoints/sidepanel/lib/test-helpers";
import type * as schema from "../packages/extension/schema/src/schema";

// Re-export types for convenience
export type { TabTreeNode, TreeTestHelpers, WindowInfo };

export interface TestTreeHelpers {
	/**
	 * Get test helpers from the sidepanel
	 */
	getHelpers: () => Promise<TreeTestHelpers>;

	/**
	 * Wait for a tab with specific URL to appear
	 */
	waitForTab: (url: string, timeout?: number) => Promise<TabTreeNode>;

	/**
	 * Wait for a specific number of tabs
	 */
	waitForTabCount: (count: number, timeout?: number) => Promise<void>;

	/**
	 * Get tab by URL
	 */
	getTabByUrl: (url: string) => Promise<TabTreeNode | undefined>;

	/**
	 * Get tab element by browser tab ID
	 */
	getTabElement: (tabId: number) => ReturnType<Page["locator"]>;

	/**
	 * Verify parent-child relationship
	 */
	verifyParentChild: (
		parentId: number,
		childId: number,
	) => Promise<{ isChild: boolean; childDepth: number }>;

	/**
	 * Move a tab using the native browser API (simulates drag in native UI)
	 */
	moveBrowserTab: (
		tabId: number,
		moveProperties: { windowId?: number; index: number },
	) => Promise<void>;

	/**
	 * Get background debug logs
	 */
	getBackgroundLogs: () => string[];

	/**
	 * Clear background debug logs
	 */
	clearBackgroundLogs: () => void;
}

// ES module equivalent of __dirname (Playwright runs in Node.js, not Bun)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use dev mode if E2E_DEV is set, otherwise use production build
const buildDir =
	process.env.E2E_DEV === "true" ? "chrome-mv3-dev" : "chrome-mv3";

// Path to the built extension
const extensionPath = path.join(
	__dirname,
	"..",
	"packages",
	"extension",
	".output",
	buildDir,
);
const manifestPath = path.join(extensionPath, "manifest.json");

/**
 * Wait for the extension build to complete by checking for manifest.json
 */
async function waitForExtensionBuild(maxWaitMs = 60000): Promise<void> {
	const startTime = Date.now();
	const isDev = process.env.E2E_DEV === "true";

	while (!existsSync(manifestPath)) {
		if (Date.now() - startTime > maxWaitMs) {
			const command = isDev ? '"bun run dev"' : '"bun run build"';
			throw new Error(
				`Extension build timeout: manifest.json not found at ${manifestPath}. Please run ${command} first.`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
}

// Internal fixture for storing test state
interface TestState {
	latestTreeState: { windows: schema.Window[]; tabs: schema.Tab[] } | null;
	stateReportedPromise: Promise<void>;
	updateState: (state: {
		windows: schema.Window[];
		tabs: schema.Tab[];
	}) => void;
	backgroundLogs: string[];
	addBackgroundLog: (message: string) => void;
}

export interface ExtensionFixtures {
	testState: TestState;
	context: BrowserContext;
	extensionId: string;
	sidepanel: Page;
	treeHelpers: TestTreeHelpers;
	// createTab: (url: string) => Promise<Page>;
}

/**
 * Custom test fixture that provides:
 * - A browser context with the extension loaded
 * - The extension ID for accessing extension pages
 * - A helper to open the sidepanel
 */
export const test = base.extend<ExtensionFixtures>({
	// Create test state fixture to hold shared state
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture requires empty object
	testState: async ({}, use) => {
		let resolveStateReported: (() => void) | null = null;
		const stateReportedPromise = new Promise<void>((resolve) => {
			resolveStateReported = resolve;
		});

		const testState: TestState = {
			latestTreeState: null,
			stateReportedPromise,
			updateState: (state) => {
				testState.latestTreeState = state;
				if (resolveStateReported) {
					resolveStateReported();
					resolveStateReported = null; // Only resolve once
				}
			},
			backgroundLogs: [],
			addBackgroundLog: (message: string) => {
				testState.backgroundLogs.push(message);
			},
		};

		await use(testState);
	},

	// Override the default context to load our extension
	context: async ({ testState }, use) => {
		// Wait for extension to be built before launching browser
		await waitForExtensionBuild();

		const context = await chromium.launchPersistentContext("", {
			headless: false, // Extensions require headed mode
			args: [
				`--disable-extensions-except=${extensionPath}`,
				`--load-extension=${extensionPath}`,
				"--no-first-run",
				"--disable-infobars",
			],
		});

		// Expose test helper callbacks early, before any pages load
		await context.exposeFunction("__reportTabTreeState", testState.updateState);
		await context.exposeFunction("__backgroundDebugLog", testState.addBackgroundLog);

		await use(context);
		await context.close();
	},

	// Get the extension ID from the service worker
	extensionId: async ({ context }, use) => {
		// Wait for the service worker to be available
		let serviceWorker = context.serviceWorkers()[0];
		if (!serviceWorker) {
			serviceWorker = await context.waitForEvent("serviceworker");
		}

		// Extract extension ID from the service worker URL
		const extensionId = serviceWorker.url().split("/")[2];
		await use(extensionId);
	},

	// Open and return the sidepanel page
	sidepanel: async ({ context, extensionId, testState }, use) => {
		// const existingPages = context.pages();
		// console.log(
		// 	"Existing pages",
		// 	existingPages.map((page) => page.url()),
		// );
		// Open the sidepanel by navigating to its URL
		// In Chrome, sidepanel can be accessed via chrome-extension://[id]/sidepanel.html
		const sidepanelPage = await context.newPage();
		await sidepanelPage.goto(
			`chrome-extension://${extensionId}/sidepanel.html`,
		);

		// Wait for the app to load
		await sidepanelPage.waitForSelector('[data-testid="tab-manager"]', {
			timeout: 30000,
		});

		// Wait for at least one tab to be present (extension has synced)
		await sidepanelPage.waitForSelector('[data-testid="tab-card"]', {
			timeout: 30000,
		});

		// Wait for state to be reported to tests
		await testState.stateReportedPromise;

		await use(sidepanelPage);
		await sidepanelPage.close();
	},

	treeHelpers: async ({ sidepanel, testState }, use) => {
		const getTestHelpers = async (): Promise<TreeTestHelpers> => {
			// Get the latest state (should already be reported by now)
			const latestTreeState = testState.latestTreeState;

			if (!latestTreeState) {
				throw new Error(
					"Tree state not reported by extension. Make sure the extension is loaded and has synced tabs.",
				);
			}

			// Build helpers from the reported state in Node.js
			const tabs = latestTreeState.tabs;
			const windows = latestTreeState.windows;

			// Build tab nodes with tree metadata
			const tabMap = new Map(tabs.map((t) => [t.browserTabId, t]));
			const nodes = tabs.map((tab) => {
				const children = tabs.filter((t) => t.parentTabId === tab.browserTabId);

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

			const nodeMap = new Map(nodes.map((n) => [n.id, n]));

			return {
				getAllTabs: () => [...nodes],
				getTabById: (tabId: number) => nodeMap.get(tabId),
				getChildren: (tabId: number) =>
					nodes.filter((n) => n.parentId === tabId),
				getDescendants: (tabId: number) => {
					const result: typeof nodes = [];
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
				getWindows: () =>
					windows.map((win) => ({
						id: win.browserWindowId,
						tabIds: nodes
							.filter((n) => n.windowId === win.browserWindowId)
							.map((n) => n.id),
						focused: win.focused ?? false,
					})),
				getTreeHierarchy: (windowId?: number) => {
					const rootTabs =
						windowId !== undefined
							? nodes.filter(
									(n) => n.parentId === null && n.windowId === windowId,
								)
							: nodes.filter((n) => n.parentId === null);
					return rootTabs.sort((a, b) => a.index - b.index);
				},
				isAncestor: (ancestorId: number, descendantId: number) => {
					let current = nodeMap.get(descendantId);
					while (
						current?.parentId !== null &&
						current?.parentId !== undefined
					) {
						if (current.parentId === ancestorId) return true;
						current = nodeMap.get(current.parentId);
						if (!current) break;
					}
					return false;
				},
			};
		};

		const helpers: TestTreeHelpers = {
			getHelpers: async () => {
				return await getTestHelpers();
			},

			waitForTab: async (url: string, timeout = 10000) => {
				const start = Date.now();
				while (Date.now() - start < timeout) {
					const helpers = await getTestHelpers();
					const tab = helpers.getAllTabs().find((t) => t.url.includes(url));
					if (tab) return tab;

					await sidepanel.waitForTimeout(100);
				}
				throw new Error(`Tab with URL ${url} not found within ${timeout}ms`);
			},

			waitForTabCount: async (count: number, timeout = 10000) => {
				const start = Date.now();
				while (Date.now() - start < timeout) {
					const helpers = await getTestHelpers();
					const tabs = helpers.getAllTabs();
					if (tabs.length === count) return;

					await sidepanel.waitForTimeout(100);
				}
				throw new Error(
					`Expected ${count} tabs, but timeout reached after ${timeout}ms`,
				);
			},

			getTabByUrl: async (url: string) => {
				const helpers = await getTestHelpers();
				return helpers.getAllTabs().find((t) => t.url.includes(url));
			},

			getTabElement: (tabId: number) => {
				return sidepanel.locator(`[data-tab-id="${tabId}"]`);
			},

			verifyParentChild: async (parentId: number, childId: number) => {
				const helpers = await getTestHelpers();
				const child = helpers.getTabById(childId);
				const isChild = child?.parentId === parentId;
				const childDepth = child?.depth ?? 0;
				return { isChild, childDepth };
			},

			moveBrowserTab: async (tabId: number, moveProperties) => {
				// Call the exposed browser API action
				await sidepanel.evaluate(
					({ tabId, moveProperties }) => {
						const actions = (
							window as Window & {
								__tabCanopyBrowserActions?: {
									moveTab: (
										tabId: number,
										moveProperties: { windowId?: number; index: number },
									) => Promise<void>;
								};
							}
						).__tabCanopyBrowserActions;

						if (!actions) {
							throw new Error(
								"Browser test actions not exposed. Make sure the app is in test mode.",
							);
						}

						return actions.moveTab(tabId, moveProperties);
					},
					{ tabId, moveProperties },
				);

				// Wait for the state to update
				// Give it more time for the background script to process the move
				await sidepanel.waitForTimeout(2000);
			},

			getBackgroundLogs: () => {
				return [...testState.backgroundLogs];
			},

			clearBackgroundLogs: () => {
				testState.backgroundLogs = [];
			},
		};

		await use(helpers);
	},

	// // Helper to create a new tab and switch back to sidepanel
	// createTab: async ({ context, sidepanel, page }, use) => {
	// 	const createTabHelper = async (url: string): Promise<Page> => {
	// 		await context.tracing.group(`createTab ${url}`);

	// 		// context.tracing.
	// 		const newPage = await context.newPage();
	// 		await newPage.goto(url);

	// 		await context.tracing.groupEnd();

	// 		return newPage;
	// 	};

	// 	await use(createTabHelper);
	// },
});

export const expect = test.expect;

export const createTab = async (
	context: BrowserContext,
	url: string,
	sidepanel: Page,
) => {
	await context.tracing.group(`createTab ${url}`);
	const newPage = await context.newPage();
	await newPage.goto(url);
	await sidepanel.bringToFront();
	await context.tracing.groupEnd();
	return newPage;
};

/**
 * Helper to get all tab cards from the sidepanel
 */
export async function getTabCards(sidepanel: Page) {
	return sidepanel.locator('[data-testid="tab-card"]').all();
}

/**
 * Helper to get tab card by browser tab ID
 */
export async function getTabCardById(sidepanel: Page, tabId: number) {
	return sidepanel.locator(`[data-tab-id="${tabId}"]`);
}
