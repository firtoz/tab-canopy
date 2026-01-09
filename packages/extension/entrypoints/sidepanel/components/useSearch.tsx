import { create } from "zustand";

export const useSearch = create<SearchStore>((set, get) => {
	return {
		on: false,
		input: "",
		toggle: (on) => {
			set({
				on,
				input: "",
			});
		},
		setInput: (input) => {
			set({ input });
		},
	};
});
export type SearchStore = {
	on: boolean;
	input: string;

	toggle(on: boolean): void;
	setInput(value: string): void;
};
