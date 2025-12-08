import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { buildTabTree, flattenTree } from "../lib/tree";
import {
	IconCollapsed,
	IconExpanded,
	TabCard,
	TreeBranch,
	TreeEnd,
} from "./TabCard";

// ============================================================================
// Drop Zone Components
// ============================================================================

function TreeDropZone({
	id,
	isDragging,
	position,
	depth,
}: {
	id: string;
	isDragging: boolean;
	position: "top" | "bottom";
	depth: number;
}) {
	const siblingId = `${id}-sibling`;
	const childId = `${id}-child`;

	const { setNodeRef: setSiblingRef, isOver: isSiblingOver } = useDroppable({
		id: siblingId,
	});
	const { setNodeRef: setChildRef, isOver: isChildOver } = useDroppable({
		id: childId,
	});

	const positionClass = position === "top" ? "top-0" : "bottom-0";
	// Tree: depth guides (24px each) + branch (24px) + horizontal (8px) + icon (18px)
	const indentWidth = depth * 24 + 24 + 8 + 18;

	return (
		<>
			<div
				ref={setSiblingRef}
				style={{ width: `${indentWidth}px` }}
				className={`absolute ${positionClass} left-0 h-1/2 ${
					isDragging
						? isSiblingOver
							? "bg-emerald-500/20 border-2 border-emerald-500/40"
							: "bg-transparent"
						: "pointer-events-none"
				}`}
			/>
			<div
				ref={setChildRef}
				style={{ left: `${indentWidth}px` }}
				className={`absolute ${positionClass} right-0 h-1/2 ${
					isDragging
						? isChildOver
							? "bg-blue-500/20 border-2 border-blue-500/40"
							: "bg-transparent"
						: "pointer-events-none"
				}`}
			/>
		</>
	);
}

function GapDropZone({ id, isDragging }: { id: string; isDragging: boolean }) {
	const { setNodeRef, isOver } = useDroppable({ id });

	if (!isDragging) {
		return null;
	}

	return (
		<div
			ref={setNodeRef}
			className={`h-2 -my-1 relative z-20 ${
				isOver ? "bg-blue-500/30" : "bg-transparent"
			}`}
		/>
	);
}

// ============================================================================
// Sortable Tab Component
// ============================================================================

interface SortableTabProps {
	tab: schema.Tab;
	id: string;
	windowId: number;
	isSelected: boolean;
	isPartOfDrag?: boolean;
	isDragging: boolean;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	onToggleCollapse: (tabId: number) => void;
	activeDropZone: string | null;
	depth: number;
	hasChildren: boolean;
	isLastChild: boolean;
	indentGuides: boolean[];
}

function SortableTab({
	tab,
	id,
	windowId,
	isSelected,
	isPartOfDrag,
	isDragging,
	onSelect,
	onToggleCollapse,
	activeDropZone,
	depth,
	hasChildren,
	isLastChild,
	indentGuides,
}: SortableTabProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		isDragging: isThisDragging,
	} = useSortable({
		id,
		animateLayoutChanges: () => false,
	});

	const style: React.CSSProperties = {
		opacity: isThisDragging || isPartOfDrag ? 0.3 : 1,
		transition: "none",
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className="relative"
		>
			<TabCard
				tab={tab}
				isSelected={isSelected}
				onSelect={onSelect}
				onToggleCollapse={onToggleCollapse}
				activeDropZone={activeDropZone}
				isDragging={isDragging}
				depth={depth}
				hasChildren={hasChildren}
				isLastChild={isLastChild}
				indentGuides={indentGuides}
			/>
			<TreeDropZone
				id={`drop-${windowId}-${tab.browserTabId}-top`}
				isDragging={isDragging}
				position="top"
				depth={depth}
			/>
			<TreeDropZone
				id={`drop-${windowId}-${tab.browserTabId}-bottom`}
				isDragging={isDragging}
				position="bottom"
				depth={depth}
			/>
		</div>
	);
}

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
}

export const WindowGroup = ({
	window: win,
	tabs,
	isCurrentWindow,
	isLastWindow,
	activeDropZone,
	selectedTabIds,
	setSelectedTabIds,
	lastSelectedTabId,
	setLastSelectedTabId,
	onToggleCollapse,
}: {
	window: schema.Window;
	tabs: schema.Tab[];
	isCurrentWindow: boolean;
	isLastWindow: boolean;
	activeDropZone: string | null;
	selectedTabIds: Set<number>;
	setSelectedTabIds: (ids: Set<number>) => void;
	lastSelectedTabId: number | undefined;
	setLastSelectedTabId: (id: number | undefined) => void;
	onToggleCollapse: (tabId: number) => void;
}) => {
	const { active } = useDndContext();
	const isDragging = active !== null;
	const [isCollapsed, setIsCollapsed] = useState(false);

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
	}));

	const selectedItems = items.filter((item) => selectedTabIds.has(item.tabId));

	const handleTabSelect = useCallback(
		(tabId: number, options: { ctrlKey: boolean; shiftKey: boolean }) => {
			if (options.shiftKey && lastSelectedTabId !== undefined) {
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
				const newSet = new Set(selectedTabIds);
				if (newSet.has(tabId)) {
					newSet.delete(tabId);
				} else {
					newSet.add(tabId);
				}
				setSelectedTabIds(newSet);
				setLastSelectedTabId(tabId);
			} else {
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

	const parseIndicator = useCallback(() => {
		if (!activeDropZone?.startsWith(`drop-${win.browserWindowId}-`)) {
			return null;
		}

		const parts = activeDropZone.split("-");
		if (parts[2] === "gap") {
			return { type: "gap" as const, slot: Number.parseInt(parts[3], 10) };
		}

		const tabId = Number.parseInt(parts[2], 10);
		const position = parts[3];
		const dropType = parts[4];

		const itemIndex = items.findIndex((item) => item.tabId === tabId);
		if (itemIndex === -1) return null;

		const item = items[itemIndex];

		if (dropType === "sibling") {
			return {
				type: "sibling" as const,
				index: position === "top" ? itemIndex : itemIndex + 1,
				depth: item.depth,
			};
		}
		return {
			type: "child" as const,
			index: position === "top" ? itemIndex : itemIndex + 1,
			depth: item.depth + 1,
		};
	}, [activeDropZone, win.browserWindowId, items]);

	const indicator = parseIndicator();

	const handleWindowClick = useCallback(() => {
		browser.windows.update(win.browserWindowId, { focused: true });
	}, [win.browserWindowId]);

	const handleToggleWindowCollapse = useCallback((e: React.MouseEvent) => {
		e.stopPropagation();
		setIsCollapsed((prev) => !prev);
	}, []);

	return (
		<div className="flex flex-col">
			{/* Window header as tree node */}
			<div className="flex items-stretch text-slate-300 dark:text-slate-600">
				{/* Tree lines for window */}
				{isLastWindow ? <TreeEnd /> : <TreeBranch />}
				{/* <TreeHorizontal /> */}
				{/* Window content */}
				{/* biome-ignore lint/a11y/useSemanticElements: div with role used for nested button */}
				<div
					className={cn(
						"flex-1 flex items-center gap-0 cursor-pointer",
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
						Window {win.browserWindowId}
						{isCurrentWindow && " (current)"}
					</span>
					<span className="text-xs text-slate-400 dark:text-slate-500">
						• {tabs.length} tabs
					</span>
				</div>
			</div>

			{/* Tabs as children */}
			{!isCollapsed && (
				<SortableContext
					items={items.map((i) => i.id)}
					strategy={verticalListSortingStrategy}
				>
					<div className="flex flex-col relative">
						<GapDropZone
							id={`drop-${win.browserWindowId}-gap-0`}
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

							const indicatorDepth =
								indicator?.type === "sibling" || indicator?.type === "child"
									? indicator.depth
									: 0;

							return (
								<div key={item.id} className="relative">
									{showIndicatorBefore && (
										<div
											className="absolute -top-1 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none"
											style={{
												left: `${indicatorDepth * 16}px`,
											}}
										/>
									)}
									<SortableTab
										id={item.id}
										windowId={win.browserWindowId}
										tab={item.tab}
										isSelected={isSelected}
										isPartOfDrag={isPartOfDrag}
										isDragging={isDragging}
										onSelect={handleTabSelect}
										onToggleCollapse={onToggleCollapse}
										activeDropZone={activeDropZone}
										depth={item.depth}
										hasChildren={item.hasChildren}
										isLastChild={item.isLastChild}
										indentGuides={item.indentGuides}
									/>
								</div>
							);
						})}
						{indicator &&
							((indicator.type === "gap" && indicator.slot === items.length) ||
								((indicator.type === "sibling" || indicator.type === "child") &&
									indicator.index === items.length)) && (
								<div
									className="absolute -bottom-1 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none"
									style={{
										left: `${(indicator.type === "sibling" || indicator.type === "child" ? indicator.depth : 0) * 16}px`,
									}}
								/>
							)}
						<GapDropZone
							id={`drop-${win.browserWindowId}-gap-${items.length}`}
							isDragging={isDragging}
						/>
					</div>
				</SortableContext>
			)}
		</div>
	);
};
