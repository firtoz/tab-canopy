import type { PrimitiveAtom } from "jotai";
import type { TabAtomValue } from "./TabAtomValue";

export type WindowData = {
	windowId: number;
	tabAtoms: PrimitiveAtom<TabAtomValue>[];
	activeTabId?: number;
};
