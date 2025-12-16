import type * as schema from "@/schema/src/schema";

export const TabItemOverlay = ({ tab }: { tab: schema.Tab }) => {
	return (
		<div className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-zinc-800 rounded shadow-lg border border-zinc-200 dark:border-zinc-600">
			{tab.favIconUrl ? (
				<img src={tab.favIconUrl} alt="" className="w-4 h-4 shrink-0" />
			) : (
				<div className="w-4 h-4 shrink-0 bg-zinc-300 dark:bg-zinc-600 rounded" />
			)}
			<span className="truncate text-sm max-w-[200px]">
				{tab.title || tab.url}
			</span>
		</div>
	);
};
