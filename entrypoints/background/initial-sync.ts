import { log } from "./constants";
import type { DbOperations } from "./db-operations";
import { tabToRecord, windowToRecord } from "./mappers";
import { hasTabIds, hasWindowId } from "./type-guards";

export const performInitialSync = async (dbOps: DbOperations) => {
	const { putItems, deleteItems, getAll } = dbOps;

	log("[Background] Performing initial sync...");

	// Get current browser state
	const browserWindows = await browser.windows.getAll();
	const browserTabs = await browser.tabs.query({});

	// Get current DB state
	const dbWindows = await getAll<{ id: string; browserWindowId: number }>(
		"window",
	);
	const dbTabs = await getAll<{ id: string; browserTabId: number }>("tab");

	// Create sets of current browser IDs for quick lookup
	const currentWindowIds = new Set(
		browserWindows.filter(hasWindowId).map((w) => w.id),
	);
	const currentTabIds = new Set(browserTabs.filter(hasTabIds).map((t) => t.id));

	// Find stale DB entries (windows/tabs that no longer exist in browser)
	const staleWindowIds = dbWindows
		.filter((w) => !currentWindowIds.has(w.browserWindowId))
		.map((w) => w.id);
	const staleTabIds = dbTabs
		.filter((t) => !currentTabIds.has(t.browserTabId))
		.map((t) => t.id);

	// Delete stale entries
	if (staleWindowIds.length > 0) {
		log(`[Background] Removing ${staleWindowIds.length} stale windows`);
		await deleteItems("window", staleWindowIds);
	}
	if (staleTabIds.length > 0) {
		log(`[Background] Removing ${staleTabIds.length} stale tabs`);
		await deleteItems("tab", staleTabIds);
	}

	// Update/add all current windows and tabs
	const windowRecords = browserWindows.filter(hasWindowId).map(windowToRecord);
	if (windowRecords.length > 0) {
		await putItems("window", windowRecords);
	}
	log(`[Background] Synced ${windowRecords.length} windows`);

	const tabRecords = browserTabs.filter(hasTabIds).map(tabToRecord);
	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
	log(`[Background] Synced ${tabRecords.length} tabs`);

	log(
		`[Background] Initial sync complete (removed ${staleWindowIds.length} windows, ${staleTabIds.length} tabs)`,
	);
};
