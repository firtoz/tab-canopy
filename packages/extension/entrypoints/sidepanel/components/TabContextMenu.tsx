import * as ContextMenu from "@radix-ui/react-context-menu";

interface TabContextMenuProps {
	hasChildren: boolean;
	isCollapsed: boolean;
	onRename: () => void;
	onToggleCollapse: () => void;
	onClose: () => void;
	onNewTab: () => void;
}

export const TabContextMenu = ({
	hasChildren,
	isCollapsed,
	onRename,
	onToggleCollapse,
	onClose,
	onNewTab,
}: TabContextMenuProps) => {
	return (
		<ContextMenu.Portal>
			<ContextMenu.Content className="min-w-[180px] bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 p-1 z-50">
				<ContextMenu.Item
					className="text-xs px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
					onSelect={onNewTab}
				>
					New Tab
				</ContextMenu.Item>
				<ContextMenu.Separator className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
				<ContextMenu.Item
					className="text-xs px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
					onSelect={onRename}
				>
					Rename Tab
				</ContextMenu.Item>
				{hasChildren && (
					<ContextMenu.Item
						className="text-xs px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
						onSelect={onToggleCollapse}
					>
						{isCollapsed ? "Expand" : "Collapse"}
					</ContextMenu.Item>
				)}
				<ContextMenu.Separator className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
				<ContextMenu.Item
					className="text-xs px-2 py-1.5 rounded cursor-pointer outline-none hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
					onSelect={onClose}
				>
					Close Tab
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Portal>
	);
};
