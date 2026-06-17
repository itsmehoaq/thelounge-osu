import socket from "../socket";
import {downloadChatLog} from "../helpers/chatLog";

socket.on("chatlog:data", (data) => {
	downloadChatLog(data.channelName, data.messages);
});
