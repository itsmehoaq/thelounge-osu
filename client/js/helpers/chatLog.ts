import dayjs from "dayjs";
import socket from "../socket";
import {cleanIrcMessage} from "../../../shared/irc";
import {MessageType, SharedMsg} from "../../../shared/types/msg";

function sanitizeFileName(name: string): string {
	return `${name || "chatlog"}.txt`.replace(/[/:\\?%*"<>|]/g, "_");
}

function formatTimestamp(time: Date): string {
	return dayjs(time).format("YYYY-MM-DD HH:mm:ss");
}

function formatMessage(message: SharedMsg): string {
	const timestamp = formatTimestamp(new Date(message.time));
	const nick = message.from?.nick || message.nick || "";
	const text = cleanIrcMessage(message.text || message.reason || message.error || "");

	switch (message.type) {
		case MessageType.ACTION:
			return `[${timestamp}] * ${nick} ${text}`.trimEnd();
		case MessageType.JOIN:
			return `[${timestamp}] *** ${nick} joined`;
		case MessageType.PART:
			return `[${timestamp}] *** ${nick} left${text ? ` (${text})` : ""}`;
		case MessageType.QUIT:
			return `[${timestamp}] *** ${nick} quit${text ? ` (${text})` : ""}`;
		case MessageType.KICK:
			return `[${timestamp}] *** ${message.target?.nick || ""} was kicked by ${nick}${
				text ? ` (${text})` : ""
			}`;
		case MessageType.NICK:
			return `[${timestamp}] *** ${nick} is now known as ${message.new_nick || ""}`;
		case MessageType.MODE:
		case MessageType.MODE_CHANNEL:
		case MessageType.MODE_USER:
			return `[${timestamp}] *** ${nick} set mode ${
				message.text || message.params?.join(" ") || ""
			}`;
		case MessageType.NOTICE:
			return `[${timestamp}] -${nick}- ${text}`;
		case MessageType.ERROR:
			return `[${timestamp}] !!! ${text}`;
		default:
			if (nick) {
				return `[${timestamp}] <${nick}> ${text}`;
			}

			return `[${timestamp}] ${text || message.type || ""}`.trimEnd();
	}
}

export function downloadChatLog(channelName: string, messages: SharedMsg[]): void {
	const content = `${messages.map(formatMessage).join("\n")}\n`;
	const blob = new Blob([content], {type: "text/plain;charset=utf-8"});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = sanitizeFileName(channelName);
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export function requestChatLog(target: number): void {
	socket.emit("chatlog:get", {target});
}
