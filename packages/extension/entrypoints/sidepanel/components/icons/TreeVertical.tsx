import { cn } from "../../lib/cn";
import { MID_X, STROKE, TREE_H, TREE_W } from "./icon-constants";

// Vertical line (┃) - full height, with optional highlight
export const TreeVertical = ({ highlighted }: { highlighted?: boolean }) => (
	<svg
		width={TREE_W}
		height={TREE_H}
		className={cn("shrink-0", highlighted && "text-emerald-500")}
		aria-hidden="true"
	>
		{highlighted && (
			<rect
				x={0}
				y={0}
				width={TREE_W}
				height={TREE_H}
				fill="currentColor"
				fillOpacity={0.2}
			/>
		)}
		<line
			x1={MID_X}
			y1={0}
			x2={MID_X}
			y2={TREE_H}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
	</svg>
);
