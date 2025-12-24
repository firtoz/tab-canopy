import {
	BOX_OFFSET,
	BOX_SIZE,
	BOX_Y,
	ICON_MID,
	ICON_SIZE,
	MID_Y,
	STROKE,
	TREE_H,
} from "./icon-constants";

// [>] Collapsed - rightward chevron in box
export const IconCollapsed = () => (
	<svg
		width={ICON_SIZE}
		height={TREE_H}
		className="shrink-0"
		aria-hidden="true"
	>
		<rect
			x={BOX_OFFSET}
			y={BOX_Y}
			width={BOX_SIZE}
			height={BOX_SIZE}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			rx={2}
		/>
		<polyline
			points={`${ICON_MID - 2},${MID_Y - 3} ${ICON_MID + 3},${MID_Y} ${ICON_MID - 2},${MID_Y + 3}`}
			fill="none"
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);
