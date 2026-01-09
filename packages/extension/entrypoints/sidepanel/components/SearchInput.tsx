import { useEffect, useRef } from "react";
import { useSearch } from "./useSearch";

export const SearchInput = () => {
	const input = useSearch(({ input }) => input);
	const setInput = useSearch(({ setInput }) => setInput);

	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const input = inputRef.current;

		if (!input) {
			return;
		}

		input.focus();
	}, []);

	const onChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
		(event) => {
			setInput(event.target.value);
		},
		[],
	);

	return (
		<div className="absolute top-0 right-0 w-1/2 px-2 py-2 bg-slate-200 z-50">
			<input
				className="bg-white w-full p-2"
				ref={inputRef}
				value={input}
				onChange={onChange}
			/>
		</div>
	);
};
