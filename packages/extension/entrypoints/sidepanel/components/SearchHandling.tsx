import { useEffect, useEffectEvent } from "react";
import { SearchInput } from "./SearchInput";
import { useSearch } from "./useSearch";

export const SearchHandling = () => {
	const searchOn = useSearch(({ on }) => on);
	const toggleSearch = useSearch(({ toggle }) => toggle);
	const triggerFocus = useSearch(({ triggerFocus }) => triggerFocus);

	const onKeyDown = useEffectEvent((event: DocumentEventMap["keydown"]) => {
		// console.log(event);
		if (event.key === "Control") {
			event.preventDefault();
			event.stopPropagation();
		}

		if (event.key.toLowerCase() === "f" && event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			// console.log("CTRL F!");

			if (searchOn) {
				// If search is already open, just focus the input
				triggerFocus();
			} else {
				// Otherwise, open the search
				toggleSearch(true);
			}
		}

		if (event.key === "Escape" && searchOn) {
			toggleSearch(false);
		}
	});

	useEffect(() => {
		const abortController = new AbortController();

		const signal = abortController.signal;
		document.addEventListener("keydown", onKeyDown, {
			signal,
		});

		return () => abortController.abort();
	}, []);

	if (!searchOn) {
		return null;
	}

	return <SearchInput />;
};
