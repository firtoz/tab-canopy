import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import {
	DEFAULT_TREE_ORDER,
	treeOrderSort,
} from "@/entrypoints/sidepanel/lib/tree";
import type { Tab } from "@/schema/src/schema";
import { log, makeTabId } from "./constants";
import type { DbOperations } from "./db-operations";
import { queuedHandler } from "./event-queue";
import { type TabRecord, tabToRecord } from "./mappers";
import {
	calculateTreePositionForNewTab,
	calculateTreePositionFromBrowserMove,
} from "./tree-sync";
import { hasTabIds } from "./type-guards";

/**
 * Track UI-initiated moves to prevent race conditions.
 * When the UI updates tree structure and then calls browser.tabs.move(),
 * the onMoved event might fire before the DB sync completes.
 * This map stores the intended tree positions so we don't recalculate.
 */
export interface UiMoveIntent {
	parentTabId: number | null;
	treeOrder: string;
	timestamp: number;
	/** TTL for this specific intent (creation intents have shorter TTL) */
	ttl: number;
}

// Map of tabId -> intended tree position from UI
const uiMoveIntents = new Map<number, UiMoveIntent>();

// Clean up stale intents after 5 seconds (for explicit UI moves)
const UI_MOVE_INTENT_TTL = 5000;

/**
 * Pending child tab intent - registered BEFORE the tab is created
 * Keyed by "windowId:expectedIndex" since we don't have tabId yet
 */
export interface PendingChildIntent {
	parentTabId: number;
	treeOrder: string;
	timestamp: number;
}

// Map of "windowId:index" -> pending child intent
const pendingChildIntents = new Map<string, PendingChildIntent>();

// Clean up pending intents after 2 seconds (shorter than move intents)
const PENDING_CHILD_INTENT_TTL = 2000;

export function registerPendingChildIntent(
	windowId: number,
	expectedIndex: number,
	parentTabId: number,
	treeOrder: string,
): void {
	const key = `${windowId}:${expectedIndex}`;
	log("[Background] Registering pending child intent:", key, {
		parentTabId,
		treeOrder,
	});
	pendingChildIntents.set(key, {
		parentTabId,
		treeOrder,
		timestamp: Date.now(),
	});

	// Auto-cleanup after TTL
	setTimeout(() => {
		const intent = pendingChildIntents.get(key);
		if (intent && Date.now() - intent.timestamp >= PENDING_CHILD_INTENT_TTL) {
			pendingChildIntents.delete(key);
			log("[Background] Cleaned up stale pending child intent:", key);
		}
	}, PENDING_CHILD_INTENT_TTL);
}

function consumePendingChildIntent(
	windowId: number,
	tabIndex: number,
): PendingChildIntent | undefined {
	const key = `${windowId}:${tabIndex}`;
	const intent = pendingChildIntents.get(key);
	if (intent) {
		pendingChildIntents.delete(key);
		// Check if intent is still fresh
		if (Date.now() - intent.timestamp < PENDING_CHILD_INTENT_TTL) {
			log("[Background] Consuming pending child intent:", key, intent);
			return intent;
		}
		log("[Background] Pending child intent expired:", key);
	}
	return undefined;
}

/**
 * Event tracking for tests - stores tab creation events with their decisions
 * Only active when test mode is enabled to prevent memory leaks in production
 */
export interface TabCreatedEvent {
	tabId: number;
	openerTabId: number | undefined;
	tabIndex: number;
	decidedParentId: number | null;
	treeOrder: string;
	reason: string;
	timestamp: number;
}

let isTestMode = false;
const tabCreatedEvents: TabCreatedEvent[] = [];
const MAX_EVENT_HISTORY = 100;

export function enableTestMode(): void {
	log("[Background] Test mode enabled - event tracking active");
	isTestMode = true;
}

export function disableTestMode(): void {
	log("[Background] Test mode disabled - clearing events");
	isTestMode = false;
	tabCreatedEvents.length = 0;
}

export function isTestModeEnabled(): boolean {
	return isTestMode;
}

function trackTabCreatedEvent(event: Omit<TabCreatedEvent, "timestamp">) {
	// Only track events in test mode
	if (!isTestMode) return;

	tabCreatedEvents.push({
		...event,
		timestamp: Date.now(),
	});

	// Keep only last MAX_EVENT_HISTORY events
	if (tabCreatedEvents.length > MAX_EVENT_HISTORY) {
		tabCreatedEvents.shift();
	}
}

export function getTabCreatedEvents(): TabCreatedEvent[] {
	return [...tabCreatedEvents];
}

export function clearTabCreatedEvents(): void {
	tabCreatedEvents.length = 0;
}

// Short TTL for creation-time intents (to handle Chrome's onMoved-after-onCreated race)
const CREATION_INTENT_TTL = 500;

export function registerUiMoveIntent(
	tabId: number,
	parentTabId: number | null,
	treeOrder: string,
	/** Use shorter TTL for creation-time intents to avoid interfering with user-initiated moves */
	isCreationIntent = false,
): void {
	const ttl = isCreationIntent ? CREATION_INTENT_TTL : UI_MOVE_INTENT_TTL;
	log("[Background] Registering UI move intent for tab:", tabId, {
		parentTabId,
		treeOrder,
		isCreationIntent,
		ttl,
	});
	uiMoveIntents.set(tabId, {
		parentTabId,
		treeOrder,
		timestamp: Date.now(),
		ttl,
	});

	// Auto-cleanup after TTL
	setTimeout(() => {
		const intent = uiMoveIntents.get(tabId);
		if (intent && Date.now() - intent.timestamp >= intent.ttl) {
			uiMoveIntents.delete(tabId);
			log("[Background] Cleaned up stale UI move intent for tab:", tabId);
		}
	}, ttl);
}

function consumeUiMoveIntent(tabId: number): UiMoveIntent | undefined {
	const intent = uiMoveIntents.get(tabId);
	if (intent) {
		uiMoveIntents.delete(tabId);
		// Check if intent is still fresh using its specific TTL
		if (Date.now() - intent.timestamp < intent.ttl) {
			log("[Background] Consuming UI move intent for tab:", tabId, intent);
			return intent;
		}
		log("[Background] UI move intent expired for tab:", tabId);
	}
	return undefined;
}

// Helper to update tab indices while preserving tree structure
const updateTabIndicesInWindow = async (
	windowId: number,
	dbOps: DbOperations,
) => {
	const { putItems, getAll } = dbOps;

	// Get existing tab records to preserve tree structure
	const existingTabs = await getAll<Tab>("tab");
	const existingMap = new Map<number, Tab>();
	for (const tab of existingTabs) {
		existingMap.set(tab.browserTabId, tab);
	}

	const tabs = await browser.tabs.query({ windowId });
	const tabRecords = tabs.filter(hasTabIds).map((tab) => {
		const existing = existingMap.get(tab.id);
		return tabToRecord(tab, {
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
		});
	});

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
};

// const buildFlatOrder = (tabs: Tab[]): Tab[] => {
// 	const result: Tab[] = [];
// 	const childrenMap = new Map<number | null, Tab[]>();

// 	for (const tab of tabs) {
// 		const parentId = tab.parentTabId;
// 		if (!childrenMap.has(parentId)) {
// 			childrenMap.set(parentId, []);
// 		}
// 		childrenMap.get(parentId)?.push(tab);
// 	}

// 	for (const children of childrenMap.values()) {
// 		children.sort(treeOrderSort);
// 	}

// 	const traverse = (parentId: number | null) => {
// 		const children = childrenMap.get(parentId) || [];
// 		for (const child of children) {
// 			result.push(child);
// 			traverse(child.browserTabId);
// 		}
// 	};

// 	traverse(null);
// 	return result;
// };

// Helper to update only tabs in a specific index range (for moves)
const _updateTabIndicesInRange = async (
	windowId: number,
	fromIndex: number,
	toIndex: number,
	dbOps: DbOperations,
) => {
	const { putItems, getAll } = dbOps;
	const minIndex = Math.min(fromIndex, toIndex);
	const maxIndex = Math.max(fromIndex, toIndex);

	// Get existing tab records to preserve tree structure
	const existingTabs = await getAll<Tab>("tab");
	const existingMap = new Map<number, Tab>();
	for (const tab of existingTabs) {
		existingMap.set(tab.browserTabId, tab);
	}

	const tabs = await browser.tabs.query({ windowId });
	const affectedTabs = tabs
		.filter(hasTabIds)
		.filter((tab) => tab.index >= minIndex && tab.index <= maxIndex);

	const tabRecords = affectedTabs.map((tab) => {
		const existing = existingMap.get(tab.id);
		return tabToRecord(tab, {
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
		});
	});

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
};

export const setupTabListeners = (
	dbOps: DbOperations,
	getManagedMoveTabIds?: () => Set<number>,
) => {
	const { putItems, deleteItems, getAll } = dbOps;

	// Handler for tab creation
	const handleTabCreated = async (tab: Browser.tabs.Tab) => {
		log(
			"[Background] Tab created:",
			tab.id,
			"at index:",
			tab.index,
			"openerTabId:",
			(tab as { openerTabId?: number }).openerTabId,
		);
		if (!hasTabIds(tab)) return;

		// Check for pending child intent FIRST - this was registered by the UI
		// before creating the tab (since Chrome doesn't propagate openerTabId)
		const pendingIntent = consumePendingChildIntent(tab.windowId, tab.index);
		if (pendingIntent) {
			log("[Background] Using pending child intent for new tab:", {
				tabId: tab.id,
				parentTabId: pendingIntent.parentTabId,
				treeOrder: pendingIntent.treeOrder,
			});

			// Register as a regular UI move intent for subsequent handlers
			registerUiMoveIntent(
				tab.id,
				pendingIntent.parentTabId,
				pendingIntent.treeOrder,
			);

			trackTabCreatedEvent({
				tabId: tab.id,
				openerTabId: (tab as { openerTabId?: number }).openerTabId,
				tabIndex: tab.index,
				decidedParentId: pendingIntent.parentTabId,
				treeOrder: pendingIntent.treeOrder,
				reason: `Pending child intent: child of ${pendingIntent.parentTabId}`,
			});

			// Create the new tab record with the intended parent
			const newTabRecord = tabToRecord(tab, {
				parentTabId: pendingIntent.parentTabId,
				treeOrder: pendingIntent.treeOrder,
			});
			await putItems("tab", [newTabRecord]);

			// Update other tabs in window since indices shifted
			const existingTabs = await getAll<Tab>("tab");
			const existingMap = new Map<number, Tab>();
			for (const t of existingTabs) {
				existingMap.set(t.browserTabId, t);
			}

			const browserTabs = await browser.tabs.query({ windowId: tab.windowId });
			const otherRecords: TabRecord[] = [];
			for (const t of browserTabs.filter(hasTabIds)) {
				if (t.id === tab.id) continue; // Skip the new tab
				const existing = existingMap.get(t.id);
				otherRecords.push(
					tabToRecord(t, {
						parentTabId: existing?.parentTabId ?? null,
						treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
					}),
				);
			}
			if (otherRecords.length > 0) {
				await putItems("tab", otherRecords);
			}

			return; // Early return - we've handled everything
		}

		// No pending intent - proceed with normal position-based logic
		// Get existing tabs to determine tree position
		const existingTabs = await getAll<Tab>("tab");
		const windowTabs = existingTabs.filter(
			(t) => t.browserWindowId === tab.windowId,
		);

		// Get all browser tabs in this window for index mapping
		const browserTabs = await browser.tabs.query({ windowId: tab.windowId });
		const browserTabsWithIds = browserTabs
			.filter(hasTabIds)
			.map((t) => ({ id: t.id, index: t.index }));

		// Calculate tree position based on where the tab was inserted
		let { parentTabId, treeOrder } = calculateTreePositionForNewTab(
			windowTabs,
			browserTabsWithIds,
			tab.index,
			tab.id,
		);

		log("[Background] calculateTreePositionForNewTab result:", {
			parentTabId,
			treeOrder,
			newTabIndex: tab.index,
			windowTabsCount: windowTabs.length,
			browserTabsCount: browserTabsWithIds.length,
			windowTabIds: windowTabs.map((t) => ({
				id: t.browserTabId,
				parent: t.parentTabId,
				idx: t.tabIndex,
			})),
			browserTabIndices: browserTabsWithIds.map((t) => ({
				id: t.id,
				idx: t.index,
			})),
		});

		const openerTabId = (tab as { openerTabId?: number }).openerTabId;
		let reason = "";
		let needsRepositioning = false;

		// If position-based didn't place it in a tree, but there's an opener, make it a child of opener
		if (parentTabId === null && openerTabId !== undefined) {
			const openerTab = windowTabs.find((t) => t.browserTabId === openerTabId);
			if (openerTab) {
				parentTabId = openerTabId;

				// Get opener's children
				const openerChildren = windowTabs.filter(
					(t) => t.parentTabId === openerTabId,
				);

				// Build a map from tab ID to CURRENT browser index (browserTabs has current indices)
				const currentIndexMap = new Map<number, number>();
				for (const bt of browserTabsWithIds) {
					currentIndexMap.set(bt.id, bt.index);
				}

				// Get opener's current browser index
				const openerCurrentIndex =
					currentIndexMap.get(openerTab.browserTabId) ?? openerTab.tabIndex;

				// Check if the new tab is right after the opener (context menu case)
				// In this case, tab.index == openerIndex + 1
				const isRightAfterOpener = tab.index === openerCurrentIndex + 1;

				if (isRightAfterOpener) {
					// Tab was explicitly created right after opener (context menu behavior)
					// It should be FIRST among children in tree order
					if (openerChildren.length === 0) {
						treeOrder = generateKeyBetween(null, null);
						reason = `Opener-based: first child of opener tab ${openerTabId} (right after opener)`;
					} else {
						// Find the child with the smallest treeOrder
						const childrenByTreeOrder = [...openerChildren].sort((a, b) =>
							a.treeOrder < b.treeOrder ? -1 : 1,
						);
						const firstChild = childrenByTreeOrder[0];
						treeOrder = generateKeyBetween(null, firstChild.treeOrder);
						reason = `Opener-based: first child of opener tab ${openerTabId} (right after opener, before ${firstChild.browserTabId})`;
					}
					needsRepositioning = false; // Already at correct position
				} else {
					// Tab is not right after opener - need to reposition to after last child
					needsRepositioning = true;

					if (openerChildren.length === 0) {
						treeOrder = generateKeyBetween(null, null);
						reason = `Opener-based: made first child of opener tab ${openerTabId}`;
					} else {
						// Position after last child in tree order
						const childrenByTreeOrder = [...openerChildren].sort((a, b) =>
							a.treeOrder < b.treeOrder ? -1 : 1,
						);
						const lastChild =
							childrenByTreeOrder[childrenByTreeOrder.length - 1];
						treeOrder = generateKeyBetween(lastChild.treeOrder, null);
						reason = `Opener-based: made child of opener tab ${openerTabId} (after last sibling)`;
					}
				}
			} else {
				reason = "Position-based: inserted at root level (opener not in DB)";
			}
		} else if (parentTabId !== null) {
			reason = `Position-based: inserted within tree of parent ${parentTabId}`;

			// Even if position-based logic placed it correctly, check if the tab has an opener
			// and is far from its siblings. If so, reposition it to be adjacent.
			if (openerTabId !== undefined && openerTabId === parentTabId) {
				// The tab has an opener and position-based logic agreed
				// Check if the tab is adjacent to its parent or siblings
				const parent = windowTabs.find((t) => t.browserTabId === parentTabId);
				if (parent) {
					const siblings = windowTabs.filter(
						(t) => t.parentTabId === parentTabId && t.browserTabId !== tab.id,
					);

					// If there are siblings, check if the new tab is adjacent to them
					if (siblings.length > 0) {
						// Find the expected range where children should be
						const siblingIndices = siblings.map((s) => s.tabIndex);
						const maxSiblingIndex = Math.max(...siblingIndices);

						// If the new tab is beyond the sibling range + reasonable gap,
						// it might benefit from repositioning
						const expectedMaxIndex = maxSiblingIndex + 2; // Allow small gap
						if (tab.index > expectedMaxIndex) {
							needsRepositioning = true;
							reason += " (repositioning to be adjacent to siblings)";
						}
					}
				}
			}
		} else {
			reason = "Position-based: inserted at root level";
		}

		trackTabCreatedEvent({
			tabId: tab.id,
			openerTabId,
			tabIndex: tab.index,
			decidedParentId: parentTabId,
			treeOrder,
			reason,
		});

		log("[Background] Tab tree position calculated:", {
			parentTabId,
			treeOrder,
			reason,
		});

		// Register a UI move intent BEFORE saving to protect our calculated treeOrder
		// This prevents handleTabMoved from recalculating if Chrome fires onMoved
		// after onCreated (which happens when creating a tab with a specific index)
		// Use short TTL so it doesn't interfere with user-initiated moves later
		registerUiMoveIntent(tab.id, parentTabId, treeOrder, true);

		// Create the new tab record
		const newTabRecord = tabToRecord(tab, { parentTabId, treeOrder });
		await putItems("tab", [newTabRecord]);

		// If the tab needs repositioning (opener-based placement where browser placed it far away),
		// move it to be adjacent to its siblings
		if (needsRepositioning && parentTabId !== null) {
			log("[Background] Tab needs repositioning to be adjacent to siblings");

			// Find where the tab should be positioned in the browser
			// It should be after the last child of the parent (or after the parent if no children exist yet)
			const parent = windowTabs.find((t) => t.browserTabId === parentTabId);
			if (parent) {
				// Get all children of the parent (including the new tab we just created)
				const allChildren = windowTabs
					.filter((t) => t.parentTabId === parentTabId)
					.sort(treeOrderSort);

				// Find the browser index where the tab should be
				// Start with the parent's index
				let targetIndex = parent.tabIndex + 1;

				// If there are other children, place after the last one
				if (allChildren.length > 0) {
					// Find the last child in browser order (highest tab index)
					const lastChildInBrowser = allChildren.reduce((max, child) => {
						return child.tabIndex > max.tabIndex ? child : max;
					}, allChildren[0]);
					targetIndex = lastChildInBrowser.tabIndex + 1;
				}

				log(
					`[Background] Moving tab ${tab.id} to index ${targetIndex} to be adjacent to parent ${parentTabId}`,
				);

				// Register a move intent so the onMoved handler doesn't recalculate tree position
				// Use short TTL since this is during tab creation, not explicit UI move
				registerUiMoveIntent(tab.id, parentTabId, treeOrder, true);

				// Move the tab
				await browser.tabs.move(tab.id, { index: targetIndex }).catch((err) => {
					log(`[Background] Failed to reposition tab ${tab.id}:`, err);
				});
			}
		}

		// Update other tabs in window since indices shifted
		const existingMap = new Map<number, Tab>();
		for (const t of existingTabs) {
			existingMap.set(t.browserTabId, t);
		}

		const otherRecords: TabRecord[] = [];
		for (const t of browserTabs.filter(hasTabIds)) {
			if (t.id === tab.id) continue; // Skip the new tab
			const existing = existingMap.get(t.id);
			otherRecords.push(
				tabToRecord(t, {
					parentTabId: existing?.parentTabId ?? null,
					treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
				}),
			);
		}
		if (otherRecords.length > 0) {
			await putItems("tab", otherRecords);
		}
	};

	browser.tabs.onCreated.addListener(
		queuedHandler("tabs.onCreated", handleTabCreated),
	);

	// Handler for tab updates
	const handleTabUpdated = async (
		tabId: number,
		_changeInfo: Browser.tabs.OnUpdatedInfo,
		tab: Browser.tabs.Tab,
	) => {
		log("[Background] Tab updated:", tabId);
		if (!hasTabIds(tab)) return;

		// First check if there's a UI move intent - this takes precedence
		// (Note: we don't consume it, just read it, as handleTabMoved may also need it)
		const intent = uiMoveIntents.get(tabId);

		// Preserve tree structure when updating
		const existingTabs = await getAll<Tab>("tab");
		const existing = existingTabs.find((t) => t.browserTabId === tabId);

		// Priority: intent > existing > fallback
		let treeOrder: string;
		let parentTabId: number | null;

		if (intent) {
			// Use the intent from handleTabCreated
			treeOrder = intent.treeOrder;
			parentTabId = intent.parentTabId;
		} else if (existing) {
			treeOrder = existing.treeOrder;
			parentTabId = existing.parentTabId;
		} else {
			// Tab doesn't exist in DB yet and no intent - generate unique treeOrder
			const windowTabs = existingTabs
				.filter(
					(t) => t.browserWindowId === tab.windowId && t.parentTabId === null,
				)
				.sort(treeOrderSort);
			const lastRoot = windowTabs[windowTabs.length - 1];
			treeOrder = generateKeyBetween(lastRoot?.treeOrder || null, null);
			parentTabId = null;
		}

		await putItems("tab", [
			tabToRecord(tab, {
				parentTabId,
				treeOrder,
			}),
		]);
	};

	browser.tabs.onUpdated.addListener(
		queuedHandler("tabs.onUpdated", handleTabUpdated),
	);

	// Handler for tab removal
	const handleTabRemoved = async (
		tabId: number,
		removeInfo: Browser.tabs.OnRemovedInfo,
	) => {
		log("[Background] Tab removed:", tabId, removeInfo);

		const existingTabs = await getAll<Tab>("tab");
		const removedTab = existingTabs.find((t) => t.browserTabId === tabId);

		if (removedTab) {
			// Find children of the removed tab
			const children = existingTabs.filter((t) => t.parentTabId === tabId);
			if (children.length > 0) {
				// Behavior depends on whether the tab was collapsed or not
				if (removedTab.isCollapsed) {
					// Collapsed: close all descendants recursively
					log("[Background] Tab was collapsed, closing all descendants");
					const descendantIds = new Set<number>();
					const queue = [...children];
					
					while (queue.length > 0) {
						const child = queue.shift();
						if (!child) continue;
						
						descendantIds.add(child.browserTabId);
						
						// Find grandchildren and add to queue
						const grandchildren = existingTabs.filter(
							(t) => t.parentTabId === child.browserTabId,
						);
						queue.push(...grandchildren);
					}

					// Close all descendants
					for (const descendantId of descendantIds) {
						try {
							await browser.tabs.remove(descendantId);
							log("[Background] Closed descendant tab:", descendantId);
						} catch (error) {
							log("[Background] Failed to close descendant tab:", descendantId, error);
						}
					}
				} else {
					// Not collapsed: promote children to the removed tab's parent
					log("[Background] Tab was not collapsed, promoting children");
					const promotedRecords: TabRecord[] = [];
					for (const child of children) {
						const browserTab = await browser.tabs
							.get(child.browserTabId)
							.catch(() => null);
						if (browserTab && hasTabIds(browserTab)) {
							promotedRecords.push(
								tabToRecord(browserTab, {
									parentTabId: removedTab.parentTabId,
									treeOrder: child.treeOrder,
								}),
							);
						}
					}
					if (promotedRecords.length > 0) {
						await putItems("tab", promotedRecords);
					}
				}
			}
		}

		await deleteItems("tab", [makeTabId(tabId)]);

		// Update indices of remaining tabs
		if (!removeInfo.isWindowClosing) {
			await updateTabIndicesInWindow(removeInfo.windowId, dbOps);
		}
	};

	browser.tabs.onRemoved.addListener(
		queuedHandler("tabs.onRemoved", handleTabRemoved),
	);

	// Helper to log to test context by sending message to sidepanel
	const testLog = (message: string) => {
		// Send message to all extension pages (sidepanel will receive it)
		browser.runtime
			.sendMessage({
				type: "TEST_DEBUG_LOG",
				log: message,
			})
			.catch(() => {
				// Ignore errors if no listeners (not in test mode)
			});
	};

	// Handler for tab moves
	const handleTabMoved = async (
		tabId: number,
		moveInfo: Browser.tabs.OnMovedInfo,
	) => {
		log("[Background] Tab moved:", tabId, moveInfo);
		testLog(
			`Tab moved: ${tabId} from ${moveInfo.fromIndex} to ${moveInfo.toIndex}`,
		);

		// First, check if this move was initiated by our UI
		// The UI registers intent before calling browser.tabs.move() to avoid race conditions
		const uiIntent = consumeUiMoveIntent(tabId);
		if (uiIntent) {
			log(
				"[Background] Using UI move intent, skipping tree recalculation for tab:",
				tabId,
			);
			// Use the tree position that the UI already set
			const browserTab = await browser.tabs.get(tabId);
			if (browserTab && hasTabIds(browserTab)) {
				await putItems("tab", [
					tabToRecord(browserTab, {
						parentTabId: uiIntent.parentTabId,
						treeOrder: uiIntent.treeOrder,
					}),
				]);
			}

			// Still need to update other tabs' indices
			const existingTabs = await getAll<Tab>("tab");
			const existingMap = new Map<number, Tab>();
			for (const tab of existingTabs) {
				existingMap.set(tab.browserTabId, tab);
			}

			const allBrowserTabs = await browser.tabs.query({
				windowId: moveInfo.windowId,
			});
			const filteredTabs = allBrowserTabs.filter(hasTabIds);
			const otherTabRecords: TabRecord[] = [];

			// Separate tabs into those with existing records/intents and those without
			const tabsWithData: typeof filteredTabs = [];
			const tabsWithoutData: typeof filteredTabs = [];

			for (const bt of filteredTabs) {
				if (bt.id === tabId) continue;
				const existing = existingMap.get(bt.id);
				const otherIntent = uiMoveIntents.get(bt.id);
				if (existing || otherIntent) {
					tabsWithData.push(bt);
				} else {
					tabsWithoutData.push(bt);
				}
			}

			// Update tabs with existing data
			for (const bt of tabsWithData) {
				if (!hasTabIds(bt)) continue;
				const existing = existingMap.get(bt.id);
				const otherIntent = uiMoveIntents.get(bt.id);
				otherTabRecords.push(
					tabToRecord(bt, {
						parentTabId:
							otherIntent?.parentTabId ?? existing?.parentTabId ?? null,
						treeOrder:
							otherIntent?.treeOrder ??
							existing?.treeOrder ??
							DEFAULT_TREE_ORDER,
					}),
				);
			}

			// For tabs without existing data, generate unique treeOrders
			if (tabsWithoutData.length > 0) {
				const keys = generateNKeysBetween(null, null, tabsWithoutData.length);
				for (let i = 0; i < tabsWithoutData.length; i++) {
					const bt = tabsWithoutData[i];
					if (!hasTabIds(bt)) continue;
					otherTabRecords.push(
						tabToRecord(bt, {
							parentTabId: null,
							treeOrder: keys[i],
						}),
					);
				}
			}

			if (otherTabRecords.length > 0) {
				await putItems("tab", otherTabRecords);
			}
			return;
		}

		// Get existing tabs to calculate new tree position
		const existingTabs = await getAll<Tab>("tab");
		const tabsInTargetWindow = existingTabs
			.filter((t) => t.browserWindowId === moveInfo.windowId)
			.sort((a, b) => {
				return a.tabIndex - b.tabIndex;
			});
		const existingTabInTargetWindow = existingTabs.find(
			(t) => t.browserTabId === tabId,
		);

		// Check if the move was initiated by our extension UI
		// by seeing if the tab's current tree position already puts it at the right browser index
		let shouldRecalculateTree = true;

		if (existingTabInTargetWindow) {
			// Simple check: build expected order from tree
			// If the expected position matches toIndex, the UI already set the correct tree position

			const expectedIndex = tabsInTargetWindow.findIndex(
				(t) => t.browserTabId === tabId,
			);

			if (expectedIndex === moveInfo.toIndex) {
				log(
					"[Background] Tab already at expected position, preserving UI tree structure",
				);
				shouldRecalculateTree = false;
			}
		}

		let newParentId: number | null;
		let newTreeOrder: string;

		let childrenToFlatten: number[] = [];

		testLog(
			`shouldRecalculateTree: ${shouldRecalculateTree} for tab: ${tabId}`,
		);

		if (shouldRecalculateTree) {
			// This is a browser-native move (drag from tab bar) - calculate tree position
			const result = calculateTreePositionFromBrowserMove(
				tabsInTargetWindow,
				tabId,
				moveInfo.toIndex,
			);
			newParentId = result.parentTabId;
			newTreeOrder = result.treeOrder;
			childrenToFlatten = result.childrenToFlatten;
			log("[Background] Calculated new tree position:", {
				newParentId,
				newTreeOrder,
				childrenToFlatten,
			});
			testLog(
				`Calculated new tree position: parentId=${newParentId}, treeOrder=${newTreeOrder}, childrenToFlatten=${JSON.stringify(childrenToFlatten)}`,
			);
		} else {
			// Preserve the existing tree position (set by extension UI)
			newParentId = existingTabInTargetWindow?.parentTabId ?? null;
			newTreeOrder = existingTabInTargetWindow?.treeOrder ?? DEFAULT_TREE_ORDER;
			log("[Background] Preserving existing tree position:", {
				newParentId,
				newTreeOrder,
			});
			testLog(
				`Preserving existing tree position: parentId=${newParentId}, treeOrder=${newTreeOrder}`,
			);
		}

		// Update the moved tab with tree position AND new browser index
		const browserTab = await browser.tabs.get(tabId);
		if (browserTab && hasTabIds(browserTab)) {
			await putItems("tab", [
				tabToRecord(browserTab, {
					parentTabId: newParentId,
					treeOrder: newTreeOrder,
				}),
			]);
		}

		testLog("About to check for descendants to flatten");

		// After moving the tab, check if any of its descendants are now at a browser index
		// before the parent. If so, flatten those descendants.
		// This handles the case where a parent tab is moved past its children.

		// Get all descendants of the moved tab BEFORE the move (from existing DB state)
		const getAllDescendantIds = (parentId: number): number[] => {
			const descendants: number[] = [];
			const children = existingTabs.filter((t) => t.parentTabId === parentId);
			for (const child of children) {
				descendants.push(child.browserTabId);
				descendants.push(...getAllDescendantIds(child.browserTabId));
			}
			return descendants;
		};

		const descendantIds = getAllDescendantIds(tabId);
		testLog(
			`Found descendants: [${descendantIds.join(", ")}] for moved tab: ${tabId}`,
		);

		// Track which descendants were actually flattened so we don't overwrite them later
		const flattenedDescendantIds: number[] = [];

		if (descendantIds.length > 0) {
			const movedTabBrowserInfo = await browser.tabs.get(tabId);
			if (movedTabBrowserInfo && hasTabIds(movedTabBrowserInfo)) {
				const movedTabNewIndex = movedTabBrowserInfo.index;
				testLog(`Moved tab new browser index: ${movedTabNewIndex}`);

				// Check which descendants are now before the parent in browser order
				const descendantsToFlatten: number[] = [];
				for (const descendantId of descendantIds) {
					const descendantBrowserTab = await browser.tabs
						.get(descendantId)
						.catch(() => null);
					if (descendantBrowserTab && hasTabIds(descendantBrowserTab)) {
						testLog(
							`Descendant ${descendantId} is at browser index ${descendantBrowserTab.index} vs parent at ${movedTabNewIndex}`,
						);
						if (descendantBrowserTab.index < movedTabNewIndex) {
							testLog(`--> Descendant ${descendantId} needs to be flattened!`);
							descendantsToFlatten.push(descendantId);
						}
					}
				}

				if (descendantsToFlatten.length > 0) {
					log("[Background] Flattening descendants:", descendantsToFlatten);
					testLog(
						`Flattening descendants: [${descendantsToFlatten.join(", ")}]`,
					);
					const childRecords: TabRecord[] = [];

					// Get all tabs at the new parent level to calculate proper tree orders
					const siblingsAtNewLevel = existingTabs
						.filter(
							(t) =>
								t.parentTabId === newParentId &&
								t.browserTabId !== tabId &&
								!descendantsToFlatten.includes(t.browserTabId),
						)
						.sort(treeOrderSort);

					// For each child to flatten, give it the same parent as the moved tab
					// and a treeOrder that places it before the moved tab
					for (let i = 0; i < descendantsToFlatten.length; i++) {
						const childId = descendantsToFlatten[i];
						const childBrowserTab = await browser.tabs
							.get(childId)
							.catch(() => null);
						if (childBrowserTab && hasTabIds(childBrowserTab)) {
							// Generate treeOrder between the last sibling and the moved tab
							const beforeSibling =
								i === 0
									? siblingsAtNewLevel[siblingsAtNewLevel.length - 1]
									: childRecords[childRecords.length - 1];
							const childTreeOrder = generateKeyBetween(
								beforeSibling?.treeOrder || null,
								newTreeOrder,
							);

							testLog(
								`Flattening child ${childId} with treeOrder=${childTreeOrder} and newParentId=${newParentId}`,
							);

							childRecords.push(
								tabToRecord(childBrowserTab, {
									parentTabId: newParentId,
									treeOrder: childTreeOrder,
								}),
							);

							// Track that we flattened this descendant
							flattenedDescendantIds.push(childId);
						}
					}
					if (childRecords.length > 0) {
						testLog(`Updating ${childRecords.length} child records`);
						await putItems("tab", childRecords);
					}
				} else {
					testLog("No descendants need to be flattened");
				}
			}
		} else {
			testLog("No descendants found for moved tab");
		}

		// Also update indices of other affected tabs (preserve their tree structure)
		// BUT exclude the flattened descendants, as we've already updated them
		// ALSO: fix treeOrders for tabs that come after the moved section
		testLog(
			`Flattened descendant IDs to exclude from other tabs update: [${flattenedDescendantIds.join(", ")}]`,
		);

		const existingMap = new Map<number, Tab>();
		for (const tab of existingTabs) {
			existingMap.set(tab.browserTabId, tab);
		}

		// Get the final browser tab order
		const allBrowserTabs = await browser.tabs.query({
			windowId: moveInfo.windowId,
		});

		// Build a map of what we've already updated with new tree orders
		// const updatedTreeOrders = new Map<number, string>();
		// updatedTreeOrders.set(tabId, newTreeOrder);
		// for (const flattenedId of flattenedDescendantIds) {
		// 	const _flattenedTab = existingTabs.find(
		// 		(t) => t.browserTabId === flattenedId,
		// 	);
		// 	// The flattened tab got a new treeOrder, but we need to know what it was
		// 	// For now, we'll regenerate it
		// }

		const otherTabRecords: TabRecord[] = [];

		// For tabs that come after the moved tab, we need to ensure their treeOrders
		// are greater than the moved tab's treeOrder to maintain correct sort order
		let lastTreeOrderAtSameLevel = newTreeOrder;

		for (const bt of allBrowserTabs.filter(hasTabIds)) {
			// Skip the moved tab (already updated) and flattened descendants (already updated)
			if (bt.id === tabId || flattenedDescendantIds.includes(bt.id)) {
				testLog(`Skipping tab ${bt.id} in other tabs update`);
				// Update lastTreeOrder if this is at root level
				if (flattenedDescendantIds.includes(bt.id)) {
					// Flattened tabs are at root level, update lastTreeOrder
					// We need to recalculate what treeOrder the flattened tab got
					// For simplicity, let's get it from the DB after it was updated
					const updated = await browser.tabs.get(bt.id);
					if (updated) {
						const freshTabs = await getAll<Tab>("tab");
						const freshTab = freshTabs.find((t) => t.browserTabId === bt.id);
						if (freshTab) {
							lastTreeOrderAtSameLevel = freshTab.treeOrder;
						}
					}
				}
				continue;
			}

			const existing = existingMap.get(bt.id);
			let treeOrderToUse = existing?.treeOrder ?? DEFAULT_TREE_ORDER;
			const parentIdToUse = existing?.parentTabId ?? null;

			// If this tab is at root level AND comes after the moved tab in browser order,
			// AND its current treeOrder is less than the last root-level tab we've seen,
			// we need to give it a new treeOrder
			if (
				parentIdToUse === null &&
				bt.index > moveInfo.toIndex &&
				treeOrderToUse <= lastTreeOrderAtSameLevel
			) {
				// Generate a new treeOrder after the last one
				treeOrderToUse = generateKeyBetween(lastTreeOrderAtSameLevel, null);
				testLog(
					`Tab ${bt.id} at index ${bt.index} needs new treeOrder ${treeOrderToUse} (was ${existing?.treeOrder}) because it comes after moved tab and had old treeOrder`,
				);
			}

			if (parentIdToUse === null) {
				lastTreeOrderAtSameLevel = treeOrderToUse;
			}

			otherTabRecords.push(
				tabToRecord(bt, {
					parentTabId: parentIdToUse,
					treeOrder: treeOrderToUse,
				}),
			);
		}

		if (otherTabRecords.length > 0) {
			testLog(`Updating ${otherTabRecords.length} other tab records`);
			// Log each tab's treeOrder for debugging
			for (const record of otherTabRecords) {
				testLog(
					`  Tab ${record.browserTabId}: treeOrder=${record.treeOrder}, parentId=${record.parentTabId}, index=${record.tabIndex}`,
				);
			}
			await putItems("tab", otherTabRecords);
		}

		// Log final state of all tabs in window for debugging
		const finalBrowserTabs = await browser.tabs.query({
			windowId: moveInfo.windowId,
		});
		const finalExistingTabs = await getAll<Tab>("tab");
		testLog("Final tab state after move:");
		for (const bt of finalBrowserTabs.filter(hasTabIds)) {
			const existing = finalExistingTabs.find((t) => t.browserTabId === bt.id);
			testLog(
				`  Tab ${bt.id} @ index ${bt.index}: treeOrder=${existing?.treeOrder}, parentId=${existing?.parentTabId}`,
			);
		}
	};

	browser.tabs.onMoved.addListener(
		queuedHandler("tabs.onMoved", handleTabMoved),
	);

	// Handler for tab activation
	const handleTabActivated = async (
		activeInfo: Browser.tabs.OnActivatedInfo,
	) => {
		log("[Background] Tab activated:", activeInfo.tabId);

		// Get existing tabs to preserve tree structure
		const existingTabs = await getAll<Tab>("tab");
		const existingMap = new Map<number, Tab>();
		for (const tab of existingTabs) {
			existingMap.set(tab.browserTabId, tab);
		}

		const tabs = await browser.tabs.query({ windowId: activeInfo.windowId });
		const filteredTabs = tabs.filter(hasTabIds);

		// Separate tabs into those with existing records and those without
		const tabsWithRecords: typeof filteredTabs = [];
		const tabsWithoutRecords: typeof filteredTabs = [];

		for (const tab of filteredTabs) {
			if (existingMap.has(tab.id)) {
				tabsWithRecords.push(tab);
			} else {
				tabsWithoutRecords.push(tab);
			}
		}

		const tabRecords: TabRecord[] = [];

		// Update tabs with existing records (preserve tree structure)
		for (const tab of tabsWithRecords) {
			if (!hasTabIds(tab)) continue;
			const existing = existingMap.get(tab.id);
			if (!existing) continue;
			tabRecords.push(
				tabToRecord(tab, {
					parentTabId: existing.parentTabId,
					treeOrder: existing.treeOrder,
				}),
			);
		}

		// For tabs without existing records, generate unique treeOrders
		if (tabsWithoutRecords.length > 0) {
			const keys = generateNKeysBetween(null, null, tabsWithoutRecords.length);
			for (let i = 0; i < tabsWithoutRecords.length; i++) {
				const tab = tabsWithoutRecords[i];
				if (!hasTabIds(tab)) continue;
				tabRecords.push(
					tabToRecord(tab, {
						parentTabId: null,
						treeOrder: keys[i],
					}),
				);
			}
		}

		if (tabRecords.length > 0) {
			await putItems("tab", tabRecords);
		}
	};

	browser.tabs.onActivated.addListener(
		queuedHandler("tabs.onActivated", handleTabActivated),
	);

	// Handler for tab detachment (tab leaving a window)
	const handleTabDetached = async (
		tabId: number,
		detachInfo: Browser.tabs.OnDetachedInfo,
	) => {
		log("[Background] Tab detached:", tabId, detachInfo);

		// Check if this tab is part of a UI-managed move (e.g., drag to new window with children)
		const managedMoveTabIds = getManagedMoveTabIds?.() || new Set<number>();

		if (managedMoveTabIds.has(tabId)) {
			log(
				"[Background] Tab is part of UI-managed move, skipping child promotion",
			);
			// Don't promote children - the UI is handling the entire move
			await updateTabIndicesInWindow(detachInfo.oldWindowId, dbOps);
			return;
		}

		// Get the detached tab's record to handle its children
		const existingTabs = await getAll<Tab>("tab");
		const detachedTab = existingTabs.find((t) => t.browserTabId === tabId);

		if (detachedTab) {
			// Promote children of the detached tab to its parent (within the old window)
			// This handles the case where a parent is moved to another window via
			// external means (browser tab bar drag, etc.)
			const children = existingTabs.filter((t) => t.parentTabId === tabId);
			if (children.length > 0) {
				const promotedRecords: TabRecord[] = [];
				for (const child of children) {
					const browserTab = await browser.tabs
						.get(child.browserTabId)
						.catch(() => null);
					if (browserTab && hasTabIds(browserTab)) {
						promotedRecords.push(
							tabToRecord(browserTab, {
								parentTabId: detachedTab.parentTabId,
								treeOrder: child.treeOrder,
							}),
						);
					}
				}
				if (promotedRecords.length > 0) {
					await putItems("tab", promotedRecords);
				}
			}
		}

		// Update indices of remaining tabs in the old window
		await updateTabIndicesInWindow(detachInfo.oldWindowId, dbOps);
	};

	browser.tabs.onDetached.addListener(
		queuedHandler("tabs.onDetached", handleTabDetached),
	);

	// Handler for tab attachment (tab entering a window)
	const handleTabAttached = async (
		tabId: number,
		attachInfo: Browser.tabs.OnAttachedInfo,
	) => {
		log("[Background] Tab attached:", tabId, attachInfo);

		// Get the attached tab from the browser
		const browserTab = await browser.tabs.get(tabId).catch(() => null);
		if (!browserTab || !hasTabIds(browserTab)) return;

		// First, check if there's a UI move intent (sent before browser.tabs.move was called)
		// This is the definitive source of truth for UI-initiated moves
		const uiIntent = consumeUiMoveIntent(tabId);
		if (uiIntent) {
			log(
				`[Background] Tab ${tabId} has UI move intent, using it: parentId=${uiIntent.parentTabId}, treeOrder=${uiIntent.treeOrder}`,
			);
			const tabRecord = tabToRecord(browserTab, {
				parentTabId: uiIntent.parentTabId,
				treeOrder: uiIntent.treeOrder,
			});
			await putItems("tab", [tabRecord]);
			// IMPORTANT: Don't call updateTabIndicesInWindow here!
			// During a UI-managed batch move, each tab has its own uiIntent with the correct
			// tree structure. If we call updateTabIndicesInWindow, it reads from IndexedDB
			// which may have stale data (Electric-SQL updates haven't synced yet).
			// Each tab will update its own index when its handler fires.
			return;
		}

		// Check if this tab is part of a UI-managed move (e.g., drag to new window with children)
		const managedMoveTabIds = getManagedMoveTabIds?.() || new Set<number>();
		const isUiManagedMove = managedMoveTabIds.has(tabId);
		log(
			`[Background] Tab ${tabId} isUiManagedMove: ${isUiManagedMove}, managedSet size: ${managedMoveTabIds.size}`,
		);

		// Get existing tabs
		const existingTabs = await getAll<Tab>("tab");
		const existingTab = existingTabs.find((t) => t.browserTabId === tabId);
		log(
			`[Background] Tab ${tabId} existingTab:`,
			existingTab
				? `windowId=${existingTab.browserWindowId}, parentId=${existingTab.parentTabId}`
				: "NOT FOUND",
		);

		// Check if the tab was already moved by our extension UI
		// Either:
		// 1. It's in the managed move set (definitive - the UI is coordinating this move)
		// 2. The DB windowId already matches (DB update already committed)
		const isExtensionMove =
			isUiManagedMove ||
			(existingTab && existingTab.browserWindowId === attachInfo.newWindowId);

		log(
			`[Background] Tab ${tabId} isExtensionMove: ${isExtensionMove} (isUiManagedMove=${isUiManagedMove}, existingTab.browserWindowId=${existingTab?.browserWindowId}, newWindowId=${attachInfo.newWindowId})`,
		);

		if (isExtensionMove && existingTab) {
			log(
				`[Background] Tab ${tabId} is part of extension UI move, preserving tree structure: parentId=${existingTab.parentTabId}, treeOrder=${existingTab.treeOrder}`,
			);
			// Preserve the tree structure from DB
			// For UI-managed moves, the UI has already updated parentTabId, treeOrder, and browserWindowId
			// for ALL tabs being moved. We just need to update this specific tab's browser index.
			const tabRecord = tabToRecord(browserTab, {
				parentTabId: existingTab.parentTabId,
				treeOrder: existingTab.treeOrder,
			});
			await putItems("tab", [tabRecord]);

			// IMPORTANT: Don't update other tabs here!
			// During a UI-managed batch move, multiple tabs attach in quick succession.
			// Each tab's onAttached handler will update itself when it fires.
			// If we try to update "other tabs" here, we'll race with their own onAttached handlers
			// and potentially overwrite correct data with stale data.
			//
			// The UI has already set the correct tree structure in the DB before starting the move.
			// We just update browser indices as each tab attaches.

			return; // Early return - we're done for UI-managed moves
		} else if (isUiManagedMove && !existingTab) {
			// This tab is part of a UI-managed move but we don't have the DB record yet
			// This shouldn't happen if UI sent move intent first, but handle it gracefully
			log(
				`[Background] ERROR: Tab ${tabId} is part of UI-managed move but no DB record or move intent found!`,
			);
			// Create as root tab with default tree order as fallback
			const tabRecord = tabToRecord(browserTab, {
				parentTabId: null,
				treeOrder: DEFAULT_TREE_ORDER,
			});
			await putItems("tab", [tabRecord]);
			return; // Early return
		} else if (!isExtensionMove) {
			log(
				`[Background] Tab ${tabId} is browser-native move, calculating tree position`,
			);
			// This is a browser-native cross-window move (drag from tab bar)
			// Its children were already promoted by handleTabDetached
			// Now we determine its position in the new window based on where it was dropped
			const newWindowTabs = existingTabs.filter(
				(t) => t.browserWindowId === attachInfo.newWindowId,
			);

			// Get all browser tabs in the new window for index mapping
			const allBrowserTabsInWindow = await browser.tabs.query({
				windowId: attachInfo.newWindowId,
			});
			const browserTabsWithIds = allBrowserTabsInWindow
				.filter(hasTabIds)
				.map((t) => ({ id: t.id, index: t.index }));

			// Calculate tree position based on where the tab was attached
			const { parentTabId, treeOrder } = calculateTreePositionForNewTab(
				newWindowTabs,
				browserTabsWithIds,
				attachInfo.newPosition,
				tabId,
			);

			log(
				`[Background] Tab ${tabId} attached at position ${attachInfo.newPosition}, calculated tree position: parentId=${parentTabId}, treeOrder=${treeOrder}`,
			);

			// Create the tab record with calculated tree position
			const tabRecord = tabToRecord(browserTab, {
				parentTabId,
				treeOrder,
			});
			await putItems("tab", [tabRecord]);

			// For browser-native moves, update all tabs in the window
			const existingMap = new Map<number, Tab>();
			for (const tab of existingTabs) {
				existingMap.set(tab.browserTabId, tab);
			}

			const allBrowserTabs = await browser.tabs.query({
				windowId: attachInfo.newWindowId,
			});
			const otherTabRecords: TabRecord[] = [];

			// Separate tabs into those with existing records and those without
			const tabsWithRecords: Browser.tabs.Tab[] = [];
			const tabsWithoutRecords: Browser.tabs.Tab[] = [];

			for (const bt of allBrowserTabs.filter(hasTabIds)) {
				if (bt.id === tabId) continue; // Skip the attached tab, already updated
				const existing = existingMap.get(bt.id);
				if (existing) {
					tabsWithRecords.push(bt);
				} else {
					tabsWithoutRecords.push(bt);
				}
			}

			// Update tabs with existing records (preserve tree structure)
			for (const bt of tabsWithRecords) {
				if (!hasTabIds(bt)) continue;
				const existing = existingMap.get(bt.id);
				if (!existing) continue;
				otherTabRecords.push(
					tabToRecord(bt, {
						parentTabId: existing.parentTabId,
						treeOrder: existing.treeOrder,
					}),
				);
			}

			// For tabs without existing records, generate unique treeOrders
			if (tabsWithoutRecords.length > 0) {
				const keys = generateNKeysBetween(
					null,
					null,
					tabsWithoutRecords.length,
				);
				for (let i = 0; i < tabsWithoutRecords.length; i++) {
					const bt = tabsWithoutRecords[i];
					if (!hasTabIds(bt)) continue;
					otherTabRecords.push(
						tabToRecord(bt, {
							parentTabId: null,
							treeOrder: keys[i],
						}),
					);
				}
			}

			if (otherTabRecords.length > 0) {
				await putItems("tab", otherTabRecords);
			}
		}
	};

	browser.tabs.onAttached.addListener(
		queuedHandler("tabs.onAttached", handleTabAttached),
	);

	// Export handlers for testing (so we can inject fake events)
	return {
		handleTabCreated,
		handleTabUpdated,
		handleTabRemoved,
		handleTabMoved,
		handleTabActivated,
		handleTabDetached,
		handleTabAttached,
	};
};
