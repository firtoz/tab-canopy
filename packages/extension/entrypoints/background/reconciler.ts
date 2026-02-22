import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import {
	DEFAULT_TREE_ORDER,
	treeOrderSort,
} from "@/entrypoints/sidepanel/lib/tree";
import type { Tab } from "@/schema/src/schema";
import { log, makeTabId } from "./constants";
import type { DbOperations } from "./db-operations";
import { type TabRecord, tabToRecord } from "./mappers";
import {
	consumePendingChildIntent,
	consumeUiMoveIntent,
	getUiMoveIntent,
	registerUiMoveIntent,
	trackTabCreatedEvent,
} from "./tab-handlers";
import type {
	TabActivatedEvent,
	TabAttachedEvent,
	TabCreatedEvent,
	TabDetachedEvent,
	TabMovedEvent,
	TabRemovedEvent,
	TabSyncEvent,
	TabUpdatedEvent,
} from "./tab-sync-events";
import {
	getAllDescendants,
	inferTreeFromBrowserCreate,
	inferTreeFromBrowserMove,
	promoteOnRemove,
} from "./tree-sync";
import { hasTabIds } from "./type-guards";

export interface ReconcilerOptions {
	getManagedMoveTabIds?: () => Set<number>;
}

/**
 * Build tab list for a window in **current browser order** (from browser.tabs.query),
 * with tree fields (parentTabId, treeOrder) merged from existing DB tabs.
 * Used by TabMoved to fix the "wrong order" bug.
 */
async function getTabsInWindowBrowserOrder(
	windowId: number,
	existingTabs: Tab[],
): Promise<Tab[]> {
	const browserTabs = await browser.tabs.query({ windowId });
	const existingMap = new Map<number, Tab>();
	for (const t of existingTabs) {
		existingMap.set(t.browserTabId, t);
	}
	// Ensure strict browser order by tab index (Chrome may not guarantee order)
	const inOrder = browserTabs
		.filter(hasTabIds)
		.sort((a, b) => a.index - b.index);
	return inOrder.map((bt) => {
		const existing = existingMap.get(bt.id);
		return {
			...existing,
			browserTabId: bt.id,
			browserWindowId: windowId,
			tabIndex: bt.index,
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
		} as Tab;
	});
}
/**
 * Update tab indices for a window (single batch write). Preserves tree from DB.
 */
async function writeWindowTabIndices(
	windowId: number,
	dbOps: DbOperations,
): Promise<void> {
	const { putItems, getAll } = dbOps;
	const existingTabs = await getAll<Tab>("tab");
	const existingMap = new Map<number, Tab>();
	for (const tab of existingTabs) {
		existingMap.set(tab.browserTabId, tab);
	}
	const tabs = await browser.tabs.query({ windowId });
	const filteredTabs = tabs.filter(hasTabIds);
	const missingIds = filteredTabs
		.filter((bt) => !existingMap.has(bt.id))
		.map((bt) => bt.id);
	if (missingIds.length > 0) {
		const recheck = await getAll<Tab>("tab");
		for (const t of recheck) {
			if (missingIds.includes(t.browserTabId))
				existingMap.set(t.browserTabId, t);
		}
	}
	const tabRecords = filteredTabs.map((tab) => {
		const existing = existingMap.get(tab.id);
		const record = tabToRecord(tab, {
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
		});
		if (existing) {
			record.active = existing.active;
		}
		return record;
	});
	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
}

async function applyTabMoved(
	dbOps: DbOperations,
	event: TabMovedEvent,
): Promise<void> {
	const { putItems, getAll } = dbOps;
	const { tabId, moveInfo } = event;

	const uiIntent = consumeUiMoveIntent(tabId);
	// Chrome only fires onMoved for the tab that was moved. Skip if indices match (no-op move)
	// unless we have a UI intent (e.g. drag c onto b without changing browser index) — then we must apply it.
	if (moveInfo.fromIndex === moveInfo.toIndex && !uiIntent) {
		return;
	}

	if (uiIntent) {
		log(
			"[Background] Reconciler TabMoved: using UI move intent for tab:",
			tabId,
		);
		const existingTabs = await getAll<Tab>("tab");
		const existingMap = new Map<number, Tab>();
		for (const tab of existingTabs) {
			existingMap.set(tab.browserTabId, tab);
		}
		const browserTab = await browser.tabs.get(tabId);
		if (browserTab && hasTabIds(browserTab)) {
			const record = tabToRecord(browserTab, {
				parentTabId: uiIntent.parentTabId,
				treeOrder: uiIntent.treeOrder,
			});
			const existingMovedTab = existingMap.get(tabId);
			if (existingMovedTab) {
				record.active = existingMovedTab.active;
			}
			await putItems("tab", [record]);
		}
		const allBrowserTabs = await browser.tabs.query({
			windowId: moveInfo.windowId,
		});
		const otherTabRecords: TabRecord[] = [];
		for (const bt of allBrowserTabs.filter(hasTabIds)) {
			if (bt.id === tabId) continue;
			const existing = existingMap.get(bt.id);
			const otherIntent = getUiMoveIntent(bt.id);
			const record = tabToRecord(bt, {
				parentTabId: otherIntent?.parentTabId ?? existing?.parentTabId ?? null,
				treeOrder:
					otherIntent?.treeOrder ?? existing?.treeOrder ?? DEFAULT_TREE_ORDER,
			});
			if (existing) {
				record.active = existing.active;
			}
			otherTabRecords.push(record);
		}
		const tabsWithoutData = allBrowserTabs.filter(
			(bt) =>
				hasTabIds(bt) &&
				bt.id !== tabId &&
				!existingMap.has(bt.id) &&
				!getUiMoveIntent(bt.id),
		);
		if (tabsWithoutData.length > 0) {
			const keys = generateNKeysBetween(null, null, tabsWithoutData.length);
			for (let i = 0; i < tabsWithoutData.length; i++) {
				const bt = tabsWithoutData[i];
				if (!hasTabIds(bt)) continue;
				otherTabRecords.push(
					tabToRecord(bt, { parentTabId: null, treeOrder: keys[i] }),
				);
			}
		}
		if (otherTabRecords.length > 0) {
			await putItems("tab", otherTabRecords);
		}
		return;
	}

	// No UI intent: infer tree from browser move using **browser order**
	// Use fresh read so prior drag (e.g. c made child of b) is visible
	const existingTabs = await getAll<Tab>("tab");
	const tabsInTargetWindow = await getTabsInWindowBrowserOrder(
		moveInfo.windowId,
		existingTabs,
	);
	// Re-read so tree is current (e.g. after drag that made c child of b)
	const freshTabs = await getAll<Tab>("tab");
	const existingMap = new Map<number, Tab>();
	for (const tab of freshTabs) {
		existingMap.set(tab.browserTabId, tab);
	}
	// Rebuild window list with fresh tree so "tab after moved" has correct parent
	const tabsInTargetWindowFresh = tabsInTargetWindow.map((t) => {
		const fresh = existingMap.get(t.browserTabId);
		return fresh
			? { ...t, parentTabId: fresh.parentTabId, treeOrder: fresh.treeOrder }
			: t;
	});

	// Build definitive post-move order from moveInfo so we don't rely on the query
	// returning updated indices (Chrome may not have updated .index yet when onMoved fires).
	let movedTab = tabsInTargetWindowFresh.find((t) => t.browserTabId === tabId);
	if (!movedTab) {
		// Moved tab missing from window list (e.g. timing); ensure we have it so inference and records stay complete
		const bt = await browser.tabs.get(tabId).catch(() => null);
		if (bt && hasTabIds(bt)) {
			const fromExisting = existingMap.get(tabId);
			movedTab = {
				browserTabId: bt.id,
				browserWindowId: bt.windowId,
				tabIndex: bt.index,
				parentTabId: fromExisting?.parentTabId ?? null,
				treeOrder: fromExisting?.treeOrder ?? DEFAULT_TREE_ORDER,
			} as Tab;
		}
	}
	const others = tabsInTargetWindowFresh.filter(
		(t) => t.browserTabId !== tabId,
	);
	const toIndexClamped = Math.min(moveInfo.toIndex, others.length);
	const postMoveOrder: Tab[] = [
		...others.slice(0, toIndexClamped),
		...(movedTab ? [movedTab] : []),
		...others.slice(toIndexClamped),
	];

	// Infer tree from definitive post-move order so "parent moved after child" flattens correctly
	let result = inferTreeFromBrowserMove(postMoveOrder, tabId, toIndexClamped);

	// Fallback: flatten any descendant of the moved tab that appears before it in post-move order.
	// Include (1) descendants from DB and (2) tabs with pending UI move intent parentTabId === tabId,
	// so we flatten even when onMoved(child) hasn't been processed yet (e.g. parent moved first).
	const windowIdForFilter =
		postMoveOrder[0]?.browserWindowId ?? moveInfo.windowId;
	const tabsInWindow = freshTabs.filter(
		(t) => t.browserWindowId === windowIdForFilter,
	);
	const descendantIds = getAllDescendants(tabsInWindow, tabId);
	const intentChildEntries = postMoveOrder
		.map((t, index) => ({ id: t.browserTabId, index }))
		.filter(
			({ id, index }) =>
				index < toIndexClamped && getUiMoveIntent(id)?.parentTabId === tabId,
		);
	// If inference wrongly set moved tab's parent to itself (e.g. next tab was a descendant), treat as root
	let movedTabNewParent = result.updates.get(tabId)?.parentTabId ?? null;
	if (movedTabNewParent === tabId) movedTabNewParent = null;
	const movedTreeOrder = result.updates.get(tabId)?.treeOrder ?? null;
	const toFlattenByIndex = [
		...[...descendantIds]
			.map((id) => ({
				id,
				index: postMoveOrder.findIndex((t) => t.browserTabId === id),
			}))
			.filter(({ index }) => index >= 0 && index < toIndexClamped),
		...intentChildEntries,
	]
		.filter(({ id }, i, arr) => arr.findIndex((e) => e.id === id) === i)
		.sort((a, b) => a.index - b.index);
	if (toFlattenByIndex.length > 0) {
		const prevSibling = postMoveOrder[toIndexClamped - 1];
		let lastTreeOrder: string | null =
			prevSibling?.browserTabId === tabId
				? movedTreeOrder
				: prevSibling
					? (existingMap.get(prevSibling.browserTabId)?.treeOrder ??
						result.updates.get(prevSibling.browserTabId)?.treeOrder ??
						null)
					: null;
		const newUpdates = new Map(result.updates);
		const newChildrenToFlatten = [...result.childrenToFlatten];
		for (const { id } of toFlattenByIndex) {
			// Consume intent so a later onMoved(child) doesn't overwrite with stale parent
			consumeUiMoveIntent(id);
			// generateKeyBetween requires first < second; keep flattened child before moved tab
			const low =
				lastTreeOrder != null &&
				movedTreeOrder != null &&
				lastTreeOrder >= movedTreeOrder
					? null
					: (lastTreeOrder ?? null);
			const high =
				lastTreeOrder != null &&
				movedTreeOrder != null &&
				lastTreeOrder >= movedTreeOrder
					? movedTreeOrder
					: (movedTreeOrder ?? null);
			const childTreeOrder = generateKeyBetween(low, high);
			newUpdates.set(id, {
				parentTabId: movedTabNewParent,
				treeOrder: childTreeOrder,
			});
			if (!newChildrenToFlatten.includes(id)) {
				newChildrenToFlatten.push(id);
			}
			lastTreeOrder = childTreeOrder;
		}
		result = { updates: newUpdates, childrenToFlatten: newChildrenToFlatten };
	}

	// Fallback: if moved tab was missing from input (e.g. timing), infer parent from tab after moved in post-move order
	if (!result.updates.has(tabId) && toIndexClamped >= 0) {
		const nextTab = postMoveOrder[toIndexClamped + 1] ?? null;
		const newParentId = nextTab?.parentTabId ?? null;
		const movedTab = existingMap.get(tabId);
		const treeOrder = movedTab?.treeOrder ?? DEFAULT_TREE_ORDER;
		result = {
			updates: new Map([
				...result.updates,
				[tabId, { parentTabId: newParentId, treeOrder }],
			]),
			childrenToFlatten: result.childrenToFlatten,
		};
	}

	const allBrowserTabs = await browser.tabs.query({
		windowId: moveInfo.windowId,
	});
	const records: TabRecord[] = [];
	for (const bt of allBrowserTabs.filter(hasTabIds)) {
		const treeUpdate = result.updates.get(bt.id);
		const existing = existingMap.get(bt.id);
		const isMovedTab = bt.id === tabId;

		// Always include every tab in the window so we never drop tabs from the tree
		// (e.g. move parent back after child had flattened — use root defaults when no existing/update).
		// Previously we skipped when !isMovedTab && !treeUpdate && !existing, which could omit tabs.

		// For the moved tab use inferred tree; when inference gave null, use next tab's
		// existing parent from DB so we don't flatten when the list was stale (e.g. C not yet written as child of B).
		let parentTabId: number | null;
		if (isMovedTab) {
			const inferred = treeUpdate?.parentTabId ?? null;
			if (inferred === null && toIndexClamped >= 0) {
				const nextInList = postMoveOrder[toIndexClamped + 1];
				parentTabId = nextInList
					? (existingMap.get(nextInList.browserTabId)?.parentTabId ?? null)
					: null;
			} else {
				parentTabId = inferred;
			}
		} else {
			parentTabId = treeUpdate?.parentTabId ?? existing?.parentTabId ?? null;
			// Flattened tabs must be root; ensure we never write a stale parent (e.g. race where inference didn't see child)
			if (result.childrenToFlatten.includes(bt.id)) {
				parentTabId = null;
			}
		}
		const treeOrder =
			treeUpdate?.treeOrder ?? existing?.treeOrder ?? DEFAULT_TREE_ORDER;
		const record = tabToRecord(bt, { parentTabId, treeOrder });
		if (existing) {
			record.active = existing.active;
			record.titleOverride = existing.titleOverride ?? null;
			record.isCollapsed = existing.isCollapsed;
		}
		records.push(record);
	}
	if (records.length > 0) {
		await putItems("tab", records);
	}
}

async function applyTabRemoved(
	dbOps: DbOperations,
	event: TabRemovedEvent,
): Promise<void> {
	const { putItems, deleteItems, getAll } = dbOps;
	const { tabId, removeInfo } = event;

	const existingTabs = await getAll<Tab>("tab");
	const removedTab = existingTabs.find((t) => t.browserTabId === tabId);

	if (removedTab) {
		const children = existingTabs.filter((t) => t.parentTabId === tabId);
		if (children.length > 0 && removedTab.isCollapsed) {
			const descendantIds = new Set<number>();
			const queue = [...children];
			while (queue.length > 0) {
				const child = queue.shift();
				if (!child) continue;
				descendantIds.add(child.browserTabId);
				const grandchildren = existingTabs.filter(
					(t) => t.parentTabId === child.browserTabId,
				);
				queue.push(...grandchildren);
			}
			for (const descendantId of descendantIds) {
				try {
					await browser.tabs.remove(descendantId);
				} catch (err) {
					log(
						"[Background] Reconciler TabRemoved: failed to close descendant:",
						descendantId,
						err,
					);
				}
			}
		}
	}

	// Promote direct children (non-collapsed): compute updates from current state
	const promotedUpdates =
		removedTab && !removedTab.isCollapsed
			? promoteOnRemove(existingTabs, tabId)
			: new Map<number, { parentTabId: number | null; treeOrder: string }>();

	await deleteItems("tab", [makeTabId(tabId)]);

	if (!removeInfo.isWindowClosing) {
		// Single batch: all remaining tabs in window; promoted children get new parent from promotedUpdates
		const currentTabs = await getAll<Tab>("tab");
		const browserTabs = await browser.tabs.query({
			windowId: removeInfo.windowId,
		});
		const existingMap = new Map<number, Tab>();
		for (const t of currentTabs) {
			existingMap.set(t.browserTabId, t);
		}
		const records: TabRecord[] = [];
		for (const bt of browserTabs.filter(hasTabIds)) {
			const treeUpdate = promotedUpdates.get(bt.id);
			const existing = existingMap.get(bt.id);
			// Prefer promoted update; never keep parentTabId pointing at the removed tab
			const parentTabId =
				treeUpdate?.parentTabId ??
				(existing?.parentTabId === tabId
					? null
					: (existing?.parentTabId ?? null));
			const treeOrder =
				treeUpdate?.treeOrder ?? existing?.treeOrder ?? DEFAULT_TREE_ORDER;
			const record = tabToRecord(bt, { parentTabId, treeOrder });
			if (existing) {
				record.active = existing.active;
				record.titleOverride = existing.titleOverride ?? null;
				record.isCollapsed = existing.isCollapsed;
			}
			records.push(record);
		}
		if (records.length > 0) {
			log(
				"[Background] TabRemoved putItems: removedTabId=",
				tabId,
				"promotedUpdates.size=",
				promotedUpdates.size,
				"promotedIds=",
				[...promotedUpdates.keys()].join(","),
				"parentTabIds=",
				records.map((r) => `${r.browserTabId}:${r.parentTabId}`).join(", "),
			);
			await putItems("tab", records);
		}
	}
}

async function applyTabCreated(
	dbOps: DbOperations,
	event: TabCreatedEvent,
): Promise<void> {
	const { putItems, getAll } = dbOps;
	const { tab } = event;
	if (!hasTabIds(tab)) return;

	const pendingIntent = consumePendingChildIntent(tab.windowId, tab.index);
	if (pendingIntent) {
		log("[Background] Reconciler TabCreated: using pending child intent");
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
		const newTabRecord = tabToRecord(tab, {
			parentTabId: pendingIntent.parentTabId,
			treeOrder: pendingIntent.treeOrder,
		});
		const existingTabs = await getAll<Tab>("tab");
		const existingMap = new Map<number, Tab>();
		for (const t of existingTabs) {
			existingMap.set(t.browserTabId, t);
		}
		const browserTabs = await browser.tabs.query({ windowId: tab.windowId });
		const otherRecords: TabRecord[] = [];
		for (const t of browserTabs.filter(hasTabIds)) {
			if (t.id === tab.id) continue;
			const existing = existingMap.get(t.id);
			const record = tabToRecord(t, {
				parentTabId: existing?.parentTabId ?? null,
				treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
			});
			if (existing) {
				record.active = existing.active;
			}
			otherRecords.push(record);
		}
		await putItems("tab", [newTabRecord, ...otherRecords]);
		return;
	}

	const existingTabs = await getAll<Tab>("tab");
	const windowTabs = existingTabs.filter(
		(t) => t.browserWindowId === tab.windowId,
	);
	const browserTabs = await browser.tabs.query({ windowId: tab.windowId });
	const browserTabsWithIds = browserTabs
		.filter(hasTabIds)
		.map((t) => ({ id: t.id, index: t.index }));

	const openerTabId = (tab as { openerTabId?: number }).openerTabId;
	let parentTabId: number | null;
	let treeOrder: string;
	let reason = "";
	let needsRepositioning = false;

	if (openerTabId !== undefined) {
		const openerTab = windowTabs.find((t) => t.browserTabId === openerTabId);
		if (openerTab) {
			parentTabId = openerTabId;
			const openerChildren = windowTabs.filter(
				(t) => t.parentTabId === openerTabId,
			);
			const currentIndexMap = new Map<number, number>();
			for (const bt of browserTabsWithIds) {
				currentIndexMap.set(bt.id, bt.index);
			}
			const openerCurrentIndex =
				currentIndexMap.get(openerTab.browserTabId) ?? openerTab.tabIndex;
			const isRightAfterOpener = tab.index === openerCurrentIndex + 1;

			if (isRightAfterOpener) {
				if (openerChildren.length === 0) {
					treeOrder = generateKeyBetween(null, null);
					reason = `Opener-based: first child of opener tab ${openerTabId}`;
				} else {
					const childrenByTreeOrder = [...openerChildren].sort((a, b) =>
						a.treeOrder < b.treeOrder ? -1 : 1,
					);
					const firstChild = childrenByTreeOrder[0];
					treeOrder = generateKeyBetween(null, firstChild.treeOrder);
					reason = `Opener-based: first child of opener tab ${openerTabId}`;
				}
				needsRepositioning = false;
			} else {
				needsRepositioning = true;
				if (openerChildren.length === 0) {
					treeOrder = generateKeyBetween(null, null);
					reason = `Opener-based: made first child of opener tab ${openerTabId}`;
				} else {
					const childrenByTreeOrder = [...openerChildren].sort((a, b) =>
						a.treeOrder < b.treeOrder ? -1 : 1,
					);
					const lastChild = childrenByTreeOrder[childrenByTreeOrder.length - 1];
					treeOrder = generateKeyBetween(lastChild.treeOrder, null);
					reason = `Opener-based: made child of opener tab ${openerTabId}`;
				}
			}
		} else {
			const positionResult = inferTreeFromBrowserCreate(
				windowTabs,
				tab.index,
				tab.id,
				browserTabsWithIds,
			);
			parentTabId = positionResult.parentTabId;
			treeOrder = positionResult.treeOrder;
			reason = "Position-based: opener not in DB";
		}
	} else {
		const positionResult = inferTreeFromBrowserCreate(
			windowTabs,
			tab.index,
			tab.id,
			browserTabsWithIds,
		);
		parentTabId = positionResult.parentTabId;
		treeOrder = positionResult.treeOrder;
		reason =
			parentTabId !== null
				? `Position-based: inserted within tree of parent ${parentTabId}`
				: "Position-based: inserted at root level";
	}

	trackTabCreatedEvent({
		tabId: tab.id,
		openerTabId,
		tabIndex: tab.index,
		decidedParentId: parentTabId,
		treeOrder,
		reason,
	});
	registerUiMoveIntent(tab.id, parentTabId, treeOrder, true);

	const newTabRecord = tabToRecord(tab, { parentTabId, treeOrder });
	const existingMap = new Map<number, Tab>();
	for (const t of existingTabs) {
		existingMap.set(t.browserTabId, t);
	}
	const otherRecords: TabRecord[] = [];
	for (const t of browserTabs.filter(hasTabIds)) {
		if (t.id === tab.id) continue;
		const existing = existingMap.get(t.id);
		const record = tabToRecord(t, {
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? DEFAULT_TREE_ORDER,
		});
		if (existing) {
			record.active = existing.active;
		}
		otherRecords.push(record);
	}
	await putItems("tab", [newTabRecord, ...otherRecords]);

	if (needsRepositioning && parentTabId !== null) {
		const parent = windowTabs.find((t) => t.browserTabId === parentTabId);
		if (parent) {
			const allChildren = windowTabs
				.filter((t) => t.parentTabId === parentTabId)
				.sort(treeOrderSort);
			let targetIndex = parent.tabIndex + 1;
			if (allChildren.length > 0) {
				const lastChildInBrowser = allChildren.reduce(
					(max, child) => (child.tabIndex > max.tabIndex ? child : max),
					allChildren[0],
				);
				targetIndex = lastChildInBrowser.tabIndex + 1;
			}
			registerUiMoveIntent(tab.id, parentTabId, treeOrder, true);
			await browser.tabs.move(tab.id, { index: targetIndex }).catch((err) => {
				log(
					"[Background] Reconciler TabCreated: failed to reposition tab:",
					tab.id,
					err,
				);
			});
		}
	}
}

async function applyTabUpdated(
	dbOps: DbOperations,
	event: TabUpdatedEvent,
): Promise<void> {
	const { putItems, getAll } = dbOps;
	const { tabId, tab } = event;
	if (!hasTabIds(tab)) return;

	const intent = getUiMoveIntent(tabId);
	const existingTabs = await getAll<Tab>("tab");
	const existing = existingTabs.find((t) => t.browserTabId === tabId);
	let existingResolved =
		existing ??
		(await getAll<Tab>("tab")).find((t) => t.browserTabId === tabId);
	if (existingResolved === undefined) {
		existingResolved = (await getAll<Tab>("tab")).find(
			(t) => t.browserTabId === tabId,
		);
	}
	if (!intent && !existingResolved) return;

	let treeOrder: string;
	let parentTabId: number | null;

	if (intent) {
		treeOrder = intent.treeOrder;
		parentTabId = intent.parentTabId;
	} else if (existingResolved) {
		treeOrder = existingResolved.treeOrder;
		parentTabId = existingResolved.parentTabId;
	} else {
		const windowTabs = existingTabs
			.filter(
				(t) => t.browserWindowId === tab.windowId && t.parentTabId === null,
			)
			.sort(treeOrderSort);
		const lastRoot = windowTabs[windowTabs.length - 1];
		treeOrder = generateKeyBetween(lastRoot?.treeOrder || null, null);
		parentTabId = null;
	}
	if (parentTabId === null && !intent) return;

	const record = tabToRecord(tab, { parentTabId, treeOrder });
	if (existingResolved) {
		record.active = existingResolved.active;
		record.titleOverride = existingResolved.titleOverride ?? null;
		record.isCollapsed = existingResolved.isCollapsed;
	}
	await putItems("tab", [record]);
}

async function applyTabActivated(
	dbOps: DbOperations,
	event: TabActivatedEvent,
): Promise<void> {
	const { putItems, getAll } = dbOps;
	const { activeInfo } = event;

	const existingTabs = await getAll<Tab>("tab");
	const existingMap = new Map<number, Tab>();
	for (const tab of existingTabs) {
		existingMap.set(tab.browserTabId, tab);
	}
	const tabs = await browser.tabs.query({ windowId: activeInfo.windowId });
	const filteredTabs = tabs.filter(hasTabIds);
	const tabsWithoutRecords = filteredTabs.filter(
		(tab) => !existingMap.has(tab.id),
	);
	const keys =
		tabsWithoutRecords.length > 0
			? generateNKeysBetween(null, null, tabsWithoutRecords.length)
			: [];

	const tabRecords: TabRecord[] = [];
	let keyIndex = 0;
	for (const tab of filteredTabs) {
		if (!hasTabIds(tab)) continue;
		const existing = existingMap.get(tab.id);
		const record = tabToRecord(tab, {
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? keys[keyIndex++] ?? DEFAULT_TREE_ORDER,
		});
		record.active = tab.id === activeInfo.tabId;
		tabRecords.push(record);
	}
	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
}

async function applyTabDetached(
	dbOps: DbOperations,
	event: TabDetachedEvent,
	options: ReconcilerOptions,
): Promise<void> {
	const { tabId, detachInfo } = event;
	const managedMoveTabIds =
		options.getManagedMoveTabIds?.() ?? new Set<number>();

	if (managedMoveTabIds.has(tabId)) {
		await writeWindowTabIndices(detachInfo.oldWindowId, dbOps);
		return;
	}

	const { putItems, getAll } = dbOps;
	const existingTabs = await getAll<Tab>("tab");
	const detachedTab = existingTabs.find((t) => t.browserTabId === tabId);

	const promotedMap = new Map<
		number,
		{ parentTabId: number | null; treeOrder: string }
	>();
	if (detachedTab) {
		const children = existingTabs.filter((t) => t.parentTabId === tabId);
		for (const child of children) {
			promotedMap.set(child.browserTabId, {
				parentTabId: detachedTab.parentTabId,
				treeOrder: child.treeOrder,
			});
		}
	}

	const browserTabs = await browser.tabs.query({
		windowId: detachInfo.oldWindowId,
	});
	const existingMap = new Map<number, Tab>();
	for (const t of existingTabs) {
		existingMap.set(t.browserTabId, t);
	}
	const records: TabRecord[] = [];
	for (const bt of browserTabs.filter(hasTabIds)) {
		const promoted = promotedMap.get(bt.id);
		const existing = existingMap.get(bt.id);
		const parentTabId = promoted?.parentTabId ?? existing?.parentTabId ?? null;
		const treeOrder =
			promoted?.treeOrder ?? existing?.treeOrder ?? DEFAULT_TREE_ORDER;
		const record = tabToRecord(bt, { parentTabId, treeOrder });
		if (existing) {
			record.active = existing.active;
		}
		records.push(record);
	}
	if (records.length > 0) {
		await putItems("tab", records);
	}
}

async function applyTabAttached(
	dbOps: DbOperations,
	event: TabAttachedEvent,
	options: ReconcilerOptions,
): Promise<void> {
	const { putItems, getAll } = dbOps;
	const { tabId, attachInfo } = event;

	const browserTab = await browser.tabs.get(tabId).catch(() => null);
	if (!browserTab || !hasTabIds(browserTab)) return;

	const existingTabs = await getAll<Tab>("tab");
	const existingTab = existingTabs.find((t) => t.browserTabId === tabId);

	const uiIntent = consumeUiMoveIntent(tabId);
	if (uiIntent) {
		const tabRecord = tabToRecord(browserTab, {
			parentTabId: uiIntent.parentTabId,
			treeOrder: uiIntent.treeOrder,
		});
		if (existingTab) {
			tabRecord.active = existingTab.active;
		}
		await putItems("tab", [tabRecord]);
		return;
	}

	const managedMoveTabIds =
		options.getManagedMoveTabIds?.() ?? new Set<number>();
	const isUiManagedMove = managedMoveTabIds.has(tabId);
	const isExtensionMove =
		isUiManagedMove ||
		(existingTab && existingTab.browserWindowId === attachInfo.newWindowId);

	if (isExtensionMove && existingTab) {
		const tabRecord = tabToRecord(browserTab, {
			parentTabId: existingTab.parentTabId,
			treeOrder: existingTab.treeOrder,
		});
		tabRecord.active = existingTab.active;
		await putItems("tab", [tabRecord]);
		return;
	}
	if (isUiManagedMove && !existingTab) {
		const tabRecord = tabToRecord(browserTab, {
			parentTabId: null,
			treeOrder: DEFAULT_TREE_ORDER,
		});
		await putItems("tab", [tabRecord]);
		return;
	}

	// Browser-native cross-window move
	const newWindowTabs = existingTabs.filter(
		(t) => t.browserWindowId === attachInfo.newWindowId,
	);
	const allBrowserTabsInWindow = await browser.tabs.query({
		windowId: attachInfo.newWindowId,
	});
	const browserTabsWithIds = allBrowserTabsInWindow
		.filter(hasTabIds)
		.map((t) => ({ id: t.id, index: t.index }));

	const { parentTabId, treeOrder } = inferTreeFromBrowserCreate(
		newWindowTabs,
		attachInfo.newPosition,
		tabId,
		browserTabsWithIds,
	);

	const tabRecord = tabToRecord(browserTab, { parentTabId, treeOrder });
	if (existingTab) {
		tabRecord.active = existingTab.active;
	}
	await putItems("tab", [tabRecord]);

	const existingMap = new Map<number, Tab>();
	for (const tab of existingTabs) {
		existingMap.set(tab.browserTabId, tab);
	}
	const otherTabRecords: TabRecord[] = [];
	for (const bt of allBrowserTabsInWindow.filter(hasTabIds)) {
		if (bt.id === tabId) continue;
		const existing = existingMap.get(bt.id);
		if (!existing) continue;
		const record = tabToRecord(bt, {
			parentTabId: existing.parentTabId,
			treeOrder: existing.treeOrder,
		});
		record.active = existing.active;
		otherTabRecords.push(record);
	}
	const tabsWithoutRecords = allBrowserTabsInWindow.filter(
		(bt) => hasTabIds(bt) && bt.id !== tabId && !existingMap.has(bt.id),
	);
	if (tabsWithoutRecords.length > 0) {
		const keys = generateNKeysBetween(null, null, tabsWithoutRecords.length);
		for (let i = 0; i < tabsWithoutRecords.length; i++) {
			const bt = tabsWithoutRecords[i];
			if (!hasTabIds(bt)) continue;
			otherTabRecords.push(
				tabToRecord(bt, { parentTabId: null, treeOrder: keys[i] }),
			);
		}
	}
	if (otherTabRecords.length > 0) {
		await putItems("tab", otherTabRecords);
	}
}

/**
 * Single reconciliation entry: apply one tab sync event and perform one write (plus optional delete).
 */
export async function reconcile(
	dbOps: DbOperations,
	event: TabSyncEvent,
	options: ReconcilerOptions = {},
): Promise<void> {
	switch (event.type) {
		case "TabMoved":
			await applyTabMoved(dbOps, event);
			break;
		case "TabRemoved":
			await applyTabRemoved(dbOps, event);
			break;
		case "TabCreated":
			await applyTabCreated(dbOps, event);
			break;
		case "TabUpdated":
			await applyTabUpdated(dbOps, event);
			break;
		case "TabActivated":
			await applyTabActivated(dbOps, event);
			break;
		case "TabDetached":
			await applyTabDetached(dbOps, event, options);
			break;
		case "TabAttached":
			await applyTabAttached(dbOps, event, options);
			break;
		default: {
			const _: never = event;
			break;
		}
	}
}
