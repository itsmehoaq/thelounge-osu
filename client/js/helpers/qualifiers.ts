import {cleanIrcMessage} from "../../../shared/irc";

export type QualsMessageEvent = "ready" | "finished";
export type QualCursor = {
	mapIndex: number;
	run: number;
};

export function isBanchoBotNick(nick: string): boolean {
	return nick.trim().toLowerCase() === "banchobot";
}

export function shouldTriggerQualsEmergency(
	text: string,
	emergencyWord: string,
	isSelf: boolean,
	isBanchoBot: boolean
): boolean {
	const normalizedEmergencyWord = emergencyWord.trim().toLowerCase();

	if (isSelf || isBanchoBot || !normalizedEmergencyWord) {
		return false;
	}

	return cleanIrcMessage(text).toLowerCase().includes(normalizedEmergencyWord);
}

export function getNextQualCursor(
	currentMapIndex: number,
	currentRun: number,
	totalMaps: number,
	totalRuns: number
): QualCursor | null {
	if (totalMaps <= 0) {
		return null;
	}

	if (currentMapIndex < totalMaps - 1) {
		return {mapIndex: currentMapIndex + 1, run: currentRun};
	}

	if (currentRun < Math.max(1, totalRuns)) {
		return {mapIndex: 0, run: currentRun + 1};
	}

	return null;
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
