import {
	BOX_OFFSET,
	BOX_SIZE,
	BOX_Y,
	ICON_SIZE,
	MID_Y,
	STROKE,
	TREE_H,
} from "./icon-constants";

// [-] Leaf node - horizontal dash in box
export const IconLeaf = () => (
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
		<line
			x1={BOX_OFFSET + 6}
			y1={MID_Y}
			x2={ICON_SIZE - BOX_OFFSET - 6}
			y2={MID_Y}
			stroke="currentColor"
			strokeWidth={STROKE}
			strokeLinecap="round"
		/>
	</svg>
);
