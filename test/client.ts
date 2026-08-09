import {expect} from "chai";
import {NetworkConfig} from "../server/models/network";
import {ChanConfig} from "../server/models/chan";
import {ChanState, ChanType} from "../shared/types/chan";
import ClientManager from "../server/clientManager";
import Client from "../server/client";
import log from "../server/log";

import sinon from "ts-sinon";

describe("Client", function () {
	const commonNetworkConfig: NetworkConfig = {
		uuid: "67363f03-d903-498b-8e52-031ebb912791",
		awayMessage: "",
		name: "Super Nice Network",
		nick: "thelounge0001",
		host: "example.org",
		port: 6667,
		tls: false,
		userDisconnected: false,
		rejectUnauthorized: true,
		password: "",
		username: "thelounge",
		realname: "thelounge26",
		leaveMessage: "",
		sasl: "",
		saslAccount: "",
		saslPassword: "",
		commands: [],
		ignoreList: [],
		proxyHost: "",
		proxyPort: 1080,
		proxyUsername: "",
		proxyEnabled: false,
		proxyPassword: "",
		channels: [],
	};
	let logWarnStub: sinon.SinonStub<string[], void>;

	before(function () {
		logWarnStub = sinon.stub(log, "warn");
	});

	after(function () {
		logWarnStub.restore();
	});

	it("should parse channel configuration", function () {
		const manager = new ClientManager();
		const channel: ChanConfig = {name: "AAAA!", type: "query"};
		const networkConfig: NetworkConfig = {
			...commonNetworkConfig,
			channels: [{name: "AAAA!", type: "query"}, {name: "#thelounge"}, {name: "&foobar"}],
		};
		const client = new Client(manager, "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
			networks: [networkConfig],
		});

		// The client would normally do it as part of client.connect();
		// but this avoids the need to mock the irc-framework connection
		const network = client.networkFromConfig(networkConfig);

		sinon.assert.notCalled(logWarnStub);

		expect(network.channels[0].name).to.equal("Super Nice Network");
		expect(network.channels[0].type).to.equal(ChanType.LOBBY);
		expect(network.channels[1].name).to.equal("AAAA!");
		expect(network.channels[1].type).to.equal(ChanType.QUERY);
		expect(network.channels[2].name).to.equal("#thelounge");
		expect(network.channels[2].type).to.equal(ChanType.CHANNEL);
		expect(network.channels[3].name).to.equal("&foobar");
		expect(network.channels[3].type).to.equal(ChanType.CHANNEL);
	});

	it("should ignore invalid channel types", function () {
		const manager = new ClientManager();
		const channel: ChanConfig = {name: "AAAA!", type: "query"};
		const networkConfig: NetworkConfig = {
			...commonNetworkConfig,
			channels: [
				{name: "AAAA!", type: "query"},
				{name: "#thelounge", type: "wrongtype"},
				{name: "&foobar"},
			],
		};
		const client = new Client(manager, "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
			networks: [networkConfig],
		});

		// The client would normally do it as part of client.connect();
		// but this avoids the need to mock the irc-framework connection
		const network = client.networkFromConfig(networkConfig);

		sinon.assert.calledOnce(logWarnStub);

		expect(network.channels[0].name).to.equal("Super Nice Network");
		expect(network.channels[0].type).to.equal(ChanType.LOBBY);
		expect(network.channels[1].name).to.equal("AAAA!");
		expect(network.channels[1].type).to.equal(ChanType.QUERY);
		expect(network.channels[2].name).to.equal("&foobar");
		expect(network.channels[2].type).to.equal(ChanType.CHANNEL);
	});

	it("should only auto-rejoin active multiplayer channels", function () {
		const client = new Client(new ClientManager(), "test");
		const network = client.networkFromConfig({
			...commonNetworkConfig,
			channels: [
				{name: "#mp_active"},
				{name: "#mp_stale"},
				{name: "#osu"},
			],
		});
		const active = network.getChannel("#mp_active")!;
		const stale = network.getChannel("#mp_stale")!;
		const regular = network.getChannel("#osu")!;

		active.state = ChanState.JOINED;
		network.rememberJoinedMultiplayerChannels();

		expect(network.shouldAutoJoinChannel(active)).to.be.true;
		expect(network.shouldAutoJoinChannel(stale)).to.be.false;
		expect(network.shouldAutoJoinChannel(regular)).to.be.true;
	});

	it("should keep Bancho network creation idempotent", function () {
		const manager = new ClientManager();
		const client = new Client(manager, "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
		});
		const emitStub = sinon.stub(client, "emit");
		const first = client.connectToNetwork(
			{...commonNetworkConfig, host: "irc.ppy.sh"},
			true
		);
		const second = client.connectToNetwork(
			{...commonNetworkConfig, host: "cho.ppy.sh"},
			true
		);
		const options = first?.irc?.options as any;

		expect(second).to.equal(first);
		expect(client.networks).to.have.lengthOf(1);
		expect(client.networks[0].getChannel("BanchoBot")?.type).to.equal(ChanType.QUERY);
		expect(options.ping_interval).to.equal(30);
		sinon.assert.calledOnce(emitStub);
	});
});
