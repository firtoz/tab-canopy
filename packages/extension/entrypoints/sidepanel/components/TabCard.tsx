import { useDndContext } from "@dnd-kit/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Info, Puzzle, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { isDropData } from "../lib/dnd/dnd-types";
import { useTabActions } from "../store/useTabActions";
import { IconCollapsed } from "./icons/IconCollapsed";
import { IconExpanded } from "./icons/IconExpanded";
import { IconLeaf } from "./icons/IconLeaf";
import { TreeBranch } from "./icons/TreeBranch";
import { TreeEmpty } from "./icons/TreeEmpty";
import { TreeEnd } from "./icons/TreeEnd";
import { TreeVertical } from "./icons/TreeVertical";
import { TabContextMenu } from "./TabContextMenu";

export const TabCard = ({
	tab,
	windowFocused,
	isSelected,
	onSelect,
	onEditingChange,
	// activeDropData,
	isDragging,
	depth = 0,
	hasChildren = false,
	isLastChild = false,
	indentGuides = [],
	highlightedDepth,
}: {
	tab: schema.Tab;
	windowFocused: boolean;
	isSelected: boolean;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	onEditingChange?: (isEditing: boolean) => void;
	// activeDropData: DropData | null;
	isDragging?: boolean;
	depth?: number;
	hasChildren?: boolean;
	isLastChild?: boolean;
	indentGuides?: boolean[];
	highlightedDepth?: number | null;
}) => {
	const [showInfo, setShowInfo] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");
	const [mouseDownPos, setMouseDownPos] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Get actions from Zustand store
	const { toggleCollapse, closeTab, renameTab, newTabAsChild } =
		useTabActions();

	// Auto-focus and select text when entering edit mode
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleStartRename = useCallback(() => {
		setEditValue(tab.titleOverride || tab.title || "");
		setIsEditing(true);
		onEditingChange?.(true);
	}, [tab.title, tab.titleOverride, onEditingChange]);

	const handleSaveRename = useCallback(() => {
		const trimmed = editValue.trim();
		// If empty or matches the original title, treat as null (no override)
		const finalValue = !trimmed || trimmed === tab.title ? null : trimmed;
		renameTab(tab.browserTabId, finalValue);
		setIsEditing(false);
		onEditingChange?.(false);
	}, [editValue, tab.browserTabId, tab.title, renameTab, onEditingChange]);

	const handleCancelRename = useCallback(() => {
		setIsEditing(false);
		setEditValue("");
		onEditingChange?.(false);
	}, [onEditingChange]);

	const handleRenameKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				handleSaveRename();
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				handleCancelRename();
			}
		},
		[handleSaveRename, handleCancelRename],
	);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		// Track mouse position for click-to-rename detection
		setMouseDownPos({ x: e.clientX, y: e.clientY });
	}, []);

	// Middle click (auxclick) closes the tab
	const handleAuxClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.button === 1) {
				e.preventDefault();
				e.stopPropagation();
				closeTab(tab.browserTabId);
			}
		},
		[tab.browserTabId, closeTab],
	);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();

			// Check for click-to-rename: only if window is focused, tab is active, and we didn't drag much
			if (
				windowFocused &&
				tab.active &&
				mouseDownPos &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.shiftKey
			) {
				const deltaX = Math.abs(e.clientX - mouseDownPos.x);
				const deltaY = Math.abs(e.clientY - mouseDownPos.y);
				const DRAG_THRESHOLD = 5; // pixels

				if (deltaX < DRAG_THRESHOLD && deltaY < DRAG_THRESHOLD) {
					// This is a click on an already-selected tab, trigger rename
					handleStartRename();
					return;
				}
			}

			onSelect(tab.browserTabId, {
				ctrlKey: e.ctrlKey || e.metaKey,
				shiftKey: e.shiftKey,
			});
		},
		[
			tab.browserTabId,
			tab.active,
			windowFocused,
			mouseDownPos,
			onSelect,
			handleStartRename,
		],
	);

	const handleClose = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			closeTab(tab.browserTabId);
		},
		[tab.browserTabId, closeTab],
	);

	const handleToggleInfo = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setShowInfo((prev) => !prev);
	}, []);

	const handleToggleCollapse = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			toggleCollapse(tab.browserTabId);
		},
		[tab.browserTabId, toggleCollapse],
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

	const displayTitle = tab.titleOverride || tab.title || "Untitled";

	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger asChild>
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
									!tab.active && !isSelected && !isEditing,
								// Active tab in focused window (blue) - clear highlight
								"bg-blue-50 dark:bg-blue-900/20":
									tab.active && windowFocused && !isSelected,
								// Active tab in unfocused window - subtle left border only
								"border-l-2 border-l-blue-300 dark:border-l-blue-600":
									tab.active && !windowFocused && !isSelected,
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
								"cursor-pointer": !isDragging && !isEditing,
							})}
							onClick={isEditing ? undefined : handleClick}
							onAuxClick={isEditing ? undefined : handleAuxClick}
							onMouseDown={isEditing ? undefined : handleMouseDown}
							onKeyDown={
								isEditing
									? undefined
									: (e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleClick(e as unknown as React.MouseEvent);
											}
										}
							}
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
								{isEditing ? (
									<input
										ref={inputRef}
										type="text"
										value={editValue}
										onChange={(e) => setEditValue(e.target.value)}
										onKeyDown={handleRenameKeyDown}
										onBlur={handleSaveRename}
										className="text-xs font-medium px-1 py-0.5 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 min-w-[100px] flex-1"
										onClick={(e) => e.stopPropagation()}
										onMouseDown={(e) => e.stopPropagation()}
										onPointerDown={(e) => e.stopPropagation()}
									/>
								) : (
									<div
										className={cn(
											"text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis shrink h-full",
											{
												"text-slate-700 dark:text-slate-200":
													!tab.active && !isSelected,
												// Active tab in focused window - bright blue
												"text-blue-700 dark:text-blue-300":
													tab.active && windowFocused && !isSelected,
												// Active tab in unfocused window - muted blue
												"text-blue-500/70 dark:text-blue-400/70":
													tab.active && !windowFocused && !isSelected,
												"text-indigo-700 dark:text-indigo-300": isSelected,
											},
										)}
										title={displayTitle}
									>
										{displayTitle}
										{tab.titleOverride && (
											<span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
												✏️
											</span>
										)}
									</div>
								)}
								{!isEditing && tab.pinned && (
									<span
										className="text-xs text-indigo-500 dark:text-indigo-400"
										title="Pinned"
									>
										📌
									</span>
								)}
								{!isEditing && tab.url && (
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
							{!isEditing && (
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
							)}
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
			</ContextMenu.Trigger>
			<TabContextMenu
				hasChildren={hasChildren}
				isCollapsed={tab.isCollapsed}
				onRename={handleStartRename}
				onToggleCollapse={() => toggleCollapse(tab.browserTabId)}
				onClose={() => closeTab(tab.browserTabId)}
				onNewTab={() => newTabAsChild(tab.browserTabId)}
			/>
		</ContextMenu.Root>
	);
};
