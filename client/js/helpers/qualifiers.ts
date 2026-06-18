import {cleanIrcMessage} from "../../../shared/irc";

export type QualsMessageEvent = "ready" | "finished";

export function isBanchoBotNick(nick: string): boolean {
	return nick.trim().toLowerCase() === "banchobot";
}

export function getQualsMessageEvent(text: string): QualsMessageEvent | null {
	const normalizedText = cleanIrcMessage(text).replace(/\s+/g, " ");

	if (
		/All players are ready/i.test(normalizedText) ||
		/Everyone is ready/i.test(normalizedText) ||
		/Countdown (?:has )?(?:ended|finished)/i.test(normalizedText)
	) {
		return "ready";
	}

	if (/The match has finished/i.test(normalizedText)) {
		return "finished";
	}

	return null;
}
