/**
 * Event union for the single reconciliation loop.
 * Handlers enqueue one of these; the reconciler is the only writer.
 */

export type TabSyncEvent =
	| TabMovedEvent
	| TabRemovedEvent
	| TabCreatedEvent
	| TabUpdatedEvent
	| TabActivatedEvent
	| TabDetachedEvent
	| TabAttachedEvent;

export interface TabMovedEvent {
	type: "TabMoved";
	tabId: number;
	moveInfo: Browser.tabs.OnMovedInfo;
}

export interface TabRemovedEvent {
	type: "TabRemoved";
	tabId: number;
	removeInfo: Browser.tabs.OnRemovedInfo;
}

export interface TabCreatedEvent {
	type: "TabCreated";
	tab: Browser.tabs.Tab;
}

export interface TabUpdatedEvent {
	type: "TabUpdated";
	tabId: number;
	changeInfo: Browser.tabs.OnUpdatedInfo;
	tab: Browser.tabs.Tab;
}

export interface TabActivatedEvent {
	type: "TabActivated";
	activeInfo: Browser.tabs.OnActivatedInfo;
}

export interface TabDetachedEvent {
	type: "TabDetached";
	tabId: number;
	detachInfo: Browser.tabs.OnDetachedInfo;
}

export interface TabAttachedEvent {
	type: "TabAttached";
	tabId: number;
	attachInfo: Browser.tabs.OnAttachedInfo;
}
