import type { PrimitiveAtom } from "jotai";
import type { TabData } from "./TabData";
import type { WindowData } from "./WindowData";

export type TabAtomValue = {
	tab: TabData;
	windowAtom: PrimitiveAtom<WindowData>;
};
