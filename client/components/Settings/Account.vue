<template>
	<div>
		<h2>osu! IRC</h2>

		<div v-if="saveStatus === 'ok'" class="feedback success">Settings saved. Reconnect to apply.</div>
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
			<button type="button" class="btn" @click="saveAndReconnect">Save &amp; Reconnect</button>
		</div>
		<p class="osu-hint">Reconnect will open a new connection using the updated credentials.</p>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, reactive} from "vue";
import RevealPassword from "../RevealPassword.vue";
import {storedCredentials, saveCredentials} from "../../js/helpers/osuCredentials";
import {useRouter} from "vue-router";
import socket from "../../js/socket";
import {useStore} from "../../js/store";

export default defineComponent({
	name: "OsuIrcSettings",
	components: {RevealPassword},
	setup() {
		const router = useRouter();
		const store = useStore();
		const saveStatus = ref<"ok" | "err" | null>(null);

		const form = reactive({
			nick: storedCredentials.value?.nick ?? "",
			password: storedCredentials.value?.password ?? "",
		});

		let statusTimer: ReturnType<typeof setTimeout> | null = null;

		const saveAndReconnect = () => {
			if (!form.nick || !form.password) {
				saveStatus.value = "err";
				return;
			}

			try {
				saveCredentials({nick: form.nick, password: form.password});
				saveStatus.value = "ok";
				if (statusTimer) clearTimeout(statusTimer);
				statusTimer = setTimeout(() => (saveStatus.value = null), 3000);
			} catch {
				saveStatus.value = "err";
				return;
			}

			// Disconnect all current networks then navigate to /connect (auto-connect will fire)
			const networks = store.state.networks;
			for (const net of networks) {
				socket.emit("input", {target: net.channels[0].id, text: "/quit"});
			}
			setTimeout(() => router.push("/connect"), 400);
		};

		return {store, form, saveStatus, saveAndReconnect};
	},
});
</script>

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

.osu-save-row {
	display: flex;
	gap: 8px;
	margin-top: 4px;
	margin-bottom: 4px;
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
