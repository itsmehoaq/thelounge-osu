import {expect} from "chai";
import {getQualsMessageEvent, isBanchoBotNick} from "../client/js/helpers/qualifiers";

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
});
