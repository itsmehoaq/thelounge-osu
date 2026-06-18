import io, {Socket as rawSocket} from "socket.io-client";
import type {ServerToClientEvents, ClientToServerEvents} from "../../shared/types/socket-events";

type Socket = rawSocket<ServerToClientEvents, ClientToServerEvents>;

const publicSessionId = getPublicSessionId();

const socket: Socket = io({
	transports: JSON.parse(document.body.dataset.transports || "['polling', 'websocket']"),
	path: window.location.pathname + "socket.io/",
	autoConnect: false,
	reconnection: true,
	auth: publicSessionId ? {publicSessionId} : {},
});

function getPublicSessionId(): string | null {
	if (!document.body.classList.contains("public")) {
		return null;
	}

	const key = "thelounge.publicSessionId";

	try {
		const existing = window.sessionStorage.getItem(key);

		if (existing) {
			return existing;
		}

		const generated =
			typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(36).slice(2)}`;

		window.sessionStorage.setItem(key, generated);
		return generated;
	} catch {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}
}

if (publicSessionId) {
	window.addEventListener("pagehide", (event) => {
		if (event.persisted) {
			return;
		}

		const basePath = window.location.pathname.endsWith("/")
			? window.location.pathname
			: `${window.location.pathname}/`;
		const body = new Blob([publicSessionId], {type: "text/plain"});

		navigator.sendBeacon(`${basePath}public-session/close`, body);
	});
}

// Ease debugging socket during development
if (process.env.NODE_ENV === "development") {
	window.socket = socket;
}

declare global {
	interface Window {
		socket: Socket;
	}
}

export {publicSessionId};
export default socket;
