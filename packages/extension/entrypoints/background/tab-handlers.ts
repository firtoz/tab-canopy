import { log } from "./constants";
import type { DbOperations } from "./db-operations";
import { queuedHandler } from "./event-queue";
import { reconcile } from "./reconciler";
import type {
	TabActivatedEvent,
	TabAttachedEvent,
	TabCreatedEvent,
	TabDetachedEvent,
	TabMovedEvent,
	TabRemovedEvent,
	TabUpdatedEvent,
} from "./tab-sync-events";

/**
 * Track UI-initiated moves to prevent race conditions.
 * When the UI updates tree structure and then calls browser.tabs.move(),
 * the onMoved event might fire before the DB sync completes.
 * This map stores the intended tree positions so we don't recalculate.
 */
export interface UiMoveIntent {
	parentTabId: number | null;
	treeOrder: string;
	timestamp: number;
	/** TTL for this specific intent (creation intents have shorter TTL) */
	ttl: number;
}

// Map of tabId -> intended tree position from UI
const uiMoveIntents = new Map<number, UiMoveIntent>();

// Clean up stale intents after 5 seconds (for explicit UI moves)
const UI_MOVE_INTENT_TTL = 5000;

/**
 * Pending child tab intent - registered BEFORE the tab is created
 * Keyed by "windowId:expectedIndex" since we don't have tabId yet
 */
export interface PendingChildIntent {
	parentTabId: number;
	treeOrder: string;
	timestamp: number;
}

// Map of "windowId:index" -> pending child intent
const pendingChildIntents = new Map<string, PendingChildIntent>();

// Clean up pending intents after 2 seconds (shorter than move intents)
const PENDING_CHILD_INTENT_TTL = 2000;

export function registerPendingChildIntent(
	windowId: number,
	expectedIndex: number,
	parentTabId: number,
	treeOrder: string,
): void {
	const key = `${windowId}:${expectedIndex}`;
	log("[Background] Registering pending child intent:", key, {
		parentTabId,
		treeOrder,
	});
	pendingChildIntents.set(key, {
		parentTabId,
		treeOrder,
		timestamp: Date.now(),
	});

	// Auto-cleanup after TTL
	setTimeout(() => {
		const intent = pendingChildIntents.get(key);
		if (intent && Date.now() - intent.timestamp >= PENDING_CHILD_INTENT_TTL) {
			pendingChildIntents.delete(key);
			log("[Background] Cleaned up stale pending child intent:", key);
		}
	}, PENDING_CHILD_INTENT_TTL);
}

export function consumePendingChildIntent(
	windowId: number,
	tabIndex: number,
): PendingChildIntent | undefined {
	const key = `${windowId}:${tabIndex}`;
	const intent = pendingChildIntents.get(key);
	if (intent) {
		pendingChildIntents.delete(key);
		// Check if intent is still fresh
		if (Date.now() - intent.timestamp < PENDING_CHILD_INTENT_TTL) {
			log("[Background] Consuming pending child intent:", key, intent);
			return intent;
		}
		log("[Background] Pending child intent expired:", key);
	}
	return undefined;
}

/**
 * Event tracking for tests - stores tab creation events with their decisions
 * Only active when test mode is enabled to prevent memory leaks in production
 */
export interface TabCreatedTestEvent {
	tabId: number;
	openerTabId: number | undefined;
	tabIndex: number;
	decidedParentId: number | null;
	treeOrder: string;
	reason: string;
	timestamp: number;
}

let isTestMode = false;
const tabCreatedEvents: TabCreatedTestEvent[] = [];
const MAX_EVENT_HISTORY = 100;

export function enableTestMode(): void {
	log("[Background] Test mode enabled - event tracking active");
	isTestMode = true;
}

export function disableTestMode(): void {
	log("[Background] Test mode disabled - clearing events");
	isTestMode = false;
	tabCreatedEvents.length = 0;
}

export function isTestModeEnabled(): boolean {
	return isTestMode;
}

export function trackTabCreatedEvent(
	event: Omit<TabCreatedTestEvent, "timestamp">,
) {
	// Only track events in test mode
	if (!isTestMode) return;

	tabCreatedEvents.push({
		...event,
		timestamp: Date.now(),
	});

	// Keep only last MAX_EVENT_HISTORY events
	if (tabCreatedEvents.length > MAX_EVENT_HISTORY) {
		tabCreatedEvents.shift();
	}
}

export function getTabCreatedEvents(): TabCreatedTestEvent[] {
	return [...tabCreatedEvents];
}

export function clearTabCreatedEvents(): void {
	tabCreatedEvents.length = 0;
}

// Short TTL for creation-time intents (to handle Chrome's onMoved-after-onCreated race)
const CREATION_INTENT_TTL = 500;

export function registerUiMoveIntent(
	tabId: number,
	parentTabId: number | null,
	treeOrder: string,
	/** Use shorter TTL for creation-time intents to avoid interfering with user-initiated moves */
	isCreationIntent = false,
): void {
	const ttl = isCreationIntent ? CREATION_INTENT_TTL : UI_MOVE_INTENT_TTL;
	log("[Background] Registering UI move intent for tab:", tabId, {
		parentTabId,
		treeOrder,
		isCreationIntent,
		ttl,
	});
	uiMoveIntents.set(tabId, {
		parentTabId,
		treeOrder,
		timestamp: Date.now(),
		ttl,
	});

	// Auto-cleanup after TTL
	setTimeout(() => {
		const intent = uiMoveIntents.get(tabId);
		if (intent && Date.now() - intent.timestamp >= intent.ttl) {
			uiMoveIntents.delete(tabId);
			log("[Background] Cleaned up stale UI move intent for tab:", tabId);
		}
	}, ttl);
}

/** Read UI move intent without consuming (e.g. for TabUpdated in reconciler). */
export function getUiMoveIntent(tabId: number): UiMoveIntent | undefined {
	return uiMoveIntents.get(tabId);
}

export function consumeUiMoveIntent(tabId: number): UiMoveIntent | undefined {
	const intent = uiMoveIntents.get(tabId);
	if (intent) {
		uiMoveIntents.delete(tabId);
		// Check if intent is still fresh using its specific TTL
		if (Date.now() - intent.timestamp < intent.ttl) {
			log("[Background] Consuming UI move intent for tab:", tabId, intent);
			return intent;
		}
		log("[Background] UI move intent expired for tab:", tabId);
	}
	return undefined;
}

export const setupTabListeners = (
	dbOps: DbOperations,
	getManagedMoveTabIds?: () => Set<number>,
) => {
	const options = { getManagedMoveTabIds };

	const handleTabCreated = async (tab: Browser.tabs.Tab) => {
		log("[Background] Tab created:", tab.id, "at index:", tab.index);
		await reconcile(
			dbOps,
			{ type: "TabCreated", tab } satisfies TabCreatedEvent,
			options,
		);
	};

	const handleTabUpdated = async (
		tabId: number,
		changeInfo: Browser.tabs.OnUpdatedInfo,
		tab: Browser.tabs.Tab,
	) => {
		log("[Background] Tab updated:", tabId);
		await reconcile(
			dbOps,
			{ type: "TabUpdated", tabId, changeInfo, tab } satisfies TabUpdatedEvent,
			options,
		);
	};

	const handleTabRemoved = async (
		tabId: number,
		removeInfo: Browser.tabs.OnRemovedInfo,
	) => {
		log("[Background] Tab removed:", tabId, removeInfo);
		await reconcile(
			dbOps,
			{ type: "TabRemoved", tabId, removeInfo } satisfies TabRemovedEvent,
			options,
		);
	};

	const handleTabMoved = async (
		tabId: number,
		moveInfo: Browser.tabs.OnMovedInfo,
	) => {
		log("[Background] Tab moved:", tabId, moveInfo);
		await reconcile(
			dbOps,
			{ type: "TabMoved", tabId, moveInfo } satisfies TabMovedEvent,
			options,
		);
	};

	const handleTabActivated = async (
		activeInfo: Browser.tabs.OnActivatedInfo,
	) => {
		log("[Background] Tab activated:", activeInfo.tabId);
		await reconcile(
			dbOps,
			{ type: "TabActivated", activeInfo } satisfies TabActivatedEvent,
			options,
		);
	};

	const handleTabDetached = async (
		tabId: number,
		detachInfo: Browser.tabs.OnDetachedInfo,
	) => {
		log("[Background] Tab detached:", tabId, detachInfo);
		await reconcile(
			dbOps,
			{ type: "TabDetached", tabId, detachInfo } satisfies TabDetachedEvent,
			options,
		);
	};

	const handleTabAttached = async (
		tabId: number,
		attachInfo: Browser.tabs.OnAttachedInfo,
	) => {
		log("[Background] Tab attached:", tabId, attachInfo);
		await reconcile(
			dbOps,
			{ type: "TabAttached", tabId, attachInfo } satisfies TabAttachedEvent,
			options,
		);
	};

	browser.tabs.onCreated.addListener(
		queuedHandler("tabs.onCreated", handleTabCreated),
	);
	browser.tabs.onUpdated.addListener(
		queuedHandler("tabs.onUpdated", handleTabUpdated),
	);
	browser.tabs.onRemoved.addListener(
		queuedHandler("tabs.onRemoved", handleTabRemoved),
	);
	browser.tabs.onMoved.addListener(
		queuedHandler("tabs.onMoved", handleTabMoved),
	);
	browser.tabs.onActivated.addListener(
		queuedHandler("tabs.onActivated", handleTabActivated),
	);
	browser.tabs.onDetached.addListener(
		queuedHandler("tabs.onDetached", handleTabDetached),
	);
	browser.tabs.onAttached.addListener(
		queuedHandler("tabs.onAttached", handleTabAttached),
	);

	// Export handlers for testing (so we can inject fake events)
	return {
		handleTabCreated,
		handleTabUpdated,
		handleTabRemoved,
		handleTabMoved,
		handleTabActivated,
		handleTabDetached,
		handleTabAttached,
	};
};
