import { cn } from "../../lib/cn";
import { TREE_H, TREE_W } from "./icon-constants";

// Empty space - with optional highlight for drop zones
export const TreeEmpty = ({ highlighted }: { highlighted?: boolean }) => (
	<div
		style={{ width: TREE_W, height: TREE_H }}
		className={cn("shrink-0", highlighted && "bg-emerald-500/20")}
	/>
);
