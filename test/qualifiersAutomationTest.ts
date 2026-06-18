import {expect} from "chai";
import {
	getQualsMessageEvent,
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
});
