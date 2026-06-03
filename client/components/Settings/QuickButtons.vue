<template>
	<div>
		<h2>Quick action buttons</h2>

		<div class="rh-block">
			<p class="rh-section-label">Timer Defaults</p>

			<div class="osu-field">
				<label for="qb-timer-default" class="osu-label">
					Countdown timer
					<span class="rh-cmd-preview">!mp timer &lt;n&gt;</span>
				</label>
				<input
					id="qb-timer-default"
					:value="store.state.settings.refTimerDefault"
					type="number"
					name="refTimerDefault"
					class="input rh-number-input"
					min="0"
					max="600"
				/>
			</div>

			<div class="osu-field">
				<label for="qb-start-timer" class="osu-label">
					Start countdown
					<span class="rh-cmd-preview">!mp start &lt;n&gt;</span>
				</label>
				<p class="osu-hint">Set to 0 for instant start</p>
				<input
					id="qb-start-timer"
					:value="store.state.settings.refStartTimer"
					type="number"
					name="refStartTimer"
					class="input rh-number-input"
					min="0"
					max="600"
				/>
			</div>
		</div>

		<p class="qb-hint">
			Built-in buttons (Settings, Timer, Start, Abort) always appear. Add custom buttons
			below to send one or more commands in sequence.
		</p>

		<div v-if="customButtons.length > 0" class="qb-list">
			<div v-for="btn in customButtons" :key="btn.id" class="qb-item">
				<div class="qb-item-info">
					<span class="qb-item-icon">
						<component :is="resolveIcon(btn.icon)" :size="13" />
					</span>
					<span :class="['qb-item-label', {danger: btn.danger}]">{{ btn.label }}</span>
					<span class="qb-item-cmds">{{ btn.commands.join(" → ") }}</span>
				</div>
				<div class="qb-item-actions">
					<button type="button" class="btn btn-small" @click="startEdit(btn)">Edit</button>
					<button
						type="button"
						class="btn btn-small btn-danger"
						@click="remove(btn.id)"
					>
						Remove
					</button>
				</div>
			</div>
		</div>
		<p v-else class="qb-empty">No custom buttons yet.</p>

		<div v-if="formOpen" class="qb-form">
			<h3>{{ editingId ? "Edit button" : "New button" }}</h3>

			<label class="opt qb-field">
				<span class="qb-field-label">Label</span>
				<input
					v-model.trim="formLabel"
					type="text"
					class="input"
					maxlength="24"
					placeholder="e.g. Set Map"
					@keydown.stop
				/>
			</label>

			<label class="opt qb-field">
				<span class="qb-field-label">Commands <small>(one per line)</small></span>
				<textarea
					v-model="formCommands"
					class="input qb-textarea"
					placeholder="!mp map 123456&#10;!mp mods HD HR&#10;!mp start 10"
					rows="4"
					@keydown.stop
				/>
			</label>

			<div class="opt qb-field">
				<span class="qb-field-label">
					Icon
					<small>
						— Lucide icon name, e.g.
						<code>Trophy</code>, <code>Star</code>, <code>Sword</code>
					</small>
				</span>
				<div class="qb-icon-row">
					<input
						v-model.trim="formIcon"
						type="text"
						class="input qb-icon-input"
						placeholder="Zap"
						@keydown.stop
					/>
					<span class="qb-icon-preview" :title="iconValid ? formIcon : 'Unknown icon — using Zap'">
						<component :is="resolveIcon(formIcon)" :size="16" />
					</span>
					<span v-if="formIcon && !iconValid" class="qb-icon-warn">unknown, using Zap</span>
				</div>
			</div>

			<label class="opt qb-field qb-field-inline">
				<input v-model="formDanger" type="checkbox" />
				Red hover color (for destructive actions)
			</label>

			<div class="qb-form-actions">
				<button
					type="button"
					class="btn"
					:disabled="!formLabel || !formCommands.trim()"
					@click="save"
				>
					{{ editingId ? "Update" : "Add button" }}
				</button>
				<button type="button" class="btn btn-small" @click="closeForm">Cancel</button>
			</div>
		</div>

		<button v-if="!formOpen" type="button" class="btn" @click="openNew">
			+ Add custom button
		</button>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, computed} from "vue";
import * as LucideIcons from "lucide-vue-next";
import {Zap} from "lucide-vue-next";
import {useStore} from "../../js/store";
import {
	customButtons,
	addButton,
	updateButton,
	removeButton,
	type QuickButton,
} from "../../js/helpers/quickButtons";

function resolveIcon(name?: string) {
	if (name && Object.prototype.hasOwnProperty.call(LucideIcons, name)) {
		return (LucideIcons as Record<string, unknown>)[name];
	}

	return Zap;
}

export default defineComponent({
	name: "QuickButtonsSettings",
	setup() {
		const store = useStore();
		const formOpen = ref(false);
		const editingId = ref<string | null>(null);
		const formLabel = ref("");
		const formCommands = ref("");
		const formIcon = ref("");
		const formDanger = ref(false);

		const iconValid = computed(
			() =>
				!formIcon.value ||
				Object.prototype.hasOwnProperty.call(LucideIcons, formIcon.value)
		);

		const resetForm = () => {
			formLabel.value = "";
			formCommands.value = "";
			formIcon.value = "";
			formDanger.value = false;
			editingId.value = null;
		};

		const openNew = () => {
			resetForm();
			formOpen.value = true;
		};

		const startEdit = (btn: QuickButton) => {
			editingId.value = btn.id;
			formLabel.value = btn.label;
			formCommands.value = btn.commands.join("\n");
			formIcon.value = btn.icon ?? "";
			formDanger.value = btn.danger;
			formOpen.value = true;
		};

		const closeForm = () => {
			formOpen.value = false;
			resetForm();
		};

		const save = () => {
			const commands = formCommands.value
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);

			if (!formLabel.value || commands.length === 0) return;

			const btn = {
				label: formLabel.value,
				commands,
				danger: formDanger.value,
				icon: formIcon.value || undefined,
			};

			if (editingId.value) {
				updateButton(editingId.value, btn);
			} else {
				addButton(btn);
			}

			closeForm();
		};

		const remove = (id: string) => {
			removeButton(id);
		};

		return {
			store,
			customButtons,
			formOpen,
			editingId,
			formLabel,
			formCommands,
			formIcon,
			formDanger,
			iconValid,
			openNew,
			startEdit,
			closeForm,
			save,
			remove,
			resolveIcon,
		};
	},
});
</script>

<style>
.qb-hint {
	color: var(--body-color-muted);
	font-size: 13px;
	margin-bottom: 16px;
}

.qb-empty {
	color: var(--body-color-muted);
	font-size: 13px;
	margin-bottom: 12px;
}

.qb-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-bottom: 16px;
}

.qb-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 12px;
	border: 1px solid #2a2a40;
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.15);
}

.qb-item-info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.qb-item-icon {
	display: flex;
	align-items: center;
	color: #9999bb;
	margin-bottom: 1px;
}

.qb-item-label {
	font-size: 13px;
	font-weight: 600;
	font-family: monospace;
	color: var(--body-color);
}

.qb-item-label.danger {
	color: #ff4466;
}

.qb-item-cmds {
	font-size: 11px;
	color: var(--body-color-muted);
	font-family: monospace;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.qb-item-actions {
	display: flex;
	gap: 6px;
	flex-shrink: 0;
}

.btn-danger {
	border-color: #ff4466;
	color: #ff4466;
}

.btn-danger:hover {
	background: #ff4466;
	color: #fff;
}

/* Form */
.qb-form {
	border: 1px solid #2a2a40;
	border-radius: 4px;
	padding: 16px;
	margin-bottom: 16px;
	background: rgba(0, 0, 0, 0.1);
}

.qb-form h3 {
	margin: 0 0 14px;
	font-size: 13px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--body-color-muted);
}

.qb-field {
	display: flex;
	flex-direction: column;
	gap: 5px;
	margin-bottom: 12px;
}

.qb-field-inline {
	flex-direction: row !important;
	align-items: center;
	gap: 8px !important;
	margin-bottom: 14px;
}

.qb-field-label {
	font-size: 12px;
	font-weight: 600;
	color: var(--body-color-muted);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.qb-field-label small {
	text-transform: none;
	letter-spacing: 0;
	font-weight: 400;
}

.qb-field-label code {
	font-family: monospace;
	background: rgba(255, 102, 170, 0.12);
	color: #ff66aa;
	padding: 1px 4px;
	border-radius: 3px;
	font-size: 11px;
}

.qb-textarea {
	resize: vertical;
	min-height: 80px;
	font-family: monospace;
	font-size: 12px;
	line-height: 1.5;
}

.qb-icon-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.qb-icon-input {
	max-width: 160px;
}

.qb-icon-preview {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: 1px solid #2a2a40;
	border-radius: 4px;
	color: #ff66aa;
	flex-shrink: 0;
}

.qb-icon-warn {
	font-size: 11px;
	color: var(--body-color-muted);
	font-style: italic;
}

.qb-form-actions {
	display: flex;
	gap: 8px;
	align-items: center;
}
</style>
