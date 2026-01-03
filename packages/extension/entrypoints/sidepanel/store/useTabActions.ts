import type { InferCollectionFromTable } from "@firtoz/drizzle-utils";
import { generateKeyBetween } from "fractional-indexing";
import { create } from "zustand";
import type * as schema from "@/schema/src/schema";
import type {
	PendingChildTabData,
	UiMoveIntentData,
} from "../lib/db/createIDBTransportAdapter";

type TabCollection = InferCollectionFromTable<typeof schema.tabTable>;
type WindowCollection = InferCollectionFromTable<typeof schema.windowTable>;
type SendMoveIntent = (moves: UiMoveIntentData[]) => Promise<void>;
type SendPendingChildIntent = (data: PendingChildTabData) => void;

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
	sendMoveIntent: SendMoveIntent | null;
	sendPendingChildIntent: SendPendingChildIntent | null;
	setCollections: (
		tabCollection: TabCollection,
		windowCollection: WindowCollection,
		sendMoveIntent: SendMoveIntent,
		sendPendingChildIntent: SendPendingChildIntent,
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
	sendMoveIntent: null,
	sendPendingChildIntent: null,
	setCollections: (
		tabCollection,
		windowCollection,
		sendMoveIntent,
		sendPendingChildIntent,
	) =>
		set({
			tabCollection,
			windowCollection,
			sendMoveIntent,
			sendPendingChildIntent,
		}),

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
		const { tabCollection, sendMoveIntent, sendPendingChildIntent } = get();
		if (!tabCollection) return;

		const tabs = getAllFromCollection(tabCollection);
		const parentTab = tabs.find((t) => t.browserTabId === parentTabId);
		if (!parentTab) return;

		// Get the current browser index for the parent tab
		// (collection's tabIndex might be stale if there were recent tab operations)
		const currentParentBrowserTab = await browser.tabs.get(parentTabId);
		const parentIndex = currentParentBrowserTab?.index ?? parentTab.tabIndex;

		// Calculate the insertion index: right after the parent's last descendant
		// If parent has no descendants, insert right after the parent
		const insertIndex = parentIndex + 1;

		// Pre-calculate treeOrder before creating the tab
		// Since we're inserting at parentIndex + 1 (right after the parent),
		// the new tab should appear FIRST among children in the tree view
		// This respects the native browser position
		const existingSiblings = tabs
			.filter((t) => t.parentTabId === parentTabId)
			.sort((a, b) => (a.treeOrder < b.treeOrder ? -1 : 1));
		const firstSibling = existingSiblings[0];
		const treeOrder = generateKeyBetween(null, firstSibling?.treeOrder ?? null);

		console.log("new tab as child", {
			windowId: parentTab.browserWindowId,
			openerTabId: parentTabId,
			index: insertIndex,
			treeOrder,
		});

		// Register pending child intent BEFORE creating the tab
		// This tells the background what parent to use when it handles onCreated,
		// since Chrome doesn't propagate openerTabId from browser.tabs.create()
		if (sendPendingChildIntent) {
			sendPendingChildIntent({
				windowId: parentTab.browserWindowId,
				expectedIndex: insertIndex,
				parentTabId,
				treeOrder,
			});
			// Delay to ensure the message is delivered and processed by the background
			// before we create the tab. This is necessary because port.postMessage is async.
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Create the new tab with openerTabId set to the parent and correct position
		// Note: Chrome doesn't actually set openerTabId on the tab object when using
		// browser.tabs.create(), so the pending intent above handles the parent relationship
		const newTab = await browser.tabs.create({
			windowId: parentTab.browserWindowId,
			openerTabId: parentTabId,
			index: insertIndex,
			active: true,
		});

		if (!newTab.id) return;
		const newTabBrowserId = newTab.id;

		// Wait for the tab to appear in collection
		let newTabRecord = findInCollection(
			tabCollection,
			(t) => t.browserTabId === newTabBrowserId,
		);

		let attempts = 0;
		const maxAttempts = 50; // 500ms total

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

		// Register UI move intent with background to ensure subsequent events use correct parent
		// This is a second line of defense after the pending intent
		if (sendMoveIntent) {
			await sendMoveIntent([
				{ tabId: newTabBrowserId, parentTabId, treeOrder },
			]);
		}

		// Always update the parent to ensure it's correct
		// The background might have set a different parent due to timing issues
		tabCollection.update(newTabRecord.id, (draft) => {
			draft.parentTabId = parentTabId;
			draft.treeOrder = treeOrder;
		});
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
