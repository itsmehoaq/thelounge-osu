import Msg from "../../models/msg";
import User from "../../models/user";
import type {IrcEventHandler} from "../../client";
import {MessageType} from "../../../shared/types/msg";
import {ChanState} from "../../../shared/types/chan";

export default <IrcEventHandler>function (irc, network) {
	const client = this;

	irc.on("join", function (data) {
		let chan = network.getChannel(data.channel);

		if (typeof chan === "undefined") {
			chan = client.createChannel({
				name: data.channel,
				state: ChanState.JOINED,
			});

			client.emit("join", {
				network: network.uuid,
				chan: chan.getFilteredClone(true),
				shouldOpen: false,
				index: network.addChannel(chan),
			});
			client.save();

			chan.loadMessages(client, network);

			// Request channels' modes
			network.irc.raw("MODE", chan.name);
		} else if (data.nick === irc.user.nick) {
			chan.state = ChanState.JOINED;

			client.emit("channel:state", {
				chan: chan.id,
				state: chan.state,
			});
		}

		if (data.nick === irc.user.nick && /^#mp_/i.test(chan.name)) {
			const joinedChannel = chan;

			setTimeout(() => {
				if (joinedChannel.state === ChanState.JOINED && network.irc.connected) {
					network.irc.say(joinedChannel.name, "!mp settings");
				}
			}, 800);
		}

		const user = new User({nick: data.nick});
		const msg = new Msg({
			time: data.time,
			from: user,
			hostmask: data.ident + "@" + data.hostname,
			gecos: data.gecos,
			account: data.account,
			type: MessageType.JOIN,
			self: data.nick === irc.user.nick,
		});
		chan.pushMessage(client, msg);

		chan.setUser(new User({nick: data.nick}));
		client.emit("users", {
			chan: chan.id,
		});
	});
};
