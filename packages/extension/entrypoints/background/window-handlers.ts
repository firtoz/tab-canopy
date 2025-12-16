import { log, makeWindowId } from "./constants";
import type { DbOperations } from "./db-operations";
import { queuedHandler } from "./event-queue";
import { windowToRecord } from "./mappers";
import { hasWindowId } from "./type-guards";

export const setupWindowListeners = (dbOps: DbOperations) => {
	const { putItems, deleteItems } = dbOps;

	// Handler for window creation
	const handleWindowCreated = async (win: Browser.windows.Window) => {
		log("[Background] Window created:", win.id);
		if (!hasWindowId(win)) return;
		await putItems("window", [windowToRecord(win)]);
	};

	browser.windows.onCreated.addListener(
		queuedHandler("windows.onCreated", handleWindowCreated),
	);

	// Handler for window removal
	const handleWindowRemoved = async (windowId: number) => {
		log("[Background] Window removed:", windowId);
		await deleteItems("window", [makeWindowId(windowId)]);
	};

	browser.windows.onRemoved.addListener(
		queuedHandler("windows.onRemoved", handleWindowRemoved),
	);

	// Handler for window focus change
	const handleWindowFocusChanged = async (windowId: number) => {
		log("[Background] Window focus changed:", windowId);
		const windows = await browser.windows.getAll();
		const windowRecords = windows.filter(hasWindowId).map(windowToRecord);
		if (windowRecords.length > 0) {
			await putItems("window", windowRecords);
		}
	};

	browser.windows.onFocusChanged.addListener(
		queuedHandler("windows.onFocusChanged", handleWindowFocusChanged),
	);
};
