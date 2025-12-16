/**
 * React hook for using the EventRecorder
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tab, Window } from "@/schema/src/schema";
import {
	EventRecorder,
	type EventRecorderOptions,
	type RecorderState,
} from "./event-recorder";
import type { RecordedEvent, RecordingSession, UserEvent } from "./event-types";

export interface UseEventRecorderOptions {
	/** Get current state for initial snapshot */
	getCurrentState: () => { windows: Window[]; tabs: Tab[] };
}

export interface UseEventRecorderReturn {
	state: RecorderState;
	events: RecordedEvent[];
	startRecording: () => void;
	stopRecording: () => RecordingSession | null;
	pauseRecording: () => void;
	resumeRecording: () => void;
	clearEvents: () => void;
	recordUserEvent: (event: Omit<UserEvent, "timestamp">) => void;
	captureChomeStateSnapshot: (label: string) => Promise<void>;
	exportToJson: () => string;
}

export function useEventRecorder(
	options: UseEventRecorderOptions,
): UseEventRecorderReturn {
	const [state, setState] = useState<RecorderState>("idle");
	const [events, setEvents] = useState<RecordedEvent[]>([]);
	const [initialState, setInitialState] = useState<{
		windows: Window[];
		tabs: Tab[];
	} | null>(null);
	const [startTime, setStartTime] = useState<number>(0);
	const recorderRef = useRef<EventRecorder | null>(null);

	// Initialize recorder on mount
	useEffect(() => {
		const recorderOptions: EventRecorderOptions = {
			onStateChange: setState,
			onEventRecorded: (event) => {
				setEvents((prev) => [...prev, event]);
			},
		};

		recorderRef.current = new EventRecorder(recorderOptions);

		return () => {
			recorderRef.current?.stopRecording();
		};
	}, []);

	const startRecording = useCallback(() => {
		const currentState = options.getCurrentState();
		const now = Date.now();
		setStartTime(now);
		setInitialState(currentState);
		recorderRef.current?.startRecording(currentState);
		setEvents([]);
	}, [options]);

	const stopRecording = useCallback(() => {
		return recorderRef.current?.stopRecording() ?? null;
	}, []);

	const pauseRecording = useCallback(() => {
		recorderRef.current?.pauseRecording();
	}, []);

	const resumeRecording = useCallback(() => {
		recorderRef.current?.resumeRecording();
	}, []);

	const clearEvents = useCallback(() => {
		recorderRef.current?.clearEvents();
		setEvents([]);
	}, []);

	const recordUserEvent = useCallback((event: Omit<UserEvent, "timestamp">) => {
		recorderRef.current?.recordUserEvent(event);
	}, []);

	const captureChomeStateSnapshot = useCallback(async (label: string) => {
		await recorderRef.current?.captureChomeStateSnapshot(label);
	}, []);

	const exportToJson = useCallback(() => {
		const session: RecordingSession = {
			id: `session-${startTime || Date.now()}`,
			startTime: startTime || Date.now(),
			events: events,
			initialState: initialState || { windows: [], tabs: [] },
		};
		return JSON.stringify(session, null, 2);
	}, [events, initialState, startTime]);

	return {
		state,
		events,
		startRecording,
		stopRecording,
		pauseRecording,
		resumeRecording,
		clearEvents,
		recordUserEvent,
		captureChomeStateSnapshot,
		exportToJson,
	};
}
