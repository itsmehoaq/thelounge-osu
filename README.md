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
	Auto-connects to Bancho · <code>!mp</code> autocomplete · Quick action buttons · Ref Helper · Qualifiers Automation · osu! pink theme
</p>

---

## What this is

A fork of [TheLounge](https://github.com/thelounge/thelounge) customised for osu! tournament referee work:

- **Auto-connects to osu! Bancho** (`irc.ppy.sh:6667`) on first load after credentials are saved
- **osu! pink theme** (`#FF66AA`) with dark background
- **`!mp` command autocomplete** — all 24 subcommands with descriptions
- **Quick action bar** — one-click Timer, Start, Abort, and custom button macros
- **Ref Helper** — winner hint after each map, configurable win condition and team mode
- **Qualifiers Automation** — automated map sequencing with emergency stop
- **Public mode** — no server login; each referee stores credentials in their browser's localStorage

## Settings tabs

### osu! IRC
Bancho credentials (nick + IRC password) and osu! API credentials (Client ID + Secret for winner hints). Save & Reconnect applies immediately.

### Ref Helper

**Match Setup**
- Win condition: Score / Accuracy / Combo / Score V2
- Team mode: Head-to-Head or Team VS (with team size)
- Show winner hint after each map — fetches result from osu! APIv2 after BanchoBot reports `The match has finished.`

**Qualifiers Automation**

Automates the full map sequence for qualifier lobbies. The ref sets up the room manually, then starts the sequence from the quick action bar.

| Setting | Description |
|---------|-------------|
| Enable | Activates the automation |
| NoFail (NF) | Appends `nf` to all mod commands except Freemod |
| Total runs | 1 or 2 passes through the full mappool |
| Mappool | Paste TSV from spreadsheet, then click **Import** to parse into an editable grid |
| Emergency stop keyword | Any player typing this word pauses automation and alerts the ref |

**Mappool import format** (tab-separated, copy-paste from Google Sheets):
```
NM1	1234567
NM2	2345678
HD1	3456789
DT1	4567890
```

Mod commands are auto-derived from the label prefix:

| Prefix | Command |
|--------|---------|
| NM | `!mp mods` |
| HD | `!mp mods hd` |
| HR | `!mp mods hr` |
| DT | `!mp mods dt` |
| FM, TB, others | `!mp mods freemod` |

After import, each row's mod command is editable in the grid before starting.

**Automation sequence per map:**
1. `!mp map <id>` + `!mp mods <mod>`
2. Wait for BanchoBot: `Beatmap changed to:` → send `!mp settings` to verify
3. Send `!mp timer 120`
4. On `All players are ready` or timer end → `!mp start 10`
5. On `The match has finished.` → advance to next map / run

**Emergency stop:** any player typing the configured keyword triggers 3 audio beeps, a desktop notification, and a pulsing red banner. Ref clicks Dismiss or Abort Quals.

**Notices sent on start:**
```
Notice: Automation mode is active.
In case of players requiring support, please send "!panic" in chat to stop and wait for ref
```

### Quick Action
Timer and Start countdown defaults, plus custom button configuration.

Custom buttons support multi-command sequences (one command per line) and any [Lucide icon](https://lucide.dev/icons/) name.

### Notifications
Standard TheLounge notification settings.

## Quick action bar

The bar above the chat input:

| Button | Command |
|--------|---------|
| Timer | `!mp timer <n>` |
| Start | `!mp start <n>` |
| Abort | `!mp abort` |
| Quals | Start qualifiers automation (when enabled and mappool imported) |

A permanent amber banner appears above the bar whenever Qualifiers Automation is enabled as a reminder.

## `!mp` autocomplete

Type `!mp ` in any channel and press Tab to see all subcommands:

`abort` `aborttimer` `addref` `ban` `clearhost` `close` `host` `invite` `kick` `listrefs` `lock` `make` `makeprivate` `map` `mods` `move` `password` `removeref` `set` `size` `start` `team` `timer` `unlock`

## Winner hint

Requires osu! API credentials (Client ID + Secret from [osu! OAuth settings](https://osu.ppy.sh/home/account/edit#oauth)):

1. Create an OAuth application with **Client Credentials** grant
2. Enter Client ID and Secret in **Settings → osu! IRC → osu! credentials**
3. Enable **Show winner hint** in **Settings → Ref Helper → Match Setup**

After each map finishes, the hint appears above the quick action bar showing the winning player or team with score/accuracy/combo difference.

## Getting your osu! IRC password

Your IRC password is **not** your osu! account password. Get it from:

**osu! website → Settings → [Legacy API section](https://osu.ppy.sh/home/account/edit#irc-password)**

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

## Credits

Built on [TheLounge](https://github.com/thelounge/thelounge) — MIT licensed.
