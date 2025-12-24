import { useDndContext } from "@dnd-kit/core";
import { Info, Puzzle, Volume2, X } from "lucide-react";
import { useCallback, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { useDevTools } from "../lib/devtools";
import { isDropData } from "../lib/dnd/dnd-types";
import { IconCollapsed } from "./icons/IconCollapsed";
import { IconExpanded } from "./icons/IconExpanded";
import { IconLeaf } from "./icons/IconLeaf";
import { TreeBranch } from "./icons/TreeBranch";
import { TreeEmpty } from "./icons/TreeEmpty";
import { TreeEnd } from "./icons/TreeEnd";
import { TreeVertical } from "./icons/TreeVertical";

export const TabCard = ({
	tab,
	isSelected,
	onSelect,
	onToggleCollapse,
	onClose,
	// activeDropData,
	isDragging,
	depth = 0,
	hasChildren = false,
	isLastChild = false,
	indentGuides = [],
	highlightedDepth,
}: {
	tab: schema.Tab;
	isSelected: boolean;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	onToggleCollapse: (tabId: number) => void;
	onClose: (tabId: number) => void;
	// activeDropData: DropData | null;
	isDragging?: boolean;
	depth?: number;
	hasChildren?: boolean;
	isLastChild?: boolean;
	indentGuides?: boolean[];
	highlightedDepth?: number | null;
}) => {
	const [showInfo, setShowInfo] = useState(false);
	const { recordUserEvent } = useDevTools();

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();

			// Record tab activation event
			recordUserEvent({
				type: "user.tabActivate",
				data: {
					tabId: tab.browserTabId,
					windowId: tab.browserWindowId,
				},
			});

			onSelect(tab.browserTabId, {
				ctrlKey: e.ctrlKey || e.metaKey,
				shiftKey: e.shiftKey,
			});
		},
		[tab.browserTabId, tab.browserWindowId, onSelect, recordUserEvent],
	);

	const handleClose = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onClose(tab.browserTabId);
		},
		[tab.browserTabId, onClose],
	);

	const handleToggleInfo = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setShowInfo((prev) => !prev);
	}, []);

	const handleToggleCollapse = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			onToggleCollapse(tab.browserTabId);
		},
		[tab.browserTabId, onToggleCollapse],
	);

	const { over } = useDndContext();
	const dropData = over?.data?.current;
	const activeDropData = isDropData(dropData) ? dropData : null;

	// Check if this tab is the drop target
	const isDropTargetSibling =
		activeDropData?.type === "sibling" &&
		activeDropData.tabId === tab.browserTabId;
	const isDropTargetChild =
		activeDropData?.type === "child" &&
		activeDropData.tabId === tab.browserTabId;

	// Check if URL is an extension URL (can't load favicon)
	const isExtensionUrl = tab.url?.startsWith("chrome-extension://");
	const isLoadableFavicon =
		tab.favIconUrl && !tab.favIconUrl.startsWith("chrome-extension://");

	return (
		<div
			className={cn("flex items-stretch", {
				"cursor-grab active:cursor-grabbing": !isDragging,
			})}
			data-testid="tab-card"
		>
			{/* Tree lines - outside the card using SVGs */}
			{depth > 0 && (
				<div className="flex items-stretch shrink-0 text-slate-300 dark:text-slate-600 select-none">
					{/* Render continuation lines for parent levels */}
					{indentGuides.map((showGuide, i) => {
						const isHighlighted = highlightedDepth === i;
						return (
							<div key={`guide-${tab.browserTabId}-${i}`}>
								{showGuide ? (
									<TreeVertical highlighted={isHighlighted} />
								) : (
									<TreeEmpty highlighted={isHighlighted} />
								)}
							</div>
						);
					})}
					{/* Render branch connector for current level */}
					<div>
						{isLastChild ? (
							<TreeEnd highlighted={highlightedDepth === depth} />
						) : (
							<TreeBranch highlighted={highlightedDepth === depth} />
						)}
					</div>
				</div>
			)}
			{/* Card content */}
			<div
				className={cn(
					"flex-1 flex flex-col overflow-hidden transition-colors duration-150 ease-in-out",
					{
						// Base hover state - subtle slate
						"hover:bg-slate-100 dark:hover:bg-slate-800/50":
							!tab.active && !isSelected,
						// Active tab (blue) - clear but soft
						"bg-blue-50 dark:bg-blue-900/20": tab.active && !isSelected,
						// Selected tab (indigo) - distinct from active
						"bg-indigo-50 dark:bg-indigo-900/20": isSelected,
						// Drop target - sibling (emerald) or child (blue)
						"ring-2 ring-emerald-500 ring-inset": isDropTargetSibling,
						"ring-2 ring-blue-500 ring-inset": isDropTargetChild,
					},
				)}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: Cannot use button due to nested buttons */}
				<div
					className={cn("flex items-center gap-0 group", {
						"cursor-pointer": !isDragging,
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
					{/* Expand/collapse indicator */}
					<button
						type="button"
						className={cn(
							"shrink-0 text-slate-400 dark:text-slate-500 select-none transition-colors",
							hasChildren &&
								"hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer",
						)}
						onClick={hasChildren ? handleToggleCollapse : undefined}
						disabled={!hasChildren}
					>
						{hasChildren ? (
							tab.isCollapsed ? (
								<IconCollapsed />
							) : (
								<IconExpanded />
							)
						) : (
							<IconLeaf />
						)}
					</button>
					<div className="flex-1 min-w-0 flex items-center gap-2 pl-2 py-1">
						<div
							className={cn(
								"shrink-0 size-4 flex items-center justify-center rounded-full transition-all",
								{
									// Discarded tab - orange/amber circle (priority over frozen)
									"ring-2 ring-amber-400 dark:ring-amber-500 bg-amber-50/30 dark:bg-amber-900/20":
										tab.discarded && !tab.active,
									// Frozen tab - cyan circle (only if not discarded)
									"ring-2 ring-cyan-400 dark:ring-cyan-500 bg-cyan-50/30 dark:bg-cyan-900/20":
										tab.frozen && !tab.discarded && !tab.active,
								},
							)}
						>
							{tab.audible ? (
								<Volume2
									size={16}
									className="text-emerald-500 dark:text-emerald-400 animate-pulse"
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
									className="text-indigo-400 dark:text-indigo-400"
								/>
							) : (
								<div className="size-4 bg-slate-200 dark:bg-slate-700 rounded-sm" />
							)}
						</div>
						<div
							className={cn(
								"text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis shrink h-full",
								{
									"text-slate-700 dark:text-slate-200":
										!tab.active && !isSelected,
									"text-blue-700 dark:text-blue-300": tab.active && !isSelected,
									"text-indigo-700 dark:text-indigo-300": isSelected,
								},
							)}
							title={tab.title || "Untitled"}
						>
							{tab.title || "Untitled"}
						</div>
						{tab.pinned && (
							<span
								className="text-xs text-indigo-500 dark:text-indigo-400"
								title="Pinned"
							>
								📌
							</span>
						)}
						{tab.url && (
							<div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis shrink-999">
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
					<div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity w-0 group-hover:w-auto">
						<button
							type="button"
							className={cn(
								"shrink-0 flex items-center justify-center p-1.5 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors",
								{ "text-blue-500 dark:text-blue-400": showInfo },
							)}
							onClick={handleToggleInfo}
							title="Toggle debug info"
						>
							<Info size={14} />
						</button>
						<button
							type="button"
							className="shrink-0 flex items-center justify-center p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
							onClick={handleClose}
							title="Close tab"
						>
							<X size={14} />
						</button>
					</div>
				</div>
				{showInfo && (
					<div className="p-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
						<pre className="text-xs text-slate-600 dark:text-slate-300 overflow-x-auto">
							{JSON.stringify(tab, null, 2)}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
};
