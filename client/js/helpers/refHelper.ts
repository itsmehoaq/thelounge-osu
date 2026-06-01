import {ref} from "vue";
import {store} from "../store";
import {getOsuToken, fetchOsuMatch} from "./osuApi";

export const winnerHint = ref<string | null>(null);
export const winnerHintError = ref(false);

let currentMatchId: string | null = null;

export function clearWinnerHint() {
	winnerHint.value = null;
	winnerHintError.value = false;
}

export function processBanchoMessage(nick: string, text: string) {
	if (nick !== "BanchoBot") return;
	if (!store.state.settings.refHelperEnabled) return;

	// Capture match ID when room is created
	const matchUrlMatch = text.match(/osu\.ppy\.sh\/mp\/(\d+)/);
	if (matchUrlMatch) {
		currentMatchId = matchUrlMatch[1];
		return;
	}

	// Trigger fetch when map finishes
	if (/The match has finished/i.test(text)) {
		void fetchAndCalculate();
	}
}

async function fetchAndCalculate() {
	if (!store.state.settings.refShowWinnerHint) return;
	if (!currentMatchId) return;

	const clientId = String(store.state.settings.osuApiClientId ?? "");
	const clientSecret = String(store.state.settings.osuApiClientSecret ?? "");

	if (!clientId || !clientSecret) {
		setHint("Set osu! API credentials in Ref Helper settings", true);
		return;
	}

	const token = await getOsuToken(clientId, clientSecret);
	if (!token) {
		setHint("API auth failed — check client ID / secret", true);
		return;
	}

	const matchData = await fetchOsuMatch(currentMatchId, token);
	if (!matchData) {
		setHint("Failed to fetch match data from osu! API", true);
		return;
	}

	const gameEvents = (matchData.events ?? []).filter((e: any) => e.game);
	if (!gameEvents.length) {
		setHint("No game events in match data", true);
		return;
	}

	const lastGame = gameEvents[gameEvents.length - 1].game;
	const scores: any[] = lastGame.scores ?? [];
	const users: {id: number; username: string}[] = matchData.users ?? [];

	const winCondition = String(store.state.settings.refWinCondition ?? "score");
	const teamMode = String(store.state.settings.refTeamMode ?? "headtohead");
	const teamSize = Number(store.state.settings.refTeamSize) || 2;

	const result = calculateWinner(scores, users, winCondition, teamMode, teamSize);
	setHint(result, false);
}

function setHint(text: string, isError: boolean) {
	winnerHint.value = text;
	winnerHintError.value = isError;
}

function getUserName(userId: number, users: {id: number; username: string}[]): string {
	return users.find((u) => u.id === userId)?.username ?? `User ${userId}`;
}

function getValue(score: any, winCondition: string): number {
	switch (winCondition) {
		case "accuracy":
			return score.accuracy as number;
		case "combo":
			return score.max_combo as number;
		default:
			return score.score as number;
	}
}

function formatValue(val: number, winCondition: string): string {
	switch (winCondition) {
		case "accuracy":
			return `${(val * 100).toFixed(2)}%`;
		case "combo":
			return `${val}x combo`;
		default:
			return val.toLocaleString();
	}
}

function calculateWinner(
	scores: any[],
	users: {id: number; username: string}[],
	winCondition: string,
	teamMode: string,
	teamSize: number
): string {
	const passed = scores.filter((s) => s.passed);

	if (!passed.length) return "No passing scores";

	if (teamMode === "teamvs") {
		const totals: Record<string, number> = {red: 0, blue: 0};
		for (const s of passed) {
			const team = s.team as string;
			if (team === "red" || team === "blue") {
				totals[team] += getValue(s, winCondition);
			}
		}
		const redWins = totals.red >= totals.blue;
		const winner = redWins ? "Red" : "Blue";
		const diff = Math.abs(totals.red - totals.blue);
		const diffStr = winCondition === "accuracy" ? `${(diff * 100).toFixed(2)}%` : diff.toLocaleString();
		return `${winner} team wins  (+${diffStr})`;
	}

	// Head-to-head
	const sorted = [...passed].sort((a, b) => getValue(b, winCondition) - getValue(a, winCondition));
	const top = sorted[0];
	const val = getValue(top, winCondition);
	const name = getUserName(top.user_id as number, users);
	return `${name}  ${formatValue(val, winCondition)}`;
}

// Expose current match ID for display
export function getCurrentMatchId(): string | null {
	return currentMatchId;
}
