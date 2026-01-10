import { Settings } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../lib/cn";
import { useSearch } from "./useSearch";

export const SearchInput = () => {
	const input = useSearch(({ input }) => input);
	const setInput = useSearch(({ setInput }) => setInput);
	const threshold = useSearch(({ threshold }) => threshold);
	const setThreshold = useSearch(({ setThreshold }) => setThreshold);
	const showOptions = useSearch(({ showOptions }) => showOptions);
	const toggleOptions = useSearch(({ toggleOptions }) => toggleOptions);
	const setInputRef = useSearch(({ setInputRef }) => setInputRef);

	const inputRef = useRef<HTMLInputElement>(null);

	// Register ref with store and focus on mount
	useEffect(() => {
		setInputRef(inputRef);
		inputRef.current?.focus();
	}, [setInputRef]);

	const onChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
		(event) => {
			setInput(event.target.value);
		},
		[setInput],
	);

	const onThresholdChange = useCallback<
		React.ChangeEventHandler<HTMLInputElement>
	>(
		(event) => {
			setThreshold(Number.parseFloat(event.target.value));
		},
		[setThreshold],
	);

	return (
		<div className="absolute top-2 right-2 w-1/2 px-2 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg shadow-lg z-50">
			<div className="flex items-center gap-2">
				<input
					className="bg-slate-50 dark:bg-slate-600 dark:text-amber-50 w-full p-2 rounded border border-slate-300 dark:border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
					ref={inputRef}
					value={input}
					onChange={onChange}
					placeholder="Search tabs..."
				/>
				<button
					type="button"
					onClick={toggleOptions}
					className={cn(
						"shrink-0 p-2 rounded transition-colors",
						showOptions
							? "bg-blue-500 text-white"
							: "bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-400 dark:hover:bg-slate-500",
					)}
					title="Search options"
				>
					<Settings size={18} />
				</button>
			</div>

			{showOptions && (
				<div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-600">
					<div className="space-y-2">
						<div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
							<span className="font-medium">Match Quality Threshold</span>
							<span className="font-mono bg-slate-300 dark:bg-slate-600 px-2 py-0.5 rounded">
								{threshold.toFixed(2)}
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={threshold}
							onChange={onThresholdChange}
							className="w-full h-2 bg-slate-300 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
						/>
						<div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
							<span>0.0 (Lenient)</span>
							<span>1.0 (Strict)</span>
						</div>
						<div className="text-xs text-slate-600 dark:text-slate-400 mt-2">
							<p>
								Higher values show fewer, more accurate matches. Lower values
								show more results with fuzzy matching.
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
