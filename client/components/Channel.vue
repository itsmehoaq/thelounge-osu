<template>
	<!-- TODO: investigate -->
	<ChannelWrapper ref="wrapper" v-bind="$props">
		<span class="name">{{ channel.name }}</span>
		<span
			v-if="channel.unread"
			:class="{highlight: channel.highlight && !channel.muted}"
			class="badge"
			>{{ unreadCount }}</span
		>
		<template v-if="channel.type === 'channel'">
			<span
				v-if="channel.state === 0"
				class="parted-channel-tooltip tooltipped tooltipped-w"
				aria-label="Rejoin"
			>
				<button class="parted-channel-icon" aria-label="Rejoin" @click.stop="rejoin" />
			</span>
			<span class="close-tooltip tooltipped tooltipped-w" data-tooltip="Leave">
				<button class="close" aria-label="Leave" @click.stop="close" />
			</span>
		</template>
		<template v-else>
			<span class="close-tooltip tooltipped tooltipped-w" data-tooltip="Close">
				<button class="close" aria-label="Close" @click.stop="close" />
			</span>
		</template>
	</ChannelWrapper>
</template>

<script lang="ts">
import {PropType, defineComponent, computed} from "vue";
import roundBadgeNumber from "../js/helpers/roundBadgeNumber";
import useCloseChannel from "../js/hooks/use-close-channel";
import socket from "../js/socket";
import {ClientChan, ClientNetwork} from "../js/types";
import ChannelWrapper from "./ChannelWrapper.vue";

export default defineComponent({
	name: "Channel",
	components: {
		ChannelWrapper,
	},
	props: {
		network: {
			type: Object as PropType<ClientNetwork>,
			required: true,
		},
		channel: {
			type: Object as PropType<ClientChan>,
			required: true,
		},
		active: Boolean,
		isFiltering: Boolean,
	},
	setup(props) {
		const unreadCount = computed(() => roundBadgeNumber(props.channel.unread));
		const close = useCloseChannel(props.channel);
		const rejoin = () => {
			socket.emit("input", {
				target: props.channel.id,
				text: `/join ${props.channel.name}`,
			});
		};

		return {
			unreadCount,
			close,
			rejoin,
		};
	},
});
</script>
