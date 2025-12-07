import { log, makeTabId } from "./constants";
import type { DbOperations } from "./db-operations";
import { tabToRecord } from "./mappers";
import { hasTabIds } from "./type-guards";

// Helper to update tab indices in a window (queries browser for current state)
const updateTabIndicesInWindow = async (
	windowId: number,
	putItems: DbOperations["putItems"],
) => {
	const tabs = await browser.tabs.query({ windowId });
	const tabRecords = tabs.filter(hasTabIds).map(tabToRecord);
	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
};

// Helper to update only tabs in a specific index range (for moves)
const updateTabIndicesInRange = async (
	windowId: number,
	fromIndex: number,
	toIndex: number,
	putItems: DbOperations["putItems"],
) => {
	const minIndex = Math.min(fromIndex, toIndex);
	const maxIndex = Math.max(fromIndex, toIndex);

	const tabs = await browser.tabs.query({ windowId });
	const affectedTabs = tabs
		.filter(hasTabIds)
		.filter((tab) => tab.index >= minIndex && tab.index <= maxIndex);

	const tabRecords = affectedTabs.map(tabToRecord);
	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
};

export const setupTabListeners = (dbOps: DbOperations) => {
	const { putItems, deleteItems } = dbOps;

	browser.tabs.onCreated.addListener(async (tab) => {
		log("[Background] Tab created:", tab.id);
		if (!hasTabIds(tab)) return;
		// Update all tabs in window since a new tab shifts indices of tabs after it
		await updateTabIndicesInWindow(tab.windowId, putItems);
	});

	browser.tabs.onUpdated.addListener(async (tabId, _changeInfo, tab) => {
		log("[Background] Tab updated:", tabId);
		if (!hasTabIds(tab)) return;
		await putItems("tab", [tabToRecord(tab)]);
	});

	browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
		log("[Background] Tab removed:", tabId, removeInfo);
		await deleteItems("tab", [makeTabId(tabId)]);

		// Update indices of tabs that shifted (those after the removed tab)
		// Skip if the whole window is closing
		if (!removeInfo.isWindowClosing) {
			await updateTabIndicesInWindow(removeInfo.windowId, putItems);
		}
	});

	browser.tabs.onMoved.addListener(async (tabId, moveInfo) => {
		log("[Background] Tab moved:", tabId, moveInfo);
		// Only update tabs in the affected range (between fromIndex and toIndex)
		await updateTabIndicesInRange(
			moveInfo.windowId,
			moveInfo.fromIndex,
			moveInfo.toIndex,
			putItems,
		);
	});

	browser.tabs.onActivated.addListener(async (activeInfo) => {
		log("[Background] Tab activated:", activeInfo.tabId);
		// Update all tabs in the window to reflect active state
		const tabs = await browser.tabs.query({ windowId: activeInfo.windowId });
		const tabRecords = tabs.filter(hasTabIds).map(tabToRecord);
		if (tabRecords.length > 0) {
			await putItems("tab", tabRecords);
		}
	});

	browser.tabs.onDetached.addListener(async (tabId, detachInfo) => {
		log("[Background] Tab detached:", tabId, detachInfo);
		// Update tabs in the old window since indices shifted
		await updateTabIndicesInWindow(detachInfo.oldWindowId, putItems);
	});

	browser.tabs.onAttached.addListener(async (tabId, attachInfo) => {
		log("[Background] Tab attached:", tabId, attachInfo);
		// Update tabs in the new window since indices shifted
		await updateTabIndicesInWindow(attachInfo.newWindowId, putItems);
	});
};
