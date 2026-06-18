<template>
	<ChannelWrapper v-bind="$props" :channel="channel">
		<button
			v-if="network.channels.length > 1"
			:aria-controls="'network-' + network.uuid"
			:aria-label="getExpandLabel(network)"
			:aria-expanded="!network.isCollapsed"
			class="collapse-network"
			@click.stop="onCollapseClick"
		>
			<span class="collapse-network-icon" />
		</button>
		<span v-else class="collapse-network" />
		<div class="lobby-wrap">
			<span :title="channel.name" class="name">{{ channel.name }}</span>
			<span
				v-if="!store.state.isConnected || !network.status.connected"
				:aria-label="reconnectLabel"
				class="reconnect-network-tooltip tooltipped tooltipped-w tooltipped-no-touch"
			>
				<button
					type="button"
					class="reconnect-network"
					:aria-label="reconnectLabel"
					@click.stop="reconnect"
				>
					<RotateCcw :size="13" />
				</button>
			</span>
			<span v-if="channel.unread" :class="{highlight: channel.highlight}" class="badge">{{
				unreadCount
			}}</span>
		</div>
		<span
			:aria-label="joinChannelLabel"
			class="add-channel-tooltip tooltipped tooltipped-w tooltipped-no-touch"
		>
			<button
				:class="['add-channel', {opened: isJoinChannelShown}]"
				:aria-controls="'join-channel-' + channel.id"
				:aria-label="joinChannelLabel"
				@click.stop="$emit('toggle-join-channel')"
			/>
		</span>
	</ChannelWrapper>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import collapseNetwork from "../js/helpers/collapseNetwork";
import roundBadgeNumber from "../js/helpers/roundBadgeNumber";
import socket from "../js/socket";
import {useStore} from "../js/store";
import ChannelWrapper from "./ChannelWrapper.vue";
import {RotateCcw} from "lucide-vue-next";

import type {ClientChan, ClientNetwork} from "../js/types";

export default defineComponent({
	name: "Channel",
	components: {
		ChannelWrapper,
		RotateCcw,
	},
	props: {
		network: {
			type: Object as PropType<ClientNetwork>,
			required: true,
		},
		isJoinChannelShown: Boolean,
		active: Boolean,
		isFiltering: Boolean,
	},
	emits: ["toggle-join-channel"],
	setup(props) {
		const store = useStore();
		const channel = computed(() => {
			return props.network.channels[0];
		});

		const joinChannelLabel = computed(() => {
			return props.isJoinChannelShown ? "Cancel" : "Join a channel or message a user…";
		});

		const unreadCount = computed(() => {
			return roundBadgeNumber(channel.value.unread);
		});

		const reconnectLabel = computed(() =>
			store.state.isConnected ? "Reconnect network" : "Reconnect to server"
		);

		const reconnect = () => {
			if (!store.state.isConnected) {
				socket.connect();
				return;
			}

			socket.emit("input", {
				target: channel.value.id,
				text: "/connect",
			});
		};

		const onCollapseClick = () => {
			collapseNetwork(props.network, !props.network.isCollapsed);
		};

		const getExpandLabel = (network: ClientNetwork) => {
			return network.isCollapsed ? "Expand" : "Collapse";
		};

		return {
			store,
			channel,
			joinChannelLabel,
			unreadCount,
			reconnectLabel,
			reconnect,
			onCollapseClick,
			getExpandLabel,
		};
	},
});
</script>
