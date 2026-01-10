import type { RefObject } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSearch = create<SearchStore>()(
	persist(
		(set, get) => {
			return {
				on: false,
				input: "",
				threshold: 0.4,
				showOptions: false,
				inputRef: null,
				toggle: (on) => {
					set({
						on,
						input: "",
					});
				},
				setInput: (input) => {
					set({ input });
				},
				setThreshold: (threshold) => {
					set({ threshold });
				},
				toggleOptions: () => {
					set({ showOptions: !get().showOptions });
				},
				setInputRef: (inputRef) => {
					set({ inputRef });
				},
				triggerFocus: () => {
					const { inputRef } = get();
					if (inputRef?.current) {
						inputRef.current.focus();
						inputRef.current.select();
					}
				},
			};
		},
		{
			name: "tabcanopy-search-settings",
			partialize: (state) => ({
				threshold: state.threshold,
				showOptions: state.showOptions,
			}),
		},
	),
);

export type SearchStore = {
	on: boolean;
	input: string;
	threshold: number;
	showOptions: boolean;
	inputRef: RefObject<HTMLInputElement | null> | null;

	toggle(on: boolean): void;
	setInput(value: string): void;
	setThreshold(threshold: number): void;
	toggleOptions(): void;
	setInputRef(inputRef: RefObject<HTMLInputElement | null>): void;
	triggerFocus(): void;
};
