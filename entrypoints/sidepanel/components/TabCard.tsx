import { type PrimitiveAtom, useAtomValue } from "jotai";
import {
	ChevronDown,
	ChevronsDown,
	ChevronsUp,
	ChevronUp,
	Puzzle,
	Volume2,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import type { TabAtomValue } from "../store/TabAtomValue";

export function TabCard({ tabAtom }: { tabAtom: PrimitiveAtom<TabAtomValue> }) {
	const { tab, windowAtom } = useAtomValue(tabAtom);
	const window = useAtomValue(windowAtom);
	const { id, audible, favIconUrl, title, url } = tab;

	const handleTabClick = useCallback(() => {
		if (id) {
			browser.tabs.update(id, { active: true });
		}
	}, [id]);

	const handleMoveUp = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (id !== undefined && tab.index !== undefined && tab.index > 0) {
				browser.tabs.move(id, { index: tab.index - 1 });
			}
		},
		[id, tab.index],
	);

	const handleMoveUp2 = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (id !== undefined && tab.index !== undefined && tab.index > 1) {
				browser.tabs.move(id, { index: tab.index - 2 });
			}
		},
		[id, tab.index],
	);

	const handleMoveDown = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (id !== undefined && tab.index !== undefined) {
				browser.tabs.move(id, { index: tab.index + 1 });
			}
		},
		[id, tab.index],
	);

	const handleMoveDown2 = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (id !== undefined && tab.index !== undefined) {
				browser.tabs.move(id, { index: tab.index + 2 });
			}
		},
		[id, tab.index],
	);

	// Filter out chrome-extension:// URLs since we can't load them due to cross-extension security
	const isExtensionUrl = useMemo(
		() => url?.startsWith("chrome-extension://"),
		[url],
	);
	const isLoadableFavicon = useMemo(
		() => favIconUrl && !favIconUrl.startsWith("chrome-extension://"),
		[favIconUrl],
	);

	return (
		<div
			className={`flex items-center gap-2 rounded-lg overflow-hidden ${
				tab.active
					? "bg-blue-500/15 dark:bg-blue-500/30 border-2 border-blue-500/50 dark:border-blue-500/60 shadow-[0_0_0_1px_rgba(59,130,246,0.1)] dark:shadow-[0_0_0_1px_rgba(59,130,246,0.2)]"
					: "bg-black/5 dark:bg-white/5"
			}`}
		>
			<button
				type="button"
				className="flex-1 min-w-0 flex items-center gap-3 p-3 bg-transparent border-none text-inherit cursor-pointer transition-colors hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-black/30 dark:focus-visible:outline-white/30 focus-visible:-outline-offset-2 text-left"
				onClick={handleTabClick}
			>
				<div className="shrink-0 w-4 h-4 flex items-center justify-center">
					{audible ? (
						<Volume2
							size={16}
							className="text-green-500 dark:text-green-400 animate-pulse"
						/>
					) : isLoadableFavicon ? (
						<img src={favIconUrl} alt="" className="w-4 h-4 object-contain" />
					) : isExtensionUrl ? (
						<Puzzle
							size={16}
							className="text-purple-500 dark:text-purple-400"
						/>
					) : (
						<div className="w-4 h-4 bg-black/10 dark:bg-white/10 rounded-sm" />
					)}
				</div>
				<div className="flex-1 min-w-0 flex flex-col gap-1">
					<div className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
						{title || "Untitled"}
					</div>
					{url && (
						<div className="text-xs text-black/50 dark:text-white/50 whitespace-nowrap overflow-hidden text-ellipsis">
							{new URL(url).hostname || url}
						</div>
					)}
				</div>
			</button>
			<div className="flex flex-row gap-1 p-2">
				<button
					type="button"
					className="flex items-center justify-center p-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-black/10 dark:hover:bg-white/15 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={handleMoveUp2}
					title="Move 2 up"
					disabled={tab.index === undefined || tab.index < 2}
				>
					<ChevronsUp size={14} />
				</button>
				<button
					type="button"
					className="flex items-center justify-center p-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-black/10 dark:hover:bg-white/15 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={handleMoveUp}
					title="Move up"
					disabled={tab.index === undefined || tab.index < 1}
				>
					<ChevronUp size={14} />
				</button>
				<button
					type="button"
					className="flex items-center justify-center p-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-black/10 dark:hover:bg-white/15 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={handleMoveDown}
					title="Move down"
					disabled={
						tab.index === undefined || tab.index >= window.tabAtoms.length - 1
					}
				>
					<ChevronDown size={14} />
				</button>
				<button
					type="button"
					className="flex items-center justify-center p-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded text-black/60 dark:text-white/70 cursor-pointer transition-all hover:bg-black/10 dark:hover:bg-white/15 hover:text-black/90 dark:hover:text-white/90 hover:border-black/20 dark:hover:border-white/20 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
					onClick={handleMoveDown2}
					title="Move 2 down"
					disabled={
						tab.index === undefined || tab.index >= window.tabAtoms.length - 2
					}
				>
					<ChevronsDown size={14} />
				</button>
			</div>
		</div>
	);
}
