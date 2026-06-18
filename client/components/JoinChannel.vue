<template>
	<form
		:id="'join-channel-' + channel.id"
		class="join-form"
		method="post"
		action=""
		autocomplete="off"
		@keydown.esc.prevent="$emit('toggle-join-channel')"
		@submit.prevent="onSubmit"
	>
		<input
			v-model="inputChannel"
			v-focus
			type="text"
			class="input"
			name="channel"
			placeholder="#channel or username"
			pattern="[^\s]+"
			maxlength="200"
			title="Channel names and usernames may not contain spaces"
			required
		/>
		<button type="submit" class="btn btn-small">Open</button>
	</form>
</template>

<script lang="ts">
import {defineComponent, PropType, ref} from "vue";
import {switchToChannel} from "../js/router";
import socket from "../js/socket";
import {useStore} from "../js/store";
import {ClientNetwork, ClientChan} from "../js/types";
import {ChanState} from "../../shared/types/chan";

export default defineComponent({
	name: "JoinChannel",
	directives: {
		focus: {
			mounted: (el: HTMLFormElement) => el.focus(),
		},
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	emits: ["toggle-join-channel"],
	setup(props, {emit}) {
		const store = useStore();
		const inputChannel = ref("");

		const onSubmit = () => {
			const target = inputChannel.value.trim();

			if (!target) {
				return;
			}

			const isChannel = target.startsWith("#");
			const existingChannel = store.getters.findChannelOnCurrentNetwork(target);

			if (existingChannel && (!isChannel || existingChannel.state !== ChanState.PARTED)) {
				switchToChannel(existingChannel);
			} else {
				socket.emit("input", {
					text: isChannel ? `/join ${target}` : `/query ${target}`,
					target: props.channel.id,
				});
			}

			inputChannel.value = "";
			emit("toggle-join-channel");
		};

		return {
			inputChannel,
			onSubmit,
		};
	},
});
</script>
