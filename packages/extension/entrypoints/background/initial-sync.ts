import { generateNKeysBetween } from "fractional-indexing";
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

	const keys = generateNKeysBetween(null, null, browserTabs.length);

	// Insert all tabs as root level (no tree structure)
	const tabRecords = browserTabs.filter(hasTabIds).map((tab, index) =>
		tabToRecord(tab, {
			parentTabId: null,
			treeOrder: keys[index],
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
	// For new tabs, we need to generate unique treeOrder values
	const filteredTabs = browserTabs.filter(hasTabIds);

	// Separate existing and new tabs
	const existingTabs: typeof filteredTabs = [];
	const newTabs: typeof filteredTabs = [];

	for (const tab of filteredTabs) {
		if (existingTabMap.has(tab.id)) {
			existingTabs.push(tab);
		} else {
			newTabs.push(tab);
		}
	}

	// Generate unique treeOrder keys for new tabs
	const newTabKeys = generateNKeysBetween(null, null, newTabs.length);

	// Map existing tabs with preserved tree structure and active state
	const existingTabRecords = existingTabs.map((tab) => {
		const existing = existingTabMap.get(tab.id);
		if (!existing) {
			throw new Error(`Existing tab not found for tab ${tab.id}`);
		}
		const record = tabToRecord(tab, {
			parentTabId: existing.parentTabId,
			treeOrder: existing.treeOrder,
		});
		// Preserve DB active state - only handleTabActivated should change active state
		record.active = existing.active;
		return record;
	});

	// Map new tabs with unique treeOrder values
	const newTabRecords = newTabs.map((tab, index) =>
		tabToRecord(tab, {
			parentTabId: null,
			treeOrder: newTabKeys[index],
		}),
	);

	const tabRecords = [...existingTabRecords, ...newTabRecords];

	if (tabRecords.length > 0) {
		await putItems("tab", tabRecords);
	}
	log(
		`[Background] Synced ${tabRecords.length} tabs (${existingTabs.length} existing, ${newTabs.length} new)`,
	);

	log(
		`[Background] Initial sync complete (removed ${staleWindowIds.length} windows, ${staleTabIds.length} tabs)`,
	);
};
