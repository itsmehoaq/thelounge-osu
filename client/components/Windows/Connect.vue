<template>
	<NetworkForm :handle-submit="handleSubmit" :defaults="defaults" :disabled="disabled" />
</template>

<script lang="ts">
import {defineComponent, ref, onMounted} from "vue";

import socket from "../../js/socket";
import {useStore} from "../../js/store";
import NetworkForm, {NetworkFormDefaults} from "../NetworkForm.vue";
import {
	clearCredentials,
	saveCredentials,
	storedCredentials,
} from "../../js/helpers/osuCredentials";

export default defineComponent({
	name: "Connect",
	components: {
		NetworkForm,
	},
	props: {
		queryParams: Object,
	},
	setup(props) {
		const store = useStore();

		const disabled = ref(false);
		const formRef = ref<InstanceType<typeof NetworkForm> | null>(null);

		const handleSubmit = (data: Record<string, any>) => {
			disabled.value = true;

			const managesStoredCredentials = Object.prototype.hasOwnProperty.call(
				data,
				"rememberCredentials"
			);
			const rememberCredentials =
				data.rememberCredentials === true || data.rememberCredentials === "1";
			delete data.rememberCredentials;

			if (managesStoredCredentials) {
				if (rememberCredentials && data.nick && data.password) {
					saveCredentials({nick: String(data.nick), password: String(data.password)});
				} else if (!rememberCredentials) {
					clearCredentials();
				}
			}

			data.join = "";
			socket.emit("network:new", data);
		};

		const parseOverrideParams = (params?: Record<string, string>) => {
			if (!params) {
				return {};
			}

			const parsedParams: Record<string, any> = {};

			for (let key of Object.keys(params)) {
				let value = params[key];

				// Param can contain multiple values in an array if its supplied more than once
				if (Array.isArray(value)) {
					value = value[0];
				}

				// Support `channels` as a compatibility alias with other clients
				if (key === "channels") {
					key = "join";
				}

				if (
					!Object.prototype.hasOwnProperty.call(
						store.state.serverConfiguration?.defaults,
						key
					)
				) {
					continue;
				}

				// When the network is locked, URL overrides should not affect disabled fields
				if (
					store.state.serverConfiguration?.lockNetwork &&
					["name", "host", "port", "tls", "rejectUnauthorized"].includes(key)
				) {
					continue;
				}

				if (key === "join") {
					value = value
						.split(",")
						.map((chan) => {
							if (!chan.match(/^[#&!+]/)) {
								return `#${chan}`;
							}

							return chan;
						})
						.join(", ");
				}

				// Override server provided defaults with parameters passed in the URL if they match the data type
				switch (typeof store.state.serverConfiguration?.defaults[key]) {
					case "boolean":
						if (value === "0" || value === "false") {
							parsedParams[key] = false;
						} else {
							parsedParams[key] = !!value;
						}

						break;
					case "number":
						parsedParams[key] = Number(value);
						break;
					case "string":
						parsedParams[key] = String(value);
						break;
				}
			}

			return parsedParams;
		};

		const defaults = ref<Partial<NetworkFormDefaults>>(
			Object.assign(
				{},
				store.state.serverConfiguration?.defaults,
				parseOverrideParams(props.queryParams),
				{rememberCredentials: storedCredentials.value !== null}
			)
		);

		onMounted(() => {
			const creds = storedCredentials.value;

			if (!creds) {
				return;
			}

			// Pre-fill from localStorage
			defaults.value = Object.assign({}, defaults.value, {
				nick: creds.nick,
				password: creds.password,
				rememberCredentials: true,
			});

			if (store.state.networks.length === 0) {
				handleSubmit(defaults.value as Record<string, any>);
			}
		});

		return {
			defaults,
			disabled,
			handleSubmit,
			formRef,
		};
	},
});
</script>
