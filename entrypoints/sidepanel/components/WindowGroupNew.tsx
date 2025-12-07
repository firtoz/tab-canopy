import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { TabCard } from "./TabCard";

// ============================================================================
// Drop Zone Components
// ============================================================================

// Droppable zone component - becomes visible when dragging
function DropZone({
	id,
	isDragging,
	position,
}: {
	id: string;
	isDragging: boolean;
	position: "top" | "bottom" | "full";
}) {
	const { setNodeRef, isOver } = useDroppable({ id });

	const positionClass =
		position === "top"
			? "top-0 h-1/2"
			: position === "bottom"
				? "bottom-0 h-1/2"
				: "inset-0";

	return (
		<div
			ref={setNodeRef}
			className={`absolute left-0 right-0 ${positionClass} ${
				isDragging
					? isOver
						? "bg-blue-500/30 border-2 border-blue-500/50"
						: "bg-black/5 dark:bg-white/5"
					: "pointer-events-none"
			}`}
		/>
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
// Sortable Tab Component
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
	activeDropZone: string | null;
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
	activeDropZone,
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
				activeDropZone={activeDropZone}
				isDragging={isDragging}
			/>
			{/* Top half drop zone - drop here = insert BEFORE this tab */}
			<DropZone
				id={`drop-${windowId}-${tabIndex}-top`}
				isDragging={isDragging}
				position="top"
			/>
			{/* Bottom half drop zone - drop here = insert AFTER this tab */}
			<DropZone
				id={`drop-${windowId}-${tabIndex}-bottom`}
				isDragging={isDragging}
				position="bottom"
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
}: {
	window: schema.Window;
	tabs: schema.Tab[];
	isCurrentWindow: boolean;
	activeDropZone: string | null;
	selectedTabIds: Set<number>;
	setSelectedTabIds: (ids: Set<number>) => void;
	lastSelectedTabId: number | undefined;
	setLastSelectedTabId: (id: number | undefined) => void;
}) => {
	const { active } = useDndContext();
	const isDragging = active !== null;

	// Create stable IDs for sortable items
	const items: WindowItem[] = tabs.map((tab) => ({
		id: `tab-${win.browserWindowId}-${tab.browserTabId}`,
		tabId: tab.browserTabId,
		windowId: win.browserWindowId,
		tab,
	}));

	// Get selected items for this window
	const selectedItems = items.filter((item) => selectedTabIds.has(item.tabId));

	const handleTabSelect = useCallback(
		(tabId: number, options: { ctrlKey: boolean; shiftKey: boolean }) => {
			if (options.shiftKey && lastSelectedTabId !== undefined) {
				// Range selection
				const lastIndex = tabs.findIndex(
					(t) => t.browserTabId === lastSelectedTabId,
				);
				const currentIndex = tabs.findIndex((t) => t.browserTabId === tabId);
				if (lastIndex !== -1 && currentIndex !== -1) {
					const startIdx = Math.min(lastIndex, currentIndex);
					const endIdx = Math.max(lastIndex, currentIndex);
					const newSelected = new Set(selectedTabIds);
					for (let i = startIdx; i <= endIdx; i++) {
						newSelected.add(tabs[i].browserTabId);
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
				const tab = tabs.find((t) => t.browserTabId === tabId);
				if (tab) {
					browser.tabs.update(tabId, { active: true });
					browser.windows.update(tab.browserWindowId, { focused: true });
				}
				setSelectedTabIds(new Set([tabId]));
				setLastSelectedTabId(tabId);
			}
		},
		[
			tabs,
			selectedTabIds,
			lastSelectedTabId,
			setSelectedTabIds,
			setLastSelectedTabId,
		],
	);

	// Determine which slot should show the indicator
	// activeDropZone format: "drop-{windowId}-{tabIndex}-{top|bottom}" or "drop-{windowId}-gap-{slot}"
	let indicatorSlot: number | null = null;
	if (activeDropZone?.startsWith(`drop-${win.browserWindowId}-`)) {
		const parts = activeDropZone.split("-");
		if (parts[2] === "gap") {
			indicatorSlot = Number.parseInt(parts[3], 10);
		} else {
			const tabIndex = Number.parseInt(parts[2], 10);
			const position = parts[3];
			// top = before this tab, bottom = after this tab
			indicatorSlot = position === "top" ? tabIndex : tabIndex + 1;
		}
	}

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

						return (
							<div key={item.id} className="relative">
								{/* Drop indicator line */}
								{indicatorSlot === index && (
									<div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none" />
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
									activeDropZone={activeDropZone}
								/>
							</div>
						);
					})}
					{/* Indicator after last tab */}
					{indicatorSlot === items.length && (
						<div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none" />
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
