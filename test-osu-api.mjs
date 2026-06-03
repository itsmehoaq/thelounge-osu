// Quick test script — dumps raw osu! APIv2 match response
// Usage: node test-osu-api.mjs <client_id> <client_secret> <match_id>
//
// Get client_id + client_secret from: https://osu.ppy.sh/home/account/edit#oauth
// Get match_id from a BanchoBot message: "Created the tournament match https://osu.ppy.sh/mp/MATCH_ID"

const [, , clientId, clientSecret, matchId] = process.argv;

if (!clientId || !clientSecret || !matchId) {
	console.error("Usage: node test-osu-api.mjs <client_id> <client_secret> <match_id>");
	process.exit(1);
}

// Step 1: Get token
console.log("\n=== Getting token ===");
const tokenRes = await fetch("https://osu.ppy.sh/oauth/token", {
	method: "POST",
	headers: {"Content-Type": "application/json", Accept: "application/json"},
	body: JSON.stringify({
		client_id: Number(clientId),
		client_secret: clientSecret,
		grant_type: "client_credentials",
		scope: "public",
	}),
});

if (!tokenRes.ok) {
	console.error("Token request failed:", tokenRes.status, await tokenRes.text());
	process.exit(1);
}

const tokenData = await tokenRes.json();
console.log("Token acquired, expires_in:", tokenData.expires_in, "seconds");
const token = tokenData.access_token;

// Step 2: Fetch match
console.log(`\n=== Fetching match ${matchId} ===`);
const matchRes = await fetch(`https://osu.ppy.sh/api/v2/matches/${matchId}`, {
	headers: {Authorization: `Bearer ${token}`, Accept: "application/json"},
});

if (!matchRes.ok) {
	console.error("Match fetch failed:", matchRes.status, await matchRes.text());
	process.exit(1);
}

const matchData = await matchRes.json();

// Step 3: Print summary
console.log("\n=== Match Info ===");
console.log("Name:", matchData.match?.name);
console.log("Start:", matchData.match?.start_time);
console.log("Total events:", matchData.events?.length);
console.log("Users:", matchData.users?.map((u) => `${u.username} (id:${u.id})`).join(", "));

const gameEvents = (matchData.events ?? []).filter((e) => e.game);
console.log("Game events (maps played):", gameEvents.length);

if (gameEvents.length) {
	console.log("\n=== Last game event ===");
	const lastGame = gameEvents[gameEvents.length - 1].game;
	console.log("Mode:", lastGame.mode);
	console.log("Scoring type:", lastGame.scoring_type);
	console.log("Team type:", lastGame.team_type);
	console.log("Scores count:", lastGame.scores?.length);

	if (lastGame.scores?.length) {
		console.log("\nScores:");
		for (const s of lastGame.scores) {
			const user = matchData.users?.find((u) => u.id === s.user_id);
			console.log(
				`  ${user?.username ?? s.user_id} | team:${s.team} | score:${s.score} | acc:${(s.accuracy * 100).toFixed(2)}% | combo:${s.max_combo}x | passed:${s.passed}`
			);
		}
	}
}

// Step 4: Dump full raw response to file
import {writeFileSync} from "fs";
writeFileSync("test-osu-api-response.json", JSON.stringify(matchData, null, 2));
console.log("\n=== Full response saved to test-osu-api-response.json ===");
