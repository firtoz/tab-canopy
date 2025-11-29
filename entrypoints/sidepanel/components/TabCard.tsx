import { type PrimitiveAtom, useAtomValue } from "jotai";
import { Info, Puzzle, SplitSquareHorizontal, Volume2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "../lib/cn";
import type { TabAtomValue } from "../store/TabAtomValue";

interface TabCardProps {
	tabAtom: PrimitiveAtom<TabAtomValue>;
	isSelected: boolean;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	lastSelectedTabId: number | undefined;
}

export function TabCard({
	tabAtom,
	isSelected,
	onSelect,
	lastSelectedTabId,
}: TabCardProps) {
	const { tab } = useAtomValue(tabAtom);
	const { id, audible, favIconUrl, title, url } = tab;
	const [showInfo, setShowInfo] = useState(false);

	const handleTabClick = useCallback(
		(e: React.MouseEvent) => {
			if (!id) return;

			// Handle multi-select
			if (e.ctrlKey || e.metaKey || e.shiftKey) {
				e.preventDefault();
				onSelect(id, { ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey });
			} else {
				// Regular click - activate tab and clear selection
				onSelect(id, { ctrlKey: false, shiftKey: false });
				if (tab.windowId) {
					browser.tabs.update(id, { active: true });
					browser.windows.update(tab.windowId, { focused: true });
				}
			}
		},
		[id, tab.windowId, onSelect],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				handleTabClick(e as unknown as React.MouseEvent);
			}
		},
		[handleTabClick],
	);

	const handleClose = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (id !== undefined) {
				browser.tabs.remove(id);
			}
		},
		[id],
	);

	const handleToggleInfo = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setShowInfo((prev) => !prev);
	}, []);

	// Filter out chrome-extension:// URLs since we can't load them due to cross-extension security
	const isExtensionUrl = useMemo(
		() => url?.startsWith("chrome-extension://"),
		[url],
	);
	const isLoadableFavicon = useMemo(
		() => favIconUrl && !favIconUrl.startsWith("chrome-extension://"),
		[favIconUrl],
	);

	return (
		<div
			className={cn("flex flex-col rounded-md overflow-hidden border-2", {
				"bg-blue-500/15 dark:bg-blue-500/30 border-blue-500/50 dark:border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,0.1)] dark:shadow-[0_0_0_1px_rgba(59,130,246,0.2)]":
					tab.active && !isSelected,
				"bg-orange-500/25 dark:bg-orange-500/35 border-orange-500/70 dark:border-orange-500/80 shadow-[0_0_0_1px_rgba(249,115,22,0.2)] dark:shadow-[0_0_0_1px_rgba(249,115,22,0.3)]":
					isSelected,
				"bg-cyan-500/10 dark:bg-cyan-500/10 border-cyan-500/30 dark:border-cyan-500/40":
					tab.frozen && !tab.active && !isSelected,
				"bg-black/5 dark:bg-white/5 border-transparent":
					!tab.active && !tab.frozen && !isSelected,
			})}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: Cannot use button element due to nested close button */}
			<div
				className={cn("flex items-center gap-2 cursor-pointer group", {
					"hover:bg-black/10 dark:hover:bg-white/10": !isSelected,
					"hover:bg-orange-500/30 dark:hover:bg-orange-500/40": isSelected,
				})}
				onClick={handleTabClick}
				onKeyDown={handleKeyDown}
				role="button"
				tabIndex={0}
				aria-label={`Switch to tab: ${title || "Untitled"}`}
			>
				<div className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5">
					<div className="shrink-0 size-4 flex items-center justify-center">
						{audible ? (
							<Volume2
								size={16}
								className="text-green-500 dark:text-green-400 animate-pulse"
							/>
						) : isLoadableFavicon ? (
							<img src={favIconUrl} alt="" className="w-4 h-4 object-contain" />
						) : isExtensionUrl ? (
							<Puzzle
								size={16}
								className="text-purple-500 dark:text-purple-400"
							/>
						) : (
							<div className="size-4 bg-black/10 dark:bg-white/10 rounded-sm" />
						)}
					</div>
					<div className="text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis shrink h-full">
						{title || "Untitled"}
					</div>
					{tab.splitViewId !== undefined && tab.splitViewId !== -1 && (
						<div
							className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-medium shrink-0"
							title={`Split view ID: ${tab.splitViewId}`}
						>
							<SplitSquareHorizontal size={10} />
						</div>
					)}
					{url && (
						<div className="text-xs text-black/40 dark:text-white/40 whitespace-nowrap overflow-hidden text-ellipsis shrink-999">
							{new URL(url).hostname || url}
						</div>
					)}
				</div>
				<div className=" items-center hidden group-hover:flex">
					<button
						type="button"
						className={cn(
							"shrink-0 flex items-center justify-center p-1.5 hover:bg-blue-500/10 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 text-black/50 dark:text-white/50 transition-all",
							{ "opacity-100": showInfo },
						)}
						onClick={handleToggleInfo}
						title="Toggle debug info"
					>
						<Info size={14} />
					</button>
					<button
						type="button"
						className="shrink-0 flex items-center justify-center p-1.5 hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-black/50 dark:text-white/50 transition-colors"
						onClick={handleClose}
						title="Close tab"
					>
						<X size={14} />
					</button>
				</div>
			</div>
			{showInfo && (
				<div className="p-2 bg-black/5 dark:bg-white/5 border-t border-black/10 dark:border-white/10">
					<pre className="text-xs text-black/70 dark:text-white/70 overflow-x-auto">
						{JSON.stringify(tab, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
