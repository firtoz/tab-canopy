import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { type PrimitiveAtom, useAtom, useAtomValue, useStore } from "jotai";
import { Eye, Monitor, X } from "lucide-react";
import { useCallback, useState } from "react";
import { selectedTabIdsAtom } from "../App";
import { calculateSequentialMoves, hoverToPosition } from "../lib/reorder";
import type { TabAtomValue } from "../store/TabAtomValue";
import type { WindowData } from "../store/WindowData";
import { TabCard } from "./TabCard";

interface SortableTabProps {
	tabAtom: PrimitiveAtom<TabAtomValue>;
	id: string;
	isSelected: boolean;
	isDragOverlay?: boolean;
	isPartOfDrag?: boolean; // True if this item is being dragged (part of selection)
	showDropIndicator?: "above" | "below" | null;
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	lastSelectedTabId: number | undefined;
}

function SortableTab({
	tabAtom,
	id,
	isSelected,
	isDragOverlay,
	isPartOfDrag,
	showDropIndicator,
	onSelect,
	lastSelectedTabId,
}: SortableTabProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useSortable({
		id,
		animateLayoutChanges: () => false,
	});

	// No animations - dim items being dragged (overlay shows them)
	const style: React.CSSProperties = {
		cursor: "grab",
		opacity: isDragging || isPartOfDrag ? 0.3 : 1,
		transition: "none", // Prevent any animation on drop
	};

	if (isDragOverlay) {
		return (
			<TabCard
				tabAtom={tabAtom}
				isSelected={isSelected}
				onSelect={onSelect}
				lastSelectedTabId={lastSelectedTabId}
			/>
		);
	}

	return (
		<div className="relative" style={{ transition: "none" }}>
			{/* Drop indicator line */}
			{showDropIndicator === "above" && (
				<div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
			)}
			<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
				<TabCard
					tabAtom={tabAtom}
					isSelected={isSelected}
					onSelect={onSelect}
					lastSelectedTabId={lastSelectedTabId}
				/>
			</div>
			{showDropIndicator === "below" && (
				<div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
			)}
		</div>
	);
}

export function WindowGroup({
	windowAtom,
	isCurrentWindow,
}: {
	windowAtom: PrimitiveAtom<WindowData>;
	isCurrentWindow: boolean;
}) {
	const window = useAtomValue(windowAtom);
	const store = useStore();
	const [selectedTabIds, setSelectedTabIds] = useAtom(selectedTabIdsAtom);
	const [lastSelectedTabId, setLastSelectedTabId] = useState<
		number | undefined
	>();
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);

	// Create stable IDs for sortable items
	const items = window.tabAtoms.map((atom) => {
		const data = store.get(atom);
		return {
			id: `tab-${data.tab.id}`,
			tabId: data.tab.id,
			atom,
		};
	});

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleTabSelect = useCallback(
		(tabId: number, options: { ctrlKey: boolean; shiftKey: boolean }) => {
			if (options.shiftKey && lastSelectedTabId !== undefined) {
				// Shift+Click: Select range
				const lastIndex = window.tabAtoms.findIndex((atom) => {
					const tabData = store.get(atom);
					return tabData.tab.id === lastSelectedTabId;
				});
				const currentIndex = window.tabAtoms.findIndex((atom) => {
					const tabData = store.get(atom);
					return tabData.tab.id === tabId;
				});

				if (lastIndex !== -1 && currentIndex !== -1) {
					const start = Math.min(lastIndex, currentIndex);
					const end = Math.max(lastIndex, currentIndex);
					const newSelected = new Set(selectedTabIds);

					for (let i = start; i <= end; i++) {
						const atom = window.tabAtoms[i];
						if (atom) {
							const tabData = store.get(atom);
							if (tabData.tab.id) {
								newSelected.add(tabData.tab.id);
							}
						}
					}

					setSelectedTabIds(newSelected);
				}
			} else if (options.ctrlKey) {
				// Ctrl/Cmd+Click: Toggle selection
				const newSelected = new Set(selectedTabIds);
				if (newSelected.has(tabId)) {
					newSelected.delete(tabId);
				} else {
					newSelected.add(tabId);
				}
				setSelectedTabIds(newSelected);
				setLastSelectedTabId(tabId);
			} else {
				// Regular click: Clear selection
				setSelectedTabIds(new Set());
				setLastSelectedTabId(undefined);
			}
		},
		[
			window.tabAtoms,
			store,
			selectedTabIds,
			setSelectedTabIds,
			lastSelectedTabId,
		],
	);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const { active } = event;
			setActiveId(active.id as string);
			setOverId(null);

			// If dragging a non-selected item, auto-select it
			const draggedTabId = Number.parseInt(
				(active.id as string).replace("tab-", ""),
				10,
			);
			if (!selectedTabIds.has(draggedTabId)) {
				setSelectedTabIds(new Set([draggedTabId]));
				setLastSelectedTabId(draggedTabId);
			}
		},
		[selectedTabIds, setSelectedTabIds],
	);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		const { over } = event;
		setOverId(over?.id as string | null);
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			setActiveId(null);
			setOverId(null);

			if (!over || active.id === over.id) return;

			// Get indices
			const activeIndex = items.findIndex((item) => item.id === active.id);
			const overIndex = items.findIndex((item) => item.id === over.id);

			if (activeIndex === -1 || overIndex === -1) return;

			// Get all tab IDs in current order
			const allTabIds = items
				.map((item) => item.tabId)
				.filter((id): id is number => id !== undefined);

			// Get the IDs being dragged (either selected or just the active one)
			const activeTabId = items[activeIndex]?.tabId;
			const draggedTabIds =
				activeTabId && selectedTabIds.has(activeTabId)
					? Array.from(selectedTabIds)
					: activeTabId
						? [activeTabId]
						: [];

			if (draggedTabIds.length === 0) return;

			// Determine if dropping above or below based on direction
			const position = activeIndex < overIndex ? "below" : "above";
			const reorderPosition = hoverToPosition(overIndex, position);

			// Calculate sequential moves (one tab at a time to avoid browser API issues)
			const operations = calculateSequentialMoves(
				allTabIds,
				draggedTabIds,
				reorderPosition,
			);

			console.log("[handleDragEnd]", {
				activeIndex,
				overIndex,
				position,
				draggedTabIds,
				operations,
			});

			// Execute moves sequentially
			for (const op of operations) {
				browser.tabs.move(op.tabId, { index: op.toIndex });
			}
		},
		[items, selectedTabIds],
	);

	const handleCloseWindow = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			browser.windows.remove(window.windowId);
		},
		[window.windowId],
	);

	// Find active item for drag overlay
	const activeItem = activeId
		? items.find((item) => item.id === activeId)
		: null;

	// Get all selected items for overlay when dragging multiple
	const selectedItems =
		activeItem && selectedTabIds.has(activeItem.tabId ?? -1)
			? items.filter((item) => item.tabId && selectedTabIds.has(item.tabId))
			: activeItem
				? [activeItem]
				: [];

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 px-1">
				<div className="text-sm font-semibold text-black/50 dark:text-white/60 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap">
					Window {window.windowId} ({window.tabAtoms.length} tabs)
				</div>
				<div className="flex items-center gap-1 flex-1">
					{window.focused && (
						<div
							className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium"
							title="This window is focused"
						>
							<Eye size={12} />
							<span>Focused</span>
						</div>
					)}
					{isCurrentWindow && (
						<div
							className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium"
							title="This side panel is attached to this window"
						>
							<Monitor size={12} />
							<span>Current</span>
						</div>
					)}
				</div>
				<button
					type="button"
					className="flex items-center justify-center p-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/20 dark:hover:border-red-500/20 active:scale-90"
					onClick={handleCloseWindow}
					title="Close window"
				>
					<X size={14} />
				</button>
			</div>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={items.map((i) => i.id)}
					strategy={verticalListSortingStrategy}
				>
					<div className="flex flex-col gap-2">
						{items.map((item, index) => {
							const isSelected =
								item.tabId !== undefined && selectedTabIds.has(item.tabId);
							// Check if this item is part of the current drag operation
							const isPartOfDrag =
								activeId !== null &&
								item.tabId !== undefined &&
								selectedItems.some((si) => si.tabId === item.tabId);

							// Show drop indicator on the item being hovered
							let showDropIndicator: "above" | "below" | null = null;
							if (overId === item.id && activeId && activeId !== item.id) {
								const activeIndex = items.findIndex((i) => i.id === activeId);
								// Show above or below based on drag direction
								showDropIndicator = activeIndex < index ? "below" : "above";
							}

							return (
								<SortableTab
									key={item.id}
									id={item.id}
									tabAtom={item.atom}
									isSelected={isSelected}
									isPartOfDrag={isPartOfDrag}
									showDropIndicator={showDropIndicator}
									onSelect={handleTabSelect}
									lastSelectedTabId={lastSelectedTabId}
								/>
							);
						})}
					</div>
				</SortableContext>
				<DragOverlay dropAnimation={null}>
					{activeId && selectedItems.length > 0 && (
						<div className="flex flex-col gap-2">
							{selectedItems.map((item) => (
								<SortableTab
									key={item.id}
									id={item.id}
									tabAtom={item.atom}
									isSelected={true}
									isDragOverlay={true}
									onSelect={() => {}}
									lastSelectedTabId={undefined}
								/>
							))}
						</div>
					)}
				</DragOverlay>
			</DndContext>
		</div>
	);
}
