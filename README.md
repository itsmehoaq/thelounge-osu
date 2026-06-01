<h1 align="center">
	<img
		width="200"
		alt="osu!"
		src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Osu%21_Logo_2016.svg/1200px-Osu%21_Logo_2016.svg.png">
</h1>

<h2 align="center">thelounge-osu</h2>

<h3 align="center">
	osu! IRC client for tournament referees — built on <a href="https://github.com/thelounge/thelounge">TheLounge</a>
</h3>

<p align="center">
	Auto-connects to Bancho · <code>!mp</code> autocomplete · Quick action buttons · osu! pink theme
</p>

---

## What this is

A fork of [TheLounge](https://github.com/thelounge/thelounge) customised for osu! tournament referee work:

- **Auto-connects to osu! Bancho** (`irc.ppy.sh:6667`) on first load after credentials are saved
- **osu! pink theme** (`#FF66AA`) with dark background
- **`!mp` command autocomplete** — all 24 subcommands with descriptions
- **Quick action bar** above the chat input — one-click Timer, Start, Abort, and custom buttons
- **Custom button sequences** — define multi-command macros (e.g. `!mp set`, `!mp size`, `!mp mods` in one click)
- **Public mode** — no server login; each referee stores their own osu! IRC credentials in their browser's localStorage
- **Credential settings panel** — update username/password and reconnect without touching config files

## How it works

TheLounge runs in **public mode** with **network locked to Bancho**:

- First visit → connect form shows only Nick + Password fields
- After submitting, credentials are saved to `localStorage` in the browser
- Every subsequent visit auto-connects silently using stored credentials
- **Settings → osu! IRC** lets referees update credentials and reconnect

Bancho itself rejects invalid credentials, so no additional auth layer is needed.

## Deployment

### Local (macOS)

```sh
git clone https://github.com/itsmehoaq/thelounge-osu
cd thelounge-osu
yarn install
NODE_ENV=production yarn build
node index start
```

Configure `~/.thelounge/config.js` with your defaults (host, port, theme).

#### Run as a boot service (macOS LaunchAgent)

Create `~/Library/LaunchAgents/com.thelounge.osu.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>       <string>com.thelounge.osu</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/path/to/thelounge-osu/index.js</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>   <true/>
  <key>KeepAlive</key>   <true/>
  <key>StandardOutPath</key> <string>/tmp/thelounge-osu.log</string>
  <key>StandardErrorPath</key> <string>/tmp/thelounge-osu.log</string>
</dict>
</plist>
```

```sh
launchctl load ~/Library/LaunchAgents/com.thelounge.osu.plist
```

### VPS / Linux (recommended for tournaments)

```sh
# Install Node.js 20+, yarn, then:
git clone https://github.com/itsmehoaq/thelounge-osu
cd thelounge-osu
yarn install
NODE_ENV=production yarn build
```

Create `/etc/systemd/system/thelounge-osu.service`:

```ini
[Unit]
Description=thelounge-osu IRC client
After=network.target

[Service]
ExecStart=/usr/bin/node /home/user/thelounge-osu/index.js start
Restart=always
User=user

[Install]
WantedBy=multi-user.target
```

```sh
systemctl enable --now thelounge-osu
```

### Public access via Cloudflare Tunnel

To expose the client to referees without opening inbound firewall ports:

```sh
cloudflared tunnel login
cloudflared tunnel create osu-ref
cloudflared tunnel route dns osu-ref osu-ref.yourdomain.com
```

Config `~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: /home/user/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: osu-ref.yourdomain.com
    service: http://localhost:9000
  - service: http_status:404
```

```sh
cloudflared service install
systemctl enable --now cloudflared
```

Referees visit `https://osu-ref.yourdomain.com`, enter their osu! IRC credentials once, and auto-connect on every subsequent visit.

## Configuration

Key settings in `~/.thelounge/config.js`:

```js
public: true,          // No server login required
lockNetwork: true,     // Lock to Bancho — refs can't point elsewhere
messageStorage: [],    // No server-side IRC log retention
theme: "osu",          // osu! pink dark theme

defaults: {
  name: "osu! Bancho",
  host: "irc.ppy.sh",
  port: 6667,
  tls: false,
  nick: "YourOsuUsername",
  join: "#osu",
},
```

## Getting your osu! IRC password

Your IRC password is **not** your osu! account password. Get it from:

**osu! website → Settings → [Legacy API section](https://osu.ppy.sh/home/account/edit#irc-password)**

## Quick action buttons

The bar above the chat input has built-in buttons:

| Button | Command sent |
|--------|-------------|
| Timer  | `!mp timer 120` |
| Start  | `!mp start` |
| Abort  | `!mp abort` |

Custom buttons are configured in **Settings → Buttons** and support multi-command sequences (one command per line). Each custom button can use any [Lucide icon](https://lucide.dev/icons/) name.

## `!mp` autocomplete

Type `!mp ` in any channel and press Tab to see all subcommands with descriptions:

`abort` `aborttimer` `addref` `ban` `clearhost` `close` `host` `invite` `kick` `listrefs` `lock` `make` `makeprivate` `map` `mods` `move` `password` `removeref` `set` `size` `start` `team` `timer` `unlock`

## Credits

Built on [TheLounge](https://github.com/thelounge/thelounge) — MIT licensed.
