import type { Tab } from "@/schema/src/schema";
import { log, makeTabId } from "./constants";
import type { DbOperations } from "./db-operations";
import { queuedHandler } from "./event-queue";
import { type TabRecord, tabToRecord } from "./mappers";
import { calculateTreePositionFromBrowserMove } from "./tree-sync";
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
}

// Map of tabId -> intended tree position from UI
const uiMoveIntents = new Map<number, UiMoveIntent>();

// Clean up stale intents after 5 seconds
const UI_MOVE_INTENT_TTL = 5000;

export function registerUiMoveIntent(
	tabId: number,
	parentTabId: number | null,
	treeOrder: string,
): void {
	log("[Background] Registering UI move intent for tab:", tabId, {
		parentTabId,
		treeOrder,
	});
	uiMoveIntents.set(tabId, {
		parentTabId,
		treeOrder,
		timestamp: Date.now(),
	});

	// Auto-cleanup after TTL
	setTimeout(() => {
		const intent = uiMoveIntents.get(tabId);
		if (intent && Date.now() - intent.timestamp >= UI_MOVE_INTENT_TTL) {
			uiMoveIntents.delete(tabId);
			log("[Background] Cleaned up stale UI move intent for tab:", tabId);
		}
	}, UI_MOVE_INTENT_TTL);
}

function consumeUiMoveIntent(tabId: number): UiMoveIntent | undefined {
	const intent = uiMoveIntents.get(tabId);
	if (intent) {
		uiMoveIntents.delete(tabId);
		// Check if intent is still fresh
		if (Date.now() - intent.timestamp < UI_MOVE_INTENT_TTL) {
			log("[Background] Consuming UI move intent for tab:", tabId, intent);
			return intent;
		}
		log("[Background] UI move intent expired for tab:", tabId);
	}
	return undefined;
}

/**
 * Generate a treeOrder value between two existing values.
 * Handles mixed alphanumeric strings (digits sort before letters in ASCII).
 * ASCII order: '0'-'9' (48-57) < 'A'-'Z' (65-90) < 'a'-'z' (97-122)
 */
function generateTreeOrder(before?: string, after?: string): string {
	// Default midpoint
	if (!before && !after) {
		return "n"; // middle of alphabet
	}

	if (!before) {
		// Insert before `after` - we need something that sorts before it
		const firstChar = after!.charCodeAt(0);

		// Try to find a character that sorts before the first character
		// '0' is ASCII 48, which is a safe lower bound for printable chars
		if (firstChar > 48) {
			// There's room before the first character
			const midChar = Math.floor((48 + firstChar) / 2);
			if (midChar < firstChar && midChar >= 48) {
				return String.fromCharCode(midChar);
			}
		}

		// First char is already at or near the minimum ('0')
		// Prepend '0' and recurse on the rest
		if (after!.length > 1) {
			return "0" + generateTreeOrder(undefined, after!.slice(1));
		}
		// Single character at minimum - just prepend '0'
		return "0";
	}

	if (!after) {
		// Insert after `before` - we need something that sorts after it
		// Append a character to make it larger
		return before + "n";
	}

	// Insert between two values
	// Find common prefix
	let i = 0;
	while (i < before.length && i < after.length && before[i] === after[i]) {
		i++;
	}
	const commonPrefix = before.slice(0, i);

	// Get the differing parts
	const beforeSuffix = before.slice(i);
	const afterSuffix = after.slice(i);

	// Get first differing character (or use boundaries)
	// Use ASCII 47 ('/') as lower bound and 127 (DEL) as upper bound
	const beforeChar = beforeSuffix.length > 0 ? beforeSuffix.charCodeAt(0) : 47;
	const afterChar = afterSuffix.length > 0 ? afterSuffix.charCodeAt(0) : 127;

	if (afterChar - beforeChar > 1) {
		// There's room for a character in between
		const midChar = String.fromCharCode(
			Math.floor((beforeChar + afterChar) / 2),
		);
		return commonPrefix + midChar;
	}

	// Characters are adjacent (e.g., '0' and '1', or 'a' and 'b')
	// We need to extend the `before` value
	if (beforeSuffix.length === 0) {
		// before ended at common prefix, after has more
		// Insert between common prefix and afterSuffix
		const midChar = Math.floor((47 + afterChar) / 2);
		if (midChar > 47 && midChar < afterChar) {
			return commonPrefix + String.fromCharCode(midChar);
		}
	}

	// Append to before to make it slightly larger but still less than after
	return before + "n";
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
			treeOrder: existing?.treeOrder ?? "a0",
		});
	});

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
};

// Helper to update only tabs in a specific index range (for moves)
const updateTabIndicesInRange = async (
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
			treeOrder: existing?.treeOrder ?? "a0",
		});
	});

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
};

export const setupTabListeners = (dbOps: DbOperations) => {
	const { putItems, deleteItems, getAll } = dbOps;

	// Handler for tab creation
	const handleTabCreated = async (tab: Browser.tabs.Tab) => {
		log(
			"[Background] Tab created:",
			tab.id,
			"openerTabId:",
			(tab as { openerTabId?: number }).openerTabId,
		);
		if (!hasTabIds(tab)) return;

		// Get existing tabs to determine tree position
		const existingTabs = await getAll<Tab>("tab");
		const existingMap = new Map<number, Tab>();
		for (const t of existingTabs) {
			existingMap.set(t.browserTabId, t);
		}

		// Check for openerTabId - if present, this tab was opened from another tab
		const openerTabId = (tab as { openerTabId?: number }).openerTabId;
		let parentTabId: number | null = null;
		let treeOrder = "a0";

		if (openerTabId && existingMap.has(openerTabId)) {
			// This tab was opened from another tab (e.g., middle click)
			// Make it a child of the opener tab
			parentTabId = openerTabId;

			// Find siblings (other children of the opener)
			const siblings = existingTabs
				.filter((t) => t.parentTabId === openerTabId)
				.sort((a, b) =>
					a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
				);

			// Get all tabs in the window to determine browser positions
			const windowTabs = await browser.tabs.query({ windowId: tab.windowId });

			// Build a map of tab ID to browser index for quick lookup
			const tabIndexMap = new Map<number, number>();
			for (const wt of windowTabs.filter(hasTabIds)) {
				tabIndexMap.set(wt.id, wt.index);
			}

			// Find the position among siblings based on browser index
			// Build a list of sibling indices in browser order
			const siblingWithIndices = siblings
				.map((s) => {
					const browserIndex = tabIndexMap.get(s.browserTabId);
					return browserIndex !== undefined ? { tab: s, browserIndex } : null;
				})
				.filter((s): s is { tab: Tab; browserIndex: number } => s !== null);

			// Find where to insert based on the new tab's browser index
			let insertAfter: Tab | undefined;
			let insertBefore: Tab | undefined;

			for (const sibling of siblingWithIndices) {
				if (sibling.browserIndex < tab.index) {
					// This sibling is before the new tab
					if (
						!insertAfter ||
						sibling.browserIndex >
							(tabIndexMap.get(insertAfter.browserTabId) ?? -1)
					) {
						insertAfter = sibling.tab;
					}
				} else {
					// This sibling is after the new tab
					if (
						!insertBefore ||
						sibling.browserIndex <
							(tabIndexMap.get(insertBefore.browserTabId) ?? Number.MAX_VALUE)
					) {
						insertBefore = sibling.tab;
					}
				}
			}

			treeOrder = generateTreeOrder(
				insertAfter?.treeOrder,
				insertBefore?.treeOrder,
			);

			log(
				"[Background] Tab opened from",
				openerTabId,
				"at index",
				tab.index,
				"- setting as child with treeOrder:",
				treeOrder,
				"between siblings:",
				insertAfter?.browserTabId,
				"and",
				insertBefore?.browserTabId,
			);
		} else {
			// Root level tab - place at end of root tabs in this window
			const rootTabs = existingTabs
				.filter(
					(t) => t.parentTabId === null && t.browserWindowId === tab.windowId,
				)
				.sort((a, b) =>
					a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
				);

			const lastRoot = rootTabs[rootTabs.length - 1];
			treeOrder = generateTreeOrder(lastRoot?.treeOrder, undefined);
		}

		// Create the new tab record
		const newTabRecord = tabToRecord(tab, { parentTabId, treeOrder });
		await putItems("tab", [newTabRecord]);

		// Update other tabs in window since indices shifted
		const otherTabs = await browser.tabs.query({ windowId: tab.windowId });
		const otherRecords: TabRecord[] = [];
		for (const t of otherTabs.filter(hasTabIds)) {
			if (t.id === tab.id) continue; // Skip the new tab
			const existing = existingMap.get(t.id);
			otherRecords.push(
				tabToRecord(t, {
					parentTabId: existing?.parentTabId ?? null,
					treeOrder: existing?.treeOrder ?? "a0",
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

		// Preserve tree structure when updating
		const existingTabs = await getAll<Tab>("tab");
		const existing = existingTabs.find((t) => t.browserTabId === tabId);

		await putItems("tab", [
			tabToRecord(tab, {
				parentTabId: existing?.parentTabId ?? null,
				treeOrder: existing?.treeOrder ?? "a0",
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

		// Before deleting, promote children to the removed tab's parent
		const existingTabs = await getAll<Tab>("tab");
		const removedTab = existingTabs.find((t) => t.browserTabId === tabId);

		if (removedTab) {
			// Find children of the removed tab
			const children = existingTabs.filter((t) => t.parentTabId === tabId);
			if (children.length > 0) {
				// Promote children to the removed tab's parent
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

		await deleteItems("tab", [makeTabId(tabId)]);

		// Update indices of remaining tabs
		if (!removeInfo.isWindowClosing) {
			await updateTabIndicesInWindow(removeInfo.windowId, dbOps);
		}
	};

	browser.tabs.onRemoved.addListener(
		queuedHandler("tabs.onRemoved", handleTabRemoved),
	);

	// Handler for tab moves
	const handleTabMoved = async (
		tabId: number,
		moveInfo: Browser.tabs.OnMovedInfo,
	) => {
		log("[Background] Tab moved:", tabId, moveInfo);

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
			const otherTabRecords: TabRecord[] = [];
			for (const bt of allBrowserTabs.filter(hasTabIds)) {
				if (bt.id === tabId) continue;
				const existing = existingMap.get(bt.id);
				// Check if this tab also has a UI intent (for batch moves)
				const otherIntent = uiMoveIntents.get(bt.id);
				otherTabRecords.push(
					tabToRecord(bt, {
						parentTabId:
							otherIntent?.parentTabId ?? existing?.parentTabId ?? null,
						treeOrder: otherIntent?.treeOrder ?? existing?.treeOrder ?? "a0",
					}),
				);
			}
			if (otherTabRecords.length > 0) {
				await putItems("tab", otherTabRecords);
			}
			return;
		}

		// Get existing tabs to calculate new tree position
		const existingTabs = await getAll<Tab>("tab");
		const windowTabs = existingTabs.filter(
			(t) => t.browserWindowId === moveInfo.windowId,
		);
		const existingTab = existingTabs.find((t) => t.browserTabId === tabId);

		// Check if the move was initiated by our extension UI
		// by seeing if the tab's current tree position already puts it at the right browser index
		let shouldRecalculateTree = true;

		if (existingTab) {
			// Build tree with current DB state and see where this tab would be
			const sortedByTree = [...windowTabs].sort((a, b) => {
				// Sort by tree structure (depth-first)
				const aOrder = `${a.parentTabId ?? ""}-${a.treeOrder}`;
				const bOrder = `${b.parentTabId ?? ""}-${b.treeOrder}`;
				return aOrder.localeCompare(bOrder);
			});

			// Simple check: build expected order from tree
			// If the expected position matches toIndex, the UI already set the correct tree position
			const buildFlatOrder = (tabs: Tab[]): Tab[] => {
				const result: Tab[] = [];
				const childrenMap = new Map<number | null, Tab[]>();

				for (const tab of tabs) {
					const parentId = tab.parentTabId;
					if (!childrenMap.has(parentId)) {
						childrenMap.set(parentId, []);
					}
					childrenMap.get(parentId)!.push(tab);
				}

				// Sort children by treeOrder (using ASCII order, not locale)
				for (const children of childrenMap.values()) {
					children.sort((a, b) =>
						a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
					);
				}

				const traverse = (parentId: number | null) => {
					const children = childrenMap.get(parentId) || [];
					for (const child of children) {
						result.push(child);
						traverse(child.browserTabId);
					}
				};

				traverse(null);
				return result;
			};

			const expectedOrder = buildFlatOrder(windowTabs);
			const expectedIndex = expectedOrder.findIndex(
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

		if (shouldRecalculateTree) {
			// This is a browser-native move (drag from tab bar) - calculate tree position
			const result = calculateTreePositionFromBrowserMove(
				windowTabs,
				tabId,
				moveInfo.toIndex,
			);
			newParentId = result.parentTabId;
			newTreeOrder = result.treeOrder;
			log("[Background] Calculated new tree position:", {
				newParentId,
				newTreeOrder,
			});
		} else {
			// Preserve the existing tree position (set by extension UI)
			newParentId = existingTab?.parentTabId ?? null;
			newTreeOrder = existingTab?.treeOrder ?? "a0";
			log("[Background] Preserving existing tree position:", {
				newParentId,
				newTreeOrder,
			});
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

		// Also update indices of other affected tabs (preserve their tree structure)
		const existingMap = new Map<number, Tab>();
		for (const tab of existingTabs) {
			existingMap.set(tab.browserTabId, tab);
		}

		const allBrowserTabs = await browser.tabs.query({
			windowId: moveInfo.windowId,
		});
		const otherTabRecords: TabRecord[] = [];
		for (const bt of allBrowserTabs.filter(hasTabIds)) {
			if (bt.id === tabId) continue; // Skip the moved tab, already updated
			const existing = existingMap.get(bt.id);
			otherTabRecords.push(
				tabToRecord(bt, {
					parentTabId: existing?.parentTabId ?? null,
					treeOrder: existing?.treeOrder ?? "a0",
				}),
			);
		}

		if (otherTabRecords.length > 0) {
			await putItems("tab", otherTabRecords);
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
		const tabRecords = tabs.filter(hasTabIds).map((tab) => {
			const existing = existingMap.get(tab.id);
			return tabToRecord(tab, {
				parentTabId: existing?.parentTabId ?? null,
				treeOrder: existing?.treeOrder ?? "a0",
			});
		});

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

		// Get the detached tab's record to handle its children
		const existingTabs = await getAll<Tab>("tab");
		const detachedTab = existingTabs.find((t) => t.browserTabId === tabId);

		if (detachedTab) {
			// Promote children of the detached tab to its parent (within the old window)
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

		// Get existing tabs
		const existingTabs = await getAll<Tab>("tab");
		const existingTab = existingTabs.find((t) => t.browserTabId === tabId);

		// Check if the tab was already moved by our extension UI
		// (the UI updates the DB first, then calls browser.tabs.move)
		// If the tab's windowId in the DB already matches the new window,
		// it means our UI already set up the tree structure correctly
		if (existingTab && existingTab.browserWindowId === attachInfo.newWindowId) {
			log(
				"[Background] Tab already updated by extension UI, preserving tree structure",
			);
			// Just update the tabIndex, preserve tree structure
			const tabRecord = tabToRecord(browserTab, {
				parentTabId: existingTab.parentTabId,
				treeOrder: existingTab.treeOrder,
			});
			await putItems("tab", [tabRecord]);
		} else {
			// This is a browser-native cross-window move (drag from tab bar)
			// Calculate tree position based on where the tab was attached
			const newWindowTabs = existingTabs.filter(
				(t) => t.browserWindowId === attachInfo.newWindowId,
			);

			let treeOrder = "a0";
			const rootTabs = newWindowTabs
				.filter((t) => t.parentTabId === null)
				.sort((a, b) =>
					a.treeOrder < b.treeOrder ? -1 : a.treeOrder > b.treeOrder ? 1 : 0,
				);

			// Find the appropriate position based on attachInfo.newPosition
			if (attachInfo.newPosition === 0) {
				// Inserted at the beginning
				const firstRoot = rootTabs[0];
				treeOrder = generateTreeOrder(undefined, firstRoot?.treeOrder);
			} else if (attachInfo.newPosition >= rootTabs.length) {
				// Inserted at the end
				const lastRoot = rootTabs[rootTabs.length - 1];
				treeOrder = generateTreeOrder(lastRoot?.treeOrder, undefined);
			} else {
				// Inserted in the middle - use the position
				const prevRoot = rootTabs[attachInfo.newPosition - 1];
				const nextRoot = rootTabs[attachInfo.newPosition];
				treeOrder = generateTreeOrder(prevRoot?.treeOrder, nextRoot?.treeOrder);
			}

			// Create the tab record with reset tree structure (root level in new window)
			const tabRecord = tabToRecord(browserTab, {
				parentTabId: null, // Root level when moving via browser native UI
				treeOrder,
			});
			await putItems("tab", [tabRecord]);
		}

		// Update indices of other tabs in the new window
		const existingMap = new Map<number, Tab>();
		for (const tab of existingTabs) {
			existingMap.set(tab.browserTabId, tab);
		}

		const allBrowserTabs = await browser.tabs.query({
			windowId: attachInfo.newWindowId,
		});
		const otherTabRecords: TabRecord[] = [];
		for (const bt of allBrowserTabs.filter(hasTabIds)) {
			if (bt.id === tabId) continue; // Skip the attached tab, already updated
			const existing = existingMap.get(bt.id);
			otherTabRecords.push(
				tabToRecord(bt, {
					parentTabId: existing?.parentTabId ?? null,
					treeOrder: existing?.treeOrder ?? "a0",
				}),
			);
		}

		if (otherTabRecords.length > 0) {
			await putItems("tab", otherTabRecords);
		}
	};

	browser.tabs.onAttached.addListener(
		queuedHandler("tabs.onAttached", handleTabAttached),
	);
};
