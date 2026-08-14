import { Client } from "discord-rpc";

import { config } from "./config";

// internal state
let rpc: Client;

export async function initDiscordRpc() {
  if (!config.discordRpc) return;

  // clean up existing client if one exists
  rpc?.removeAllListeners();

  try {
    rpc = new Client({ transport: "ipc" });

    rpc.on("ready", () =>
      rpc.setActivity({
        state: "stoat.chat",
        details: "Chatting with others",
        largeImageKey: "qr",
        largeImageText: "Join Stoat!",
        buttons: [
          {
            label: "Join Stoat",
            url: "https://stoat.chat/",
          },
        ],
      }),
    );

    rpc.on("disconnected", reconnect);

    // Discord may not be running, in which case the socket connection fails
    // and the login promise rejects. Handle it so it doesn't surface as an
    // unhandled promise rejection.
    rpc.login({ clientId: "872068124005007420" }).catch(reconnect);
  } catch {
    reconnect();
  }
}

const reconnect = () => setTimeout(() => initDiscordRpc(), 1e4);

export async function destroyDiscordRpc() {
  rpc?.destroy();
}
