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
} from "../../extension/entrypoints/sidepanel/lib/tests/test-helpers";
import type * as schema from "../../extension/schema/src/schema";
import type { InjectBrowserEvent } from "../../extension/src/idb-transport";

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
	 * Wait for a tab to have a specific parent
	 */
	waitForTabParent: (
		tabId: number,
		expectedParentId: number | null,
		timeout?: number,
	) => Promise<void>;

	/**
	 * Wait for a tab to be in a specific window
	 */
	waitForTabInWindow: (
		tabId: number,
		windowId: number,
		timeout?: number,
	) => Promise<void>;

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

	/**
	 * Get the treeOrder for a tab by ID
	 */
	getTreeOrder: (tabId: number) => Promise<string | undefined>;

	/**
	 * Get tab created events from background script (for testing)
	 */
	getTabCreatedEvents: () => Promise<
		Array<{
			tabId: number;
			openerTabId: number | undefined;
			tabIndex: number;
			decidedParentId: number | null;
			reason: string;
			timestamp: number;
		}>
	>;

	/**
	 * Clear tab created events from background script (for testing)
	 */
	clearTabCreatedEvents: () => Promise<void>;

	/**
	 * Create a tab with openerTabId (for testing Ctrl+T-like scenarios)
	 */
	createTabWithOpener: (
		url: string,
		openerTabId: number,
		index?: number,
	) => Promise<number>;

	/**
	 * Inject a fake browser event for testing (bypasses real browser APIs)
	 */
	injectBrowserEvent: (event: InjectBrowserEvent) => Promise<void>;

	/**
	 * Drag a tab element onto another tab element to make it a child (UI interaction)
	 * @param sourceTabId The tab to drag
	 * @param targetTabId The tab to drop onto (drops on center of target)
	 */
	dragTabToTab: (sourceTabId: number, targetTabId: number) => Promise<void>;

	/**
	 * Programmatically make a tab a child of another (bypasses UI)
	 * @param sourceTabId The tab to make a child
	 * @param targetTabId The parent tab
	 */
	makeTabChild: (sourceTabId: number, targetTabId: number) => Promise<void>;
	makeTabChildren: (
		parentTabId: number,
		childTabIds: number[],
	) => Promise<void>;

	/**
	 * Drag a tab element to position after another tab as a sibling
	 * @param sourceTabId The tab to drag
	 * @param targetTabId The tab to drop after (drops to left of target)
	 * @param waitAfter Wait time in ms after the drag completes (default: 500)
	 */
	dragTabAfterTab: (
		sourceTabId: number,
		targetTabId: number,
		waitAfter?: number,
	) => Promise<void>;

	/**
	 * Drag a tab to the "new window" drop zone to create a new window (UI interaction)
	 * @param sourceTabId The tab to drag
	 */
	dragTabToNewWindow: (sourceTabId: number) => Promise<void>;

	/**
	 * Programmatically move a tab to a new window (bypasses UI)
	 * @param sourceTabId The tab to move
	 */
	moveTabToNewWindow: (sourceTabId: number) => Promise<void>;
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
	"..",
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
	context: async ({ testState, headless }, use) => {
		// Wait for extension to be built before launching browser
		await waitForExtensionBuild();

		const args = [
			`--disable-extensions-except=${extensionPath}`,
			`--load-extension=${extensionPath}`,
			"--no-first-run",
			"--disable-infobars",
		];

		if (headless) {
			args.push("--headless");
		}

		const context = await chromium.launchPersistentContext("", {
			headless: false, // Extensions require headed mode
			args: args,
		});

		// Expose test helper callbacks early, before any pages load
		await context.exposeFunction("__reportTabTreeState", testState.updateState);
		await context.exposeFunction(
			"__backgroundDebugLog",
			testState.addBackgroundLog,
		);

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

		// Listen to console messages from the page
		sidepanelPage.on("console", (msg) => {
			const type = msg.type();
			const text = msg.text();
			// Only show test-related and error messages to avoid noise
			if (
				text.includes("[Test]") ||
				text.includes("[test-helpers]") ||
				text.includes("[TabManagerContent]") ||
				type === "error" ||
				type === "warning"
			) {
				console.log(`[Browser ${type}]`, text);
			}
		});

		// Listen to page errors
		sidepanelPage.on("pageerror", (err) => {
			console.error("[Browser Error]", err.message);
		});

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

			waitForTabParent: async (
				tabId: number,
				expectedParentId: number | null,
				timeout = 10000,
			) => {
				const start = Date.now();
				while (Date.now() - start < timeout) {
					const helpers = await getTestHelpers();
					const tab = helpers.getTabById(tabId);
					if (tab && tab.parentId === expectedParentId) {
						return;
					}
					await sidepanel.waitForTimeout(100);
				}
				const helpers = await getTestHelpers();
				const tab = helpers.getTabById(tabId);
				throw new Error(
					`Tab ${tabId} did not reach expected parent state within ${timeout}ms. Current parentId: ${tab?.parentId}, expected: ${expectedParentId}`,
				);
			},

			waitForTabInWindow: async (
				tabId: number,
				windowId: number,
				timeout = 10000,
			) => {
				const start = Date.now();
				while (Date.now() - start < timeout) {
					const helpers = await getTestHelpers();
					const tab = helpers.getTabById(tabId);
					if (tab && tab.windowId === windowId) {
						return;
					}
					await sidepanel.waitForTimeout(100);
				}
				const helpers = await getTestHelpers();
				const tab = helpers.getTabById(tabId);
				throw new Error(
					`Tab ${tabId} did not reach expected window within ${timeout}ms. Current windowId: ${tab?.windowId}, expected: ${windowId}`,
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
						// @ts-expect-error - window is available in browser context
						const actions = window.__tabCanopyBrowserActions;

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
			getTreeOrder: async (tabId: number) => {
				await getTestHelpers(); // Ensure state is refreshed
				const tab = testState.latestTreeState?.tabs.find(
					(t) => t.browserTabId === tabId,
				);
				return tab?.treeOrder;
			},

			getTabCreatedEvents: async () => {
				return await sidepanel.evaluate(() => {
					// @ts-expect-error - window is available in browser context
					const actions = window.__tabCanopyBrowserActions;
					if (!actions) {
						throw new Error(
							"Browser test actions not exposed. Make sure the app is in test mode.",
						);
					}
					return actions.getTabCreatedEvents();
				});
			},

			clearTabCreatedEvents: async () => {
				await sidepanel.evaluate(() => {
					// @ts-expect-error - window is available in browser context
					const actions = window.__tabCanopyBrowserActions;
					if (!actions) {
						throw new Error(
							"Browser test actions not exposed. Make sure the app is in test mode.",
						);
					}
					return actions.clearTabCreatedEvents();
				});
			},

			createTabWithOpener: async (
				url: string,
				openerTabId: number,
				index?: number,
			) => {
				return await sidepanel.evaluate(
					({ url, openerTabId, index }) => {
						// @ts-expect-error - window is available in browser context
						const actions = window.__tabCanopyBrowserActions;
						if (!actions) {
							throw new Error(
								"Browser test actions not exposed. Make sure the app is in test mode.",
							);
						}
						return actions.createTab({ url, openerTabId, index });
					},
					{ url, openerTabId, index },
				);
			},

			injectBrowserEvent: async (event: unknown) => {
				await sidepanel.evaluate((event) => {
					// @ts-expect-error - window is available in browser context
					const actions = window.__tabCanopyBrowserActions;
					if (!actions) {
						throw new Error(
							"Browser test actions not exposed. Make sure the app is in test mode.",
						);
					}
					return actions.injectBrowserEvent(event);
				}, event);
			},

			makeTabChild: async (sourceTabId: number, targetTabId: number) => {
				// Use programmatic action instead of UI interaction
				await sidepanel.evaluate(
					({ sourceTabId, targetTabId }) => {
						// @ts-expect-error - window is available in browser context
						return window.__tabCanopyBrowserActions.sendUserAction({
							type: "dragTabToTab",
							sourceTabId,
							targetTabId,
						});
					},
					{ sourceTabId, targetTabId },
				);

				// Wait for the operation to complete by checking the state
				// The sendUserAction already waits internally, but we double-check here
				await helpers.waitForTabParent(sourceTabId, targetTabId);
			},

			makeTabChildren: async (parentTabId: number, childTabIds: number[]) => {
				// Batch operation - make multiple tabs children of the same parent
				await sidepanel.evaluate(
					({ parentTabId, childTabIds }) => {
						// @ts-expect-error - window is available in browser context
						return window.__tabCanopyBrowserActions.sendUserAction({
							type: "makeTabChildren",
							parentTabId,
							childTabIds,
						});
					},
					{ parentTabId, childTabIds },
				);

				// Wait for all children to be parented
				for (const childTabId of childTabIds) {
					await helpers.waitForTabParent(childTabId, parentTabId);
				}
			},

			dragTabToTab: async (sourceTabId: number, targetTabId: number) => {
				// Check if sidepanel is still valid
				if (sidepanel.isClosed()) {
					throw new Error("Sidepanel was closed before drag operation");
				}

				const sourceElement = sidepanel.locator(
					`[data-tab-id="${sourceTabId}"]`,
				);
				const targetElement = sidepanel.locator(
					`[data-tab-id="${targetTabId}"]`,
				);

				const sourceBox = await sourceElement.boundingBox();
				const targetBox = await targetElement.boundingBox();

				if (!sourceBox || !targetBox) {
					throw new Error(
						`Could not get bounding boxes for drag operation. Source: ${sourceBox}, Target: ${targetBox}`,
					);
				}

				try {
					// Perform drag and drop (drop on target to make it a child)
					await sidepanel.mouse.move(
						sourceBox.x + 200,
						sourceBox.y + sourceBox.height / 2,
					);
					await sidepanel.mouse.down();
					await sidepanel.mouse.move(
						targetBox.x + 200,
						targetBox.y + targetBox.height / 2,
						{ steps: 10 },
					);
					await sidepanel.waitForTimeout(200); // Pause before mouse up for dnd-kit
					await sidepanel.mouse.up();

					// Wait for the operation to complete by checking the state
					await helpers.waitForTabParent(sourceTabId, targetTabId);

					// Small delay to prevent overwhelming Chrome with rapid operations
					// (Chrome may close sidepanel if too many operations happen too quickly)
					await sidepanel.waitForTimeout(50);
				} catch (error) {
					// If sidepanel was closed during operation, provide better error message
					if (
						error instanceof Error &&
						error.message.includes(
							"Target page, context or browser has been closed",
						)
					) {
						throw new Error(
							`Sidepanel was closed during drag operation from ${sourceTabId} to ${targetTabId}. This might indicate an issue with tab move handling.`,
						);
					}
					throw error;
				}
			},

			dragTabAfterTab: async (
				sourceTabId: number,
				targetTabId: number,
				waitAfter = 500,
			) => {
				// Check if sidepanel is still valid
				if (sidepanel.isClosed()) {
					throw new Error("Sidepanel was closed before drag operation");
				}

				const sourceElement = sidepanel.locator(
					`[data-tab-id="${sourceTabId}"]`,
				);
				const targetElement = sidepanel.locator(
					`[data-tab-id="${targetTabId}"]`,
				);

				const sourceBox = await sourceElement.boundingBox();
				const targetBox = await targetElement.boundingBox();

				if (!sourceBox || !targetBox) {
					throw new Error(
						`Could not get bounding boxes for drag operation. Source: ${sourceBox}, Target: ${targetBox}`,
					);
				}

				try {
					// Perform drag and drop (drop to the left of target to make it a sibling)
					await sidepanel.mouse.move(
						sourceBox.x + 200,
						sourceBox.y + sourceBox.height / 2,
					);
					await sidepanel.mouse.down();
					await sidepanel.mouse.move(
						targetBox.x + 25, // Slightly to the left of the box
						targetBox.y + targetBox.height / 4, // Vertically centered
						{ steps: 20 },
					);
					await sidepanel.waitForTimeout(100);
					await sidepanel.mouse.up();
					await sidepanel.waitForTimeout(waitAfter);
				} catch (error) {
					// If sidepanel was closed during operation, provide better error message
					if (
						error instanceof Error &&
						error.message.includes(
							"Target page, context or browser has been closed",
						)
					) {
						throw new Error(
							`Sidepanel was closed during drag operation from ${sourceTabId} after ${targetTabId}. This might indicate an issue with tab move handling.`,
						);
					}
					throw error;
				}
			},

			moveTabToNewWindow: async (sourceTabId: number) => {
				// Get current window ID and all descendants before the move
				const helpersBefore = await getTestHelpers();
				const tabBefore = helpersBefore.getTabById(sourceTabId);
				if (!tabBefore) {
					throw new Error(`Source tab ${sourceTabId} not found`);
				}
				const originalWindowId = tabBefore.windowId;

				// Get all descendants that should move with the parent
				const descendants = helpersBefore.getDescendants(sourceTabId);
				const allTabsToMove = [sourceTabId, ...descendants.map((d) => d.id)];

				// Use programmatic action instead of UI interaction
				await sidepanel.evaluate(
					({ sourceTabId }) => {
						// @ts-expect-error - window is available in browser context
						const actions = window.__tabCanopyBrowserActions;
						if (!actions) {
							throw new Error("Browser test actions not exposed");
						}
						return actions.sendUserAction({
							type: "dragTabToNewWindow",
							sourceTabId,
						});
					},
					{ sourceTabId },
				);

				// Wait for ALL tabs (parent + descendants) to move to the new window
				const start = Date.now();
				const timeout = 10000;
				while (Date.now() - start < timeout) {
					const helpersAfter = await getTestHelpers();
					const movedTabs = allTabsToMove.map((id) =>
						helpersAfter.getTabById(id),
					);

					// Check if all tabs exist and are in a new window (same window, different from original)
					if (movedTabs.every((t) => t !== null)) {
						const newWindowIds = movedTabs.map((t) => t?.windowId);
						const allInSameWindow = newWindowIds.every(
							(w) => w === newWindowIds[0],
						);
						const inDifferentWindow = newWindowIds[0] !== originalWindowId;

						if (allInSameWindow && inDifferentWindow) {
							return; // Successfully moved all tabs to new window
						}
					}

					await sidepanel.waitForTimeout(100);
				}

				// Provide detailed error message
				const helpersAfter = await getTestHelpers();
				const tabStates = allTabsToMove.map((id) => {
					const tab = helpersAfter.getTabById(id);
					return `  Tab ${id}: windowId=${tab?.windowId ?? "null"}`;
				});

				throw new Error(
					`Not all tabs moved to new window within ${timeout}ms.\n` +
						`Original window: ${originalWindowId}\n` +
						`Expected to move: ${allTabsToMove.join(", ")}\n` +
						`Current state:\n${tabStates.join("\n")}`,
				);
			},

			dragTabToNewWindow: async (sourceTabId: number) => {
				// Check if sidepanel is still valid
				if (sidepanel.isClosed()) {
					throw new Error("Sidepanel was closed before drag operation");
				}

				// Get current window ID before the move
				const helpersBefore = await getTestHelpers();
				const tabBefore = helpersBefore.getTabById(sourceTabId);
				if (!tabBefore) {
					throw new Error(`Source tab ${sourceTabId} not found`);
				}
				const originalWindowId = tabBefore.windowId;

				const sourceElement = sidepanel.locator(
					`[data-tab-id="${sourceTabId}"]`,
				);

				const sourceBox = await sourceElement.boundingBox();

				if (!sourceBox) {
					throw new Error(
						`Could not get bounding box for source tab ${sourceTabId}`,
					);
				}

				try {
					// Perform drag - start at the source
					await sidepanel.mouse.move(
						sourceBox.x + 200,
						sourceBox.y + sourceBox.height / 2,
					);
					await sidepanel.mouse.down();

					// Move down to trigger drag and reveal the drop zone (with steps for dnd-kit)
					await sidepanel.mouse.move(
						sourceBox.x + 200,
						sourceBox.y + sourceBox.height / 2 + 200,
						{ steps: 10 },
					);

					await sidepanel.waitForTimeout(300);

					// Find the new window drop zone
					const dropZone = sidepanel.locator(
						'[data-testid="new-window-drop-zone"]',
					);
					await dropZone.waitFor({ state: "visible", timeout: 3000 });

					const dropBox = await dropZone.boundingBox();

					if (!dropBox) {
						throw new Error(
							"Could not get bounding box for new window drop zone",
						);
					}

					// Move to the center of the drop zone (with steps)
					await sidepanel.mouse.move(
						dropBox.x + dropBox.width / 2,
						dropBox.y + dropBox.height / 2,
						{ steps: 10 },
					);
					await sidepanel.waitForTimeout(100);
					await sidepanel.mouse.up();

					// Wait for the tab to actually move to a different window
					const start = Date.now();
					const timeout = 10000;
					while (Date.now() - start < timeout) {
						const helpersAfter = await getTestHelpers();
						const tabAfter = helpersAfter.getTabById(sourceTabId);
						if (tabAfter && tabAfter.windowId !== originalWindowId) {
							return tabAfter.windowId; // Successfully moved to new window, return new window ID
						}
						await sidepanel.waitForTimeout(100);
					}

					throw new Error(
						`Tab ${sourceTabId} did not move to new window within ${timeout}ms`,
					);
				} catch (error) {
					// If sidepanel was closed during operation, provide better error message
					if (
						error instanceof Error &&
						error.message.includes(
							"Target page, context or browser has been closed",
						)
					) {
						throw new Error(
							`Sidepanel was closed during drag operation for tab ${sourceTabId} to new window. This might indicate an issue with window creation or tab move handling.`,
						);
					}
					throw error;
				}
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
