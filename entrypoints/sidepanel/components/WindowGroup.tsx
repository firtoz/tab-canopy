import { type PrimitiveAtom, useAtomValue } from "jotai";
import { Eye, Monitor, X } from "lucide-react";
import { useCallback } from "react";
import type { WindowData } from "../store/WindowData";
import { TabCard } from "./TabCard";

export function WindowGroup({
	windowAtom,
	isCurrentWindow,
}: {
	windowAtom: PrimitiveAtom<WindowData>;
	isCurrentWindow: boolean;
}) {
	const window = useAtomValue(windowAtom);

	const handleCloseWindow = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			browser.windows.remove(window.windowId);
		},
		[window.windowId],
	);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 px-1">
				<div className="text-sm font-semibold text-black/50 dark:text-white/60 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap">
					Window {window.windowId} ({window.tabAtoms.length} tabs)
				</div>
				<div className="flex items-center gap-1 flex-1">
					{window.focused && (
						<div
							className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium"
							title="This window is focused"
						>
							<Eye size={12} />
							<span>Focused</span>
						</div>
					)}
					{isCurrentWindow && (
						<div
							className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium"
							title="This side panel is attached to this window"
						>
							<Monitor size={12} />
							<span>Current</span>
						</div>
					)}
				</div>
				<button
					type="button"
					className="flex items-center justify-center p-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/20 dark:hover:border-red-500/20 active:scale-90"
					onClick={handleCloseWindow}
					title="Close window"
				>
					<X size={14} />
				</button>
			</div>
			<div className="flex flex-col gap-2">
				{window.tabAtoms.map((tabAtom) => (
					<TabCard key={`${tabAtom}`} tabAtom={tabAtom} />
				))}
			</div>
		</div>
	);
}
