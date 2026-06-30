import {ref} from "vue";
import {store} from "../store";
import {getOsuToken, fetchOsuMatch} from "./osuApi";
import socket from "../socket";
import {cleanIrcMessage} from "../../../shared/irc";
import {
	applyQualSettingsLine,
	buildMappoolModCommand,
	createQualSettingsSnapshot,
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

export interface QualSession {
	state: QualState;
	currentMapIdx: number;
	currentRun: number;
	mappool: QualMap[];
	emergencyWho: string | null;
	emergencyMsg: string | null;
	pausedState: ResumableQualState | null;
	refAlert: string | null;
}

export const qualLobbyNames = ref<Record<number, string>>({});
export const qualChannelMappoolSlugs = ref<Record<number, string>>({});
export const qualMappoolWarnings = ref<Record<number, string>>({});
export const qualSessions = ref<Record<number, QualSession>>({});

let pendingMadeLobbyName: string | null = null;
const requestedLobbySettingsChannels = new Set<number>();

type QualRuntime = {
	settingsSnapshot: QualSettingsSnapshot;
	startTimeout: ReturnType<typeof setTimeout> | null;
	readyCheckTimeout: ReturnType<typeof setTimeout> | null;
	readyCheckPending: boolean;
};

const emptyQualSession: QualSession = {
	state: "idle",
	currentMapIdx: 0,
	currentRun: 1,
	mappool: [],
	emergencyWho: null,
	emergencyMsg: null,
	pausedState: null,
	refAlert: null,
};
const qualRuntimes = new Map<number, QualRuntime>();

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

export function getQualSession(channelId: number): QualSession {
	return qualSessions.value[channelId] ?? emptyQualSession;
}

function createQualSession(overrides: Partial<QualSession> = {}): QualSession {
	return {
		state: "idle",
		currentMapIdx: 0,
		currentRun: 1,
		mappool: [],
		emergencyWho: null,
		emergencyMsg: null,
		pausedState: null,
		refAlert: null,
		...overrides,
	};
}

function ensureQualSession(channelId: number): QualSession {
	const existing = qualSessions.value[channelId];

	if (existing) {
		return existing;
	}

	const session = createQualSession();

	qualSessions.value = {
		...qualSessions.value,
		[channelId]: session,
	};

	return session;
}

function getQualRuntime(channelId: number): QualRuntime {
	let runtime = qualRuntimes.get(channelId);

	if (runtime) {
		return runtime;
	}

	runtime = {
		settingsSnapshot: createQualSettingsSnapshot(),
		startTimeout: null,
		readyCheckTimeout: null,
		readyCheckPending: false,
	};
	qualRuntimes.set(channelId, runtime);

	return runtime;
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

	clearQualStartTimeout(channelId);
	clearQualReadyCheckTimeout(channelId);
	getQualRuntime(channelId).settingsSnapshot = createQualSettingsSnapshot();
	Object.assign(
		ensureQualSession(channelId),
		createQualSession({
			mappool: pool.maps,
		})
	);
	clearQualMappoolWarning(channelId);

	const emergencyWord = String(store.state.settings.refQualEmergencyWord ?? "");
	sendQualCmd(channelId, "Notice: Automation mode is active.");
	sendQualCmd(
		channelId,
		`In case of players requiring support, please send "${emergencyWord}" in chat to stop and wait for ref`
	);

	setNextMap(channelId);
}

export function pauseQuals(channelId: number, message?: string | Event) {
	const session = getQualSession(channelId);

	if (!isResumableQualState(session.state)) {
		return;
	}

	session.pausedState = session.state;
	session.state = "paused";
	clearQualStartTimeout(channelId);
	clearQualReadyCheckTimeout(channelId);
	getQualRuntime(channelId).settingsSnapshot = createQualSettingsSnapshot();

	if (typeof message === "string" && message.trim()) {
		setQualRefAlert(channelId, message);
	} else {
		session.refAlert = null;
	}
}

export function resumeQuals(channelId: number) {
	const session = getQualSession(channelId);

	if (session.state !== "paused") {
		return;
	}

	const resumeState = session.pausedState;

	session.emergencyWho = null;
	session.emergencyMsg = null;
	session.pausedState = null;
	session.refAlert = null;

	if (!session.mappool[session.currentMapIdx]) {
		session.state = "idle";
		return;
	}

	if (resumeState === "checking_ready" || resumeState === "starting") {
		requestQualReadyCheck(channelId);
		return;
	}

	session.state = resumeState ?? "waiting_ready";
}

function setNextMap(channelId: number) {
	const session = ensureQualSession(channelId);
	const map = session.mappool[session.currentMapIdx];

	if (!map) {
		clearQualStartTimeout(channelId);
		clearQualReadyCheckTimeout(channelId);
		session.state = "done";
		return;
	}

	const mod = getQualMapModCommand(map);

	clearQualStartTimeout(channelId);
	clearQualReadyCheckTimeout(channelId);
	session.refAlert = null;
	sendQualCmd(channelId, `!mp map ${map.id}`);
	sendQualCmd(channelId, `!mp mods ${mod}`.trimEnd());
	sendQualCmd(channelId, `!mp timer ${Number(store.state.settings.refTimerDefault) || 120}`);
	session.state = "waiting_ready";
}

function sendQualCmd(channelId: number, cmd: string) {
	socket.emit("input", {target: channelId, text: cmd});
}

function sendQualStart(channelId: number) {
	const session = ensureQualSession(channelId);
	const startTimer = Number(store.state.settings.refStartTimer);

	clearQualStartTimeout(channelId);
	session.refAlert = null;
	session.state = "running";
	sendQualCmd(channelId, startTimer > 0 ? `!mp start ${startTimer}` : "!mp start");
}

function scheduleQualStart(channelId: number) {
	const session = ensureQualSession(channelId);
	const runtime = getQualRuntime(channelId);

	clearQualStartTimeout(channelId);
	session.state = "starting";
	runtime.startTimeout = setTimeout(() => {
		sendQualStart(channelId);
	}, 350);
}

function clearQualStartTimeout(channelId: number) {
	const runtime = qualRuntimes.get(channelId);

	if (runtime?.startTimeout) {
		clearTimeout(runtime.startTimeout);
		runtime.startTimeout = null;
	}
}

function clearQualReadyCheckTimeout(channelId: number) {
	const runtime = qualRuntimes.get(channelId);

	if (!runtime) {
		return;
	}

	if (runtime.readyCheckTimeout) {
		clearTimeout(runtime.readyCheckTimeout);
		runtime.readyCheckTimeout = null;
	}

	runtime.readyCheckPending = false;
}

function requestQualReadyCheck(channelId: number, delay = 0) {
	const session = ensureQualSession(channelId);
	const runtime = getQualRuntime(channelId);

	clearQualStartTimeout(channelId);
	clearQualReadyCheckTimeout(channelId);
	session.state = "checking_ready";
	runtime.settingsSnapshot = createQualSettingsSnapshot();

	const sendCheck = () => {
		runtime.readyCheckTimeout = null;
		runtime.readyCheckPending = false;
		sendQualCmd(channelId, "!mp settings");
	};

	if (delay > 0) {
		runtime.readyCheckPending = true;
		runtime.readyCheckTimeout = setTimeout(sendCheck, delay);
		return;
	}

	sendCheck();
}

function setQualRefAlert(channelId: number, message: string) {
	ensureQualSession(channelId).refAlert = message;
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

function triggerEmergency(channelId: number, nick: string, text: string) {
	const session = ensureQualSession(channelId);

	session.emergencyWho = nick;
	session.emergencyMsg = text;
	pauseQuals(channelId, `Automation paused by ${nick}: ${text}`);

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

function resetQualSettingsSnapshotIfNeeded(channelId: number, text: string) {
	if (/^(?:Room|Match)\s+name:\s*/i.test(cleanIrcMessage(text).trim())) {
		getQualRuntime(channelId).settingsSnapshot = createQualSettingsSnapshot();
	}
}

function processQualSettingsLine(channelId: number, text: string) {
	const session = getQualSession(channelId);
	const runtime = getQualRuntime(channelId);

	if (session.state !== "checking_ready") {
		return;
	}

	if (runtime.readyCheckPending) {
		return;
	}

	resetQualSettingsSnapshotIfNeeded(channelId, text);
	runtime.settingsSnapshot = applyQualSettingsLine(runtime.settingsSnapshot, text);

	if (!isQualSettingsSnapshotComplete(runtime.settingsSnapshot)) {
		return;
	}

	if (!runtime.settingsSnapshot.slots.every((slot) => slot.ready)) {
		session.state = "waiting_ready";
		runtime.settingsSnapshot = createQualSettingsSnapshot();
		return;
	}

	runtime.settingsSnapshot = createQualSettingsSnapshot();
	scheduleQualStart(channelId);
}

function handleQualPlayerChange(channelId: number) {
	const session = getQualSession(channelId);

	if (session.state === "checking_ready" || session.state === "starting") {
		requestQualReadyCheck(channelId, 350);
	}
}

function processQualsMessage(channelId: number, text: string) {
	const session = getQualSession(channelId);
	const event = getQualsMessageEvent(text);

	if (session.state === "checking_ready") {
		processQualSettingsLine(channelId, text);
	}

	if (event === "player_change") {
		handleQualPlayerChange(channelId);
		return;
	}

	switch (session.state) {
		case "waiting_ready":
			if (event === "ready") {
				requestQualReadyCheck(channelId);
			}

			break;

		case "running":
			if (event === "finished") {
				advanceQuals(channelId);
			}

			break;
	}
}

function advanceQuals(channelId: number) {
	const session = ensureQualSession(channelId);
	const totalRuns = Number(store.state.settings.refQualTotalRuns) || 1;
	const totalMaps = session.mappool.length;
	const next = getNextQualCursor(session.currentMapIdx, session.currentRun, totalMaps, totalRuns);

	if (next) {
		session.currentMapIdx = next.mapIndex;
		session.currentRun = next.run;
		setNextMap(channelId);
		return;
	}

	clearQualStartTimeout(channelId);
	clearQualReadyCheckTimeout(channelId);
	session.state = "done";
}

// ─── BanchoBot message router ─────────────────────────────────────────────────

export function processBanchoMessage(
	nick: string,
	text: string,
	channelId?: number,
	isSelf = false
) {
	const isBanchoBot = isBanchoBotNick(nick);
	const normalizedText = cleanIrcMessage(text);
	const session = channelId === undefined ? null : getQualSession(channelId);
	const qualsActive =
		session !== null &&
		session.state !== "idle" &&
		session.state !== "done" &&
		session.state !== "paused";

	if (isBanchoBot && channelId !== undefined) {
		const lobbyName = getLobbyNameFromSettingsMessage(normalizedText);

		if (lobbyName) {
			setQualLobbyName(channelId, lobbyName);
		}
	}

	// Emergency word — any player, any message
	if (qualsActive && channelId !== undefined && !isBanchoBot) {
		const eWord = String(store.state.settings.refQualEmergencyWord ?? "").trim();

		if (shouldTriggerQualsEmergency(normalizedText, eWord, isSelf, isBanchoBot)) {
			triggerEmergency(channelId, nick, normalizedText);
		}

		return;
	}

	if (qualsActive && channelId !== undefined && isBanchoBot) {
		processQualsMessage(channelId, normalizedText);

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
