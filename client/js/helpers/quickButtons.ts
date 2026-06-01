import {ref} from "vue";

export interface QuickButton {
	id: string;
	label: string;
	commands: string[];
	danger: boolean;
	icon?: string; // lucide-vue-next component name, e.g. "Trophy"
}

const STORAGE_KEY = "osu-quick-buttons";

function load(): QuickButton[] {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
	} catch {
		return [];
	}
}

function persist(buttons: QuickButton[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(buttons));
}

// Module-level ref — shared reactively across all importers in the same page instance
export const customButtons = ref<QuickButton[]>(load());

export function addButton(btn: Omit<QuickButton, "id">): void {
	customButtons.value = [...customButtons.value, {...btn, id: Date.now().toString()}];
	persist(customButtons.value);
}

export function updateButton(id: string, btn: Omit<QuickButton, "id">): void {
	customButtons.value = customButtons.value.map((b) => (b.id === id ? {...btn, id} : b));
	persist(customButtons.value);
}

export function removeButton(id: string): void {
	customButtons.value = customButtons.value.filter((b) => b.id !== id);
	persist(customButtons.value);
}
