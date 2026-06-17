import {ref} from "vue";
import {store} from "../store";
import {getOsuToken, fetchOsuMatch} from "./osuApi";
import socket from "../socket";

// ─── Winner hint ────────────────────────────────────────────────────────────

export const winnerHint = ref<string | null>(null);
export const winnerHintError = ref(false);

let currentMatchId: string | null = null;

export function clearWinnerHint() {
	winnerHint.value = null;
	winnerHintError.value = false;
}

// ─── Qualifiers automation ───────────────────────────────────────────────────

type QualState =
	| "idle"
	| "setting_map"
	| "verifying"
	| "waiting_ready"
	| "running"
	| "done"
	| "emergency";

export interface QualMap {
	label: string;
	id: string;
	mod: string;
}

export const qualState = ref<QualState>("idle");
export const qualCurrentMapIdx = ref(0);
export const qualCurrentRun = ref(1);
export const qualMappool = ref<QualMap[]>([]);
export const qualEmergencyWho = ref<string | null>(null);
export const qualEmergencyMsg = ref<string | null>(null);

let qualsChannelId: number | null = null;

const MOD_MAP: Record<string, string> = {
	NM: "",
	HD: "hd",
	HR: "hr",
	DT: "dt",
	NC: "nc",
	FM: "freemod",
	EZ: "ez",
	FL: "fl",
	TB: "freemod",
};

export function parseMappool(raw: string): QualMap[] {
	return raw
		.split("\n")
		.map((l) => l.split("\t"))
		.filter((cols) => cols.length >= 2 && /^\d+$/.test(cols[1].trim()))
		.map((cols) => {
			const label = cols[0].trim();
			const prefix = label.replace(/\d+$/, "").toUpperCase();
			const mod = MOD_MAP[prefix] ?? "freemod";
			return {label, id: cols[1].trim(), mod};
		});
}

export function startQuals(channelId: number) {
	let maps: QualMap[] = [];
	try {
		const parsed = JSON.parse(String(store.state.settings.refQualMappoolParsed ?? ""));
		if (Array.isArray(parsed)) maps = parsed;
	} catch {
		maps = [];
	}
	if (!maps.length) return;

	qualsChannelId = channelId;
	qualMappool.value = maps;
	qualCurrentMapIdx.value = 0;
	qualCurrentRun.value = 1;
	qualEmergencyWho.value = null;
	qualEmergencyMsg.value = null;

	const emergencyWord = String(store.state.settings.refQualEmergencyWord ?? "");
	sendQualCmd("Notice: Automation mode is active.");
	sendQualCmd(
		`In case of players requiring support, please send "${emergencyWord}" in chat to stop and wait for ref`
	);

	setNextMap();
}

export function abortQuals() {
	qualState.value = "idle";
	qualsChannelId = null;
	qualEmergencyWho.value = null;
	qualEmergencyMsg.value = null;
}

export function resumeAfterEmergency() {
	qualEmergencyWho.value = null;
	qualEmergencyMsg.value = null;
	qualState.value = "idle";
}

function setNextMap() {
	const map = qualMappool.value[qualCurrentMapIdx.value];
	if (!map) {
		qualState.value = "done";
		return;
	}

	const mod = String(map.mod ?? "").trim();

	sendQualCmd(`!mp map ${map.id}`);
	sendQualCmd(`!mp mods ${mod}`.trimEnd());
	sendQualCmd(`!mp timer ${Number(store.state.settings.refTimerDefault) || 120}`);
	qualState.value = "waiting_ready";
}

function sendQualCmd(cmd: string) {
	if (qualsChannelId === null) return;
	socket.emit("input", {target: qualsChannelId, text: cmd});
}

function sendQualStart() {
	const startTimer = Number(store.state.settings.refStartTimer);

	qualState.value = "running";
	sendQualCmd(startTimer > 0 ? `!mp start ${startTimer}` : "!mp start");
}

function playEmergencyBeeps() {
	for (let i = 0; i < 3; i++) {
		setTimeout(() => {
			try {
				const a = new Audio("audio/pop.wav");
				void a.play();
			} catch {}
		}, i * 350);
	}
}

function triggerEmergency(nick: string, text: string) {
	qualState.value = "emergency";
	qualEmergencyWho.value = nick;
	qualEmergencyMsg.value = text;

	playEmergencyBeeps();

	if (
		store.state.settings.desktopNotifications &&
		"Notification" in window &&
		Notification.permission === "granted"
	) {
		try {
			new Notification("EMERGENCY STOP", {body: `${nick}: ${text}`});
		} catch {}
	}
}

function processQualsMessage(text: string) {
	switch (qualState.value) {
		case "waiting_ready":
			if (
				/All players are ready/i.test(text) ||
				/Everyone is ready/i.test(text) ||
				/Countdown (?:has )?(?:ended|finished)/i.test(text)
			) {
				sendQualStart();
			}
			break;

		case "running":
			if (/The match has finished/i.test(text)) {
				advanceQuals();
			}
			break;
	}
}

function advanceQuals() {
	const totalRuns = Number(store.state.settings.refQualTotalRuns) || 1;
	const totalMaps = qualMappool.value.length;

	if (qualCurrentMapIdx.value < totalMaps - 1) {
		qualCurrentMapIdx.value++;
		setNextMap();
	} else if (qualCurrentRun.value < totalRuns) {
		qualCurrentRun.value++;
		qualCurrentMapIdx.value = 0;
		setNextMap();
	} else {
		qualState.value = "done";
	}
}

// ─── BanchoBot message router ─────────────────────────────────────────────────

export function processBanchoMessage(nick: string, text: string) {
	if (!store.state.settings.refHelperEnabled) return;

	const qualsActive =
		qualState.value !== "idle" && qualState.value !== "done" && qualState.value !== "emergency";

	// Emergency word — any player, any message
	if (qualsActive && nick !== "BanchoBot") {
		const eWord = String(store.state.settings.refQualEmergencyWord ?? "").trim();
		if (eWord && text.toLowerCase().includes(eWord.toLowerCase())) {
			triggerEmergency(nick, text);
		}
		return;
	}

	if (nick !== "BanchoBot") return;

	// Capture match ID when room is created
	const matchUrlMatch = text.match(/osu\.ppy\.sh\/mp\/(\d+)/);
	if (matchUrlMatch) {
		currentMatchId = matchUrlMatch[1];
		return;
	}

	// Quals state machine takes priority when active
	if (qualsActive) {
		processQualsMessage(text);
		return;
	}

	// Winner hint (normal mode)
	if (/The match has finished/i.test(text)) {
		void fetchAndCalculate();
	}
}

// ─── Winner hint logic ────────────────────────────────────────────────────────

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
			const team = (s.match?.team ?? s.team) as string;
			if (team === "red" || team === "blue") {
				totals[team] += getValue(s, winCondition);
			}
		}
		const redWins = totals.red >= totals.blue;
		const winner = redWins ? "Red" : "Blue";
		const diff = Math.abs(totals.red - totals.blue);
		const diffStr =
			winCondition === "accuracy" ? `${(diff * 100).toFixed(2)}%` : diff.toLocaleString();
		return `${winner} team wins  (+${diffStr})`;
	}

	// Head-to-head
	const sorted = [...passed].sort(
		(a, b) => getValue(b, winCondition) - getValue(a, winCondition)
	);
	const top = sorted[0];
	const val = getValue(top, winCondition);
	const name = getUserName(top.user_id as number, users);
	return `${name}  ${formatValue(val, winCondition)}`;
}

export function getCurrentMatchId(): string | null {
	return currentMatchId;
}
