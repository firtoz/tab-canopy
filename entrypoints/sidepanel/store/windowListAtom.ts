import { atom, type PrimitiveAtom } from "jotai";
import type { WindowData } from "./WindowData";

export const windowListAtom = atom<PrimitiveAtom<WindowData>[]>([]);
