import * as LucideIcons from "lucide-vue-next";
import {Zap} from "lucide-vue-next";

type LucideIconMap = Record<string, unknown>;

const icons = LucideIcons as LucideIconMap;

function normalizeIconName(name: string): string {
	return name
		.trim()
		.replace(/^lucide[\s_-]*/i, "")
		.replace(/[\s_-]*icon$/i, "")
		.replace(/[^a-z0-9]/gi, "")
		.toLowerCase();
}

function toPascalCase(name: string): string {
	return name
		.trim()
		.split(/[^a-z0-9]+/i)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

const iconLookup = new Map<string, unknown>();

for (const key of Object.keys(icons).sort((a, b) => {
	const rank = (name: string) => (name.startsWith("Lucide") ? 2 : name.endsWith("Icon") ? 1 : 0);

	return rank(a) - rank(b);
})) {
	if (typeof icons[key] !== "function") {
		continue;
	}

	const normalized = normalizeIconName(key);

	if (!iconLookup.has(normalized)) {
		iconLookup.set(normalized, icons[key]);
	}
}

export function getLucideIcon(name?: string): unknown {
	const trimmed = name?.trim();

	if (!trimmed) {
		return Zap;
	}

	if (
		Object.prototype.hasOwnProperty.call(icons, trimmed) &&
		typeof icons[trimmed] === "function"
	) {
		return icons[trimmed];
	}

	const pascal = toPascalCase(trimmed);

	for (const candidate of [pascal, `${pascal}Icon`, `Lucide${pascal}`]) {
		if (
			Object.prototype.hasOwnProperty.call(icons, candidate) &&
			typeof icons[candidate] === "function"
		) {
			return icons[candidate];
		}
	}

	return iconLookup.get(normalizeIconName(trimmed)) ?? Zap;
}

export function hasLucideIcon(name?: string): boolean {
	const trimmed = name?.trim();

	if (!trimmed) {
		return true;
	}

	return getLucideIcon(trimmed) !== Zap || normalizeIconName(trimmed) === "zap";
}
