# pi-tbuddy 🤖📱

**Telegram Companion for Pi Coding Agent**

`pi-tbuddy` connects your interactive terminal `pi` session to Telegram on your phone:
- **Get alerted when you're away from your PC:** Receive automatic notifications when Pi finishes an agent run (`agent_settled`) or is waiting for your input/choice (`ui_prompt_start`).
- **Reply from Telegram to steer Pi:** Text your bot on Telegram to reply to questions, inject next instructions, check status, or abort running operations remotely.

---

## Quick Setup

### 1. Create a Bot with BotFather
1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, give it a name and a username (e.g. `MyPiAssistantBot`).
3. Copy your API token (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).

### 2. Connect in Pi
In any Pi terminal session where `pi-tbuddy` is loaded:

```text
/tbuddy botkey <YOUR_BOT_TOKEN>
```

Pi will verify the token and display:
```text
✅ Connected! Bot: @MyPiAssistantBot (My Pi Assistant)
📱 Send /start to @MyPiAssistantBot on Telegram to pair your phone!
```

### 3. Pair Your Phone
1. Open Telegram and search for your bot.
2. Send `/start`.
3. The bot pairs with your Chat ID automatically, sends a confirmation, and Pi will notify you on the terminal!

---

## Pi Commands (`/tbuddy`)

| Command | Description |
| --- | --- |
| `/tbuddy botkey <token>` | Paste and save your Telegram Bot API token |
| `/tbuddy pair` | Show instructions to pair your phone by sending `/start` |
| `/tbuddy target <chat_id>` | Manually set target chat/user ID |
| `/tbuddy status` | Show current connection, bot, and pairing status |
| `/tbuddy test [message]` | Send a test message to your Telegram chat |
| `/tbuddy toggle` | Quickly enable or disable Telegram notifications |
| `/tbuddy clear` | Reset token and unpair target chat |

---

## Telegram Phone Commands

When chatting with your bot on Telegram:

- **Any normal message:** Forwarded directly to your active Pi session as a user prompt or steering message!
- `/status`: Returns whether Pi is idle or running, the current directory (`cwd`), and active model.
- `/abort`: Aborts the active generation or tool execution if Pi is running.
- `/help`: Shows available commands.

---

## Loading into Pi

### Option A: Direct Flag (Quick Testing)
```bash
pi --extension ./repos/tbuddy
```

### Option B: Add to User Settings
Add to your `~/.pi/agent/settings.json` (or workspace `.pi/settings.json`):
```json
{
  "extensions": [
    "./repos/tbuddy"
  ]
}
```

Or install it as a local package.

---

## Configuration File
Settings are safely persisted across sessions in `~/.pi/agent/tbuddy.json`:
```json
{
  "botToken": "...",
  "botUsername": "MyPiAssistantBot",
  "targetChatId": 123456789,
  "targetUser": "@username",
  "enabled": true,
  "notifyOnSettled": true,
  "notifyOnInput": true
}
```

---

## License
MIT
