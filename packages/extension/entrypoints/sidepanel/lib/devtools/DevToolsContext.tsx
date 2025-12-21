/**
 * DevTools Context - Provides event recording functionality throughout the app
 */

import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Tab, Window } from "@/schema/src/schema";
import type { RecorderState } from "./event-recorder";
import type { RecordedEvent, RecordingSession, UserEvent } from "./event-types";
import { useEventRecorder } from "./useEventRecorder";

interface DevToolsContextValue {
	// Recording state
	recorderState: RecorderState;
	recordedEvents: RecordedEvent[];

	// Recording controls
	startRecording: () => void;
	stopRecording: () => RecordingSession | null;
	pauseRecording: () => void;
	resumeRecording: () => void;
	clearEvents: () => void;

	// Event recording (for components to report user actions)
	recordUserEvent: (event: Omit<UserEvent, "timestamp">) => void;
	captureChomeStateSnapshot: (label: string) => Promise<void>;

	// Export/Import
	exportToJson: () => string;

	// UI state
	isDevToolsOpen: boolean;
	setDevToolsOpen: (open: boolean) => void;
}

const DevToolsContext = createContext<DevToolsContextValue | null>(null);

interface DevToolsProviderProps {
	children: ReactNode;
	/** Function to get current windows/tabs state */
	getCurrentState: () => { windows: Window[]; tabs: Tab[] };
}

export function DevToolsProvider({
	children,
	getCurrentState,
}: DevToolsProviderProps) {
	const [isDevToolsOpen, setDevToolsOpen] = useState(false);

	const {
		state: recorderState,
		events: recordedEvents,
		startRecording,
		stopRecording,
		pauseRecording,
		resumeRecording,
		clearEvents,
		recordUserEvent,
		captureChomeStateSnapshot,
		exportToJson,
	} = useEventRecorder({ getCurrentState });

	const value = useMemo<DevToolsContextValue>(
		() => ({
			recorderState,
			recordedEvents,
			startRecording,
			stopRecording,
			pauseRecording,
			resumeRecording,
			clearEvents,
			recordUserEvent,
			captureChomeStateSnapshot,
			exportToJson,
			isDevToolsOpen,
			setDevToolsOpen,
		}),
		[
			recorderState,
			recordedEvents,
			startRecording,
			stopRecording,
			pauseRecording,
			resumeRecording,
			clearEvents,
			recordUserEvent,
			captureChomeStateSnapshot,
			exportToJson,
			isDevToolsOpen,
		],
	);

	return (
		<DevToolsContext.Provider value={value}>
			{children}
		</DevToolsContext.Provider>
	);
}

export function useDevTools(): DevToolsContextValue {
	const context = useContext(DevToolsContext);
	if (!context) {
		throw new Error("useDevTools must be used within a DevToolsProvider");
	}
	return context;
}

/**
 * Hook to check if recording is active (for components that want to record events)
 */
export function useIsRecording(): boolean {
	const { recorderState } = useDevTools();
	return recorderState === "recording";
}
