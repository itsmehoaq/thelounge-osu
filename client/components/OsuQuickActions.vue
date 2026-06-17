<template>
	<!-- Quals automation warning banner -->
	<div
		v-if="store.state.settings.refQualEnabled && qualState !== 'emergency'"
		class="qa-quals-warning"
	>
		⚠ WARNING: Qualifiers Automation is enabled!
	</div>

	<!-- Emergency stop banner -->
	<div v-if="qualState === 'emergency'" class="qa-emergency-banner">
		<span class="qa-emergency-icon">!</span>
		<span class="qa-emergency-text">
			<strong>EMERGENCY STOP</strong> &mdash;
			<span class="qa-emergency-who">{{ qualEmergencyWho }}</span
			>:
			{{ qualEmergencyMsg }}
		</span>
		<div class="qa-emergency-actions">
			<button class="qa-btn" @click="resumeAfterEmergency">Dismiss</button>
			<button class="qa-btn qa-danger" @click="abortQuals">Abort Quals</button>
		</div>
	</div>

	<!-- Quals status bar -->
	<div v-else-if="qualsRunning" class="qa-quals-bar">
		<span class="qa-quals-map">
			<strong>{{ currentQualMap?.label }}</strong>
			({{ qualCurrentMapIdx + 1 }}/{{ qualMappool.length }}) &mdash; Run
			{{ qualCurrentRun }}/{{ qualTotalRuns }}
		</span>
		<span class="qa-quals-state">{{ qualStateLabel }}</span>
	</div>

	<div
		v-if="store.state.settings.refShowWinnerHint && winnerHint"
		:class="['qa-winner-bar', {error: winnerHintError}]"
	>
		<span class="qa-winner-text">{{ winnerHint }}</span>
		<button class="qa-winner-dismiss" @click="clearWinnerHint">×</button>
	</div>
	<div v-if="isVisible" id="osu-quick-actions">
		<button
			class="qa-btn qa-pool"
			:disabled="!store.state.isConnected || !parsedMappool.length"
			:title="parsedMappool.length ? 'Open mappool picker' : 'Import a mappool first'"
			@click="openPoolPicker"
		>
			<MapPinned :size="12" />
			<span class="qa-label">Pick Map</span>
		</button>
		<div class="qa-divider" />
		<button
			class="qa-btn qa-settings"
			:disabled="!store.state.isConnected"
			title="!mp settings"
			@click="sendSettings"
		>
			<Settings :size="12" />
			<span class="qa-label">Settings</span>
		</button>
		<button
			class="qa-btn qa-timer"
			:disabled="!store.state.isConnected"
			:title="`!mp timer ${store.state.settings.refTimerDefault || 120}`"
			@click="sendTimer"
		>
			<Clock :size="12" />
			<span class="qa-label">Timer</span>
		</button>
		<button
			class="qa-btn qa-start"
			:disabled="!store.state.isConnected"
			:title="
				Number(store.state.settings.refStartTimer) > 0
					? `!mp start ${store.state.settings.refStartTimer}`
					: '!mp start'
			"
			@click="sendStart"
		>
			<Play :size="12" />
			<span class="qa-label">Start</span>
		</button>
		<button
			class="qa-btn qa-abort qa-danger"
			:disabled="!store.state.isConnected"
			title="!mp abort"
			@click="sendAbort"
		>
			<Square :size="12" />
			<span class="qa-label">Abort</span>
		</button>
		<button class="qa-btn qa-save-log" title="Save chatlog" @click="saveChatLog">
			<Download :size="12" />
			<span class="qa-label">Save Log</span>
		</button>

		<template v-if="store.state.settings.refQualEnabled">
			<div class="qa-divider" />
			<button
				v-if="qualState === 'idle' || qualState === 'done'"
				class="qa-btn qa-quals-start"
				:disabled="!store.state.isConnected || !parsedMappool.length"
				:title="`Start Qualifiers (${parsedMappool.length} maps, ${qualTotalRuns} run${
					qualTotalRuns > 1 ? 's' : ''
				})`"
				@click="startQuals(channel.id)"
			>
				<Play :size="12" />
				<span class="qa-label">Quals</span>
			</button>
			<button
				v-else-if="qualState !== 'emergency'"
				class="qa-btn qa-danger"
				:disabled="!store.state.isConnected"
				title="Abort Qualifiers"
				@click="abortQuals"
			>
				<Square :size="12" />
				<span class="qa-label">Abort Quals</span>
			</button>
		</template>

		<template v-if="customButtons.length > 0">
			<div class="qa-divider" />
			<button
				v-for="btn in customButtons"
				:key="btn.id"
				:class="['qa-btn', 'qa-custom', {'qa-danger': btn.danger}]"
				:title="btn.commands.join('\n')"
				:disabled="!store.state.isConnected"
				@click="runCustom(btn)"
			>
				<component :is="resolveIcon(btn.icon)" :size="12" />
				<span class="qa-label">{{ btn.label }}</span>
			</button>
		</template>
	</div>

	<div
		v-if="isVisible && poolPickerOpen && parsedMappool.length"
		class="qa-pool-modal-backdrop"
		@click.self="closePoolPicker"
	>
		<div class="qa-pool-modal" role="dialog" aria-modal="true" aria-label="Mappool picker">
			<div class="qa-pool-modal-head">
				<span class="qa-pool-title">Pick Map</span>
				<button
					type="button"
					class="qa-pool-close"
					aria-label="Close"
					@click="closePoolPicker"
				>
					x
				</button>
			</div>
			<div class="qa-pool-groups">
				<section v-for="group in groupedMappool" :key="group.name" class="qa-pool-group">
					<div class="qa-pool-group-title">{{ group.name }}</div>
					<div class="qa-pool-grid">
						<button
							v-for="map in group.maps"
							:key="`${map.label}-${map.id}`"
							type="button"
							class="qa-pool-map"
							:title="getMapPickTitle(map)"
							@click="pickMap(map)"
						>
							<span class="qa-pool-map-label">{{ map.label }}</span>
							<span class="qa-pool-map-id">{{ map.id }}</span>
							<span class="qa-pool-map-mod">{{ getMapModLabel(map) }}</span>
						</button>
					</div>
				</section>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType, computed, ref} from "vue";
import {useStore} from "../js/store";
import socket from "../js/socket";
import type {ClientNetwork, ClientChan} from "../js/types";
import {ChanType} from "../../shared/types/chan";
import {customButtons, type QuickButton} from "../js/helpers/quickButtons";
import {getLucideIcon} from "../js/helpers/lucideIcons";
import {requestChatLog} from "../js/helpers/chatLog";
import {
	winnerHint,
	winnerHintError,
	clearWinnerHint,
	qualState,
	qualCurrentMapIdx,
	qualCurrentRun,
	qualMappool,
	qualEmergencyWho,
	qualEmergencyMsg,
	startQuals,
	abortQuals,
	resumeAfterEmergency,
	type QualMap,
} from "../js/helpers/refHelper";
import {Settings, Clock, Play, Square, MapPinned, Download} from "lucide-vue-next";

export default defineComponent({
	name: "OsuQuickActions",
	components: {Settings, Clock, Play, Square, MapPinned, Download},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const store = useStore();
		const poolPickerOpen = ref(false);

		const isVisible = computed(() => /^#mp_/i.test(props.channel.name));

		const send = (text: string) => {
			socket.emit("input", {target: props.channel.id, text});
		};

		const openPoolPicker = () => {
			if (!store.state.isConnected || !parsedMappool.value.length) {
				return;
			}

			poolPickerOpen.value = true;
		};

		const closePoolPicker = () => {
			poolPickerOpen.value = false;
		};

		const sendSettings = () => send("!mp settings");

		const sendTimer = () => {
			const t = Number(store.state.settings.refTimerDefault) || 120;
			send(`!mp timer ${t}`);
		};
		const sendStart = () => {
			const t = Number(store.state.settings.refStartTimer);
			send(t > 0 ? `!mp start ${t}` : "!mp start");
		};
		const sendAbort = () => send("!mp abort");

		const saveChatLog = () => requestChatLog(props.channel.id);

		const runCustom = (btn: QuickButton) => {
			for (const cmd of btn.commands) {
				if (cmd.trim()) send(cmd.trim());
			}
		};

		const getMapPickCommands = (map: QualMap) => {
			const mod = String(map.mod ?? "").trim();
			const timer = Number(store.state.settings.refTimerDefault) || 120;

			return [
				`!mp map ${String(map.id).trim()}`,
				mod ? `!mp mods ${mod}` : "!mp mods",
				`!mp timer ${timer}`,
			];
		};

		const getMapPickTitle = (map: QualMap) => getMapPickCommands(map).join("\n");

		const getMapModLabel = (map: QualMap) => String(map.mod ?? "").trim() || "No mod";

		const pickMap = (map: QualMap) => {
			for (const cmd of getMapPickCommands(map)) {
				send(cmd);
			}

			closePoolPicker();
		};

		const qualsRunning = computed(
			() =>
				qualState.value !== "idle" &&
				qualState.value !== "done" &&
				qualState.value !== "emergency"
		);

		const currentQualMap = computed(() => qualMappool.value[qualCurrentMapIdx.value]);

		const qualTotalRuns = computed(() => Number(store.state.settings.refQualTotalRuns) || 1);

		const parsedMappool = computed<QualMap[]>(() => {
			try {
				const stored = JSON.parse(String(store.state.settings.refQualMappoolParsed ?? ""));

				if (!Array.isArray(stored)) {
					return [];
				}

				return stored.filter(
					(map): map is QualMap =>
						typeof map?.label === "string" &&
						typeof map?.id === "string" &&
						typeof map?.mod === "string"
				);
			} catch {
				return [];
			}
		});

		const groupedMappool = computed(() => {
			const groups: {name: string; maps: QualMap[]}[] = [];
			const groupIndex = new Map<string, number>();

			for (const map of parsedMappool.value) {
				const name = map.label.trim().slice(0, 2).toUpperCase() || "??";
				const existing = groupIndex.get(name);

				if (existing === undefined) {
					groupIndex.set(name, groups.length);
					groups.push({name, maps: [map]});
				} else {
					groups[existing].maps.push(map);
				}
			}

			return groups;
		});

		const qualStateLabel = computed(() => {
			switch (qualState.value) {
				case "setting_map":
					return "Setting map…";
				case "verifying":
					return "Verifying…";
				case "waiting_ready":
					return "Waiting for players";
				case "running":
					return "Map running";
				case "done":
					return "Done";
				default:
					return "";
			}
		});

		return {
			store,
			isVisible,
			poolPickerOpen,
			customButtons,
			winnerHint,
			winnerHintError,
			clearWinnerHint,
			qualState,
			qualCurrentMapIdx,
			qualCurrentRun,
			qualMappool,
			qualEmergencyWho,
			qualEmergencyMsg,
			startQuals,
			abortQuals,
			resumeAfterEmergency,
			parsedMappool,
			groupedMappool,
			qualsRunning,
			currentQualMap,
			qualTotalRuns,
			qualStateLabel,
			openPoolPicker,
			closePoolPicker,
			pickMap,
			getMapPickTitle,
			getMapModLabel,
			sendSettings,
			sendTimer,
			sendStart,
			sendAbort,
			saveChatLog,
			runCustom,
			resolveIcon: getLucideIcon,
		};
	},
});
</script>

<style>
#osu-quick-actions {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 4px 8px;
	background: var(--window-bg-color);
	border-top: 1px solid #2a2a40;
	border-bottom: 1px solid #2a2a40;
	flex-wrap: wrap;
}

.qa-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 3px 10px;
	height: 26px;
	background: transparent;
	border: 1px solid transparent;
	border-radius: 3px;
	color: #9999bb;
	font-family: monospace;
	font-size: 11px;
	letter-spacing: 0.04em;
	cursor: pointer;
	transition: color 0.12s, background 0.12s, border-color 0.12s;
	white-space: nowrap;
}

.qa-btn svg {
	flex-shrink: 0;
	stroke: currentColor;
}

.qa-btn:hover:not(:disabled) {
	color: #ff66aa;
	background: rgba(255, 102, 170, 0.09);
	border-color: rgba(255, 102, 170, 0.2);
}

.qa-btn:active:not(:disabled) {
	transform: translateY(1px);
}

.qa-btn.qa-danger:hover:not(:disabled) {
	color: #ff4466;
	background: rgba(255, 68, 102, 0.09);
	border-color: rgba(255, 68, 102, 0.2);
}

.qa-btn:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.qa-divider {
	width: 1px;
	height: 16px;
	background: #2a2a40;
	margin: 0 4px;
	flex-shrink: 0;
}

.morning #osu-quick-actions {
	border-top-color: #28333d;
	border-bottom-color: #28333d;
}

.morning .qa-divider {
	background: #28333d;
}

.qa-pool-modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 30;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 24px 12px 48px;
	background: rgba(0, 0, 0, 0.32);
}

.qa-pool-modal {
	width: min(680px, calc(100vw - 24px));
	max-height: min(520px, 60vh);
	overflow: hidden;
	background: var(--window-bg-color);
	border: 1px solid #2a2a40;
	border-radius: 4px;
	box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
}

.qa-pool-modal-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 10px 12px;
	border-bottom: 1px solid #2a2a40;
}

.qa-pool-title {
	color: #ff66aa;
	font-family: monospace;
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}

.qa-pool-close {
	width: 24px;
	height: 24px;
	padding: 0;
	background: transparent;
	border: 1px solid transparent;
	border-radius: 3px;
	color: #9999bb;
	cursor: pointer;
	font-family: monospace;
	font-size: 12px;
	line-height: 1;
}

.qa-pool-close:hover {
	color: #ff66aa;
	background: rgba(255, 102, 170, 0.09);
	border-color: rgba(255, 102, 170, 0.2);
}

.qa-pool-groups {
	max-height: calc(min(520px, 60vh) - 45px);
	overflow: auto;
	padding: 10px;
}

.qa-pool-group + .qa-pool-group {
	margin-top: 12px;
}

.qa-pool-group-title {
	margin: 0 0 6px;
	color: #ff66aa;
	font-family: monospace;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.qa-pool-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
	gap: 6px;
}

.qa-pool-map {
	display: grid;
	gap: 3px;
	min-width: 0;
	padding: 8px 9px;
	background: rgba(255, 255, 255, 0.02);
	border: 1px solid #2a2a40;
	border-radius: 4px;
	color: #9999bb;
	cursor: pointer;
	font-family: monospace;
	text-align: left;
}

.qa-pool-map:hover {
	color: #ff66aa;
	background: rgba(255, 102, 170, 0.08);
	border-color: rgba(255, 102, 170, 0.24);
}

.qa-pool-map-label {
	overflow: hidden;
	color: inherit;
	font-size: 13px;
	font-weight: 700;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qa-pool-map-id,
.qa-pool-map-mod {
	overflow: hidden;
	color: #777799;
	font-size: 10px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qa-pool-map-mod {
	color: #66ddaa;
}

.morning .qa-pool-modal {
	border-color: #28333d;
}

.morning .qa-pool-modal-head,
.morning .qa-pool-map {
	border-color: #28333d;
}

.qa-winner-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 12px;
	background: rgba(255, 102, 170, 0.1);
	border-bottom: 1px solid rgba(255, 102, 170, 0.25);
	font-size: 12px;
	font-family: monospace;
	color: #ff66aa;
	gap: 8px;
}

.qa-winner-bar.error {
	background: rgba(255, 68, 102, 0.08);
	border-bottom-color: rgba(255, 68, 102, 0.2);
	color: #ff4466;
}

.qa-winner-text {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qa-winner-dismiss {
	background: transparent;
	border: none;
	color: inherit;
	opacity: 0.6;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	padding: 0 2px;
	flex-shrink: 0;
}

.qa-winner-dismiss:hover {
	opacity: 1;
}

/* Quals automation warning banner */
.qa-quals-warning {
	padding: 4px 12px;
	background: rgba(255, 191, 0, 0.08);
	border-bottom: 1px solid rgba(255, 191, 0, 0.3);
	color: #ffbf00;
	font-family: monospace;
	font-size: 11px;
	letter-spacing: 0.04em;
}

/* Emergency banner */
.qa-emergency-banner {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 12px;
	background: rgba(255, 40, 70, 0.18);
	border-bottom: 1px solid rgba(255, 40, 70, 0.5);
	animation: qa-emergency-pulse 0.8s ease-in-out infinite alternate;
}

@keyframes qa-emergency-pulse {
	from {
		background: rgba(255, 40, 70, 0.12);
	}
	to {
		background: rgba(255, 40, 70, 0.28);
	}
}

.qa-emergency-icon {
	font-size: 14px;
	font-weight: 900;
	color: #ff2846;
	flex-shrink: 0;
	width: 18px;
	height: 18px;
	border: 2px solid #ff2846;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	line-height: 1;
}

.qa-emergency-text {
	flex: 1;
	font-size: 12px;
	font-family: monospace;
	color: #ff6680;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qa-emergency-who {
	color: #ff99aa;
}

.qa-emergency-actions {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
}

/* Quals status bar */
.qa-quals-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 3px 12px;
	background: rgba(255, 102, 170, 0.06);
	border-bottom: 1px solid rgba(255, 102, 170, 0.15);
	font-size: 11px;
	font-family: monospace;
	color: #9999bb;
	gap: 8px;
}

.qa-quals-map {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qa-quals-map strong {
	color: #ff66aa;
}

.qa-quals-state {
	flex-shrink: 0;
	color: #6666aa;
	font-size: 10px;
}

.qa-btn.qa-quals-start:not(:disabled) {
	color: #66ddaa;
}

.qa-btn.qa-quals-start:hover:not(:disabled) {
	color: #66ddaa;
	background: rgba(102, 221, 170, 0.09);
	border-color: rgba(102, 221, 170, 0.2);
}
</style>
