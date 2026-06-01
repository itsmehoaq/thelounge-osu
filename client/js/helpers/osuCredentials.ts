import {ref} from "vue";

const LS_KEY = "osu-credentials";

export interface OsuCredentials {
	nick: string;
	password: string;
}

function load(): OsuCredentials | null {
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed?.nick && parsed?.password) return parsed as OsuCredentials;
		return null;
	} catch {
		return null;
	}
}

export const storedCredentials = ref<OsuCredentials | null>(load());

export function saveCredentials(creds: OsuCredentials): void {
	localStorage.setItem(LS_KEY, JSON.stringify(creds));
	storedCredentials.value = creds;
}

export function clearCredentials(): void {
	localStorage.removeItem(LS_KEY);
	storedCredentials.value = null;
}
