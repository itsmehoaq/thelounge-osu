import {expect} from "chai";
import {
	applyQualSettingsLine,
	buildMappoolModCommand,
	createQualSettingsSnapshot,
	getExpectedQualPlayerCount,
	getMappoolSlugFromLobbyName,
	getNextQualCursor,
	getQualsMessageEvent,
	isQualSettingsSnapshotComplete,
	isBanchoBotNick,
	shouldTriggerQualsEmergency,
} from "../client/js/helpers/qualifiers";

describe("qualifiers automation message detection", function () {
	it("detects the ready message emitted by BanchoBot", function () {
		expect(getQualsMessageEvent("All players are ready")).to.equal("ready");
	});

	it("normalizes IRC formatting and repeated whitespace", function () {
		expect(getQualsMessageEvent("\x02All   players are ready\x0f")).to.equal("ready");
	});

	it("detects countdown completion and match completion", function () {
		expect(getQualsMessageEvent("Countdown finished")).to.equal("ready");
		expect(getQualsMessageEvent("The match has finished!")).to.equal("finished");
	});

	it("detects player changes that should re-check mp settings", function () {
		expect(getQualsMessageEvent("PlayerA left the game.")).to.equal("player_change");
		expect(getQualsMessageEvent("PlayerA joined in slot 3.")).to.equal("player_change");
		expect(getQualsMessageEvent("PlayerA moved to slot 2")).to.equal("player_change");
	});

	it("ignores unrelated BanchoBot messages", function () {
		expect(getQualsMessageEvent("Countdown ends in 30 seconds")).to.equal(null);
	});

	it("matches the BanchoBot nick case-insensitively", function () {
		expect(isBanchoBotNick(" BanchoBot ")).to.equal(true);
		expect(isBanchoBotNick("banchobot")).to.equal(true);
		expect(isBanchoBotNick("Player")).to.equal(false);
	});

	it("ignores the emergency keyword when sent by the referee", function () {
		expect(
			shouldTriggerQualsEmergency(
				'Send "!panic" in chat to stop and wait for ref',
				"!panic",
				true,
				false
			)
		).to.equal(false);
	});

	it("allows another player to trigger the emergency keyword", function () {
		expect(shouldTriggerQualsEmergency("please !PANIC", "!panic", false, false)).to.equal(true);
	});

	it("finds the next qualifier map in pool order", function () {
		expect(getNextQualCursor(0, 1, 3, 2)).to.deep.equal({mapIndex: 1, run: 1});
		expect(getNextQualCursor(2, 1, 3, 2)).to.deep.equal({mapIndex: 0, run: 2});
		expect(getNextQualCursor(2, 2, 3, 2)).to.equal(null);
	});

	it("appends NF to mappool mod commands when enabled", function () {
		expect(buildMappoolModCommand("", true)).to.equal("nf");
		expect(buildMappoolModCommand("hd", true)).to.equal("hd nf");
		expect(buildMappoolModCommand("hd nf", true)).to.equal("hd nf");
		expect(buildMappoolModCommand("freemod", true)).to.equal("freemod");
		expect(buildMappoolModCommand("hr", false)).to.equal("hr");
	});

	it("detects the mappool abbreviation from lobby names", function () {
		expect(getMappoolSlugFromLobbyName("ABC: (Team A) vs (Team B)")).to.equal("ABC");
		expect(getMappoolSlugFromLobbyName("abc-1 : Team A vs Team B")).to.equal("ABC-1");
		expect(getMappoolSlugFromLobbyName("(Team A) vs (Team B)")).to.equal(null);
	});

	it("parses mp settings player readiness", function () {
		let snapshot = createQualSettingsSnapshot();

		for (const line of [
			"Players: 3",
			"Slot 1  Ready     https://osu.ppy.sh/u/1 PlayerA",
			"Slot 2  Ready     https://osu.ppy.sh/u/2 PlayerB",
			"Slot 3  Not Ready https://osu.ppy.sh/u/3 PlayerC",
		]) {
			snapshot = applyQualSettingsLine(snapshot, line);
		}

		expect(isQualSettingsSnapshotComplete(snapshot)).to.equal(true);
		expect(snapshot.reportedPlayers).to.equal(3);
		expect(snapshot.slots.map((slot) => slot.ready)).to.deep.equal([true, true, false]);
	});

	it("uses exact head-to-head player count for qualifier readiness", function () {
		expect(getExpectedQualPlayerCount(9)).to.equal(9);
		expect(getExpectedQualPlayerCount(4)).to.equal(4);
	});
});
