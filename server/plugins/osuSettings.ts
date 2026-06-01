import fs from "fs";
import path from "path";
import Config from "../config";

export interface CustomServer {
	name: string;
	host: string;
	port: number;
	tls: boolean;
}

export interface OsuIrcSettings {
	nick: string;
	password: string;
	host: string;
	port: number;
	tls: boolean;
	customServers: CustomServer[];
}

const DEFAULTS: OsuIrcSettings = {
	nick: "",
	password: "",
	host: "irc.ppy.sh",
	port: 6667,
	tls: false,
	customServers: [],
};

function filePath(): string {
	return path.join(Config.getHomePath(), "osu-irc.json");
}

export function load(): OsuIrcSettings {
	// Seed from Config.values.defaults so existing ~/.thelounge/config.js values prefill on first run
	const configSeed: OsuIrcSettings = {
		nick: Config.values.defaults.nick.replace(/%%?$/, ""), // strip random-digit placeholder
		password: Config.values.defaults.password ?? "",
		host: Config.values.defaults.host ?? "irc.ppy.sh",
		port: Config.values.defaults.port ?? 6667,
		tls: Config.values.defaults.tls ?? false,
		customServers: [],
	};

	try {
		const raw = fs.readFileSync(filePath(), "utf8");
		return {...configSeed, ...JSON.parse(raw)};
	} catch {
		return configSeed;
	}
}

export function save(settings: Partial<OsuIrcSettings>): void {
	const current = load();
	const merged: OsuIrcSettings = {
		...current,
		...settings,
		// always validate customServers shape
		customServers: (settings.customServers ?? current.customServers).map((s) => ({
			name: String(s.name || "").trim(),
			host: String(s.host || "").trim(),
			port: Number(s.port) || 6667,
			tls: Boolean(s.tls),
		})),
	};

	fs.writeFileSync(filePath(), JSON.stringify(merged, null, "\t"), "utf8");
	applyToConfig(merged);
}

export function applyToConfig(settings: OsuIrcSettings): void {
	if (settings.nick) Config.values.defaults.nick = settings.nick;
	if (settings.password !== undefined) Config.values.defaults.password = settings.password;
	if (settings.host) Config.values.defaults.host = settings.host;
	if (settings.port) Config.values.defaults.port = settings.port;
	Config.values.defaults.tls = settings.tls;
}
