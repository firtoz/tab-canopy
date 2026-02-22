// ============================================================================
// Drag & Drop Data Types - Discriminated Unions
// ============================================================================

// Drop zone data types
export type DropData =
	| DropDataSibling
	| DropDataChild
	| DropDataGap
	| DropDataNewWindow;

export interface DropDataSibling {
	type: "sibling";
	windowId: number;
	tabId: number;
	/** The ancestor tab ID to become a sibling of, or null for root sibling */
	ancestorId: number | null;
	/** Insert before the target tab (default true for UI strip). False = insert after (e.g. dragTabAfterTab). */
	insertBefore?: boolean;
}

export interface DropDataChild {
	type: "child";
	windowId: number;
	tabId: number;
}

export interface DropDataGap {
	type: "gap";
	windowId: number;
	slot: number;
}

export interface DropDataNewWindow {
	type: "new-window";
}

// Drag data for tabs
export interface DragDataTab {
	type: "tab";
	tabId: number;
	windowId: number;
}

// Type guards
export function isDropData(data: unknown): data is DropData {
	return (
		typeof data === "object" &&
		data !== null &&
		"type" in data &&
		(data.type === "sibling" ||
			data.type === "child" ||
			data.type === "gap" ||
			data.type === "new-window")
	);
}

export function isDragDataTab(data: unknown): data is DragDataTab {
	return (
		typeof data === "object" &&
		data !== null &&
		"type" in data &&
		data.type === "tab"
	);
}
