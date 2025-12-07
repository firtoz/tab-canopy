import { Info, Puzzle, Volume2, X } from "lucide-react";
import { useCallback, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";

export const TabCard = ({
	tab,
	tabIndex,
	isSelected,
	onSelect,
	activeDropZone,
	isDragging,
}: {
	tab: schema.Tab;
	tabIndex: number;
	isSelected: boolean;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	activeDropZone: string | null;
	isDragging?: boolean;
}) => {
	const [showInfo, setShowInfo] = useState(false);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			onSelect(tab.browserTabId, {
				ctrlKey: e.ctrlKey || e.metaKey,
				shiftKey: e.shiftKey,
			});
		},
		[tab.browserTabId, onSelect],
	);

	const handleClose = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			browser.tabs.remove(tab.browserTabId);
		},
		[tab.browserTabId],
	);

	const handleToggleInfo = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setShowInfo((prev) => !prev);
	}, []);

	const dropZoneId = `drop-${tab.browserWindowId}-${tabIndex}`;
	const isDropTarget =
		activeDropZone === `${dropZoneId}-top` ||
		activeDropZone === `${dropZoneId}-bottom`;

	// Check if URL is an extension URL (can't load favicon)
	const isExtensionUrl = tab.url?.startsWith("chrome-extension://");
	const isLoadableFavicon =
		tab.favIconUrl && !tab.favIconUrl.startsWith("chrome-extension://");

	return (
		<div
			className={cn("flex flex-col rounded-md overflow-hidden border-2", {
				"cursor-grab active:cursor-grabbing": !isDragging,
				// Active tab (blue)
				"bg-blue-500/15 dark:bg-blue-500/30 border-blue-500/50 dark:border-blue-500/60":
					tab.active && !isSelected,
				// Selected tab (orange)
				"bg-orange-500/25 dark:bg-orange-500/35 border-orange-500/70 dark:border-orange-500/80":
					isSelected,
				// Frozen/discarded tab (cyan border)
				"bg-black/5 dark:bg-white/5 border-cyan-500/15 dark:border-cyan-500/20":
					(tab.frozen || tab.discarded) && !tab.active && !isSelected,
				// Normal inactive tab
				"bg-black/5 dark:bg-white/5 border-transparent":
					!tab.active && !tab.frozen && !tab.discarded && !isSelected,
				// Drop target
				"ring-2 ring-green-500": isDropTarget,
			})}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: Cannot use button due to nested buttons */}
			<div
				className={cn("flex items-center gap-2 group", {
					"cursor-pointer": !isDragging,
					"hover:bg-black/10 dark:hover:bg-white/10": !isSelected,
					"hover:bg-orange-500/30 dark:hover:bg-orange-500/40": isSelected,
				})}
				onClick={handleClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleClick(e as unknown as React.MouseEvent);
					}
				}}
				role="button"
				tabIndex={0}
				aria-label={`Switch to tab: ${tab.title || "Untitled"}`}
			>
				<div className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5">
					<div className="shrink-0 size-4 flex items-center justify-center">
						{tab.audible ? (
							<Volume2
								size={16}
								className="text-green-500 dark:text-green-400 animate-pulse"
							/>
						) : isLoadableFavicon ? (
							<img
								src={tab.favIconUrl ?? undefined}
								alt=""
								className="w-4 h-4 object-contain"
								onError={(e) => {
									e.currentTarget.style.display = "none";
								}}
							/>
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
						{tab.title || "Untitled"}
					</div>
					{tab.pinned && (
						<span className="text-xs text-orange-500" title="Pinned">
							📌
						</span>
					)}
					{tab.url && (
						<div className="text-xs text-black/40 dark:text-white/40 whitespace-nowrap overflow-hidden text-ellipsis shrink-999">
							{(() => {
								try {
									return new URL(tab.url).hostname || tab.url;
								} catch {
									return tab.url;
								}
							})()}
						</div>
					)}
				</div>
				<div className="items-center hidden group-hover:flex">
					<button
						type="button"
						className={cn(
							"shrink-0 flex items-center justify-center p-1.5 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 text-black/50 dark:text-white/50 transition-all",
							{ "opacity-100 text-blue-500": showInfo },
						)}
						onClick={handleToggleInfo}
						title="Toggle debug info"
					>
						<Info size={14} />
					</button>
					<button
						type="button"
						className="shrink-0 flex items-center justify-center p-1.5 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-black/50 dark:text-white/50 transition-colors"
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
};
