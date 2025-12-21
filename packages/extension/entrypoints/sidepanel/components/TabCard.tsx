import { useDndContext } from "@dnd-kit/core";
import { Info, Puzzle, Volume2, X } from "lucide-react";
import { useCallback, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { useDevTools } from "../lib/devtools";
import { isDropData } from "../lib/dnd-types";

// SVG tree line components with fixed dimensions
const TREE_W = 24; // Width of each tree segment (wider for better indentation)
const TREE_H = 26; // Fixed height matching row height
const MID_X = TREE_W / 2; // Center point for vertical lines
const MID_Y = TREE_H / 2;
const STROKE = 2; // Line thickness

// Expand/collapse indicator SVGs - same style as tree lines
const ICON_SIZE = Math.min(TREE_W, TREE_H);
const ICON_MID = ICON_SIZE / 2;
const BOX_SIZE = ICON_SIZE - 2; // Size of the box
const BOX_OFFSET = (ICON_SIZE - BOX_SIZE) / 2; // Center the box
const BOX_Y = MID_Y - BOX_SIZE / 2; // Vertical center

// Vertical line (┃) - full height, with optional highlight
const TreeVertical = ({ highlighted }: { highlighted?: boolean }) => (
	<svg
		width={TREE_W}
		height={TREE_H}
		className={cn("shrink-0", highlighted && "text-emerald-500")}
		aria-hidden="true"
	>
		{highlighted && (
			<rect
				x={0}
				y={0}
				width={TREE_W}
				height={TREE_H}
				fill="currentColor"
				fillOpacity={0.2}
			/>
		)}
		<line
			x1={MID_X}
			y1={0}
			x2={MID_X}
			y2={TREE_H}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
	</svg>
);

// Empty space - with optional highlight for drop zones
export const TreeEmpty = ({ highlighted }: { highlighted?: boolean }) => (
	<div
		style={{ width: TREE_W, height: TREE_H }}
		className={cn("shrink-0", highlighted && "bg-emerald-500/20")}
	/>
);

// Branch (┣) - vertical + horizontal right
export const TreeBranch = ({ highlighted }: { highlighted?: boolean }) => (
	<svg
		width={TREE_W}
		height={TREE_H}
		className={cn("shrink-0", highlighted && "text-emerald-500")}
		aria-hidden="true"
	>
		{highlighted && (
			<rect
				x={0}
				y={0}
				width={TREE_W}
				height={TREE_H}
				fill="currentColor"
				fillOpacity={0.2}
			/>
		)}
		<line
			x1={MID_X}
			y1={0}
			x2={MID_X}
			y2={TREE_H}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
		<line
			x1={MID_X}
			y1={MID_Y}
			x2={TREE_W}
			y2={MID_Y}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
	</svg>
);

// End (┗) - vertical top half + horizontal right
export const TreeEnd = ({ highlighted }: { highlighted?: boolean }) => (
	<svg
		width={TREE_W}
		height={TREE_H}
		className={cn("shrink-0", highlighted && "text-emerald-500")}
		aria-hidden="true"
	>
		{highlighted && (
			<rect
				x={0}
				y={0}
				width={TREE_W}
				height={TREE_H}
				fill="currentColor"
				fillOpacity={0.2}
			/>
		)}
		<line
			x1={MID_X}
			y1={0}
			x2={MID_X}
			y2={MID_Y}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
		<line
			x1={MID_X}
			y1={MID_Y}
			x2={TREE_W}
			y2={MID_Y}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
	</svg>
);

// [v] Expanded - downward chevron in box
export const IconExpanded = () => (
	<svg
		width={ICON_SIZE}
		height={TREE_H}
		className="shrink-0"
		aria-hidden="true"
	>
		<rect
			x={BOX_OFFSET}
			y={BOX_Y}
			width={BOX_SIZE}
			height={BOX_SIZE}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			rx={2}
		/>
		<polyline
			points={`${ICON_MID - 3},${MID_Y - 2} ${ICON_MID},${MID_Y + 3} ${ICON_MID + 3},${MID_Y - 2}`}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

// [>] Collapsed - rightward chevron in box
export const IconCollapsed = () => (
	<svg
		width={ICON_SIZE}
		height={TREE_H}
		className="shrink-0"
		aria-hidden="true"
	>
		<rect
			x={BOX_OFFSET}
			y={BOX_Y}
			width={BOX_SIZE}
			height={BOX_SIZE}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			rx={2}
		/>
		<polyline
			points={`${ICON_MID - 2},${MID_Y - 3} ${ICON_MID + 3},${MID_Y} ${ICON_MID - 2},${MID_Y + 3}`}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

// [-] Leaf node - horizontal dash in box
export const IconLeaf = () => (
	<svg
		width={ICON_SIZE}
		height={TREE_H}
		className="shrink-0"
		aria-hidden="true"
	>
		<rect
			x={BOX_OFFSET}
			y={BOX_Y}
			width={BOX_SIZE}
			height={BOX_SIZE}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			rx={2}
		/>
		<line
			x1={BOX_OFFSET + 6}
			y1={MID_Y}
			x2={ICON_SIZE - BOX_OFFSET - 6}
			y2={MID_Y}
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
		/>
	</svg>
);

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
