import type { Tab } from "@/schema/src/schema";
import { log } from "./constants";
import type { DbOperations } from "./db-operations";
import { tabToRecord, windowToRecord } from "./mappers";
import { hasTabIds, hasWindowId } from "./type-guards";

/**
 * Performs a full database reset - clears all data and re-syncs from browser.
 * Does NOT preserve tree structure (all tabs become root level).
 */
export const performFullReset = async (dbOps: DbOperations) => {
	const { putItems, deleteItems, getAll } = dbOps;

	log("[Background] Performing full database reset...");

	// Get current DB state to delete everything
	const dbWindows = await getAll<{ id: string }>("window");
	const dbTabs = await getAll<{ id: string }>("tab");

	// Delete all existing entries
	if (dbWindows.length > 0) {
		log(`[Background] Deleting ${dbWindows.length} windows`);
		await deleteItems(
			"window",
			dbWindows.map((w) => w.id),
		);
	}
	if (dbTabs.length > 0) {
		log(`[Background] Deleting ${dbTabs.length} tabs`);
		await deleteItems(
			"tab",
			dbTabs.map((t) => t.id),
		);
	}

	// Get current browser state
	const browserWindows = await browser.windows.getAll();
	const browserTabs = await browser.tabs.query({});

	// Insert all windows
	const windowRecords = browserWindows.filter(hasWindowId).map(windowToRecord);
	if (windowRecords.length > 0) {
		await putItems("window", windowRecords);
	}
	log(`[Background] Inserted ${windowRecords.length} windows`);

	// Insert all tabs as root level (no tree structure)
	const tabRecords = browserTabs.filter(hasTabIds).map((tab) =>
		tabToRecord(tab, {
			parentTabId: null,
			treeOrder: `a${String(tab.index).padStart(4, "0")}`, // Simple ordering by index
		}),
	);

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
	log(`[Background] Inserted ${tabRecords.length} tabs (all as root level)`);

	log("[Background] Full reset complete");
};

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
	const dbTabs = await getAll<Tab>("tab");

	// Create a map of existing tabs for preserving tree structure
	const existingTabMap = new Map<number, Tab>();
	for (const tab of dbTabs) {
		existingTabMap.set(tab.browserTabId, tab);
	}

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

	// Sync tabs while preserving tree structure for existing tabs
	const tabRecords = browserTabs.filter(hasTabIds).map((tab) => {
		const existing = existingTabMap.get(tab.id);
		// Preserve tree structure if tab exists, otherwise use defaults
		return tabToRecord(tab, {
			parentTabId: existing?.parentTabId ?? null,
			treeOrder: existing?.treeOrder ?? "a0",
		});
	});

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
	log(`[Background] Synced ${tabRecords.length} tabs`);

	log(
		`[Background] Initial sync complete (removed ${staleWindowIds.length} windows, ${staleTabIds.length} tabs)`,
	);
};
