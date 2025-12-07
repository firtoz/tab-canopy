import { log, makeWindowId } from "./constants";
import type { DbOperations } from "./db-operations";
import { windowToRecord } from "./mappers";
import { hasWindowId } from "./type-guards";

export const setupWindowListeners = (dbOps: DbOperations) => {
	const { putItems, deleteItems } = dbOps;

	browser.windows.onCreated.addListener(async (win) => {
		log("[Background] Window created:", win.id);
		if (!hasWindowId(win)) return;
		await putItems("window", [windowToRecord(win)]);
	});

	browser.windows.onRemoved.addListener(async (windowId) => {
		log("[Background] Window removed:", windowId);
		await deleteItems("window", [makeWindowId(windowId)]);
	});

	browser.windows.onFocusChanged.addListener(async (windowId) => {
		log("[Background] Window focus changed:", windowId);
		const windows = await browser.windows.getAll();
		const windowRecords = windows.filter(hasWindowId).map(windowToRecord);
		if (windowRecords.length > 0) {
			await putItems("window", windowRecords);
		}
	});
};
