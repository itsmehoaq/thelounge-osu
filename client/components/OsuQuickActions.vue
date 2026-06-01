<template>
	<div
		v-if="store.state.settings.refShowWinnerHint && winnerHint"
		:class="['qa-winner-bar', {error: winnerHintError}]"
	>
		<span class="qa-winner-text">{{ winnerHint }}</span>
		<button class="qa-winner-dismiss" @click="clearWinnerHint">×</button>
	</div>
	<div v-if="isVisible" id="osu-quick-actions">
		<button class="qa-btn qa-settings" title="Settings" @click="openSettings">
			<Settings :size="12" />
			<span class="qa-label">Settings</span>
		</button>
		<div class="qa-divider" />
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
			:title="Number(store.state.settings.refStartTimer) > 0 ? `!mp start ${store.state.settings.refStartTimer}` : '!mp start'"
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
</template>

<script lang="ts">
import {defineComponent, PropType, computed} from "vue";
import {useRouter} from "vue-router";
import {useStore} from "../js/store";
import socket from "../js/socket";
import type {ClientNetwork, ClientChan} from "../js/types";
import {ChanType} from "../../shared/types/chan";
import {customButtons, type QuickButton} from "../js/helpers/quickButtons";
import {winnerHint, winnerHintError, clearWinnerHint} from "../js/helpers/refHelper";
import * as LucideIcons from "lucide-vue-next";
import {Settings, Clock, Play, Square, Zap} from "lucide-vue-next";

function resolveIcon(name?: string) {
	if (name && Object.prototype.hasOwnProperty.call(LucideIcons, name)) {
		return (LucideIcons as Record<string, unknown>)[name];
	}

	return Zap;
}

export default defineComponent({
	name: "OsuQuickActions",
	components: {Settings, Clock, Play, Square},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const store = useStore();
		const router = useRouter();

		const isVisible = computed(
			() =>
				props.channel.type === ChanType.CHANNEL || props.channel.type === ChanType.QUERY
		);

		const send = (text: string) => {
			socket.emit("input", {target: props.channel.id, text});
		};

		const openSettings = () => {
			void router.push("/settings/quick-buttons");
		};

		const sendTimer = () => {
			const t = Number(store.state.settings.refTimerDefault) || 120;
			send(`!mp timer ${t}`);
		};
		const sendStart = () => {
			const t = Number(store.state.settings.refStartTimer);
			send(t > 0 ? `!mp start ${t}` : "!mp start");
		};
		const sendAbort = () => send("!mp abort");

		const runCustom = (btn: QuickButton) => {
			for (const cmd of btn.commands) {
				if (cmd.trim()) send(cmd.trim());
			}
		};

		return {
			store,
			isVisible,
			customButtons,
			winnerHint,
			winnerHintError,
			clearWinnerHint,
			openSettings,
			sendTimer,
			sendStart,
			sendAbort,
			runCustom,
			resolveIcon,
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
</style>
