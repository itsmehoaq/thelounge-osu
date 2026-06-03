<template>
	<div>
		<h2>Referee Helper</h2>

		<div class="rh-master-toggle opt">
			<label>
				<input
					:checked="store.state.settings.refHelperEnabled"
					type="checkbox"
					name="refHelperEnabled"
				/>
				Enable referee helper
			</label>
		</div>

		<fieldset :disabled="!store.state.settings.refHelperEnabled" class="rh-fieldset">

			<div class="rh-block">
				<p class="rh-section-label">Match Setup</p>

				<div class="osu-field">
					<label for="rh-win-condition" class="osu-label">Win condition</label>
					<select
						id="rh-win-condition"
						:value="store.state.settings.refWinCondition"
						name="refWinCondition"
						class="input rh-select"
					>
						<option value="score">Score</option>
						<option value="accuracy">Accuracy</option>
						<option value="combo">Combo</option>
						<option value="scorev2">Score V2</option>
					</select>
				</div>

				<div class="osu-field">
					<label class="osu-label">Team mode</label>
					<div class="rh-radio-group">
						<label class="rh-radio-opt">
							<input
								:checked="store.state.settings.refTeamMode === 'headtohead'"
								type="radio"
								name="refTeamMode"
								value="headtohead"
							/>
							Head-to-Head
						</label>
						<label class="rh-radio-opt">
							<input
								:checked="store.state.settings.refTeamMode === 'teamvs'"
								type="radio"
								name="refTeamMode"
								value="teamvs"
							/>
							Team VS
						</label>
					</div>
				</div>

				<div v-if="store.state.settings.refTeamMode === 'teamvs'" class="osu-field">
					<label for="rh-team-size" class="osu-label">Team size</label>
					<p class="osu-hint">Players per team — used for winner calculation.</p>
					<input
						id="rh-team-size"
						:value="store.state.settings.refTeamSize"
						type="number"
						name="refTeamSize"
						class="input rh-number-input"
						min="1"
						max="8"
					/>
				</div>
			</div>

			<div class="rh-block">
				<p class="rh-section-label">Winner Hint</p>

				<div class="opt rh-inline-toggle">
					<label>
						<input
							:checked="store.state.settings.refShowWinnerHint"
							type="checkbox"
							name="refShowWinnerHint"
						/>
						Show winner hint after each map
					</label>
				</div>
				<p class="osu-hint rh-hint-note">
					Parses BanchoBot match results and shows the likely winner inline.
					Requires osu! APIv2 credentials below for Accuracy / Combo modes.
				</p>
			</div>

			<div class="rh-block">
				<p class="rh-section-label">osu! API Credentials</p>
				<p class="osu-hint rh-hint-note">
					Create an OAuth application at
					<a href="https://osu.ppy.sh/home/account/edit#oauth" target="_blank" rel="noopener">osu! settings → OAuth</a>
					using <em>Client Credentials</em> grant. Required for winner hints.
				</p>

				<div class="osu-field">
					<label for="rh-api-client-id" class="osu-label">Client ID</label>
					<input
						id="rh-api-client-id"
						:value="store.state.settings.osuApiClientId"
						type="text"
						name="osuApiClientId"
						class="input rh-api-input"
						placeholder="12345"
						autocomplete="off"
						@keydown.stop
					/>
				</div>

				<div class="osu-field">
					<label for="rh-api-client-secret" class="osu-label">Client Secret</label>
					<RevealPassword v-slot:default="slotProps" class="input-wrap password-container">
						<input
							id="rh-api-client-secret"
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
			</div>

			<div class="rh-block">
				<p class="rh-section-label">Timer Defaults</p>

				<div class="osu-field">
					<label for="rh-timer-default" class="osu-label">
						Countdown timer
						<span class="rh-cmd-preview">!mp timer &lt;n&gt;</span>
					</label>
					<input
						id="rh-timer-default"
						:value="store.state.settings.refTimerDefault"
						type="number"
						name="refTimerDefault"
						class="input rh-number-input"
						min="0"
						max="600"
					/>
				</div>

				<div class="osu-field">
					<label for="rh-start-timer" class="osu-label">
						Start countdown
						<span class="rh-cmd-preview">!mp start &lt;n&gt;</span>
					</label>
					<p class="osu-hint">Set to 0 for instant start (<code class="rh-inline-code">!mp start</code>).</p>
					<input
						id="rh-start-timer"
						:value="store.state.settings.refStartTimer"
						type="number"
						name="refStartTimer"
						class="input rh-number-input"
						min="0"
						max="600"
					/>
				</div>
			</div>

			<div class="rh-block">
				<p class="rh-section-label">Qualifiers Automation</p>

				<div class="opt rh-inline-toggle">
					<label>
						<input
							:checked="store.state.settings.refQualEnabled"
							type="checkbox"
							name="refQualEnabled"
						/>
						Enable Qualifiers Automation
					</label>
				</div>
				<p class="osu-hint rh-hint-note">
					Automates the map sequence: sets maps, waits for ready / timer, starts each map, advances through the pool.
					Set up the room manually before starting.
				</p>

				<template v-if="store.state.settings.refQualEnabled">
					<div class="osu-field">
						<label class="osu-label">Total runs</label>
						<div class="rh-radio-group">
							<label class="rh-radio-opt">
								<input
									:checked="store.state.settings.refQualTotalRuns === '1'"
									type="radio"
									name="refQualTotalRuns"
									value="1"
								/>
								1 run
							</label>
							<label class="rh-radio-opt">
								<input
									:checked="store.state.settings.refQualTotalRuns === '2'"
									type="radio"
									name="refQualTotalRuns"
									value="2"
								/>
								2 runs
							</label>
						</div>
					</div>

					<div class="osu-field">
						<label for="rh-qual-mappool" class="osu-label">Mappool</label>
						<p class="osu-hint">
							Paste from spreadsheet (tab-separated):
							<code class="rh-inline-code">NM1[tab]beatmapID</code> one per line.
							Mod is auto-set from the label prefix (NM, HD, HR, DT, FM, TB…).
						</p>
						<textarea
							id="rh-qual-mappool"
							:value="store.state.settings.refQualMappool"
							name="refQualMappool"
							class="input rh-mappool-textarea"
							placeholder="NM1&#9;1234567&#10;NM2&#9;2345678&#10;HD1&#9;3456789"
							spellcheck="false"
							@keydown.stop
						/>
					</div>

					<div class="osu-field">
						<label for="rh-qual-emergency" class="osu-label">Emergency stop keyword</label>
						<p class="osu-hint">Any player typing this pauses automation and triggers an alert.</p>
						<input
							id="rh-qual-emergency"
							:value="store.state.settings.refQualEmergencyWord"
							type="text"
							name="refQualEmergencyWord"
							class="input rh-api-input"
							placeholder="!stop"
							@keydown.stop
						/>
					</div>
				</template>
			</div>

		</fieldset>
	</div>
</template>

<script lang="ts">
import {defineComponent} from "vue";
import {useStore} from "../../js/store";
import RevealPassword from "../RevealPassword.vue";

export default defineComponent({
	name: "RefHelperSettings",
	components: {RevealPassword},
	setup() {
		const store = useStore();
		return {store};
	},
});
</script>

<style>
.rh-master-toggle {
	margin-bottom: 16px;
}

.rh-fieldset {
	border: none;
	padding: 0;
	margin: 0;
	min-width: 0;
	transition: opacity 0.15s;
}

.rh-fieldset:disabled {
	opacity: 0.35;
	pointer-events: none;
}

.rh-block {
	border: 1px solid #2a2a40;
	border-radius: 4px;
	padding: 14px 16px;
	margin-bottom: 12px;
	background: rgba(0, 0, 0, 0.1);
}

.rh-section-label {
	font-size: 11px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--body-color-muted);
	margin: 0 0 12px;
}

.rh-select {
	max-width: 200px;
}

.rh-radio-group {
	display: flex;
	gap: 20px;
}

.rh-radio-opt {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 14px;
	cursor: pointer;
}

.rh-radio-opt input {
	margin: 0;
}

.rh-number-input {
	max-width: 100px;
}

.rh-inline-toggle {
	margin-bottom: 6px;
}

.rh-hint-note {
	margin-top: 0;
}

.rh-cmd-preview {
	font-family: monospace;
	font-size: 10px;
	font-weight: 400;
	text-transform: none;
	letter-spacing: 0;
	color: #ff66aa;
	background: rgba(255, 102, 170, 0.1);
	padding: 1px 5px;
	border-radius: 3px;
	margin-left: 6px;
}

.rh-inline-code {
	font-family: monospace;
	font-size: 11px;
	background: rgba(255, 102, 170, 0.1);
	color: #ff66aa;
	padding: 1px 4px;
	border-radius: 3px;
}

.rh-api-input {
	max-width: 200px;
}

.rh-mappool-textarea {
	width: 100%;
	min-height: 120px;
	font-family: monospace;
	font-size: 12px;
	resize: vertical;
	tab-size: 4;
}
</style>
