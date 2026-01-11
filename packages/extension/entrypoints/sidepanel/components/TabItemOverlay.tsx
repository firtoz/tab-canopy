import { Puzzle } from "lucide-react";
import type * as schema from "@/schema/src/schema";
import { useFaviconProxy } from "../lib/useFaviconProxy";

export const TabItemOverlay = ({ tab }: { tab: schema.Tab }) => {
	// Check if this is an internal browser page
	const isInternalPage =
		tab.favIconUrl?.startsWith("chrome://") ||
		tab.favIconUrl?.startsWith("chrome-extension://") ||
		tab.favIconUrl?.startsWith("moz-extension://") ||
		tab.favIconUrl?.startsWith("about:");

	const { dataUrl: proxiedFavicon, isLoading: faviconLoading } =
		useFaviconProxy(isInternalPage ? null : tab.favIconUrl);
	// Only use original URL if we're not actively loading (to avoid CORS errors)
	const faviconToDisplay =
		proxiedFavicon || (!faviconLoading ? tab.favIconUrl : null);

	return (
		<div className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-zinc-800 rounded shadow-lg border border-zinc-200 dark:border-zinc-600">
			{isInternalPage ? (
				<Puzzle size={16} className="text-indigo-400 dark:text-indigo-400" />
			) : faviconToDisplay ? (
				<img
					src={faviconToDisplay ?? undefined}
					alt=""
					className="w-4 h-4 shrink-0"
				/>
			) : (
				<div className="w-4 h-4 shrink-0 bg-zinc-300 dark:bg-zinc-600 rounded" />
			)}
			<span className="truncate text-sm max-w-[200px]">
				{tab.title || tab.url}
			</span>
		</div>
	);
};
