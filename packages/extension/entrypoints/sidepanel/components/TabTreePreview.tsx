/**
 * TabTreePreview - Read-only preview of the tab tree UI
 * Used by DevTools to show exactly what the UI looks like at each replay step
 */

import { ChevronDown, ChevronRight, Puzzle, Volume2 } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../lib/cn";
import { buildTabTree, flattenTree } from "../lib/tree";

// ============================================================================
// Types for preview state
// ============================================================================

export interface PreviewTab {
	browserTabId: number;
	browserWindowId: number;
	tabIndex: number;
	parentTabId: number | null;
	treeOrder: string;
	title?: string | null;
	url?: string | null;
	favIconUrl?: string | null;
	isCollapsed?: boolean;
	active?: boolean;
	pinned?: boolean;
	audible?: boolean;
}

export interface PreviewWindow {
	browserWindowId: number;
	focused?: boolean;
}

export interface PreviewState {
	windows: PreviewWindow[];
	tabs: PreviewTab[];
}

// ============================================================================
// Tree Line Components (simplified versions from TabCard)
// ============================================================================

const TREE_W = 20;
const TREE_H = 22;
const MID_X = TREE_W / 2;
const MID_Y = TREE_H / 2;
const STROKE = 1.5;

function TreeVertical({ highlighted }: { highlighted?: boolean }) {
	return (
		<svg
			width={TREE_W}
			height={TREE_H}
			className={cn(
				"shrink-0 text-zinc-600",
				highlighted && "text-emerald-500",
			)}
			aria-hidden="true"
		>
			<line
				x1={MID_X}
				y1={0}
				x2={MID_X}
				y2={TREE_H}
				stroke="currentColor"
				strokeWidth={STROKE}
			/>
		</svg>
	);
}

function TreeEmpty() {
	return <div style={{ width: TREE_W, height: TREE_H }} className="shrink-0" />;
}

function TreeBranch({ highlighted }: { highlighted?: boolean }) {
	return (
		<svg
			width={TREE_W}
			height={TREE_H}
			className={cn(
				"shrink-0 text-zinc-600",
				highlighted && "text-emerald-500",
			)}
			aria-hidden="true"
		>
			<line
				x1={MID_X}
				y1={0}
				x2={MID_X}
				y2={TREE_H}
				stroke="currentColor"
				strokeWidth={STROKE}
			/>
			<line
				x1={MID_X}
				y1={MID_Y}
				x2={TREE_W}
				y2={MID_Y}
				stroke="currentColor"
				strokeWidth={STROKE}
			/>
		</svg>
	);
}

function TreeEnd({ highlighted }: { highlighted?: boolean }) {
	return (
		<svg
			width={TREE_W}
			height={TREE_H}
			className={cn(
				"shrink-0 text-zinc-600",
				highlighted && "text-emerald-500",
			)}
			aria-hidden="true"
		>
			<line
				x1={MID_X}
				y1={0}
				x2={MID_X}
				y2={MID_Y}
				stroke="currentColor"
				strokeWidth={STROKE}
			/>
			<line
				x1={MID_X}
				y1={MID_Y}
				x2={TREE_W}
				y2={MID_Y}
				stroke="currentColor"
				strokeWidth={STROKE}
			/>
		</svg>
	);
}

// ============================================================================
// Preview Tab Card
// ============================================================================

interface PreviewTabCardProps {
	tab: PreviewTab;
	depth: number;
	hasChildren: boolean;
	isLastChild: boolean;
	indentGuides: boolean[];
	isHighlighted?: boolean;
	changeType?: "added" | "removed" | "modified";
}

function PreviewTabCard({
	tab,
	depth,
	hasChildren,
	isLastChild,
	indentGuides,
	isHighlighted,
	changeType,
}: PreviewTabCardProps) {
	const isExtensionUrl = tab.url?.startsWith("chrome-extension://");

	return (
		<div className="flex items-stretch">
			{/* Tree lines */}
			{depth > 0 && (
				<div className="flex items-stretch shrink-0">
					{indentGuides.map((showGuide, i) => (
						<div key={`guide-${tab.browserTabId}-${i}`}>
							{showGuide ? <TreeVertical /> : <TreeEmpty />}
						</div>
					))}
					{isLastChild ? <TreeEnd /> : <TreeBranch />}
				</div>
			)}

			{/* Card content */}
			<div
				className={cn(
					"flex-1 flex items-center gap-1.5 py-1 px-1.5 rounded text-[11px]",
					// Base state
					tab.active && "bg-blue-500/20",
					// Highlight for current event
					isHighlighted && "ring-2 ring-yellow-500",
					// Change type highlighting
					changeType === "added" &&
						"bg-green-500/20 border-l-2 border-green-500",
					changeType === "removed" &&
						"bg-red-500/20 border-l-2 border-red-500 opacity-50 line-through",
					changeType === "modified" &&
						"bg-blue-500/20 border-l-2 border-blue-500",
				)}
			>
				{/* Expand/collapse indicator */}
				<span className="shrink-0 w-4 text-zinc-500">
					{hasChildren ? (
						tab.isCollapsed ? (
							<ChevronRight size={12} />
						) : (
							<ChevronDown size={12} />
						)
					) : (
						<span className="text-zinc-700">•</span>
					)}
				</span>

				{/* Favicon */}
				<div className="shrink-0 w-4 h-4 flex items-center justify-center">
					{tab.audible ? (
						<Volume2 size={12} className="text-emerald-400 animate-pulse" />
					) : tab.favIconUrl &&
						!tab.favIconUrl.startsWith("chrome-extension://") ? (
						<img
							src={tab.favIconUrl}
							alt=""
							className="w-3 h-3 object-contain"
							onError={(e) => {
								e.currentTarget.style.display = "none";
							}}
						/>
					) : isExtensionUrl ? (
						<Puzzle size={12} className="text-indigo-400" />
					) : (
						<div className="w-3 h-3 bg-zinc-700 rounded-sm" />
					)}
				</div>

				{/* Title */}
				<span
					className={cn(
						"truncate",
						tab.active ? "text-blue-300 font-medium" : "text-zinc-300",
					)}
					title={tab.title || "Untitled"}
				>
					{tab.title || "Untitled"}
				</span>

				{/* Tab ID badge */}
				<span className="shrink-0 text-[9px] text-zinc-600 font-mono">
					#{tab.browserTabId}
				</span>

				{/* Pinned indicator */}
				{tab.pinned && <span title="Pinned">📌</span>}
			</div>
		</div>
	);
}

// ============================================================================
// Preview Window Group
// ============================================================================

interface PreviewWindowGroupProps {
	window: PreviewWindow;
	tabs: PreviewTab[];
	isLastWindow: boolean;
	highlightTabId?: number;
	tabChanges?: Map<number, "added" | "removed" | "modified">;
}

function PreviewWindowGroup({
	window: win,
	tabs,
	isLastWindow,
	highlightTabId,
	tabChanges,
}: PreviewWindowGroupProps) {
	// Build tree structure - need to convert PreviewTab to Tab-like format
	const flatNodes = useMemo(() => {
		// buildTabTree expects Tab type, but we can cast since we have the required fields
		const tree = buildTabTree(tabs as Parameters<typeof buildTabTree>[0]);
		return flattenTree(tree);
	}, [tabs]);

	return (
		<div className="flex flex-col">
			{/* Window header */}
			<div className="flex items-center gap-1 text-zinc-400 py-1">
				{isLastWindow ? <TreeEnd /> : <TreeBranch />}
				<ChevronDown size={12} />
				<span className="text-[11px] font-medium">
					Window {win.browserWindowId}
				</span>
				<span className="text-[10px] text-zinc-600">• {tabs.length} tabs</span>
				{win.focused && (
					<span className="text-[9px] text-blue-400">(focused)</span>
				)}
			</div>

			{/* Tabs */}
			<div className="flex flex-col">
				{flatNodes.map((node, index) => {
					const isLast = index === flatNodes.length - 1;
					return (
						<PreviewTabCard
							key={node.tab.browserTabId}
							tab={node.tab as PreviewTab}
							depth={node.depth + 1}
							hasChildren={node.hasChildren}
							isLastChild={isLast ? true : node.isLastChild}
							indentGuides={[!isLastWindow, ...node.indentGuides]}
							isHighlighted={node.tab.browserTabId === highlightTabId}
							changeType={tabChanges?.get(node.tab.browserTabId)}
						/>
					);
				})}
			</div>
		</div>
	);
}

// ============================================================================
// Chrome Order View - Flat list by tabIndex (what Chrome actually sees)
// ============================================================================

function ChromeOrderView({
	window: win,
	tabs,
	highlightTabId,
	tabChanges,
}: {
	window: PreviewWindow;
	tabs: PreviewTab[];
	highlightTabId?: number;
	tabChanges?: Map<number, "added" | "removed" | "modified">;
}) {
	// Sort by tabIndex only (flat, no tree)
	const sorted = [...tabs].sort((a, b) => a.tabIndex - b.tabIndex);

	return (
		<div className="space-y-0.5">
			<div className="flex items-center gap-1 text-zinc-500 text-[10px] font-semibold py-1">
				<span>Window {win.browserWindowId}</span>
				<span className="text-zinc-600">• {tabs.length} tabs</span>
			</div>
			{sorted.map((tab) => {
				const isHighlighted = tab.browserTabId === highlightTabId;
				const changeType = tabChanges?.get(tab.browserTabId);

				return (
					<div
						key={tab.browserTabId}
						className={cn(
							"flex items-center gap-2 py-1 px-2 rounded text-[11px]",
							isHighlighted && "ring-2 ring-yellow-500",
							changeType === "added" &&
								"bg-green-500/20 border-l-2 border-green-500",
							changeType === "removed" &&
								"bg-red-500/20 border-l-2 border-red-500 opacity-50",
							changeType === "modified" &&
								"bg-blue-500/20 border-l-2 border-blue-500",
						)}
					>
						<span className="text-zinc-500 font-mono w-6">
							[{tab.tabIndex}]
						</span>
						<span className="text-zinc-400 font-mono">#{tab.browserTabId}</span>
						<span
							className="text-zinc-300 truncate flex-1"
							title={tab.title || ""}
						>
							{tab.title?.slice(0, 25) || "Untitled"}
							{(tab.title?.length || 0) > 25 ? "..." : ""}
						</span>
						{tab.parentTabId !== null && (
							<span className="text-zinc-600 text-[9px]">
								(parent: {tab.parentTabId})
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ============================================================================
// Main Preview Component
// ============================================================================

interface TabTreePreviewProps {
	state: PreviewState;
	title?: string;
	highlightTabId?: number;
	/** Map of tabId -> change type for highlighting changes */
	tabChanges?: Map<number, "added" | "removed" | "modified">;
	className?: string;
	/** If true, show flat Chrome order (by tabIndex) instead of tree structure */
	showChromeOrder?: boolean;
}

export function TabTreePreview({
	state,
	title,
	highlightTabId,
	tabChanges,
	className,
	showChromeOrder = false,
}: TabTreePreviewProps) {
	// Group tabs by window
	const windowsWithTabs = useMemo(() => {
		return state.windows.map((win) => ({
			window: win,
			tabs: state.tabs
				.filter((tab) => tab.browserWindowId === win.browserWindowId)
				.sort((a, b) => a.tabIndex - b.tabIndex),
		}));
	}, [state]);

	// Also show tabs that don't have a matching window (edge case)
	const orphanTabs = useMemo(() => {
		const windowIds = new Set(state.windows.map((w) => w.browserWindowId));
		return state.tabs.filter((t) => !windowIds.has(t.browserWindowId));
	}, [state]);

	return (
		<div
			className={cn(
				"bg-zinc-900 border border-zinc-700 rounded overflow-hidden",
				showChromeOrder && "border-orange-500/30",
				className,
			)}
		>
			{title && (
				<div
					className={cn(
						"px-2 py-1 bg-zinc-800 border-b border-zinc-700 text-[10px] font-semibold",
						showChromeOrder ? "text-orange-400" : "text-zinc-400",
					)}
				>
					{title}
				</div>
			)}
			<div className="p-2 overflow-y-auto max-h-[300px]">
				{windowsWithTabs.length === 0 && orphanTabs.length === 0 ? (
					<div className="text-zinc-600 text-xs text-center py-4">
						No windows or tabs
					</div>
				) : showChromeOrder ? (
					// Flat Chrome order view
					windowsWithTabs.map((wt) => (
						<ChromeOrderView
							key={wt.window.browserWindowId}
							window={wt.window}
							tabs={wt.tabs}
							highlightTabId={highlightTabId}
							tabChanges={tabChanges}
						/>
					))
				) : (
					// Tree structure view
					<>
						{windowsWithTabs.map((wt, index) => (
							<PreviewWindowGroup
								key={wt.window.browserWindowId}
								window={wt.window}
								tabs={wt.tabs}
								isLastWindow={
									index === windowsWithTabs.length - 1 &&
									orphanTabs.length === 0
								}
								highlightTabId={highlightTabId}
								tabChanges={tabChanges}
							/>
						))}
						{orphanTabs.length > 0 && (
							<div className="mt-2 pt-2 border-t border-zinc-800">
								<div className="text-[10px] text-zinc-600 mb-1">
									Orphan tabs (no window):
								</div>
								{orphanTabs.map((tab) => (
									<PreviewTabCard
										key={tab.browserTabId}
										tab={tab}
										depth={0}
										hasChildren={false}
										isLastChild={true}
										indentGuides={[]}
										isHighlighted={tab.browserTabId === highlightTabId}
										changeType={tabChanges?.get(tab.browserTabId)}
									/>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
