import type { InsertTab, InsertWindow } from "@/schema/src/schema";
import { makeTabId, makeWindowId } from "./constants";

// Make id required (it's optional in Insert types but we always provide it)
export type WindowRecord = Omit<
	InsertWindow,
	"id" | "createdAt" | "updatedAt"
> &
	Required<Pick<InsertWindow, "id">>;
export type TabRecord = Omit<InsertTab, "id" | "createdAt" | "updatedAt"> &
	Required<Pick<InsertTab, "id">> & {
		parentTabId: number | null;
		treeOrder: string;
		isCollapsed: boolean;
		titleOverride?: string | null;
	};

export const windowToRecord = (
	win: Browser.windows.Window & { id: number },
): WindowRecord => {
	return {
		id: makeWindowId(win.id),
		browserWindowId: win.id,
		focused: win.focused ?? false,
		state: win.state ?? "normal",
		incognito: win.incognito ?? false,
		type: win.type ?? "normal",
		deletedAt: null,
	};
};

export const tabToRecord = (
	tab: Browser.tabs.Tab & { id: number; windowId: number },
	options?: { parentTabId?: number | null; treeOrder?: string },
): TabRecord => {
	// Cast to access Chrome-specific properties
	const chromeTab = tab as Browser.tabs.Tab & {
		id: number;
		windowId: number;
		frozen?: boolean;
		autoDiscardable?: boolean;
		groupId?: number;
		openerTabId?: number;
	};
	return {
		id: makeTabId(tab.id),
		browserTabId: tab.id,
		browserWindowId: tab.windowId,
		tabIndex: tab.index,
		// Tree structure - use provided values or defaults
		parentTabId: options?.parentTabId ?? null,
		treeOrder: options?.treeOrder ?? "a0",
		isCollapsed: false,
		title: tab.title ?? null,
		url: tab.url ?? null,
		favIconUrl: tab.favIconUrl ?? null,
		active: tab.active ?? false,
		pinned: tab.pinned ?? false,
		highlighted: tab.highlighted ?? false,
		discarded: tab.discarded ?? false,
		frozen: chromeTab.frozen ?? false,
		autoDiscardable: chromeTab.autoDiscardable ?? true,
		audible: tab.audible ?? false,
		mutedInfo: tab.mutedInfo ? JSON.stringify(tab.mutedInfo) : null,
		status: tab.status ?? null,
		groupId: chromeTab.groupId ?? null,
		deletedAt: null,
		titleOverride: null,
	};
};
