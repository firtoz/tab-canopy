import { cn } from "../../lib/cn";
import { MID_X, MID_Y, STROKE, TREE_H, TREE_W } from "./icon-constants";

// Branch (┣) - vertical + horizontal right
export const TreeBranch = ({ highlighted }: { highlighted?: boolean }) => (
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
		<line
			x1={MID_X}
			y1={MID_Y}
			x2={TREE_W}
			y2={MID_Y}
			stroke="currentColor"
			strokeWidth={STROKE}
		/>
	</svg>
);
