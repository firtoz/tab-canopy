/**
 * DevTools Panel - UI for recording, replaying, and testing events
 */

import { generateKeyBetween } from "fractional-indexing";
import {
	ChevronDown,
	ChevronRight,
	Circle,
	ClipboardCopy,
	ClipboardPaste,
	Pause,
	Play,
	Square,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../lib/cn";
import { useDevTools } from "../lib/devtools/DevToolsContext";
import {
	isChromeEvent,
	type RecordedEvent,
	type RecordingSession,
} from "../lib/devtools/event-types";
import { type PreviewTab, TabTreePreview } from "./TabTreePreview";

// ============================================================================
// Event Display Component
// ============================================================================

function EventItem({
	event,
	index,
	isExpanded,
	onToggle,
}: {
	event: RecordedEvent;
	index: number;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const isChromeEv = isChromeEvent(event);

	const bgColor = isChromeEv
		? "bg-blue-500/10 border-blue-500/20"
		: "bg-emerald-500/10 border-emerald-500/20";

	const labelColor = isChromeEv ? "text-blue-400" : "text-emerald-400";

	const time = new Date(event.timestamp).toLocaleTimeString();

	// Get a human-readable summary
	const getSummary = () => {
		switch (event.type) {
			case "chrome.tabs.onCreated":
				return `Tab ${event.data.tab.id} created`;
			case "chrome.tabs.onRemoved":
				return `Tab ${event.data.tabId} removed`;
			case "chrome.tabs.onMoved":
				return `Tab ${event.data.tabId} moved: ${event.data.moveInfo.fromIndex} → ${event.data.moveInfo.toIndex}`;
			case "chrome.tabs.onUpdated":
				return `Tab ${event.data.tabId} updated`;
			case "chrome.tabs.onActivated":
				return `Tab ${event.data.activeInfo.tabId} activated`;
			case "chrome.tabs.onDetached":
				return `Tab ${event.data.tabId} detached`;
			case "chrome.tabs.onAttached":
				return `Tab ${event.data.tabId} attached`;
			case "chrome.windows.onCreated":
				return `Window ${event.data.window.id} created`;
			case "chrome.windows.onRemoved":
				return `Window ${event.data.windowId} removed`;
			case "chrome.windows.onFocusChanged":
				return `Window ${event.data.windowId} focused`;
			case "user.dragStart":
				return `Drag started: tab ${event.data.tabId}`;
			case "user.dragEnd":
				return `Drag ended: tab ${event.data.tabId} → ${event.data.dropTarget?.type ?? "cancelled"}`;
			case "user.tabClose":
				return `Close clicked: tab ${event.data.tabId}`;
			case "user.tabActivate":
				return `Tab clicked: ${event.data.tabId}`;
			case "user.toggleCollapse":
				return `Toggle collapse: tab ${event.data.tabId}`;
			default:
				return event.type;
		}
	};

	return (
		<div className={cn("border rounded text-xs", bgColor)}>
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center gap-2 p-2 text-left hover:bg-white/5 text-zinc-200"
			>
				{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
				<span className="text-zinc-500 font-mono">{index}</span>
				<span className={cn("font-medium", labelColor)}>
					{isChromeEv ? "Chrome" : "User"}
				</span>
				<span className="flex-1 truncate text-zinc-300">{getSummary()}</span>
				<span className="text-zinc-500">{time}</span>
			</button>
			{isExpanded && (
				<pre className="p-2 border-t border-white/5 overflow-x-auto text-[10px] leading-relaxed text-zinc-300 bg-black/20">
					{JSON.stringify(event, null, 2)}
				</pre>
			)}
		</div>
	);
}

// ============================================================================
// Recording Controls
// ============================================================================

function RecordingControls() {
	const {
		recorderState,
		startRecording,
		stopRecording,
		pauseRecording,
		resumeRecording,
		clearEvents,
		recordedEvents,
		exportToJson,
	} = useDevTools();

	const [copied, setCopied] = useState(false);

	const handleCopyEvents = useCallback(() => {
		const json = exportToJson();
		navigator.clipboard.writeText(json).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [exportToJson]);

	const isIdle = recorderState === "idle";
	const isRecording = recorderState === "recording";
	const isPaused = recorderState === "paused";

	return (
		<div className="flex items-center gap-2 p-2 border-b border-white/10">
			{/* Record / Stop */}
			{isIdle ? (
				<button
					type="button"
					onClick={startRecording}
					className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-medium transition-colors"
					title="Start Recording"
				>
					<Circle size={10} className="fill-current" />
					Record
				</button>
			) : (
				<button
					type="button"
					onClick={stopRecording}
					className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-500/20 hover:bg-zinc-500/30 text-zinc-300 rounded text-xs font-medium transition-colors"
					title="Stop Recording"
				>
					<Square size={10} className="fill-current" />
					Stop
				</button>
			)}

			{/* Pause / Resume */}
			{isRecording && (
				<button
					type="button"
					onClick={pauseRecording}
					className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded text-xs font-medium transition-colors"
					title="Pause Recording"
				>
					<Pause size={10} />
					Pause
				</button>
			)}
			{isPaused && (
				<button
					type="button"
					onClick={resumeRecording}
					className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs font-medium transition-colors"
					title="Resume Recording"
				>
					<Play size={10} />
					Resume
				</button>
			)}

			{/* Recording indicator */}
			{isRecording && (
				<span className="flex items-center gap-1.5 text-xs text-red-400">
					<span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
					Recording...
				</span>
			)}
			{isPaused && <span className="text-xs text-yellow-400">Paused</span>}

			<div className="flex-1" />

			{/* Event count */}
			<span className="text-xs text-zinc-500">
				{recordedEvents.length} events
			</span>

			{/* Copy */}
			<button
				type="button"
				onClick={handleCopyEvents}
				disabled={recordedEvents.length === 0}
				className={cn(
					"flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
					recordedEvents.length > 0
						? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
						: "bg-zinc-500/10 text-zinc-500 cursor-not-allowed",
				)}
				title="Copy Events to Clipboard"
			>
				<ClipboardCopy size={12} />
				{copied ? "Copied!" : "Copy"}
			</button>

			{/* Clear */}
			<button
				type="button"
				onClick={clearEvents}
				disabled={recordedEvents.length === 0}
				className={cn(
					"flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors",
					recordedEvents.length > 0
						? "hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
						: "text-zinc-600 cursor-not-allowed",
				)}
				title="Clear Events"
			>
				<Trash2 size={12} />
			</button>
		</div>
	);
}

// ============================================================================
// Event List
// ============================================================================

function EventList() {
	const { recordedEvents } = useDevTools();
	const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
		new Set(),
	);

	const toggleExpanded = useCallback((index: number) => {
		setExpandedIndices((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}, []);

	if (recordedEvents.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
				<div className="text-center">
					<p>No events recorded yet.</p>
					<p className="text-xs mt-1">
						Click Record to start capturing events.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto p-2 space-y-1">
			{recordedEvents.map((event, index) => (
				<EventItem
					key={`${event.timestamp}-${index}`}
					event={event}
					index={index}
					isExpanded={expandedIndices.has(index)}
					onToggle={() => toggleExpanded(index)}
				/>
			))}
		</div>
	);
}

// ============================================================================
// State Viewer Component - Shows tabs in a tree structure
// ============================================================================

interface TabState {
	browserTabId: number;
	browserWindowId: number;
	tabIndex: number;
	parentTabId: number | null;
	treeOrder: string;
	title?: string | null;
	isCollapsed?: boolean;
}

interface WindowState {
	browserWindowId: number;
	focused?: boolean;
}

interface SimulatedState {
	tabs: TabState[];
	windows: WindowState[];
}

// ============================================================================
// State Simulator - Applies events to compute expected state
// ============================================================================

function applyEventToState(
	state: SimulatedState,
	event: RecordedEvent,
): SimulatedState {
	const tabs = [...state.tabs];
	const windows = [...state.windows];

	switch (event.type) {
		case "chrome.tabs.onCreated": {
			const newTab = event.data.tab;
			if (newTab.id === undefined || newTab.windowId === undefined) break;
			// Shift indices for tabs after this one
			for (const tab of tabs) {
				if (
					tab.browserWindowId === newTab.windowId &&
					tab.tabIndex >= (newTab.index ?? 0)
				) {
					tab.tabIndex++;
				}
			}
			tabs.push({
				browserTabId: newTab.id,
				browserWindowId: newTab.windowId,
				tabIndex: newTab.index ?? 0,
				parentTabId: null,
				treeOrder: generateKeyBetween(null, null),
				title: newTab.title,
			});
			break;
		}

		case "chrome.tabs.onRemoved": {
			const { tabId } = event.data;
			const removedIndex = tabs.findIndex((t) => t.browserTabId === tabId);
			if (removedIndex !== -1) {
				const removed = tabs[removedIndex];
				// Shift indices for tabs after this one
				for (const tab of tabs) {
					if (
						tab.browserWindowId === removed.browserWindowId &&
						tab.tabIndex > removed.tabIndex
					) {
						tab.tabIndex--;
					}
				}
				tabs.splice(removedIndex, 1);
			}
			break;
		}

		case "chrome.tabs.onMoved": {
			const { tabId, moveInfo } = event.data;
			const tab = tabs.find((t) => t.browserTabId === tabId);
			if (tab) {
				const oldIndex = moveInfo.fromIndex;
				const newIndex = moveInfo.toIndex;
				// Update indices for affected tabs
				for (const t of tabs) {
					if (t.browserWindowId !== moveInfo.windowId) continue;
					if (t.browserTabId === tabId) {
						t.tabIndex = newIndex;
					} else if (oldIndex < newIndex) {
						// Moving down: shift tabs between old and new up
						if (t.tabIndex > oldIndex && t.tabIndex <= newIndex) {
							t.tabIndex--;
						}
					} else {
						// Moving up: shift tabs between new and old down
						if (t.tabIndex >= newIndex && t.tabIndex < oldIndex) {
							t.tabIndex++;
						}
					}
				}
			}
			break;
		}

		case "chrome.tabs.onDetached": {
			const { tabId, detachInfo } = event.data;
			const tabIndex = tabs.findIndex((t) => t.browserTabId === tabId);
			if (tabIndex !== -1) {
				const tab = tabs[tabIndex];
				// Shift indices for remaining tabs in old window
				for (const t of tabs) {
					if (
						t.browserWindowId === detachInfo.oldWindowId &&
						t.tabIndex > tab.tabIndex
					) {
						t.tabIndex--;
					}
				}
				// Mark as detached (windowId = -1 temporarily)
				tab.browserWindowId = -1;
				tab.tabIndex = -1;
			}
			break;
		}

		case "chrome.tabs.onAttached": {
			const { tabId, attachInfo } = event.data;
			const tab = tabs.find((t) => t.browserTabId === tabId);
			if (tab) {
				// Shift indices for tabs in new window
				for (const t of tabs) {
					if (
						t.browserWindowId === attachInfo.newWindowId &&
						t.tabIndex >= attachInfo.newPosition
					) {
						t.tabIndex++;
					}
				}
				tab.browserWindowId = attachInfo.newWindowId;
				tab.tabIndex = attachInfo.newPosition;
				// Reset tree structure for cross-window move
				tab.parentTabId = null;
			}
			break;
		}

		case "chrome.windows.onCreated": {
			if (event.data.window.id === undefined) break;
			windows.push({
				browserWindowId: event.data.window.id,
				focused: event.data.window.focused,
			});
			break;
		}

		case "chrome.windows.onRemoved": {
			const idx = windows.findIndex(
				(w) => w.browserWindowId === event.data.windowId,
			);
			if (idx !== -1) windows.splice(idx, 1);
			// Also remove all tabs in that window
			for (let i = tabs.length - 1; i >= 0; i--) {
				if (tabs[i].browserWindowId === event.data.windowId) {
					tabs.splice(i, 1);
				}
			}
			break;
		}

		case "user.dragEnd": {
			const { tabId, dropTarget } = event.data;
			if (!dropTarget) break;

			const tab = tabs.find((t) => t.browserTabId === tabId);
			if (!tab) break;

			if (dropTarget.type === "child") {
				tab.parentTabId = dropTarget.tabId;
			} else if (dropTarget.type === "sibling") {
				tab.parentTabId = dropTarget.ancestorId;
			} else if (dropTarget.type === "gap") {
				tab.parentTabId = null;
			}
			// Note: treeOrder would also change but we're simplifying
			break;
		}

		case "user.toggleCollapse": {
			const tab = tabs.find((t) => t.browserTabId === event.data.tabId);
			if (tab) {
				tab.isCollapsed = !tab.isCollapsed;
			}
			break;
		}

		// These events don't change structure
		case "chrome.tabs.onUpdated":
		case "chrome.tabs.onActivated":
		case "chrome.windows.onFocusChanged":
		case "user.dragStart":
		case "user.tabClose":
		case "user.tabActivate":
			break;
	}

	return { tabs, windows };
}

function computeStateAtStep(
	initialState: SimulatedState,
	events: RecordedEvent[],
	step: number,
): SimulatedState {
	let state = {
		tabs: initialState.tabs.map((t) => ({ ...t })),
		windows: initialState.windows.map((w) => ({ ...w })),
	};

	for (let i = 0; i < step && i < events.length; i++) {
		state = applyEventToState(state, events[i]);
	}

	return state;
}

// ============================================================================
// State Diff - Find differences between two states
// ============================================================================

interface TabDiff {
	tabId: number;
	changes: string[];
	type: "added" | "removed" | "modified" | "unchanged";
}

function diffStates(before: TabState[], after: TabState[]): TabDiff[] {
	const diffs: TabDiff[] = [];
	const beforeMap = new Map(before.map((t) => [t.browserTabId, t]));
	const afterMap = new Map(after.map((t) => [t.browserTabId, t]));

	// Find removed and modified
	for (const [tabId, beforeTab] of beforeMap) {
		const afterTab = afterMap.get(tabId);
		if (!afterTab) {
			diffs.push({ tabId, changes: ["removed"], type: "removed" });
		} else {
			const changes: string[] = [];
			if (beforeTab.browserWindowId !== afterTab.browserWindowId) {
				changes.push(
					`window: ${beforeTab.browserWindowId} → ${afterTab.browserWindowId}`,
				);
			}
			if (beforeTab.tabIndex !== afterTab.tabIndex) {
				changes.push(`index: ${beforeTab.tabIndex} → ${afterTab.tabIndex}`);
			}
			if (beforeTab.parentTabId !== afterTab.parentTabId) {
				changes.push(
					`parent: ${beforeTab.parentTabId} → ${afterTab.parentTabId}`,
				);
			}
			if (changes.length > 0) {
				diffs.push({ tabId, changes, type: "modified" });
			}
		}
	}

	// Find added
	for (const [tabId, afterTab] of afterMap) {
		if (!beforeMap.has(tabId)) {
			diffs.push({
				tabId,
				changes: [
					`added at index ${afterTab.tabIndex} in window ${afterTab.browserWindowId}`,
				],
				type: "added",
			});
		}
	}

	return diffs;
}

// ============================================================================
// Event Summary - human readable description
// ============================================================================

function getEventSummary(event: RecordedEvent): {
	summary: string;
	details: Record<string, unknown>;
	tabId?: number;
} {
	switch (event.type) {
		case "chrome.tabs.onCreated":
			return {
				summary: `Chrome created tab ${event.data.tab.id} in window ${event.data.tab.windowId} at index ${event.data.tab.index}`,
				details: event.data,
				tabId: event.data.tab.id,
			};
		case "chrome.tabs.onRemoved":
			return {
				summary: `Chrome removed tab ${event.data.tabId} from window ${event.data.removeInfo.windowId}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "chrome.tabs.onMoved":
			return {
				summary: `Chrome moved tab ${event.data.tabId}: index ${event.data.moveInfo.fromIndex} → ${event.data.moveInfo.toIndex} in window ${event.data.moveInfo.windowId}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "chrome.tabs.onUpdated":
			return {
				summary: `Chrome updated tab ${event.data.tabId}`,
				details: event.data.changeInfo as Record<string, unknown>,
				tabId: event.data.tabId,
			};
		case "chrome.tabs.onActivated":
			return {
				summary: `Chrome activated tab ${event.data.activeInfo.tabId} in window ${event.data.activeInfo.windowId}`,
				details: event.data,
				tabId: event.data.activeInfo.tabId,
			};
		case "chrome.tabs.onDetached":
			return {
				summary: `Chrome detached tab ${event.data.tabId} from window ${event.data.detachInfo.oldWindowId} at index ${event.data.detachInfo.oldPosition}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "chrome.tabs.onAttached":
			return {
				summary: `Chrome attached tab ${event.data.tabId} to window ${event.data.attachInfo.newWindowId} at index ${event.data.attachInfo.newPosition}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "chrome.windows.onCreated":
			return {
				summary: `Chrome created window ${event.data.window.id}`,
				details: event.data,
			};
		case "chrome.windows.onRemoved":
			return {
				summary: `Chrome removed window ${event.data.windowId}`,
				details: event.data,
			};
		case "chrome.windows.onFocusChanged":
			return {
				summary: `Chrome focus changed to window ${event.data.windowId}`,
				details: event.data,
			};
		case "user.dragStart":
			return {
				summary: `User started dragging tab ${event.data.tabId} (selected: ${event.data.selectedTabIds.join(", ")})`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "user.dragEnd": {
			const target = event.data.dropTarget;
			let targetDesc = "cancelled";
			if (target) {
				if (target.type === "new-window") {
					targetDesc = "new window";
				} else if (target.type === "sibling") {
					targetDesc = `sibling of tab ${target.tabId} (ancestor: ${target.ancestorId})`;
				} else if (target.type === "child") {
					targetDesc = `child of tab ${target.tabId}`;
				} else if (target.type === "gap") {
					targetDesc = `gap slot ${target.slot}`;
				}
			}
			return {
				summary: `User dropped tab ${event.data.tabId} → ${targetDesc}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		}
		case "user.tabClose":
			return {
				summary: `User clicked close on tab ${event.data.tabId}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "user.tabActivate":
			return {
				summary: `User clicked tab ${event.data.tabId}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "user.toggleCollapse":
			return {
				summary: `User toggled collapse on tab ${event.data.tabId}`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "user.selectionChange":
			return {
				summary: `User ${event.data.action} selection: [${event.data.selectedTabIds.join(", ")}]`,
				details: event.data,
				tabId: event.data.tabId,
			};
		case "snapshot.chromeState":
			return {
				summary: `Snapshot: ${event.data.label} (${event.data.tabs.length} tabs)`,
				details: event.data,
			};
		default:
			return { summary: "Unknown event", details: {} };
	}
}

// ============================================================================
// Replay Tab
// ============================================================================

function ReplayTab() {
	const [importedSession, setImportedSession] =
		useState<RecordingSession | null>(null);
	const [pasteValue, setPasteValue] = useState("");
	const [parseError, setParseError] = useState<string | null>(null);
	const [currentStep, setCurrentStep] = useState(0);
	const [showRawJson, setShowRawJson] = useState(false);

	const handlePaste = useCallback(() => {
		try {
			const session = JSON.parse(pasteValue) as RecordingSession;
			if (!session.events || !Array.isArray(session.events)) {
				throw new Error("Invalid session: missing events array");
			}
			setImportedSession(session);
			setParseError(null);
			setCurrentStep(0);
		} catch (e) {
			setParseError((e as Error).message);
			setImportedSession(null);
		}
	}, [pasteValue]);

	const handleClear = useCallback(() => {
		setImportedSession(null);
		setPasteValue("");
		setParseError(null);
		setCurrentStep(0);
	}, []);

	const handleStepForward = useCallback(() => {
		if (importedSession && currentStep < importedSession.events.length) {
			setCurrentStep((prev) => prev + 1);
		}
	}, [importedSession, currentStep]);

	const handleStepBack = useCallback(() => {
		if (currentStep > 0) {
			setCurrentStep((prev) => prev - 1);
		}
	}, [currentStep]);

	const handleJumpToStep = useCallback((step: number) => {
		setCurrentStep(step);
	}, []);

	if (!importedSession) {
		return (
			<div className="flex-1 flex flex-col p-4 gap-4">
				<div className="text-sm text-zinc-400">
					<p>Paste a recorded session JSON to replay events step by step.</p>
				</div>
				<textarea
					value={pasteValue}
					onChange={(e) => setPasteValue(e.target.value)}
					placeholder="Paste session JSON here..."
					className="flex-1 min-h-[200px] p-3 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono resize-none focus:outline-none focus:border-blue-500 text-zinc-300"
				/>
				{parseError && <p className="text-red-400 text-xs">{parseError}</p>}
				<button
					type="button"
					onClick={handlePaste}
					disabled={!pasteValue.trim()}
					className={cn(
						"flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors",
						pasteValue.trim()
							? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
							: "bg-zinc-500/10 text-zinc-500 cursor-not-allowed",
					)}
				>
					<ClipboardPaste size={14} />
					Import Session
				</button>
			</div>
		);
	}

	const currentEvent =
		currentStep < importedSession.events.length
			? importedSession.events[currentStep]
			: null;

	const eventInfo = currentEvent ? getEventSummary(currentEvent) : null;

	// Convert initial state to SimulatedState format
	const initialSimState: SimulatedState = {
		tabs: importedSession.initialState.tabs.map((tab) => ({
			browserTabId: tab.browserTabId,
			browserWindowId: tab.browserWindowId,
			tabIndex: tab.tabIndex,
			parentTabId: tab.parentTabId,
			treeOrder: tab.treeOrder,
			title: tab.title,
			isCollapsed: tab.isCollapsed,
		})),
		windows: importedSession.initialState.windows.map((w) => ({
			browserWindowId: w.browserWindowId,
			focused: w.focused,
		})),
	};

	// Compute state BEFORE current event (state after all previous events)
	const stateBefore = computeStateAtStep(
		initialSimState,
		importedSession.events,
		currentStep,
	);

	// Compute state AFTER current event
	const stateAfter = computeStateAtStep(
		initialSimState,
		importedSession.events,
		currentStep + 1,
	);

	// Compute diff between before and after
	const diff = currentEvent
		? diffStates(stateBefore.tabs, stateAfter.tabs)
		: [];

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* Header */}
			<div className="p-2 border-b border-white/10 text-xs flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-zinc-400">
						{importedSession.events.length} events
					</span>
					<span className="text-zinc-600">•</span>
					<span className="text-zinc-500">
						{new Date(importedSession.startTime).toLocaleTimeString()}
					</span>
				</div>
				<button
					type="button"
					onClick={handleClear}
					className="text-zinc-500 hover:text-zinc-300 text-xs"
				>
					Clear
				</button>
			</div>

			{/* Main content - split view */}
			<div className="flex-1 flex overflow-hidden">
				{/* Left: Event list */}
				<div className="w-48 border-r border-white/10 flex flex-col overflow-hidden">
					<div className="p-2 text-xs font-semibold text-zinc-400 border-b border-white/5">
						Events
					</div>
					<div className="flex-1 overflow-y-auto">
						{importedSession.events.map((event, index) => {
							const isCurrent = index === currentStep;
							const isPast = index < currentStep;
							return (
								<button
									key={`${event.timestamp}-${index}`}
									type="button"
									onClick={() => handleJumpToStep(index)}
									className={cn(
										"w-full px-2 py-1.5 text-left text-[10px] border-b border-white/5 transition-colors",
										isCurrent
											? "bg-yellow-500/20 text-yellow-200"
											: isPast
												? "bg-green-500/5 text-zinc-400"
												: "text-zinc-500 hover:bg-white/5",
									)}
								>
									<span className="font-mono text-zinc-500 mr-1">{index}</span>
									<span
										className={cn(
											isChromeEvent(event)
												? "text-blue-400"
												: "text-emerald-400",
										)}
									>
										{event.type.replace("chrome.", "").replace("user.", "")}
									</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* Right: Event details + State */}
				<div className="flex-1 flex flex-col overflow-hidden">
					{/* Step controls */}
					<div className="flex items-center gap-2 p-2 border-b border-white/10">
						<button
							type="button"
							onClick={() => handleJumpToStep(0)}
							disabled={currentStep === 0}
							className={cn(
								"px-2 py-1 rounded text-xs transition-colors",
								currentStep > 0
									? "hover:bg-zinc-700 text-zinc-400"
									: "text-zinc-600 cursor-not-allowed",
							)}
						>
							⏮
						</button>
						<button
							type="button"
							onClick={handleStepBack}
							disabled={currentStep === 0}
							className={cn(
								"px-2 py-1 rounded text-xs font-medium transition-colors",
								currentStep > 0
									? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
									: "bg-zinc-800 text-zinc-600 cursor-not-allowed",
							)}
						>
							← Prev
						</button>
						<button
							type="button"
							onClick={handleStepForward}
							disabled={currentStep >= importedSession.events.length}
							className={cn(
								"px-2 py-1 rounded text-xs font-medium transition-colors",
								currentStep < importedSession.events.length
									? "bg-green-600 hover:bg-green-500 text-white"
									: "bg-zinc-800 text-zinc-600 cursor-not-allowed",
							)}
						>
							Next →
						</button>
						<button
							type="button"
							onClick={() => handleJumpToStep(importedSession.events.length)}
							disabled={currentStep >= importedSession.events.length}
							className={cn(
								"px-2 py-1 rounded text-xs transition-colors",
								currentStep < importedSession.events.length
									? "hover:bg-zinc-700 text-zinc-400"
									: "text-zinc-600 cursor-not-allowed",
							)}
						>
							⏭
						</button>
						<span className="flex-1 text-center text-xs text-zinc-500">
							{currentStep < importedSession.events.length
								? `Event ${currentStep + 1} of ${importedSession.events.length}`
								: "All events reviewed"}
						</span>
					</div>

					{/* Current event details */}
					<div className="flex-1 overflow-y-auto p-3 space-y-4">
						{currentEvent && eventInfo ? (
							<>
								{/* Event summary */}
								<div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
									<div className="flex items-center gap-2 mb-2">
										<span
											className={cn(
												"text-xs font-semibold px-2 py-0.5 rounded",
												isChromeEvent(currentEvent)
													? "bg-blue-500/20 text-blue-400"
													: "bg-emerald-500/20 text-emerald-400",
											)}
										>
											{isChromeEvent(currentEvent)
												? "Chrome Event"
												: "User Action"}
										</span>
										<span className="text-xs text-zinc-500">
											{new Date(currentEvent.timestamp).toLocaleTimeString()}
										</span>
									</div>
									<div className="text-sm text-zinc-200 font-medium">
										{eventInfo.summary}
									</div>
								</div>

								{/* Event data toggle */}
								<div>
									<button
										type="button"
										onClick={() => setShowRawJson(!showRawJson)}
										className="text-xs text-zinc-500 hover:text-zinc-300 mb-2"
									>
										{showRawJson ? "▼ Hide" : "▶ Show"} raw event data
									</button>
									{showRawJson && (
										<pre className="p-2 bg-black/30 rounded text-[10px] text-zinc-400 overflow-x-auto">
											{JSON.stringify(currentEvent, null, 2)}
										</pre>
									)}
								</div>

								{/* State comparison - Chrome Order vs Tree Structure */}
								<div className="space-y-3">
									{/* Chrome Order (what Chrome sees - flat by index) */}
									<div>
										<div className="text-xs font-semibold text-orange-400 mb-2">
											🌐 Chrome Tab Order (by index)
										</div>
										<div className="grid grid-cols-2 gap-2">
											<TabTreePreview
												title="Before"
												state={{
													windows: stateBefore.windows,
													tabs: stateBefore.tabs as PreviewTab[],
												}}
												highlightTabId={eventInfo.tabId}
												showChromeOrder={true}
											/>
											<TabTreePreview
												title="After"
												state={{
													windows: stateAfter.windows,
													tabs: stateAfter.tabs as PreviewTab[],
												}}
												highlightTabId={eventInfo.tabId}
												showChromeOrder={true}
											/>
										</div>
									</div>

									{/* Tree Structure (our internal state) */}
									<div>
										<div className="text-xs font-semibold text-emerald-400 mb-2">
											🌲 Our Tree Structure (parentTabId)
										</div>
										<div className="grid grid-cols-2 gap-2">
											<TabTreePreview
												title="Before"
												state={{
													windows: stateBefore.windows,
													tabs: stateBefore.tabs as PreviewTab[],
												}}
												highlightTabId={eventInfo.tabId}
												tabChanges={
													new Map(
														diff
															.filter(
																(d) =>
																	d.type !== "added" && d.type !== "unchanged",
															)
															.map((d) => [
																d.tabId,
																d.type as "removed" | "modified",
															]),
													)
												}
											/>
											<TabTreePreview
												title="After"
												state={{
													windows: stateAfter.windows,
													tabs: stateAfter.tabs as PreviewTab[],
												}}
												highlightTabId={eventInfo.tabId}
												tabChanges={
													new Map(
														diff
															.filter(
																(d) =>
																	d.type !== "removed" &&
																	d.type !== "unchanged",
															)
															.map((d) => [
																d.tabId,
																d.type as "added" | "modified",
															]),
													)
												}
											/>
										</div>
									</div>
								</div>

								{/* Changes summary */}
								{diff.length > 0 && (
									<div className="text-xs p-2 bg-blue-500/10 border border-blue-500/20 rounded">
										<div className="font-semibold text-blue-400 mb-1">
											Changes:
										</div>
										{diff.map((d) => (
											<div key={d.tabId} className="text-zinc-300">
												<span
													className={cn(
														"font-mono",
														d.type === "added" && "text-green-400",
														d.type === "removed" && "text-red-400",
														d.type === "modified" && "text-blue-400",
													)}
												>
													Tab {d.tabId}:
												</span>{" "}
												{d.changes.join(", ")}
											</div>
										))}
									</div>
								)}
							</>
						) : (
							<div className="space-y-4">
								{currentStep >= importedSession.events.length ? (
									<>
										<div className="text-center py-4">
											<div className="text-2xl mb-2">✅</div>
											<div className="text-zinc-400">All events reviewed!</div>
										</div>
										{/* Show final state comparison */}
										<div>
											<div className="text-xs font-semibold text-zinc-400 mb-2">
												Final State Comparison
											</div>
											<div className="grid grid-cols-2 gap-2">
												<TabTreePreview
													title="⬅ Initial State"
													state={{
														windows: initialSimState.windows,
														tabs: initialSimState.tabs as PreviewTab[],
													}}
												/>
												<TabTreePreview
													title="➡ Final State"
													state={{
														windows: stateAfter.windows,
														tabs: stateAfter.tabs as PreviewTab[],
													}}
													tabChanges={
														new Map(
															diffStates(initialSimState.tabs, stateAfter.tabs)
																.filter(
																	(d) =>
																		d.type !== "removed" &&
																		d.type !== "unchanged",
																)
																.map(
																	(d) =>
																		[
																			d.tabId,
																			d.type as "added" | "modified",
																		] as const,
																),
														)
													}
												/>
											</div>
										</div>
										{/* Overall changes */}
										{(() => {
											const finalDiff = diffStates(
												initialSimState.tabs,
												stateAfter.tabs,
											);
											if (finalDiff.length === 0) {
												return (
													<div className="text-xs text-zinc-500 text-center">
														No structural changes between initial and final
														state.
													</div>
												);
											}
											return (
												<div className="text-xs p-2 bg-zinc-800/50 border border-zinc-700 rounded">
													<div className="font-semibold text-zinc-400 mb-1">
														Total Changes ({finalDiff.length}):
													</div>
													{finalDiff.map((d) => (
														<div key={d.tabId} className="text-zinc-300">
															<span
																className={cn(
																	"font-mono",
																	d.type === "added" && "text-green-400",
																	d.type === "removed" && "text-red-400",
																	d.type === "modified" && "text-blue-400",
																)}
															>
																Tab {d.tabId}:
															</span>{" "}
															{d.changes.join(", ")}
														</div>
													))}
												</div>
											);
										})()}
									</>
								) : (
									<div className="text-center text-zinc-500 text-sm py-8">
										Select an event to see details
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Main DevTools Panel
// ============================================================================

type TabId = "record" | "replay";

export function DevToolsPanel() {
	const { isDevToolsOpen, setDevToolsOpen, recorderState } = useDevTools();
	const [activeTab, setActiveTab] = useState<TabId>("record");

	if (!isDevToolsOpen) {
		return null;
	}

	return (
		<div className="fixed inset-x-0 bottom-0 h-[50vh] bg-zinc-900 border-t border-zinc-700 flex flex-col shadow-2xl z-50">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 bg-zinc-800">
				<div className="flex items-center gap-4">
					<span className="font-semibold text-sm">DevTools</span>
					{/* Tabs */}
					<div className="flex gap-1">
						<button
							type="button"
							onClick={() => setActiveTab("record")}
							className={cn(
								"px-3 py-1 rounded text-xs font-medium transition-colors",
								activeTab === "record"
									? "bg-zinc-700 text-white"
									: "text-zinc-400 hover:text-white",
							)}
						>
							Record
							{recorderState === "recording" && (
								<span className="ml-1.5 w-1.5 h-1.5 bg-red-500 rounded-full inline-block animate-pulse" />
							)}
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("replay")}
							className={cn(
								"px-3 py-1 rounded text-xs font-medium transition-colors",
								activeTab === "replay"
									? "bg-zinc-700 text-white"
									: "text-zinc-400 hover:text-white",
							)}
						>
							Replay
						</button>
					</div>
				</div>
				<button
					type="button"
					onClick={() => setDevToolsOpen(false)}
					className="p-1 hover:bg-zinc-700 rounded transition-colors"
				>
					<X size={16} />
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{activeTab === "record" && (
					<>
						<RecordingControls />
						<EventList />
					</>
				)}
				{activeTab === "replay" && <ReplayTab />}
			</div>
		</div>
	);
}

// ============================================================================
// DevTools Toggle Button
// ============================================================================

export function DevToolsToggle() {
	const { isDevToolsOpen, setDevToolsOpen, recorderState } = useDevTools();

	return (
		<button
			type="button"
			onClick={() => setDevToolsOpen(!isDevToolsOpen)}
			className={cn(
				"fixed bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all z-40",
				isDevToolsOpen
					? "bg-zinc-700 text-white"
					: "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700",
				recorderState === "recording" && "ring-2 ring-red-500",
			)}
			title={isDevToolsOpen ? "Close DevTools" : "Open DevTools"}
		>
			{recorderState === "recording" ? (
				<Circle size={20} className="fill-red-500 text-red-500" />
			) : (
				<span className="text-lg font-mono">🛠️</span>
			)}
		</button>
	);
}
