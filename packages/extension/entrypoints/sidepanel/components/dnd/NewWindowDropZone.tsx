import { useDndContext, useDroppable } from "@dnd-kit/core";
import { cn } from "../../lib/cn";
import type { DropDataNewWindow } from "../../lib/dnd/dnd-types";

// ============================================================================
// New Window Drop Zone (at bottom of main container)
// ============================================================================
export function NewWindowDropZone() {
	const { active } = useDndContext();
	const isDragging = active !== null;

	const dropData: DropDataNewWindow = { type: "new-window" };
	const { setNodeRef, isOver } = useDroppable({
		id: "new-window-drop",
		data: dropData,
	});

	if (!isDragging) {
		return null;
	}

	return (
		<div
			ref={setNodeRef}
			data-testid="new-window-drop-zone"
			className={cn(
				"flex-1 min-h-24 flex items-center justify-center border-2 border-dashed rounded-lg transition-colors",
				isOver
					? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500",
			)}
		>
			<span className="text-sm font-medium">
				Drop here to create new window
			</span>
		</div>
	);
}
