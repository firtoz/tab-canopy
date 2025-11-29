import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { type PrimitiveAtom, useAtom, useAtomValue, useStore } from "jotai";
import { Eye, Monitor, X } from "lucide-react";
import { useCallback, useState } from "react";
import { selectedTabIdsAtom } from "../App";
import { cn } from "../lib/cn";
import type { TabAtomValue } from "../store/TabAtomValue";
import type { WindowData } from "../store/WindowData";
import { TabCard } from "./TabCard";

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

interface SortableTabProps {
	tabAtom: PrimitiveAtom<TabAtomValue>;
	id: string;
	windowId: number;
	tabIndex: number;
	isSelected: boolean;
	isDragOverlay?: boolean;
	isPartOfDrag?: boolean;
	isDragging: boolean; // Global dragging state
	onSelect: (
		tabId: number,
		options: { ctrlKey: boolean; shiftKey: boolean },
	) => void;
	lastSelectedTabId: number | undefined;
}

export function SortableTab({
	tabAtom,
	id,
	windowId,
	tabIndex,
	isSelected,
	isDragOverlay,
	isPartOfDrag,
	isDragging,
	onSelect,
	lastSelectedTabId,
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

	if (isDragOverlay) {
		return (
			<TabCard
				tabAtom={tabAtom}
				isSelected={isSelected}
				isDragging={true}
				onSelect={onSelect}
				lastSelectedTabId={lastSelectedTabId}
			/>
		);
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className="relative"
		>
			<TabCard
				tabAtom={tabAtom}
				isSelected={isSelected}
				isDragging={isDragging}
				onSelect={onSelect}
				lastSelectedTabId={lastSelectedTabId}
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

export interface WindowItem {
	id: string;
	tabId: number | undefined;
	atom: PrimitiveAtom<TabAtomValue>;
	windowId: number;
}

export function WindowGroup({
	windowAtom,
	isCurrentWindow,
	activeDropZone,
}: {
	windowAtom: PrimitiveAtom<WindowData>;
	isCurrentWindow: boolean;
	activeDropZone: string | null;
}) {
	const window = useAtomValue(windowAtom);
	const store = useStore();
	const [selectedTabIds, setSelectedTabIds] = useAtom(selectedTabIdsAtom);
	const [lastSelectedTabId, setLastSelectedTabId] = useState<
		number | undefined
	>();

	const { active } = useDndContext();

	const isDragging = active !== null;

	// Create stable IDs for sortable items - filter out any invalid atoms
	const items: WindowItem[] = window.tabAtoms
		.filter((atom) => atom !== undefined && atom !== null)
		.map((atom) => {
			const data = store.get(atom);
			return {
				id: `tab-${window.windowId}-${data.tab.id}`,
				tabId: data.tab.id,
				atom,
				windowId: window.windowId,
			};
		});

	const handleTabSelect = useCallback(
		(tabId: number, options: { ctrlKey: boolean; shiftKey: boolean }) => {
			if (options.shiftKey && lastSelectedTabId !== undefined) {
				const validAtoms = window.tabAtoms.filter((a) => a != null);
				const lastIndex = validAtoms.findIndex((atom) => {
					const tabData = store.get(atom);
					return tabData.tab.id === lastSelectedTabId;
				});
				const currentIndex = validAtoms.findIndex((atom) => {
					const tabData = store.get(atom);
					return tabData.tab.id === tabId;
				});

				if (lastIndex !== -1 && currentIndex !== -1) {
					const start = Math.min(lastIndex, currentIndex);
					const end = Math.max(lastIndex, currentIndex);
					const newSelected = new Set(selectedTabIds);

					for (let i = start; i <= end; i++) {
						const atom = validAtoms[i];
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
				const newSelected = new Set(selectedTabIds);

				// If nothing is selected yet, also add the currently active tab
				if (newSelected.size === 0) {
					const validAtomsForCtrl = window.tabAtoms.filter((a) => a != null);
					const activeTab = validAtomsForCtrl.find((atom) => {
						const tabData = store.get(atom);
						return tabData.tab.active;
					});
					if (activeTab) {
						const activeTabId = store.get(activeTab).tab.id;
						if (activeTabId && activeTabId !== tabId) {
							newSelected.add(activeTabId);
						}
					}
				}

				if (newSelected.has(tabId)) {
					newSelected.delete(tabId);
				} else {
					newSelected.add(tabId);
				}
				setSelectedTabIds(newSelected);
				setLastSelectedTabId(tabId);
			} else {
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

	const handleCloseWindow = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			browser.windows.remove(window.windowId);
		},
		[window.windowId],
	);

	// Get selected items for this window
	const selectedItems = items.filter(
		(item) => item.tabId && selectedTabIds.has(item.tabId),
	);

	// Determine which slot should show the indicator
	// activeDropZone format: "drop-{windowId}-{tabIndex}-{top|bottom}"
	let indicatorSlot: number | null = null;
	if (activeDropZone?.startsWith(`drop-${window.windowId}-`)) {
		const parts = activeDropZone.split("-");
		const tabIndex = Number.parseInt(parts[2], 10);
		const position = parts[3];
		// top = before this tab, bottom = after this tab
		indicatorSlot = position === "top" ? tabIndex : tabIndex + 1;
	}

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
					className={cn(
						"flex items-center justify-center p-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 transition-all hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/20 dark:hover:border-red-500/20 active:scale-90",
						{ "cursor-pointer": !isDragging },
					)}
					onClick={handleCloseWindow}
					title="Close window"
				>
					<X size={14} />
				</button>
			</div>
			<SortableContext
				items={items.map((i) => i.id)}
				strategy={verticalListSortingStrategy}
			>
				<div className="flex flex-col gap-2 relative">
					{/* Gap before first tab */}
					<GapDropZone
						id={`drop-${window.windowId}-gap-0`}
						isDragging={isDragging}
					/>
					{items.map((item, index) => {
						const isSelected =
							item.tabId !== undefined && selectedTabIds.has(item.tabId);
						const isPartOfDrag =
							isDragging &&
							item.tabId !== undefined &&
							selectedItems.some((si) => si.tabId === item.tabId);

						return (
							<div key={item.id} className="relative">
								{/* Drop indicator line */}
								{indicatorSlot === index && (
									<div className="absolute -top-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none" />
								)}
								<SortableTab
									id={item.id}
									windowId={window.windowId}
									tabIndex={index}
									tabAtom={item.atom}
									isSelected={isSelected}
									isPartOfDrag={isPartOfDrag}
									isDragging={isDragging}
									onSelect={handleTabSelect}
									lastSelectedTabId={lastSelectedTabId}
								/>
								{/* Gap after this tab */}
								<div className="h-0" /> {/* Spacer for gap positioning */}
							</div>
						);
					})}
					{/* Indicator after last tab */}
					{indicatorSlot === items.length && (
						<div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-30 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none" />
					)}
					{/* Gap after last tab */}
					<GapDropZone
						id={`drop-${window.windowId}-gap-${items.length}`}
						isDragging={isDragging}
					/>
				</div>
			</SortableContext>
		</div>
	);
}
