import {ref} from "vue";
import {store} from "../store";
import {getOsuToken, fetchOsuMatch} from "./osuApi";
import socket from "../socket";
import {cleanIrcMessage} from "../../../shared/irc";
import {
	applyQualSettingsLine,
	buildMappoolModCommand,
	createQualSettingsSnapshot,
	getExpectedQualPlayerCount,
	getMappoolSlugFromLobbyName,
	getNextQualCursor,
	getQualsMessageEvent,
	isBanchoBotNick,
	isQualSettingsSnapshotComplete,
	normalizeMappoolSlug,
	type QualSettingsSnapshot,
	shouldTriggerQualsEmergency,
} from "./qualifiers";

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
	| "waiting_ready"
	| "checking_ready"
	| "starting"
	| "running"
	| "paused"
	| "done";
type ResumableQualState = Exclude<QualState, "idle" | "done" | "paused">;

export interface QualMap {
	label: string;
	id: string;
	mod: string;
}

export interface QualMappool {
	slug: string;
	raw: string;
	maps: QualMap[];
}

export const qualState = ref<QualState>("idle");
export const qualCurrentMapIdx = ref(0);
export const qualCurrentRun = ref(1);
export const qualMappool = ref<QualMap[]>([]);
export const qualEmergencyWho = ref<string | null>(null);
export const qualEmergencyMsg = ref<string | null>(null);
export const qualPausedState = ref<ResumableQualState | null>(null);
export const qualLobbyNames = ref<Record<number, string>>({});
export const qualChannelMappoolSlugs = ref<Record<number, string>>({});
export const qualMappoolWarnings = ref<Record<number, string>>({});
export const qualRefAlert = ref<string | null>(null);

let qualsChannelId: number | null = null;
let pendingMadeLobbyName: string | null = null;
const requestedLobbySettingsChannels = new Set<number>();
let qualSettingsSnapshot: QualSettingsSnapshot = createQualSettingsSnapshot();
let qualStartTimeout: ReturnType<typeof setTimeout> | null = null;
let qualReadyCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let qualReadyCheckPending = false;

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

export function getQualMapModCommand(map: QualMap): string {
	return buildMappoolModCommand(
		String(map.mod ?? ""),
		Boolean(store.state.settings.refQualNfEnabled)
	);
}

export function readQualMappools(): QualMappool[] {
	const pools = parseStoredMappools(String(store.state.settings.refQualMappools ?? ""));

	if (pools.length) {
		return pools;
	}

	const legacyMaps = parseStoredMaps(String(store.state.settings.refQualMappoolParsed ?? ""));

	if (!legacyMaps.length) {
		return [];
	}

	return [
		{
			slug: normalizeMappoolSlug(
				String(store.state.settings.refQualActiveMappoolSlug || "DEFAULT")
			),
			raw: String(store.state.settings.refQualMappool ?? ""),
			maps: legacyMaps,
		},
	];
}

export function findQualMappoolBySlug(
	pools: QualMappool[],
	slug: string | null | undefined
): QualMappool | null {
	const normalizedSlug = normalizeMappoolSlug(String(slug ?? ""));

	if (!normalizedSlug) {
		return null;
	}

	return pools.find((pool) => normalizeMappoolSlug(pool.slug) === normalizedSlug) ?? null;
}

export function getQualMappoolForChannel(channelId: number): QualMappool | null {
	const pools = readQualMappools();

	if (pools.length === 1) {
		return pools[0];
	}

	const assignedPool = findQualMappoolBySlug(pools, qualChannelMappoolSlugs.value[channelId]);

	if (assignedPool) {
		return assignedPool;
	}

	const detectedSlug = getMappoolSlugFromLobbyName(qualLobbyNames.value[channelId] ?? "");

	return findQualMappoolBySlug(pools, detectedSlug);
}

export function assignQualMappoolToChannel(channelId: number, slug: string) {
	const normalizedSlug = normalizeMappoolSlug(slug);

	qualChannelMappoolSlugs.value = {
		...qualChannelMappoolSlugs.value,
		[channelId]: normalizedSlug,
	};
	clearQualMappoolWarning(channelId);
}

export function handleMappoolChannelJoined(channelId: number, channelName: string) {
	if (!/^#mp_/i.test(channelName)) {
		return;
	}

	if (pendingMadeLobbyName) {
		setQualLobbyName(channelId, pendingMadeLobbyName);
		pendingMadeLobbyName = null;
	}

	if (requestedLobbySettingsChannels.has(channelId)) {
		return;
	}

	requestedLobbySettingsChannels.add(channelId);
	setTimeout(() => {
		socket.emit("input", {target: channelId, text: "!mp settings"});
	}, 800);
}

export function processRefereeMessage(text: string) {
	const lobbyName = getLobbyNameFromMakeCommand(text);

	if (lobbyName) {
		pendingMadeLobbyName = lobbyName;
	}
}

function parseStoredMaps(raw: string): QualMap[] {
	try {
		const parsed = JSON.parse(raw);

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(isQualMap);
	} catch {
		return [];
	}
}

function parseStoredMappools(raw: string): QualMappool[] {
	try {
		const parsed = JSON.parse(raw);

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.map((pool) => ({
				slug: normalizeMappoolSlug(String(pool?.slug ?? "")),
				raw: String(pool?.raw ?? ""),
				maps: Array.isArray(pool?.maps) ? pool.maps.filter(isQualMap) : [],
			}))
			.filter((pool) => pool.slug && pool.maps.length);
	} catch {
		return [];
	}
}

function isQualMap(map: any): map is QualMap {
	return (
		typeof map?.label === "string" &&
		typeof map?.id === "string" &&
		typeof map?.mod === "string"
	);
}

function setQualLobbyName(channelId: number, lobbyName: string) {
	const normalizedLobbyName = cleanIrcMessage(lobbyName).trim();

	if (!normalizedLobbyName) {
		return;
	}

	qualLobbyNames.value = {
		...qualLobbyNames.value,
		[channelId]: normalizedLobbyName,
	};

	if (getQualMappoolForChannel(channelId)) {
		clearQualMappoolWarning(channelId);
	}
}

function setQualMappoolWarning(channelId: number, text: string) {
	qualMappoolWarnings.value = {
		...qualMappoolWarnings.value,
		[channelId]: text,
	};
}

function clearQualMappoolWarning(channelId: number) {
	const {[channelId]: _removed, ...warnings} = qualMappoolWarnings.value;
	qualMappoolWarnings.value = warnings;
}

function getLobbyNameFromMakeCommand(text: string): string | null {
	const match = cleanIrcMessage(text).match(/^!mp\s+make(?:private)?\s+(.+)$/i);

	return match ? match[1].trim() : null;
}

function getLobbyNameFromSettingsMessage(text: string): string | null {
	const match = cleanIrcMessage(text).match(/^(?:Room|Match)\s+name:\s*(.+)$/i);

	return match ? match[1].trim() : null;
}

export function startQuals(channelId: number) {
	const pool = getQualMappoolForChannel(channelId);

	if (!pool?.maps.length) {
		setQualMappoolWarning(
			channelId,
			'No valid mappool found. Please assign a mappool for this lobby in "Map Pick" button'
		);
		return;
	}

	qualsChannelId = channelId;
	qualMappool.value = pool.maps;
	qualCurrentMapIdx.value = 0;
	qualCurrentRun.value = 1;
	qualEmergencyWho.value = null;
	qualEmergencyMsg.value = null;
	qualPausedState.value = null;
	qualRefAlert.value = null;
	clearQualStartTimeout();
	clearQualReadyCheckTimeout();
	clearQualMappoolWarning(channelId);

	const emergencyWord = String(store.state.settings.refQualEmergencyWord ?? "");
	sendQualCmd("Notice: Automation mode is active.");
	sendQualCmd(
		`In case of players requiring support, please send "${emergencyWord}" in chat to stop and wait for ref`
	);

	setNextMap();
}

export function pauseQuals(message?: string | Event) {
	if (!isResumableQualState(qualState.value)) {
		return;
	}

	qualPausedState.value = qualState.value;
	qualState.value = "paused";
	clearQualStartTimeout();
	clearQualReadyCheckTimeout();
	qualSettingsSnapshot = createQualSettingsSnapshot();

	if (typeof message === "string" && message.trim()) {
		setQualRefAlert(message);
	}
}

export function resumeQuals() {
	if (qualState.value !== "paused") {
		return;
	}

	const resumeState = qualPausedState.value;

	qualEmergencyWho.value = null;
	qualEmergencyMsg.value = null;
	qualPausedState.value = null;
	qualRefAlert.value = null;

	if (!qualMappool.value[qualCurrentMapIdx.value]) {
		qualState.value = "idle";
		return;
	}

	if (resumeState === "checking_ready" || resumeState === "starting") {
		requestQualReadyCheck();
		return;
	}

	qualState.value = resumeState ?? "waiting_ready";
}

function setNextMap() {
	const map = qualMappool.value[qualCurrentMapIdx.value];
	if (!map) {
		qualState.value = "done";
		return;
	}

	const mod = getQualMapModCommand(map);

	clearQualStartTimeout();
	clearQualReadyCheckTimeout();
	qualRefAlert.value = null;
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

	clearQualStartTimeout();
	qualRefAlert.value = null;
	qualState.value = "running";
	sendQualCmd(startTimer > 0 ? `!mp start ${startTimer}` : "!mp start");
}

function scheduleQualStart() {
	clearQualStartTimeout();
	qualState.value = "starting";
	qualStartTimeout = setTimeout(() => {
		sendQualStart();
	}, 350);
}

function clearQualStartTimeout() {
	if (qualStartTimeout) {
		clearTimeout(qualStartTimeout);
		qualStartTimeout = null;
	}
}

function clearQualReadyCheckTimeout() {
	if (qualReadyCheckTimeout) {
		clearTimeout(qualReadyCheckTimeout);
		qualReadyCheckTimeout = null;
	}

	qualReadyCheckPending = false;
}

function requestQualReadyCheck(delay = 0) {
	if (qualsChannelId === null) {
		return;
	}

	clearQualStartTimeout();
	clearQualReadyCheckTimeout();
	qualState.value = "checking_ready";
	qualSettingsSnapshot = createQualSettingsSnapshot();

	const sendCheck = () => {
		qualReadyCheckTimeout = null;
		qualReadyCheckPending = false;
		sendQualCmd("!mp settings");
	};

	if (delay > 0) {
		qualReadyCheckPending = true;
		qualReadyCheckTimeout = setTimeout(sendCheck, delay);
		return;
	}

	sendCheck();
}

function setQualRefAlert(message: string) {
	qualRefAlert.value = message;
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
	qualEmergencyWho.value = nick;
	qualEmergencyMsg.value = text;
	pauseQuals(`Automation paused by ${nick}: ${text}`);

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

function isResumableQualState(state: QualState): state is ResumableQualState {
	return state !== "idle" && state !== "done" && state !== "paused";
}

function getQualTeamSizeSetting() {
	return (
		Number(store.state.settings.refQualTeamSize) ||
		Number(store.state.settings.refTeamSize) ||
		1
	);
}

function resetQualSettingsSnapshotIfNeeded(text: string) {
	if (/^(?:Room|Match)\s+name:\s*/i.test(cleanIrcMessage(text).trim())) {
		qualSettingsSnapshot = createQualSettingsSnapshot();
	}
}

function processQualSettingsLine(text: string) {
	if (qualState.value !== "checking_ready") {
		return;
	}

	if (qualReadyCheckPending) {
		return;
	}

	resetQualSettingsSnapshotIfNeeded(text);
	qualSettingsSnapshot = applyQualSettingsLine(qualSettingsSnapshot, text);

	if (!isQualSettingsSnapshotComplete(qualSettingsSnapshot)) {
		return;
	}

	const expectedPlayers = getExpectedQualPlayerCount(getQualTeamSizeSetting());
	const reportedPlayers = qualSettingsSnapshot.reportedPlayers ?? 0;
	const listedPlayers = qualSettingsSnapshot.slots.length;

	if (reportedPlayers !== expectedPlayers || listedPlayers !== expectedPlayers) {
		setQualRefAlert(
			`Invalid player count: expected ${expectedPlayers}, found ${listedPlayers}. Check again.`
		);
		qualState.value = "waiting_ready";
		qualSettingsSnapshot = createQualSettingsSnapshot();
		return;
	}

	if (!qualSettingsSnapshot.slots.every((slot) => slot.ready)) {
		qualState.value = "waiting_ready";
		qualSettingsSnapshot = createQualSettingsSnapshot();
		return;
	}

	qualSettingsSnapshot = createQualSettingsSnapshot();
	scheduleQualStart();
}

function handleQualPlayerChange() {
	if (qualState.value === "checking_ready" || qualState.value === "starting") {
		requestQualReadyCheck(350);
	}
}

function processQualsMessage(text: string) {
	const event = getQualsMessageEvent(text);

	if (qualState.value === "checking_ready") {
		processQualSettingsLine(text);
	}

	if (event === "player_change") {
		handleQualPlayerChange();
		return;
	}

	switch (qualState.value) {
		case "waiting_ready":
			if (event === "ready") {
				requestQualReadyCheck();
			}

			break;

		case "running":
			if (event === "finished") {
				advanceQuals();
			}

			break;
	}
}

function advanceQuals() {
	const totalRuns = Number(store.state.settings.refQualTotalRuns) || 1;
	const totalMaps = qualMappool.value.length;
	const next = getNextQualCursor(
		qualCurrentMapIdx.value,
		qualCurrentRun.value,
		totalMaps,
		totalRuns
	);

	if (next) {
		qualCurrentMapIdx.value = next.mapIndex;
		qualCurrentRun.value = next.run;
		setNextMap();
		return;
	}

	qualState.value = "done";
}

// ─── BanchoBot message router ─────────────────────────────────────────────────

export function processBanchoMessage(
	nick: string,
	text: string,
	channelId?: number,
	isSelf = false
) {
	const qualsActive =
		qualState.value !== "idle" && qualState.value !== "done" && qualState.value !== "paused";
	const isBanchoBot = isBanchoBotNick(nick);
	const normalizedText = cleanIrcMessage(text);
	const isQualsChannel = channelId === undefined || channelId === qualsChannelId;

	if (isBanchoBot && channelId !== undefined) {
		const lobbyName = getLobbyNameFromSettingsMessage(normalizedText);

		if (lobbyName) {
			setQualLobbyName(channelId, lobbyName);
		}
	}

	// Emergency word — any player, any message
	if (qualsActive && isQualsChannel && !isBanchoBot) {
		const eWord = String(store.state.settings.refQualEmergencyWord ?? "").trim();

		if (shouldTriggerQualsEmergency(normalizedText, eWord, isSelf, isBanchoBot)) {
			triggerEmergency(nick, normalizedText);
		}

		return;
	}

	if (qualsActive && isQualsChannel && isBanchoBot) {
		processQualsMessage(normalizedText);

		return;
	}

	if (!store.state.settings.refHelperEnabled || !isBanchoBot) {
		return;
	}

	// Capture match ID when room is created
	const matchUrlMatch = normalizedText.match(/osu\.ppy\.sh\/mp\/(\d+)/);

	if (matchUrlMatch) {
		currentMatchId = matchUrlMatch[1];
		return;
	}

	// Winner hint (normal mode)
	if (/The match has finished/i.test(normalizedText)) {
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
