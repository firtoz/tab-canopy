import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useDrizzleIndexedDB } from "@firtoz/drizzle-indexeddb";
import { useLiveQuery } from "@tanstack/react-db";
import { Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type * as schema from "@/schema/src/schema";
import { cn } from "../lib/cn";
import { calculateSequentialMoves, type ReorderPosition } from "../lib/reorder";
import { TabItemOverlay } from "./TabItemOverlay";
import { WindowGroup } from "./WindowGroupNew";

const DB_NAME = "tabcanopy.db";

// Custom collision detection that prioritizes drop zones and uses pointer position
const dropZoneCollision: CollisionDetection = (args) => {
	// First, try pointerWithin to find droppables containing the pointer
	const pointerCollisions = pointerWithin(args);

	// Filter to only drop zones
	const dropZoneCollisions = pointerCollisions.filter((collision) =>
		(collision.id as string).startsWith("drop-"),
	);

	if (dropZoneCollisions.length > 0) {
		return dropZoneCollisions;
	}

	// Fallback to rectIntersection if pointer isn't within any drop zone
	const rectCollisions = rectIntersection(args);
	return rectCollisions.filter((collision) =>
		(collision.id as string).startsWith("drop-"),
	);
};

// ============================================================================
// Inner App Component (uses collections)
// ============================================================================
export const TabManagerContent = () => {
	const { useCollection } = useDrizzleIndexedDB<typeof schema>();
	const windowCollection = useCollection("windowTable");
	const tabCollection = useCollection("tabTable");

	// Reactive queries for windows and tabs
	const { data: windows, isLoading: windowsLoading } = useLiveQuery((q) =>
		q.from({ window: windowCollection }),
	);

	const { data: tabs, isLoading: tabsLoading } = useLiveQuery((q) =>
		q.from({ tab: tabCollection }),
	);

	const [currentWindowId, setCurrentWindowId] = useState<number | undefined>();
	const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set());
	const [lastSelectedTabId, setLastSelectedTabId] = useState<
		number | undefined
	>();
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeDropZone, setActiveDropZone] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Get current window ID
	useEffect(() => {
		browser.windows.getCurrent().then((win) => {
			setCurrentWindowId(win.id);
		});
	}, []);

	// Group tabs by window
	const windowsWithTabs = useMemo(() => {
		if (!windows || !tabs) return [];

		return windows.map((win) => ({
			window: win,
			tabs: tabs
				.filter((tab) => tab.browserWindowId === win.browserWindowId)
				.sort((a, b) => a.tabIndex - b.tabIndex),
		}));
	}, [windows, tabs]);

	// Get all tab items for drag operations
	const getAllItems = useCallback(() => {
		if (!tabs) return [];
		return tabs.map((tab) => ({
			id: `tab-${tab.browserWindowId}-${tab.browserTabId}`,
			tabId: tab.browserTabId,
			windowId: tab.browserWindowId,
			tab,
		}));
	}, [tabs]);

	const handleOpenSettings = useCallback(() => {
		const isFirefox = navigator.userAgent.includes("Firefox");
		if (isFirefox) {
			browser.tabs.create({
				url: "https://support.mozilla.org/en-US/kb/customize-firefox-sidebars",
			});
		} else {
			browser.tabs.create({ url: "chrome://settings/?search=side+panel" });
		}
	}, []);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			setActiveId(event.active.id as string);
			setActiveDropZone(null);

			const parts = (event.active.id as string).split("-");
			const draggedTabId = Number.parseInt(parts[parts.length - 1], 10);
			if (!selectedTabIds.has(draggedTabId)) {
				setSelectedTabIds(new Set([draggedTabId]));
			}
		},
		[selectedTabIds],
	);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		const overIdStr = event.over?.id as string | undefined;
		if (overIdStr?.startsWith("drop-")) {
			setActiveDropZone(overIdStr);
		} else {
			setActiveDropZone(null);
		}
	}, []);

	const handleDragCancel = useCallback(() => {
		setActiveId(null);
		setActiveDropZone(null);
	}, []);

	const parseDropZone = useCallback(
		(dropZoneId: string): { windowId: number; slot: number } | null => {
			const parts = dropZoneId.split("-");
			if (parts[0] !== "drop") return null;

			const windowId = Number.parseInt(parts[1], 10);
			if (parts[2] === "gap") {
				return { windowId, slot: Number.parseInt(parts[3], 10) };
			}
			const tabIndex = Number.parseInt(parts[2], 10);
			const position = parts[3];
			return { windowId, slot: position === "top" ? tabIndex : tabIndex + 1 };
		},
		[],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const dropZone = activeDropZone;
			setActiveId(null);
			setActiveDropZone(null);

			if (!dropZone) return;

			const parsed = parseDropZone(dropZone);
			if (!parsed) return;

			const { windowId: targetWindowId, slot: targetSlot } = parsed;
			const allItems = getAllItems();
			const activeItem = allItems.find((item) => item.id === event.active.id);
			if (!activeItem) return;

			const activeTabId = activeItem.tabId;
			const draggedTabIds =
				activeTabId && selectedTabIds.has(activeTabId)
					? Array.from(selectedTabIds)
					: activeTabId
						? [activeTabId]
						: [];

			if (draggedTabIds.length === 0) return;

			// Get target window's current tabs
			const windowItems = allItems.filter((i) => i.windowId === targetWindowId);
			const windowTabIds = windowItems.map((i) => i.tabId);

			const selectedSet = new Set(draggedTabIds);
			const selectedFromTarget = draggedTabIds.filter((id) =>
				windowTabIds.includes(id),
			);
			const selectedFromOther = draggedTabIds.filter(
				(id) => !windowTabIds.includes(id),
			);

			if (selectedFromOther.length === 0) {
				// Same window reorder
				let reorderPosition: ReorderPosition;
				if (targetSlot === 0) {
					reorderPosition = "start";
				} else if (targetSlot >= windowTabIds.length) {
					reorderPosition = "end";
				} else {
					reorderPosition = { before: targetSlot };
				}

				const operations = calculateSequentialMoves(
					windowTabIds,
					draggedTabIds,
					reorderPosition,
				);

				for (const op of operations) {
					browser.tabs.move(op.tabId, { index: op.toIndex });
				}
			} else {
				// Cross-window move
				const selectedIndicesBefore = windowTabIds
					.slice(0, targetSlot)
					.filter((id) => selectedSet.has(id)).length;
				const adjustedSlot = targetSlot - selectedIndicesBefore;

				const nonSelected = windowTabIds.filter((id) => !selectedSet.has(id));
				const sameWindowFinal = [
					...nonSelected.slice(0, adjustedSlot),
					...selectedFromTarget,
					...nonSelected.slice(adjustedSlot),
				];

				if (selectedFromTarget.length > 0) {
					const firstTargetIndex = sameWindowFinal.indexOf(
						selectedFromTarget[0],
					);
					let reorderPosition: ReorderPosition;
					if (firstTargetIndex === 0) {
						reorderPosition = "start";
					} else if (firstTargetIndex >= windowTabIds.length) {
						reorderPosition = "end";
					} else {
						reorderPosition = { before: firstTargetIndex };
					}

					const operations = calculateSequentialMoves(
						windowTabIds,
						selectedFromTarget,
						reorderPosition,
					);
					for (const op of operations) {
						browser.tabs.move(op.tabId, { index: op.toIndex });
					}
				}

				for (let i = 0; i < selectedFromOther.length; i++) {
					const tabId = selectedFromOther[i];
					const positionInSelection = draggedTabIds.indexOf(tabId);
					const sameWindowBefore = draggedTabIds
						.slice(0, positionInSelection)
						.filter((id) => selectedFromTarget.includes(id)).length;
					const targetIndex = adjustedSlot + sameWindowBefore + i;

					browser.tabs.move(tabId, {
						windowId: targetWindowId,
						index: targetIndex,
					});
				}
			}
		},
		[getAllItems, selectedTabIds, activeDropZone, parseDropZone],
	);

	// Find active item for drag overlay
	const allItems = getAllItems();
	const activeItem = activeId
		? allItems.find((item) => item.id === activeId)
		: null;

	const selectedItems =
		activeItem && selectedTabIds.has(activeItem.tabId)
			? allItems.filter((item) => selectedTabIds.has(item.tabId))
			: activeItem
				? [activeItem]
				: [];

	if (windowsLoading || tabsLoading) {
		return <div className="p-4 text-center text-zinc-500">Loading tabs...</div>;
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={dropZoneCollision}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div
				className={cn(
					"p-4 max-w-full min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white/90",
				)}
			>
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-2xl font-semibold m-0">Tab Canopy</h1>
					<button
						type="button"
						className={cn(
							"flex items-center justify-center p-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md text-black/60 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/10 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-95",
							{ "cursor-pointer": !activeId },
						)}
						onClick={handleOpenSettings}
						title="Change side panel position"
					>
						<Settings size={18} />
					</button>
				</div>
				<div className="flex flex-col gap-6">
					{windowsWithTabs.map(({ window: win, tabs: windowTabs }) => (
						<WindowGroup
							key={win.id}
							window={win}
							tabs={windowTabs}
							isCurrentWindow={
								currentWindowId !== undefined &&
								win.browserWindowId === currentWindowId
							}
							activeDropZone={activeDropZone}
							selectedTabIds={selectedTabIds}
							setSelectedTabIds={setSelectedTabIds}
							lastSelectedTabId={lastSelectedTabId}
							setLastSelectedTabId={setLastSelectedTabId}
						/>
					))}
				</div>
			</div>
			<DragOverlay dropAnimation={null}>
				{activeId && selectedItems.length > 0 && (
					<div className="flex flex-col gap-2 cursor-grabbing">
						{selectedItems.map((item) => (
							<TabItemOverlay key={item.id} tab={item.tab} />
						))}
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
};
