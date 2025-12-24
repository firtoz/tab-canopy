import {
	type CollisionDetection,
	pointerWithin,
	rectIntersection,
} from "@dnd-kit/core";
import { isDropData } from "../../lib/dnd/dnd-types";

// Custom collision detection that prioritizes drop zones and uses pointer position
export const dropZoneCollision: CollisionDetection = (args) => {
	// First, try pointerWithin to find droppables containing the pointer
	const pointerCollisions = pointerWithin(args);

	// Filter to only drop zones (those with DropData)
	const dropZoneCollisions = pointerCollisions.filter((collision) => {
		const container = args.droppableContainers.find(
			(c) => c.id === collision.id,
		);
		return container && isDropData(container.data?.current);
	});

	if (dropZoneCollisions.length > 0) {
		return dropZoneCollisions;
	}

	// Fallback to rectIntersection if pointer isn't within any drop zone
	const rectCollisions = rectIntersection(args);
	return rectCollisions.filter((collision) => {
		const container = args.droppableContainers.find(
			(c) => c.id === collision.id,
		);
		return container && isDropData(container.data?.current);
	});
};
