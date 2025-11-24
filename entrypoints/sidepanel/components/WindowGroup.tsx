import { type PrimitiveAtom, useAtomValue } from "jotai";
import type { WindowData } from "../store/WindowData";
import { TabCard } from "./TabCard";

export function WindowGroup({
	windowAtom,
}: {
	windowAtom: PrimitiveAtom<WindowData>;
}) {
	const window = useAtomValue(windowAtom);
	return (
		<div className="flex flex-col gap-2">
			<div className="text-sm font-semibold text-black/50 dark:text-white/60 uppercase tracking-wider px-1">
				Window {window.windowId} ({window.tabAtoms.length} tabs)
			</div>
			<div className="flex flex-col gap-2">
				{window.tabAtoms.map((tabAtom) => (
					<TabCard key={`${tabAtom}`} tabAtom={tabAtom} />
				))}
			</div>
		</div>
	);
}
