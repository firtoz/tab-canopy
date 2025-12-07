// Type guard for windows with id
export const hasWindowId = (
	win: Browser.windows.Window,
): win is Browser.windows.Window & { id: number } => win.id !== undefined;

// Type guard for tabs with id and windowId
export const hasTabIds = (
	tab: Browser.tabs.Tab,
): tab is Browser.tabs.Tab & { id: number; windowId: number } =>
	tab.id !== undefined && tab.windowId !== undefined;
