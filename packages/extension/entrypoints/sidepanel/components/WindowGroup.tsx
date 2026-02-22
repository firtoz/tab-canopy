import { useDndContext } from "@dnd-kit/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import fuzzysort from "fuzzysort";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
// import {
// 	SortableContext,
// 	useSortable,
// 	verticalListSortingStrategy,
// } from "@dnd-kit/sortable";
import { useTabcanopyDB } from "../lib/db/MemoryCollectionProvider";
import { isDropData } from "../lib/dnd/dnd-types";
import { buildTabTree, flattenTree } from "../lib/tree";
import { useTabActions } from "../store/useTabActions";
import { DraggableTab } from "./dnd/DraggableTab";
import { GapDropZone } from "./dnd/GapDropZone";
import { WindowTitleDropZone } from "./dnd/WindowTitleDropZone";
import { IconCollapsed } from "./icons/IconCollapsed";
import { IconExpanded } from "./icons/IconExpanded";
import { TreeBranch } from "./icons/TreeBranch";
import { TreeEnd } from "./icons/TreeEnd";
import { useSearch } from "./useSearch";
import { WindowContextMenu } from "./WindowContextMenu";

// ============================================================================
// Drop Zone Components - Tabs Outliner Style
// ============================================================================

export const TREE_W = 24; // Width of each tree segment (must match TabCard)

// ============================================================================
// Window Group Component - now a tree node itself
// ============================================================================

export interface WindowItem {
	id: string;
	tabId: number;
	windowId: number;
	tab: schema.Tab;
	depth: number;
	hasChildren: boolean;
	isLastChild: boolean;
	indentGuides: boolean[];
	/** Ancestor IDs from root to parent (adjusted for window being at depth 0) */
	ancestorIds: number[];
}

export const WindowGroup = ({
	window: win,
	tabs,
	isCurrentWindow,
	isLastWindow,
	selectedTabIds,
	setSelectedTabIds,
	lastSelectedTabId,
	setLastSelectedTabId,
}: {
	window: schema.Window;
	tabs: schema.Tab[];
	isCurrentWindow: boolean;
	isLastWindow: boolean;
	selectedTabIds: Set<number>;
	setSelectedTabIds: (ids: Set<number>) => void;
	lastSelectedTabId: number | undefined;
	setLastSelectedTabId: (id: number | undefined) => void;
}) => {
	const { useCollection } = useTabcanopyDB();
	const windowCollection = useCollection("windowTable");
	const { active } = useDndContext();
	const isDragging = active !== null;
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editTitleValue, setEditTitleValue] = useState("");
	const windowInputRef = useRef<HTMLInputElement>(null);

	// Get actions from Zustand store
	const { closeWindow, renameWindow, newTabInWindow } = useTabActions();

	// Auto-focus and select text when entering edit mode
	useEffect(() => {
		if (isEditingTitle && windowInputRef.current) {
			windowInputRef.current.focus();
			windowInputRef.current.select();
		}
	}, [isEditingTitle]);

	// Build tree structure and flatten for rendering
	// Tabs are now at depth 1+ (window is depth 0)
	const flatNodes = useMemo(() => {
		const tree = buildTabTree(tabs);
		return flattenTree(tree);
	}, [tabs]);

	// Get search input and threshold
	const searchInput = useSearch(({ input }) => input);
	const searchThreshold = useSearch(({ threshold }) => threshold);

	// Compute search state and match highlights for each tab
	type SearchState = "match" | "ancestor" | "hidden";
	type SearchInfo = {
		state: SearchState;
		highlightResult?: Fuzzysort.Result; // Fuzzysort result for highlighting
	};
	const searchInfo = useMemo((): Map<number, SearchInfo> => {
		const infoMap = new Map<number, SearchInfo>();

		if (!searchInput) {
			// No search active - all tabs visible as "match"
			return infoMap;
		}

		// Find all tabs that match the search
		const matchingTabIds = new Set<number>();
		for (const tab of tabs) {
			const displayTitle = tab.title || "Untitled";
			const titleResult = fuzzysort.single(searchInput, displayTitle);
			const urlResult = tab.url ? fuzzysort.single(searchInput, tab.url) : null;

			const titleMatches = titleResult && titleResult.score > searchThreshold;
			const urlMatches = urlResult && urlResult.score > searchThreshold;

			if (titleMatches || urlMatches) {
				matchingTabIds.add(tab.browserTabId);
				// Store the result for highlighting if title matched
				infoMap.set(tab.browserTabId, {
					state: "match",
					highlightResult: titleMatches ? titleResult : undefined,
				});
			}
		}

		// Find all ancestors of matching tabs
		for (const matchingTabId of matchingTabIds) {
			let currentTab = tabs.find((t) => t.browserTabId === matchingTabId);
			while (currentTab?.parentTabId !== null) {
				const parentTab = tabs.find(
					(t) => t.browserTabId === currentTab?.parentTabId,
				);
				if (!parentTab) break;

				// Only mark as ancestor if not already a direct match
				if (!infoMap.has(parentTab.browserTabId)) {
					infoMap.set(parentTab.browserTabId, { state: "ancestor" });
				}

				currentTab = parentTab;
			}
		}

		// All other tabs are hidden
		for (const tab of tabs) {
			if (!infoMap.has(tab.browserTabId)) {
				infoMap.set(tab.browserTabId, { state: "hidden" });
			}
		}

		return infoMap;
	}, [tabs, searchInput, searchThreshold]);

	// Adjust depth for tabs (add 1 since window is at depth 0)
	// Also prepend the window's continuation guide
	const items: WindowItem[] = useMemo(() => {
		// Filter out hidden tabs when searching
		const visible = searchInput
			? flatNodes.filter((node) => {
					const info = searchInfo.get(node.tab.browserTabId);
					return info?.state === "match" || info?.state === "ancestor";
				})
			: flatNodes;

		return visible.map((node, index) => ({
			id: `tab-${win.browserWindowId}-${node.tab.browserTabId}`,
			tabId: node.tab.browserTabId,
			windowId: win.browserWindowId,
			tab: node.tab,
			depth: node.depth + 1, // +1 because window is parent
			hasChildren: node.hasChildren,
			isLastChild:
				node.isLastChild && index === visible.length - 1
					? true
					: node.isLastChild,
			// Add window's guide: show vertical line if window is not last
			indentGuides: [!isLastWindow, ...node.indentGuides],
			// Pass through ancestorIds from the tree node
			ancestorIds: node.ancestorIds,
		}));
	}, [flatNodes, isLastWindow, win.browserWindowId, searchInput, searchInfo]);

	const selectedItems = items.filter((item) => selectedTabIds.has(item.tabId));

	const handleTabSelect = useCallback(
		(tabId: number, options: { ctrlKey: boolean; shiftKey: boolean }) => {
			if (options.shiftKey && lastSelectedTabId !== undefined) {
				// Range selection (shift+click)
				const lastIndex = items.findIndex(
					(item) => item.tabId === lastSelectedTabId,
				);
				const currentIndex = items.findIndex((item) => item.tabId === tabId);
				if (lastIndex !== -1 && currentIndex !== -1) {
					const startIdx = Math.min(lastIndex, currentIndex);
					const endIdx = Math.max(lastIndex, currentIndex);
					const newSelected = new Set(selectedTabIds);
					for (let i = startIdx; i <= endIdx; i++) {
						newSelected.add(items[i].tabId);
					}
					setSelectedTabIds(newSelected);
				}
			} else if (options.ctrlKey) {
				// Toggle selection (ctrl+click)
				const newSet = new Set(selectedTabIds);
				if (newSet.has(tabId)) {
					newSet.delete(tabId);
				} else {
					newSet.add(tabId);
				}
				setSelectedTabIds(newSet);
				setLastSelectedTabId(tabId);
			} else {
				// Single selection (normal click)
				const item = items.find((i) => i.tabId === tabId);
				if (item) {
					browser.tabs.update(tabId, { active: true });
					browser.windows.update(item.windowId, { focused: true });
				}
				setSelectedTabIds(new Set([tabId]));
				setLastSelectedTabId(tabId);
			}
		},
		[
			items,
			selectedTabIds,
			lastSelectedTabId,
			setSelectedTabIds,
			setLastSelectedTabId,
		],
	);

	const { over } = useDndContext();
	const dropData = over?.data?.current;
	const activeDropData = isDropData(dropData) ? dropData : null;

	// Calculate indicator position from activeDropData
	const indicator = useMemo(() => {
		if (!activeDropData) {
			return null;
		}

		if (
			activeDropData.type === "new-window" ||
			activeDropData.windowId !== win.browserWindowId
		) {
			return null;
		}

		if (activeDropData.type === "gap") {
			return { type: "gap" as const, slot: activeDropData.slot };
		}

		const itemIndex = items.findIndex(
			(item) => item.tabId === activeDropData.tabId,
		);
		if (itemIndex === -1) return null;

		const item = items[itemIndex];

		if (activeDropData.type === "sibling") {
			// Tabs Outliner style: sibling at specific ancestor level
			// We insert BEFORE the target tab (strip left of tab = "before that tab")
			const ancestorId = activeDropData.ancestorId;

			// Calculate the visual depth for the indicator
			// ancestorId: null means root level (depth 1 in UI)
			// ancestorId: X means becoming child of X, so find X's depth + 1
			let targetDepth: number;
			if (ancestorId === null) {
				targetDepth = 1; // Root level
			} else {
				// Find the depth of the ancestor in the items list
				const ancestorItem = items.find((i) => i.tabId === ancestorId);
				targetDepth = ancestorItem ? ancestorItem.depth + 1 : 1;
			}

			// Show line above the target tab (insert before = indicator at itemIndex)
			return {
				type: "sibling" as const,
				index: itemIndex,
				depth: targetDepth,
			};
		}

		// type === "child"
		return {
			type: "child" as const,
			index: itemIndex + 1,
			depth: item.depth + 1,
		};
	}, [activeDropData, win.browserWindowId, items]);

	// Get highlighted depth column for this window
	const highlightedDepth = useMemo(() => {
		if (!activeDropData) {
			return null;
		}
		if (
			activeDropData.type === "sibling" &&
			activeDropData.windowId === win.browserWindowId
		) {
			// Convert ancestorId to visual depth for highlighting
			const ancestorId = activeDropData.ancestorId;
			if (ancestorId === null) {
				return 1; // Root level
			}
			// Find the depth of the ancestor
			const ancestorItem = items.find((i) => i.tabId === ancestorId);
			return ancestorItem ? ancestorItem.depth + 1 : 1;
		}
		return null;
	}, [activeDropData, win.browserWindowId, items]);

	// Middle click (auxclick) closes the window
	const handleWindowAuxClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.button === 1) {
				e.preventDefault();
				e.stopPropagation();
				closeWindow(win.browserWindowId);
			}
		},
		[win.browserWindowId, closeWindow],
	);

	const handleWindowClick = useCallback(() => {
		browser.windows.update(win.browserWindowId, { focused: true });
	}, [win.browserWindowId]);

	const handleToggleWindowCollapse = useCallback(() => {
		// Update the window's collapsed state in the database
		windowCollection.update(win.id, (draft) => {
			draft.isCollapsed = !win.isCollapsed;
		});
	}, [win, windowCollection]);

	const handleCloseWindow = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			closeWindow(win.browserWindowId);
		},
		[win.browserWindowId, closeWindow],
	);

	const handleStartRenameWindow = useCallback(() => {
		setEditTitleValue(win.titleOverride || "Window");
		setIsEditingTitle(true);
	}, [win.titleOverride]);

	const handleSaveRenameWindow = useCallback(() => {
		const trimmed = editTitleValue.trim();
		// If empty or matches "Window" (the default), treat it as clearing the override
		const finalValue = !trimmed || trimmed === "Window" ? null : trimmed;
		renameWindow(win.browserWindowId, finalValue);
		setIsEditingTitle(false);
	}, [editTitleValue, win.browserWindowId, renameWindow]);

	const handleCancelRenameWindow = useCallback(() => {
		setIsEditingTitle(false);
		setEditTitleValue("");
	}, []);

	const handleRenameWindowKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				handleSaveRenameWindow();
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				handleCancelRenameWindow();
			}
		},
		[handleSaveRenameWindow, handleCancelRenameWindow],
	);

	const displayWindowTitle = win.titleOverride || "Window";

	return (
		<ContextMenu.Root>
			<div className="flex flex-col">
				{/* Window header as tree node */}
				<ContextMenu.Trigger asChild>
					<div className="flex items-stretch text-slate-300 dark:text-slate-600 relative">
						{/* Tree lines for window */}
						{isLastWindow ? (
							<TreeEnd highlighted={highlightedDepth === 0} />
						) : (
							<TreeBranch highlighted={highlightedDepth === 0} />
						)}
						{/* <TreeHorizontal /> */}
						{/* Window content */}
						{/* biome-ignore lint/a11y/useSemanticElements: div with role used for nested button */}
						<div
							className={cn(
								"flex-1 flex items-center gap-0 group",
								{
									"cursor-pointer": !isEditingTitle,
								},
								isCurrentWindow && "text-blue-600 dark:text-blue-400",
							)}
							onClick={isEditingTitle ? undefined : handleWindowClick}
							onAuxClick={isEditingTitle ? undefined : handleWindowAuxClick}
							onMouseDown={isEditingTitle ? undefined : handleWindowClick}
							onKeyDown={
								isEditingTitle
									? undefined
									: (e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleWindowClick();
											}
										}
							}
							role="button"
							tabIndex={0}
						>
							<button
								type="button"
								className="shrink-0 text-slate-400 dark:text-slate-500 select-none hover:text-slate-600 dark:hover:text-slate-300"
								onClick={(e) => {
									e.stopPropagation();

									handleToggleWindowCollapse();
								}}
							>
								{win.isCollapsed ? <IconCollapsed /> : <IconExpanded />}
							</button>
							{isEditingTitle ? (
								<input
									ref={windowInputRef}
									type="text"
									value={editTitleValue}
									onChange={(e) => setEditTitleValue(e.target.value)}
									onKeyDown={handleRenameWindowKeyDown}
									onBlur={handleSaveRenameWindow}
									className="text-sm font-medium px-1 py-0.5 ml-2 rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 min-w-[100px]"
									onClick={(e) => e.stopPropagation()}
									onMouseDown={(e) => e.stopPropagation()}
									onPointerDown={(e) => e.stopPropagation()}
								/>
							) : (
								<span className="text-sm font-medium pl-2 text-slate-700 dark:text-slate-200">
									{displayWindowTitle}
									{isCurrentWindow && " (current)"}
									{win.titleOverride && (
										<span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
											✏️
										</span>
									)}
								</span>
							)}
							{!isEditingTitle && (
								<span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
									• {tabs.length} tabs
								</span>
							)}
							{!isEditingTitle && (
								<>
									<button
										type="button"
										className="ml-auto mr-1 p-1 opacity-0 group-hover:opacity-100 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-all"
										onClick={(e) => {
											e.stopPropagation();
											newTabInWindow(win.browserWindowId);
										}}
										title="New tab in window"
									>
										<Plus size={14} />
									</button>
									<button
										type="button"
										className="mr-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
										onClick={handleCloseWindow}
										title="Close window"
									>
										<X size={14} />
									</button>
								</>
							)}
						</div>
						<WindowTitleDropZone
							windowId={win.browserWindowId}
							slot={0}
							isDragging={isDragging}
						/>
					</div>
				</ContextMenu.Trigger>

				{/* Tabs as children */}
				{!win.isCollapsed && (
					// <SortableContext
					// 	items={items.map((i) => i.id)}
					// 	// strategy={verticalListSortingStrategy}
					// >
					<div className="flex flex-col relative">
						<GapDropZone
							windowId={win.browserWindowId}
							slot={0}
							isDragging={isDragging}
						/>
						{items.map((item, index) => {
							const isSelected = selectedTabIds.has(item.tabId);
							const isPartOfDrag =
								isDragging &&
								selectedItems.some((si) => si.tabId === item.tabId);

							const showIndicatorBefore =
								indicator &&
								((indicator.type === "gap" && indicator.slot === index) ||
									((indicator.type === "sibling" ||
										indicator.type === "child") &&
										indicator.index === index));

							// Calculate indicator position based on type
							// For sibling: line starts at expand/collapse icon position
							// For child: line starts at favicon position (more indented)
							const indicatorLeftPx =
								indicator?.type === "sibling"
									? indicator.depth * 24 // Tree structure width
									: indicator?.type === "child"
										? indicator.depth * 24 // Already includes +1 depth from child
										: 0;

							const indicatorColor =
								indicator?.type === "child" ? "bg-blue-500" : "bg-emerald-500";

							// Get search info for this tab
							const tabSearchInfo = searchInfo.get(item.tabId);

							return (
								<div key={item.id} className="relative">
									{showIndicatorBefore && (
										<div
											className={`absolute -top-1 right-0 h-0.5 ${indicatorColor} rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none`}
											style={{
												left: `${indicatorLeftPx}px`,
											}}
										/>
									)}
									<DraggableTab
										id={item.id}
										windowId={win.browserWindowId}
										windowFocused={win.focused}
										isCurrentWindow={isCurrentWindow}
										tab={item.tab}
										isSelected={isSelected}
										isPartOfDrag={isPartOfDrag}
										isDragging={isDragging}
										onSelect={handleTabSelect}
										depth={item.depth}
										hasChildren={item.hasChildren}
										isLastChild={item.isLastChild}
										indentGuides={item.indentGuides}
										highlightedDepth={highlightedDepth}
										ancestorIds={item.ancestorIds}
										searchState={
											tabSearchInfo?.state === "hidden"
												? undefined
												: tabSearchInfo?.state
										}
										searchHighlight={tabSearchInfo?.highlightResult}
									/>
								</div>
							);
						})}
						{indicator &&
							((indicator.type === "gap" && indicator.slot === items.length) ||
								((indicator.type === "sibling" || indicator.type === "child") &&
									indicator.index === items.length)) && (
								<div
									className={`absolute -bottom-1 right-0 h-0.5 ${
										indicator.type === "child"
											? "bg-blue-500"
											: "bg-emerald-500"
									} rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none`}
									style={{
										left: `${
											indicator.type === "sibling" || indicator.type === "child"
												? indicator.depth * 24
												: 0
										}px`,
									}}
								/>
							)}
						<GapDropZone
							windowId={win.browserWindowId}
							slot={items.length}
							isDragging={isDragging}
						/>
					</div>
					// </SortableContext>
				)}
				<WindowContextMenu
					isCollapsed={win.isCollapsed}
					onRename={handleStartRenameWindow}
					onToggleCollapse={handleToggleWindowCollapse}
					onClose={() => closeWindow(win.browserWindowId)}
					onNewTab={() => newTabInWindow(win.browserWindowId)}
				/>
			</div>
		</ContextMenu.Root>
	);
};
