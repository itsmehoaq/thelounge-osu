import {PluginInputHandler} from "./index";

import Msg from "../../models/msg";
import {MessageType} from "../../../shared/types/msg";

const commands = ["join"];

function getChannelTypes(network: Parameters<PluginInputHandler>[0]): string {
	return network.irc.network.options.CHANTYPES || "#";
}

function normalizeChannelName(network: Parameters<PluginInputHandler>[0], channel: string): string {
	const trimmed = channel.trim();
	const chanTypes = getChannelTypes(network);

	if (!trimmed) {
		return "";
	}

	if (chanTypes.includes(trimmed[0])) {
		return trimmed;
	}

	return chanTypes[0] + trimmed;
}

const input: PluginInputHandler = function (network, chan, cmd, args) {
	if (args.length === 0) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "You must specify a channel to join.",
			})
		);
		return;
	}

	const channels = args[0]
		.split(",")
		.map((channel) => normalizeChannelName(network, channel))
		.filter(Boolean);
	const keys = (args[1] || "").split(",");

	for (let i = 0; i < channels.length; i++) {
		network.irc.join(channels[i], keys[i] || undefined);
	}

	return true;
};

export default {
	commands,
	input,
};
