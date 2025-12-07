import { makeId } from "@firtoz/drizzle-utils";
import { tabTable, windowTable } from "@/schema/src/schema";

export const DEBUG = true;

export const log = (...args: unknown[]) => {
	if (DEBUG) console.log(...args);
};

export const DB_NAME = "tabcanopy.db";

export const makeWindowId = (browserWindowId: number) =>
	makeId(windowTable, `window-${browserWindowId}`);

export const makeTabId = (browserTabId: number) =>
	makeId(tabTable, `tab-${browserTabId}`);
