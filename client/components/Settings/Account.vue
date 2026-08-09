<template>
	<div>
		<h2>osu! IRC</h2>

		<div v-if="saveStatus === 'ok'" class="feedback success">
			Credentials updated. Reconnecting…
		</div>
		<div v-else-if="saveStatus === 'disconnected'" class="feedback success">
			Disconnected from osu! IRC.
		</div>
		<div v-else-if="saveStatus === 'err'" class="feedback error">Failed to save settings.</div>

		<!-- Username -->
		<div class="opt osu-field">
			<label for="osu-nick" class="osu-label">osu! username</label>
			<input
				id="osu-nick"
				v-model.trim="form.nick"
				type="text"
				class="input"
				placeholder="YourOsuUsername"
				autocomplete="off"
				@keydown.stop
			/>
		</div>

		<!-- IRC password -->
		<div class="opt osu-field">
			<label for="osu-password" class="osu-label">IRC password</label>
			<p class="osu-hint">
				Not your account password.
				<a
					href="https://osu.ppy.sh/home/account/edit#:~:text=Unlink%20GitHub%20Account-,Legacy%20API,-api"
					target="_blank"
					rel="noopener"
				>Get it here</a>.
			</p>
			<RevealPassword v-slot:default="slotProps" class="input-wrap password-container">
				<input
					id="osu-password"
					v-model="form.password"
					:type="slotProps.isVisible ? 'text' : 'password'"
					class="input"
					placeholder="IRC server password"
					autocomplete="off"
					@keydown.stop
				/>
			</RevealPassword>
			<label class="opt osu-remember-credentials">
				<input v-model="rememberCredentials" type="checkbox" />
				Remember credentials on this device
			</label>
		</div>

		<!-- osu! credentials -->
		<div class="opt osu-field">
			<label class="osu-label">osu! credentials</label>
			<p class="osu-hint">
				Create an OAuth application at osu! settings → OAuth using Client Credentials grant.
				Required for winner hints.
			</p>
			<input
				:value="store.state.settings.osuApiClientId"
				type="text"
				name="osuApiClientId"
				class="input"
				placeholder="12345"
				autocomplete="off"
				@keydown.stop
			/>
			<RevealPassword v-slot:default="slotProps" class="input-wrap password-container">
				<input
					:value="store.state.settings.osuApiClientSecret"
					:type="slotProps.isVisible ? 'text' : 'password'"
					name="osuApiClientSecret"
					class="input"
					placeholder="Client secret"
					autocomplete="off"
					@keydown.stop
				/>
			</RevealPassword>
		</div>

		<div class="osu-save-row">
			<button type="button" class="btn" @click="saveAndReconnect">
				<RefreshCw :size="14" aria-hidden="true" />
				<span>Save &amp; Reconnect</span>
			</button>
			<button
				type="button"
				class="btn osu-disconnect"
				:disabled="disconnecting || !canDisconnect"
				@click="disconnect"
			>
				<Power :size="14" aria-hidden="true" />
				<span>Disconnect</span>
			</button>
		</div>
		<p class="osu-hint">Reconnect will open a new connection using the updated credentials.</p>
	</div>
</template>

<style>
.osu-label {
	display: block;
	font-size: 12px;
	font-weight: 600;
	color: var(--body-color-muted);
	text-transform: uppercase;
	letter-spacing: 0.05em;
	margin-bottom: 5px;
}

.osu-hint {
	font-size: 12px;
	color: var(--body-color-muted);
	margin: 0 0 8px;
}

.osu-field {
	display: flex;
	flex-direction: column;
	margin-bottom: 14px;
}

.osu-remember-credentials {
	align-items: center;
	display: flex;
	gap: 8px;
	margin-top: 8px;
}

.osu-remember-credentials input {
	margin: 0;
}

.osu-save-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 4px;
	margin-bottom: 4px;
}

.osu-save-row .btn {
	align-items: center;
	display: inline-flex;
	gap: 7px;
}

.osu-disconnect {
	border-color: #ff4466;
	color: #ff4466;
}

.osu-disconnect:hover:not(:disabled),
.osu-disconnect:focus:not(:disabled) {
	background: #ff4466;
	color: #fff;
}

.feedback.success {
	padding: 8px 12px;
	background: rgba(80, 200, 100, 0.12);
	border: 1px solid rgba(80, 200, 100, 0.3);
	border-radius: 4px;
	color: #50c864;
	font-size: 13px;
	margin-bottom: 14px;
}

.feedback.error {
	padding: 8px 12px;
	background: rgba(255, 68, 102, 0.12);
	border: 1px solid rgba(255, 68, 102, 0.3);
	border-radius: 4px;
	color: #ff4466;
	font-size: 13px;
	margin-bottom: 14px;
}
</style>

<script lang="ts">
import {computed, defineComponent, ref, reactive} from "vue";
import {Power, RefreshCw} from "lucide-vue-next";
import RevealPassword from "../RevealPassword.vue";
import {
	clearCredentials,
	saveCredentials,
	storedCredentials,
} from "../../js/helpers/osuCredentials";
import socket from "../../js/socket";
import {useStore} from "../../js/store";

export default defineComponent({
	name: "OsuIrcSettings",
	components: {Power, RefreshCw, RevealPassword},
	setup() {
		const store = useStore();
		const saveStatus = ref<"ok" | "disconnected" | "err" | null>(null);
		const disconnecting = ref(false);
		const rememberCredentials = ref(storedCredentials.value !== null);
		const canDisconnect = computed(
			() =>
				store.state.isConnected &&
				store.state.networks.some((network) => network.status.connected)
		);

		const form = reactive({
			nick: storedCredentials.value?.nick ?? "",
			password: storedCredentials.value?.password ?? "",
		});

		let statusTimer: ReturnType<typeof setTimeout> | null = null;

		const showStatus = (status: "ok" | "disconnected" | "err") => {
			saveStatus.value = status;

			if (statusTimer) {
				clearTimeout(statusTimer);
			}

			statusTimer = setTimeout(() => {
				saveStatus.value = null;
				disconnecting.value = false;
			}, 3000);
		};

		const saveAndReconnect = () => {
			if (!form.nick || !form.password) {
				showStatus("err");
				return;
			}

			try {
				if (rememberCredentials.value) {
					saveCredentials({nick: form.nick, password: form.password});
				} else {
					clearCredentials();
				}

				showStatus("ok");
			} catch {
				showStatus("err");
				return;
			}

			const networks = store.state.networks;
			const reconnectData = {
				...store.state.serverConfiguration?.defaults,
				nick: form.nick,
				username: form.nick,
				password: form.password,
				join: "",
			};

			for (const net of networks) {
				socket.emit("input", {target: net.channels[0].id, text: "/quit"});
			}

			setTimeout(
				() => socket.emit("network:new", reconnectData),
				networks.length > 0 ? 400 : 0
			);
		};

		const disconnect = () => {
			if (disconnecting.value || !canDisconnect.value) {
				return;
			}

			disconnecting.value = true;

			for (const network of store.state.networks) {
				if (network.status.connected) {
					socket.emit("input", {target: network.channels[0].id, text: "/disconnect"});
				}
			}

			showStatus("disconnected");
		};

		return {
			store,
			form,
			saveStatus,
			disconnecting,
			canDisconnect,
			rememberCredentials,
			saveAndReconnect,
			disconnect,
		};
	},
});
</script>
