import { useDndContext } from "@dnd-kit/core";
// import {
// 	SortableContext,
// 	useSortable,
// 	verticalListSortingStrategy,
// } from "@dnd-kit/sortable";
import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { useDevTools } from "../lib/devtools";
import { isDropData } from "../lib/dnd/dnd-types";
import { buildTabTree, flattenTree } from "../lib/tree";
import { DraggableTab } from "./dnd/DraggableTab";
import { GapDropZone } from "./dnd/GapDropZone";
import { IconCollapsed } from "./icons/IconCollapsed";
import { IconExpanded } from "./icons/IconExpanded";
import { TreeBranch } from "./icons/TreeBranch";
import { TreeEnd } from "./icons/TreeEnd";

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
	onToggleCollapse,
	onCloseTab,
	onCloseWindow,
}: {
	window: schema.Window;
	tabs: schema.Tab[];
	isCurrentWindow: boolean;
	isLastWindow: boolean;
	selectedTabIds: Set<number>;
	setSelectedTabIds: (ids: Set<number>) => void;
	lastSelectedTabId: number | undefined;
	setLastSelectedTabId: (id: number | undefined) => void;
	onToggleCollapse: (tabId: number) => void;
	onCloseTab: (tabId: number) => void;
	onCloseWindow: (windowId: number) => void;
}) => {
	const { active } = useDndContext();
	const isDragging = active !== null;
	const [isCollapsed, setIsCollapsed] = useState(false);
	const { recordUserEvent } = useDevTools();

	// Build tree structure and flatten for rendering
	// Tabs are now at depth 1+ (window is depth 0)
	const flatNodes = useMemo(() => {
		const tree = buildTabTree(tabs);
		return flattenTree(tree);
	}, [tabs]);

	// Adjust depth for tabs (add 1 since window is at depth 0)
	// Also prepend the window's continuation guide
	const items: WindowItem[] = flatNodes.map((node, index) => ({
		id: `tab-${win.browserWindowId}-${node.tab.browserTabId}`,
		tabId: node.tab.browserTabId,
		windowId: win.browserWindowId,
		tab: node.tab,
		depth: node.depth + 1, // +1 because window is parent
		hasChildren: node.hasChildren,
		isLastChild:
			node.isLastChild && index === flatNodes.length - 1
				? true
				: node.isLastChild,
		// Add window's guide: show vertical line if window is not last
		indentGuides: [!isLastWindow, ...node.indentGuides],
		// Pass through ancestorIds from the tree node
		ancestorIds: node.ancestorIds,
	}));

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
					recordUserEvent({
						type: "user.selectionChange",
						data: {
							tabId,
							windowId: win.browserWindowId,
							action: "range",
							selectedTabIds: Array.from(newSelected),
						},
					});
				}
			} else if (options.ctrlKey) {
				// Toggle selection (ctrl+click)
				const newSet = new Set(selectedTabIds);
				const action = newSet.has(tabId) ? "remove" : "add";
				if (newSet.has(tabId)) {
					newSet.delete(tabId);
				} else {
					newSet.add(tabId);
				}
				setSelectedTabIds(newSet);
				setLastSelectedTabId(tabId);
				recordUserEvent({
					type: "user.selectionChange",
					data: {
						tabId,
						windowId: win.browserWindowId,
						action,
						selectedTabIds: Array.from(newSet),
					},
				});
			} else {
				// Single selection (normal click)
				const item = items.find((i) => i.tabId === tabId);
				if (item) {
					browser.tabs.update(tabId, { active: true });
					browser.windows.update(item.windowId, { focused: true });
				}
				setSelectedTabIds(new Set([tabId]));
				setLastSelectedTabId(tabId);
				recordUserEvent({
					type: "user.selectionChange",
					data: {
						tabId,
						windowId: win.browserWindowId,
						action: "set",
						selectedTabIds: [tabId],
					},
				});
			}
		},
		[
			items,
			selectedTabIds,
			lastSelectedTabId,
			setSelectedTabIds,
			setLastSelectedTabId,
			recordUserEvent,
			win.browserWindowId,
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

			// Find the insertion index: walk forward through items until we find one
			// that's at or shallower than targetDepth
			let insertIndex = itemIndex + 1;
			while (insertIndex < items.length) {
				const nextItem = items[insertIndex];
				if (nextItem.depth <= targetDepth) {
					break;
				}
				insertIndex++;
			}

			return {
				type: "sibling" as const,
				index: insertIndex,
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

	const handleWindowClick = useCallback(() => {
		browser.windows.update(win.browserWindowId, { focused: true });
	}, [win.browserWindowId]);

	const handleToggleWindowCollapse = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setIsCollapsed((prev) => !prev);
	}, []);

	const handleCloseWindow = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onCloseWindow(win.browserWindowId);
		},
		[win.browserWindowId, onCloseWindow],
	);

	return (
		<div className="flex flex-col">
			{/* Window header as tree node */}
			<div className="flex items-stretch text-slate-300 dark:text-slate-600">
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
						"flex-1 flex items-center gap-0 cursor-pointer group",
						isCurrentWindow && "text-blue-600 dark:text-blue-400",
					)}
					onClick={handleWindowClick}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							handleWindowClick();
						}
					}}
					role="button"
					tabIndex={0}
				>
					<button
						type="button"
						className="shrink-0 text-slate-400 dark:text-slate-500 select-none hover:text-slate-600 dark:hover:text-slate-300"
						onClick={handleToggleWindowCollapse}
					>
						{isCollapsed ? <IconCollapsed /> : <IconExpanded />}
					</button>
					<span className="text-sm font-medium pl-2 text-slate-700 dark:text-slate-200">
						Window
						{isCurrentWindow && " (current)"}
					</span>
					<span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
						• {tabs.length} tabs
					</span>
					<button
						type="button"
						className="ml-auto mr-2 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
						onClick={handleCloseWindow}
						title="Close window"
					>
						<X size={14} />
					</button>
				</div>
			</div>

			{/* Tabs as children */}
			{!isCollapsed && (
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
							isDragging && selectedItems.some((si) => si.tabId === item.tabId);

						const showIndicatorBefore =
							indicator &&
							((indicator.type === "gap" && indicator.slot === index) ||
								((indicator.type === "sibling" || indicator.type === "child") &&
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
									tab={item.tab}
									isSelected={isSelected}
									isPartOfDrag={isPartOfDrag}
									isDragging={isDragging}
									onSelect={handleTabSelect}
									onToggleCollapse={onToggleCollapse}
									onClose={onCloseTab}
									depth={item.depth}
									hasChildren={item.hasChildren}
									isLastChild={item.isLastChild}
									indentGuides={item.indentGuides}
									highlightedDepth={highlightedDepth}
									ancestorIds={item.ancestorIds}
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
									indicator.type === "child" ? "bg-blue-500" : "bg-emerald-500"
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
		</div>
	);
};
