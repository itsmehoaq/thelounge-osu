interface OsuToken {
	access_token: string;
	expires_at: number;
}

let tokenCache: OsuToken | null = null;

export async function getOsuToken(clientId: string, clientSecret: string): Promise<string | null> {
	if (tokenCache && Date.now() < tokenCache.expires_at) {
		return tokenCache.access_token;
	}

	try {
		const res = await fetch("https://osu.ppy.sh/oauth/token", {
			method: "POST",
			headers: {"Content-Type": "application/json", Accept: "application/json"},
			body: JSON.stringify({
				client_id: Number(clientId),
				client_secret: clientSecret,
				grant_type: "client_credentials",
				scope: "public",
			}),
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {access_token: string; expires_in: number};
		tokenCache = {
			access_token: data.access_token,
			expires_at: Date.now() + (data.expires_in - 60) * 1000,
		};
		return tokenCache.access_token;
	} catch {
		return null;
	}
}

export function invalidateOsuToken() {
	tokenCache = null;
}

export async function fetchOsuMatch(matchId: string, token: string): Promise<any | null> {
	try {
		const res = await fetch(`https://osu.ppy.sh/api/v2/matches/${matchId}`, {
			headers: {Authorization: `Bearer ${token}`, Accept: "application/json"},
		});
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}
