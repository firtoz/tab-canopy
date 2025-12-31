import type { InferCollectionFromTable } from "@firtoz/drizzle-utils";
import { generateKeyBetween } from "fractional-indexing";
import { create } from "zustand";
import type * as schema from "@/schema/src/schema";

type TabCollection = InferCollectionFromTable<typeof schema.tabTable>;
type WindowCollection = InferCollectionFromTable<typeof schema.windowTable>;

// Helper to find item by predicate from collection
function findInCollection<T extends object>(
	collection: { values(): IterableIterator<T> },
	predicate: (item: T) => boolean,
): T | undefined {
	for (const item of collection.values()) {
		if (predicate(item)) return item;
	}
	return undefined;
}

// Helper to get all items from collection as array
function getAllFromCollection<T extends object>(collection: {
	values(): IterableIterator<T>;
}): T[] {
	return Array.from(collection.values());
}

interface TabActionsStore {
	// Collections (set by the component that has access to them)
	tabCollection: TabCollection | null;
	windowCollection: WindowCollection | null;
	setCollections: (
		tabCollection: TabCollection,
		windowCollection: WindowCollection,
	) => void;

	// Tab actions
	toggleCollapse: (tabId: number) => Promise<void>;
	closeTab: (tabId: number) => Promise<void>;
	renameTab: (tabId: number, newTitle: string | null) => Promise<void>;
	newTabAsChild: (parentTabId: number) => Promise<void>;

	// Window actions
	closeWindow: (windowId: number) => Promise<void>;
	renameWindow: (windowId: number, newTitle: string | null) => Promise<void>;
	newTabInWindow: (windowId: number) => Promise<void>;
	newWindow: () => Promise<void>;
}

export const useTabActions = create<TabActionsStore>((set, get) => ({
	// Collections
	tabCollection: null,
	windowCollection: null,
	setCollections: (tabCollection, windowCollection) =>
		set({ tabCollection, windowCollection }),

	// Tab actions
	toggleCollapse: async (tabId: number) => {
		const { tabCollection } = get();
		if (!tabCollection) return;

		const tab = findInCollection(
			tabCollection,
			(t) => t.browserTabId === tabId,
		);
		if (!tab) return;

		tabCollection.update(tab.id, (draft) => {
			draft.isCollapsed = !draft.isCollapsed;
		});
	},

	closeTab: async (tabId: number) => {
		const { tabCollection } = get();
		if (!tabCollection) return;

		const tabs = getAllFromCollection(tabCollection);
		const tab = tabs.find((t) => t.browserTabId === tabId);
		if (!tab) return;

		// Find all descendants
		const descendants: schema.Tab[] = [];
		const findDescendants = (parentId: number) => {
			const children = tabs.filter((t) => t.parentTabId === parentId);
			for (const child of children) {
				descendants.push(child);
				findDescendants(child.browserTabId);
			}
		};
		findDescendants(tabId);

		// Close all tabs (descendants first, then parent)
		const tabsToClose = [...descendants, tab];
		const browserTabIds = tabsToClose.map((t) => t.browserTabId);

		// Close in browser
		await browser.tabs.remove(browserTabIds);
	},

	renameTab: async (tabId: number, newTitle: string | null) => {
		const { tabCollection } = get();
		if (!tabCollection) return;

		const tab = findInCollection(
			tabCollection,
			(t) => t.browserTabId === tabId,
		);
		if (!tab) return;

		tabCollection.update(tab.id, (draft) => {
			draft.titleOverride = newTitle;
		});
	},

	newTabAsChild: async (parentTabId: number) => {
		const { tabCollection } = get();
		if (!tabCollection) return;

		const tabs = getAllFromCollection(tabCollection);
		const parentTab = tabs.find((t) => t.browserTabId === parentTabId);
		if (!parentTab) return;

		// Calculate the insertion index: right after the parent's last descendant
		// If parent has no descendants, insert right after the parent
		const insertIndex = parentTab.tabIndex + 1;

		console.log("new tab as child", {
			windowId: parentTab.browserWindowId,
			openerTabId: parentTabId,
			index: insertIndex,
		});

		// Create the new tab with openerTabId set to the parent and correct position
		const newTab = await browser.tabs.create({
			windowId: parentTab.browserWindowId,
			openerTabId: parentTabId,
			index: insertIndex,
			active: true,
		});

		// After a short delay, directly update the tab to ensure parent-child relationship
		// This acts as a safeguard in case the background handler didn't catch it
		if (newTab.id) {
			const newTabBrowserId = newTab.id;

			let newTabRecord = findInCollection(
				tabCollection,
				(t) => t.browserTabId === newTabBrowserId,
			);

			let attempts = 0;
			const maxAttempts = 20;

			while (!newTabRecord) {
				await new Promise((resolve) => setTimeout(resolve, 10));
				newTabRecord = findInCollection(
					tabCollection,
					(t) => t.browserTabId === newTabBrowserId,
				);
				attempts++;
				if (attempts >= maxAttempts) {
					console.log(
						"new tab not found in collection after max attempts",
						newTabBrowserId,
					);
					return;
				}
			}

			if (!newTabRecord) {
				console.log("new tab not found in collection yet", newTabBrowserId);
				return;
			}

			// Get current children of parent to calculate treeOrder
			const currentTabs = getAllFromCollection(tabCollection);
			const siblings = currentTabs
				.filter(
					(t) =>
						t.parentTabId === parentTabId && t.browserTabId !== newTabBrowserId,
				)
				.sort((a, b) => (a.treeOrder < b.treeOrder ? -1 : 1));
			const lastSibling = siblings[siblings.length - 1];
			const treeOrder = generateKeyBetween(
				lastSibling?.treeOrder ?? null,
				null,
			);

			console.log("directly updating new child tab", {
				tabId: newTabBrowserId,
				parentTabId,
				treeOrder,
			});

			// Directly update the tab record
			tabCollection.update(newTabRecord.id, (draft) => {
				draft.parentTabId = parentTabId;
				draft.treeOrder = treeOrder;
			});
		}
	},

	// Window actions
	closeWindow: async (windowId: number) => {
		// Close the window (all tabs will be closed automatically)
		await browser.windows.remove(windowId);
	},

	renameWindow: async (windowId: number, newTitle: string | null) => {
		const { windowCollection } = get();
		if (!windowCollection) return;

		const win = findInCollection(
			windowCollection,
			(w) => w.browserWindowId === windowId,
		);
		if (!win) return;

		windowCollection.update(win.id, (draft) => {
			draft.titleOverride = newTitle;
		});
	},

	newTabInWindow: async (windowId: number) => {
		// Create the new tab - it will be synced by background script
		await browser.tabs.create({
			windowId,
			active: true,
		});
	},

	newWindow: async () => {
		// Create a new window
		await browser.windows.create({
			focused: true,
		});
	},
}));
