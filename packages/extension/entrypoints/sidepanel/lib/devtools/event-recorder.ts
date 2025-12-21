/**
 * Event Recorder - Captures Chrome browser events and user interactions
 * for debugging and testing purposes.
 */

import type { Tab, Window } from "@/schema/src/schema";
import type {
	ChromeEvent,
	RecordedEvent,
	RecordingSession,
	UserEvent,
} from "./event-types";

export type RecorderState = "idle" | "recording" | "paused";

export interface EventRecorderOptions {
	onStateChange?: (state: RecorderState) => void;
	onEventRecorded?: (event: RecordedEvent) => void;
}

export class EventRecorder {
	private state: RecorderState = "idle";
	private events: RecordedEvent[] = [];
	private startTime: number = 0;
	private initialState: { windows: Window[]; tabs: Tab[] } | null = null;
	private options: EventRecorderOptions;
	private listeners: Array<() => void> = [];

	constructor(options: EventRecorderOptions = {}) {
		this.options = options;
	}

	getState(): RecorderState {
		return this.state;
	}

	getEvents(): RecordedEvent[] {
		return [...this.events];
	}

	/**
	 * Start recording events
	 */
	async startRecording(initialState: {
		windows: Window[];
		tabs: Tab[];
	}): Promise<void> {
		if (this.state === "recording") return;

		this.events = [];
		this.startTime = Date.now();
		this.initialState = initialState;
		this.state = "recording";

		// Set up Chrome event listeners
		this.setupChromeListeners();

		this.options.onStateChange?.(this.state);
	}

	/**
	 * Pause recording (keeps events, stops capturing new ones)
	 */
	pauseRecording(): void {
		if (this.state !== "recording") return;

		this.state = "paused";
		this.removeChromeListeners();

		this.options.onStateChange?.(this.state);
	}

	/**
	 * Resume recording after pause
	 */
	resumeRecording(): void {
		if (this.state !== "paused") return;

		this.state = "recording";
		this.setupChromeListeners();

		this.options.onStateChange?.(this.state);
	}

	/**
	 * Stop recording and return the session
	 */
	stopRecording(): RecordingSession | null {
		if (this.state === "idle") return null;

		this.removeChromeListeners();

		if (!this.initialState) {
			throw new Error("Cannot stop recording without initial state");
		}

		const session: RecordingSession = {
			id: `session-${this.startTime}`,
			startTime: this.startTime,
			events: [...this.events],
			initialState: this.initialState,
		};

		this.state = "idle";
		this.events = [];
		this.initialState = null;

		this.options.onStateChange?.(this.state);

		return session;
	}

	/**
	 * Clear recorded events without stopping
	 */
	clearEvents(): void {
		this.events = [];
	}

	/**
	 * Record a user interaction event (called by UI components)
	 */
	recordUserEvent(event: Omit<UserEvent, "timestamp">): void {
		if (this.state !== "recording") return;

		const recordedEvent: RecordedEvent = {
			...event,
			timestamp: Date.now(),
		} as RecordedEvent;

		this.events.push(recordedEvent);
		this.options.onEventRecorded?.(recordedEvent);
	}

	/**
	 * Capture a snapshot of actual Chrome tab state
	 * Call this after user actions to record what Chrome actually shows
	 */
	async captureChomeStateSnapshot(label: string): Promise<void> {
		if (this.state !== "recording") return;

		try {
			const chromeTabs = await browser.tabs.query({});
			const snapshot: RecordedEvent = {
				type: "snapshot.chromeState",
				timestamp: Date.now(),
				data: {
					label,
					tabs: chromeTabs
						.filter((t) => t.id !== undefined && t.windowId !== undefined)
						.map((t) => ({
							id: t.id as number,
							windowId: t.windowId as number,
							index: t.index,
							title: t.title,
							url: t.url,
						}))
						.sort((a, b) => {
							// Sort by windowId first, then by index
							if (a.windowId !== b.windowId) return a.windowId - b.windowId;
							return a.index - b.index;
						}),
				},
			};

			this.events.push(snapshot);
			this.options.onEventRecorded?.(snapshot);
		} catch (e) {
			console.error("Failed to capture Chrome state snapshot:", e);
		}
	}

	/**
	 * Export events as JSON string (for copying)
	 */
	exportToJson(): string {
		const session: RecordingSession = {
			id: `session-${this.startTime || Date.now()}`,
			startTime: this.startTime || Date.now(),
			events: this.events,
			initialState: this.initialState || { windows: [], tabs: [] },
		};

		return JSON.stringify(session, null, 2);
	}

	/**
	 * Import events from JSON string
	 */
	static fromJson(json: string): RecordingSession {
		return JSON.parse(json) as RecordingSession;
	}

	// ============================================================================
	// Chrome Event Listeners
	// ============================================================================

	private setupChromeListeners(): void {
		const recordChromeEvent = (event: Omit<ChromeEvent, "timestamp">) => {
			if (this.state !== "recording") return;

			const recordedEvent: RecordedEvent = {
				...event,
				timestamp: Date.now(),
			} as RecordedEvent;

			this.events.push(recordedEvent);
			this.options.onEventRecorded?.(recordedEvent);
		};

		// Tab events
		const onTabCreated = (tab: Browser.tabs.Tab) => {
			recordChromeEvent({
				type: "chrome.tabs.onCreated",
				data: { tab },
			});
		};

		const onTabRemoved = (
			tabId: number,
			removeInfo: Browser.tabs.OnRemovedInfo,
		) => {
			recordChromeEvent({
				type: "chrome.tabs.onRemoved",
				data: { tabId, removeInfo },
			});
		};

		const onTabMoved = (tabId: number, moveInfo: Browser.tabs.OnMovedInfo) => {
			recordChromeEvent({
				type: "chrome.tabs.onMoved",
				data: { tabId, moveInfo },
			});
		};

		const onTabUpdated = (
			tabId: number,
			changeInfo: Browser.tabs.OnUpdatedInfo,
			tab: Browser.tabs.Tab,
		) => {
			recordChromeEvent({
				type: "chrome.tabs.onUpdated",
				data: { tabId, changeInfo, tab },
			});
		};

		const onTabActivated = (activeInfo: Browser.tabs.OnActivatedInfo) => {
			recordChromeEvent({
				type: "chrome.tabs.onActivated",
				data: { activeInfo },
			});
		};

		const onTabDetached = (
			tabId: number,
			detachInfo: Browser.tabs.OnDetachedInfo,
		) => {
			recordChromeEvent({
				type: "chrome.tabs.onDetached",
				data: { tabId, detachInfo },
			});
		};

		const onTabAttached = (
			tabId: number,
			attachInfo: Browser.tabs.OnAttachedInfo,
		) => {
			recordChromeEvent({
				type: "chrome.tabs.onAttached",
				data: { tabId, attachInfo },
			});
		};

		// Window events
		const onWindowCreated = (window: Browser.windows.Window) => {
			recordChromeEvent({
				type: "chrome.windows.onCreated",
				data: { window },
			});
		};

		const onWindowRemoved = (windowId: number) => {
			recordChromeEvent({
				type: "chrome.windows.onRemoved",
				data: { windowId },
			});
		};

		const onWindowFocusChanged = (windowId: number) => {
			recordChromeEvent({
				type: "chrome.windows.onFocusChanged",
				data: { windowId },
			});
		};

		// Add listeners
		browser.tabs.onCreated.addListener(onTabCreated);
		browser.tabs.onRemoved.addListener(onTabRemoved);
		browser.tabs.onMoved.addListener(onTabMoved);
		browser.tabs.onUpdated.addListener(onTabUpdated);
		browser.tabs.onActivated.addListener(onTabActivated);
		browser.tabs.onDetached.addListener(onTabDetached);
		browser.tabs.onAttached.addListener(onTabAttached);
		browser.windows.onCreated.addListener(onWindowCreated);
		browser.windows.onRemoved.addListener(onWindowRemoved);
		browser.windows.onFocusChanged.addListener(onWindowFocusChanged);

		// Store cleanup functions
		this.listeners = [
			() => browser.tabs.onCreated.removeListener(onTabCreated),
			() => browser.tabs.onRemoved.removeListener(onTabRemoved),
			() => browser.tabs.onMoved.removeListener(onTabMoved),
			() => browser.tabs.onUpdated.removeListener(onTabUpdated),
			() => browser.tabs.onActivated.removeListener(onTabActivated),
			() => browser.tabs.onDetached.removeListener(onTabDetached),
			() => browser.tabs.onAttached.removeListener(onTabAttached),
			() => browser.windows.onCreated.removeListener(onWindowCreated),
			() => browser.windows.onRemoved.removeListener(onWindowRemoved),
			() => browser.windows.onFocusChanged.removeListener(onWindowFocusChanged),
		];
	}

	private removeChromeListeners(): void {
		for (const cleanup of this.listeners) {
			cleanup();
		}
		this.listeners = [];
	}
}
