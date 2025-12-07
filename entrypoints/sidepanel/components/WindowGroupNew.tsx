import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useMemo } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { buildTabTree, type FlatTreeNode, flattenTree } from "../lib/tree";
import { TabCard } from "./TabCard";

// ============================================================================
// Drop Zone Components
// ============================================================================

// Droppable zone component for tree - split into sibling (left) and child (right) zones
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
	// Create two drop zones: sibling (left portion) and child (right portion)
	const siblingId = `${id}-sibling`;
	const childId = `${id}-child`;

	const { setNodeRef: setSiblingRef, isOver: isSiblingOver } = useDroppable({
		id: siblingId,
	});
	const { setNodeRef: setChildRef, isOver: isChildOver } = useDroppable({
		id: childId,
	});

	const positionClass = position === "top" ? "top-0" : "bottom-0";
	const indentWidth = depth * 20 + 24; // 20px per level + 24px for chevron area

	return (
		<>
			{/* Sibling drop zone - the left edge/indent area */}
			<div
				ref={setSiblingRef}
				style={{ width: `${indentWidth}px` }}
				className={`absolute ${positionClass} left-0 h-1/2 ${
					isDragging
						? isSiblingOver
							? "bg-green-500/30 border-2 border-green-500/50"
							: "bg-black/5 dark:bg-white/5"
						: "pointer-events-none"
				}`}
			/>
			{/* Child drop zone - the rest of the row */}
			<div
				ref={setChildRef}
				style={{ left: `${indentWidth}px` }}
				className={`absolute ${positionClass} right-0 h-1/2 ${
					isDragging
						? isChildOver
							? "bg-blue-500/30 border-2 border-blue-500/50"
							: "bg-black/5 dark:bg-white/5"
						: "pointer-events-none"
				}`}
			/>
		</>
	);
}

// Gap drop zone - sits between tabs or at edges
function GapDropZone({ id, isDragging }: { id: string; isDragging: boolean }) {
	const { setNodeRef, isOver } = useDroppable({ id });

	return (
		<div
			ref={setNodeRef}
			className={`h-2 -my-1 relative z-20 ${
				isDragging
					? isOver
						? "bg-blue-500/40"
						: "bg-black/5 dark:bg-white/5"
					: "pointer-events-none"
			}`}
		/>
	);
}

// ============================================================================
// Sortable Tab Component (Tree-aware)
// ============================================================================

interface SortableTabProps {
	tab: schema.Tab;
	id: string;
	windowId: number;
	tabIndex: number;
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
	indentGuides: boolean[];
}

function SortableTab({
	tab,
	id,
	windowId,
	tabIndex,
	isSelected,
	isPartOfDrag,
	isDragging,
	onSelect,
	onToggleCollapse,
	activeDropZone,
	depth,
	hasChildren,
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
				tabIndex={tabIndex}
				isSelected={isSelected}
				onSelect={onSelect}
				onToggleCollapse={onToggleCollapse}
				activeDropZone={activeDropZone}
				isDragging={isDragging}
				depth={depth}
				hasChildren={hasChildren}
				indentGuides={indentGuides}
			/>
			{/* Tree-aware drop zones - split into sibling (left) and child (right) */}
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
// Window Group Component
// ============================================================================

export interface WindowItem {
	id: string;
	tabId: number;
	windowId: number;
	tab: schema.Tab;
	depth: number;
	hasChildren: boolean;
	indentGuides: boolean[];
}

export const WindowGroup = ({
	window: win,
	tabs,
	isCurrentWindow,
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
	activeDropZone: string | null;
	selectedTabIds: Set<number>;
	setSelectedTabIds: (ids: Set<number>) => void;
	lastSelectedTabId: number | undefined;
	setLastSelectedTabId: (id: number | undefined) => void;
	onToggleCollapse: (tabId: number) => void;
}) => {
	const { active } = useDndContext();
	const isDragging = active !== null;

	// Build tree structure and flatten for rendering
	const flatNodes = useMemo(() => {
		const tree = buildTabTree(tabs);
		return flattenTree(tree);
	}, [tabs]);

	// Create stable IDs for sortable items (use flattened tree order)
	const items: WindowItem[] = flatNodes.map((node) => ({
		id: `tab-${win.browserWindowId}-${node.tab.browserTabId}`,
		tabId: node.tab.browserTabId,
		windowId: win.browserWindowId,
		tab: node.tab,
		depth: node.depth,
		hasChildren: node.hasChildren,
		indentGuides: node.indentGuides,
	}));

	// Get selected items for this window
	const selectedItems = items.filter((item) => selectedTabIds.has(item.tabId));

	const handleTabSelect = useCallback(
		(tabId: number, options: { ctrlKey: boolean; shiftKey: boolean }) => {
			if (options.shiftKey && lastSelectedTabId !== undefined) {
				// Range selection - use flat list order
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
				// Toggle selection
				const newSet = new Set(selectedTabIds);
				if (newSet.has(tabId)) {
					newSet.delete(tabId);
				} else {
					newSet.add(tabId);
				}
				setSelectedTabIds(newSet);
				setLastSelectedTabId(tabId);
			} else {
				// Single click - activate tab and focus window
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

	// Parse drop zone to determine indicator position
	// New format: "drop-{windowId}-{tabId}-{top|bottom}-{sibling|child}" or "drop-{windowId}-gap-{slot}"
	const parseIndicator = useCallback(() => {
		if (!activeDropZone?.startsWith(`drop-${win.browserWindowId}-`)) {
			return null;
		}

		const parts = activeDropZone.split("-");
		if (parts[2] === "gap") {
			return { type: "gap" as const, slot: Number.parseInt(parts[3], 10) };
		}

		const tabId = Number.parseInt(parts[2], 10);
		const position = parts[3]; // top or bottom
		const dropType = parts[4]; // sibling or child

		const itemIndex = items.findIndex((item) => item.tabId === tabId);
		if (itemIndex === -1) return null;

		const item = items[itemIndex];

		if (dropType === "sibling") {
			// Sibling: insert at same level
			return {
				type: "sibling" as const,
				index: position === "top" ? itemIndex : itemIndex + 1,
				depth: item.depth,
			};
		}
		// Child: insert as child (one level deeper)
		return {
			type: "child" as const,
			index: position === "top" ? itemIndex : itemIndex + 1,
			depth: item.depth + 1,
		};
	}, [activeDropZone, win.browserWindowId, items]);

	const indicator = parseIndicator();

	return (
		<div
			className={cn(
				"border rounded-lg p-3",
				isCurrentWindow
					? "border-blue-500/50 bg-blue-50/30 dark:bg-blue-900/10"
					: "border-zinc-200 dark:border-zinc-700",
				win.focused && "ring-2 ring-blue-500/30",
			)}
		>
			<div className="flex items-center gap-2 mb-2 text-sm text-zinc-500 dark:text-zinc-400">
				<span className="font-medium">
					Window {win.browserWindowId}
					{isCurrentWindow && " (current)"}
				</span>
				<span className="text-xs">• {tabs.length} tabs</span>
			</div>
			<SortableContext
				items={items.map((i) => i.id)}
				strategy={verticalListSortingStrategy}
			>
				<div className="flex flex-col gap-1 relative">
					{/* Gap before first tab */}
					<GapDropZone
						id={`drop-${win.browserWindowId}-gap-0`}
						isDragging={isDragging}
					/>
					{items.map((item, index) => {
						const isSelected = selectedTabIds.has(item.tabId);
						const isPartOfDrag =
							isDragging && selectedItems.some((si) => si.tabId === item.tabId);

						// Determine if indicator should show before this item
						const showIndicatorBefore =
							indicator &&
							((indicator.type === "gap" && indicator.slot === index) ||
								((indicator.type === "sibling" || indicator.type === "child") &&
									indicator.index === index));

						const indicatorDepth =
							indicator?.type === "sibling" || indicator?.type === "child"
								? indicator.depth
								: 0;

						return (
							<div key={item.id} className="relative">
								{/* Drop indicator line */}
								{showIndicatorBefore && (
									<div
										className="absolute -top-1 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none"
										style={{
											left: `${indicatorDepth * 20}px`,
										}}
									/>
								)}
								<SortableTab
									id={item.id}
									windowId={win.browserWindowId}
									tabIndex={index}
									tab={item.tab}
									isSelected={isSelected}
									isPartOfDrag={isPartOfDrag}
									isDragging={isDragging}
									onSelect={handleTabSelect}
									onToggleCollapse={onToggleCollapse}
									activeDropZone={activeDropZone}
									depth={item.depth}
									hasChildren={item.hasChildren}
									indentGuides={item.indentGuides}
								/>
							</div>
						);
					})}
					{/* Indicator after last tab */}
					{indicator &&
						((indicator.type === "gap" && indicator.slot === items.length) ||
							((indicator.type === "sibling" || indicator.type === "child") &&
								indicator.index === items.length)) && (
							<div
								className="absolute -bottom-1 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none"
								style={{
									left: `${(indicator.type === "sibling" || indicator.type === "child" ? indicator.depth : 0) * 20}px`,
								}}
							/>
						)}
					{/* Gap after last tab */}
					<GapDropZone
						id={`drop-${win.browserWindowId}-gap-${items.length}`}
						isDragging={isDragging}
					/>
				</div>
			</SortableContext>
		</div>
	);
};
