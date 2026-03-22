# PixelAgent — Pokemon Gameboy Agents Visualizer

**Date:** 2026-03-22
**Status:** Approved

---

## Overview

A real-time read-only visual dashboard that displays Claude Code's activity and its dispatched subagents as Pokemon characters on a pixel art map, rendered in a browser with a Gameboy screen aesthetic.

---

## Goals

- Visualize Claude Code (the main agent) as **Sacha** (Ash Ketchum) moving on a pixel art map
- Each subagent dispatched by Claude Code = a **Pokemon** that appears on the map
- More agents dispatched = more Pokemon on the map
- Display full agent details: state, current tool, current file, duration, accumulated logs, final result
- Read-only — no controls, just observation
- Real-time updates via WebSocket from a local Python server

---

## Architecture

```
Claude Code (working)
    ↓ hooks (PreToolUse, PostToolUse, Stop)
    ↓ HTTP POST to http://localhost:8765/event
server.py  (Python — single process, handles both HTTP and WebSocket on port 8765)
    - /event  → HTTP POST endpoint for hook ingestion
    - /ws     → WebSocket endpoint for browser push
    - Maintains agent state dict in memory
    - Broadcasts JSON events to all connected WebSocket clients
    ↓ WebSocket (ws://localhost:8765/ws)
index.html served at http://localhost:8765/
game.js  (Phaser.js 3 via CDN)
    - Pokemon-style pixel art map
    - Sacha = main Claude Code agent
    - Each dispatched subagent = a Pokemon character
    - Connects to WebSocket on load, updates map in real time
```

**Single port, single process:** `server.py` uses Python `asyncio` with `websockets` library handling both HTTP (via a custom HTTP handler) and WebSocket upgrade on port 8765. The browser loads `index.html` via `http://localhost:8765/` to avoid `file://` CORS restrictions.

---

## File Structure

```
PixelAgent/
├── server.py              # Python server: HTTP + WebSocket
├── index.html             # Served by server.py at /
├── game.js                # Phaser.js 3 game logic
└── assets/
    ├── tileset.png        # 16x16 tile sprite sheet (generated on first run)
    └── sprites.png        # Character sprite sheet (generated on first run)
```

Hook configuration is written to `~/.claude/settings.json` automatically by `server.py --setup`.

---

## Claude Code Hook Setup

Running `python server.py --setup` reads `~/.claude/settings.json` (or creates it), merges the following hook entries, and writes it back:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' -d @-" }] }
    ],
    "PostToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' -d @-" }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' -d @-" }] }
    ]
  }
}
```

The setup command is idempotent — it checks for existing entries before adding.

---

## Hook Payload Format

Claude Code sends hook payloads as JSON on stdin to the hook command. The relevant fields are:

**PreToolUse / PostToolUse:**
```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "abc123",
  "tool_name": "Agent",
  "tool_input": {
    "subagent_type": "Explore",
    "prompt": "Find all TypeScript files..."
  },
  "tool_response": "...(PostToolUse only)..."
}
```

**Stop:**
```json
{
  "hook_event_name": "Stop",
  "session_id": "abc123"
}
```

`server.py` parses these fields from the raw JSON body of the POST request.

---

## Agent Detection Logic

1. On first event with a new `session_id` → emit `session_started`
2. If `tool_name == "Agent"` on `PostToolUse` → emit `agent_created` with a generated UUID
3. All other `PostToolUse` events → emit `tool_used` (updates Sacha's position)
4. On `hook_event_name == "Stop"` → emit `session_ended`, mark all active agents as `done`

---

## Agent State Machine

```
pending → in_progress → done
                      ↘ error
```

| State | Trigger |
|---|---|
| `pending` | `agent_created` emitted |
| `in_progress` | First `agent_updated` received |
| `done` | `agent_completed` or `session_ended` |
| `error` | Future use (not in v1) |

`agent_completed` is a distinct event from `agent_updated`. It carries the final `result` string and transitions the agent to `done`. `agent_updated` carries incremental activity (current tool, current file) and keeps the agent `in_progress`.

---

## Agent State Schema

```python
agents: dict[str, AgentState] = {
  "uuid": {
    "id": "uuid",
    "type": "Explore",          # normalized agent type string
    "pokemon": "Ronflex",       # resolved at creation
    "status": "in_progress",    # pending | in_progress | done | error
    "current_tool": "Glob",     # last tool seen in hook payload
    "current_file": "src/auth.ts",
    "started_at": 1234567890.0, # unix timestamp float
    "prompt": "Find all TS files...",
    "logs": ["Read auth.py", "Glob **/*.ts"],  # accumulated activity strings, max 100 entries
    "result": None              # filled on agent_completed
  }
}
```

---

## WebSocket Events (server → browser)

All events are JSON objects with an `event` field.

```json
{ "event": "session_started", "session_id": "abc123", "timestamp": 1234567890.0 }

{ "event": "agent_created",
  "agent": { "id": "uuid", "type": "Explore", "pokemon": "Ronflex",
             "status": "pending", "prompt": "...", "started_at": 1234567890.0 } }

{ "event": "agent_updated",
  "agent_id": "uuid", "tool": "Read", "file": "src/app.py",
  "log_entry": "Read src/app.py" }

{ "event": "agent_completed",
  "agent_id": "uuid", "result": "Found 12 files", "duration_ms": 4200 }

{ "event": "tool_used",
  "tool": "Bash", "command": "npm test", "session_id": "abc123" }

{ "event": "session_ended", "session_id": "abc123" }
```

---

## Agent Type → Pokemon Mapping

Agent type is determined from `tool_input.subagent_type` in the hook payload. Matching uses French Pokemon names consistently throughout the UI.

| `subagent_type` value | Pokemon (FR) | Emoji |
|---|---|---|
| `Explore` | Ronflex | 💤 |
| `Plan` | Alakazam | 🔮 |
| `general-purpose` | Pikachu | ⚡ |
| `code-reviewer` | Noctali | 🌙 |
| starts with `superpowers:` | Mewtwo | 🌀 |
| anything else / unknown | Évoli | ⭐ |

The `superpowers:` prefix match is a simple `str.startswith("superpowers:")` check on the normalized `subagent_type` string.

---

## The Map

Pokemon GBA top-down style, 16×16 pixel tiles. Map size: 30×20 tiles (480×320px internal resolution).

### Zones and Tool Routing

| Zone | Tiles (approx) | Tools that route here |
|---|---|---|
| Town Center | center 6×6 | Base position (idle) |
| Forest (🌲) | top-left | `Bash` |
| Library (🏛️) | top-right | `Read`, `Grep`, `Glob` |
| Forge (⚒️) | bottom-left | `Edit`, `Write` |
| Ocean (🌐) | bottom-right | `WebSearch`, `WebFetch` |
| Lab (🔬) | mid-right | `Agent`, `Plan` |

Sacha moves to the zone corresponding to the tool in the most recent `tool_used` event. Movement is tile-by-tile walking animation at 3 tiles/second using Phaser tweens. Pokemon sprites stay in their assigned zone tile (random position within zone bounds), they do not follow Sacha.

### Navigation

- No pathfinding in v1 — sprites move in a straight line to the target tile
- Collisions are cosmetic only — sprites can overlap

---

## Assets

Assets are **generated programmatically** using the browser Canvas 2D API on first load and saved as data URLs — no external image files required.

- `tileset`: grass, water, tree, building, sand tiles drawn as 16×16 colored pixel blocks
- `sprites`: Sacha and each Pokemon drawn as 16×16 pixel art characters with 4-frame walk cycles
- All sprites and tiles use a strict GBA palette (15-bit color, max 32 colors)

On `game.js` load, `generateAssets()` draws all sprites to offscreen canvases and loads them into Phaser's texture cache.

---

## UI Layout

Full-page browser screen. No physical Gameboy casing.

```
┌─────────────────────────────────────────────────────┐
│ CLAUDE CODE                    SESSION: 00:42:15    │  ← Top bar
│ 7 agents actifs                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│              [Phaser map — Phaser canvas]           │  ← Main area (fills remaining height)
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⚡ Pikachu   READ    src/app.py          ████░░░    │
│ 💤 Ronflex   GLOB    **/*.ts             ██░░░░░    │  ← Bottom panel (scrollable, max 4 rows)
│ 🔮 Alakazam  PLAN    architecture        ███████    │
│ ⭐ Évoli     IDLE    —                   ░░░░░░░    │
└─────────────────────────────────────────────────────┘
```

- **Top bar**: hardcoded "CLAUDE CODE" label, session elapsed timer (HH:MM:SS), active agent count
- **Bottom panel**: one row per agent (emoji + Pokemon name, current tool, current file truncated to 20 chars, progress bar). Scrollable via mouse wheel. Max 4 rows visible.
- **Progress bar**: visual only — fills left-to-right over time at a constant rate (resets each `agent_updated`), not tied to actual task percentage
- **Map**: Phaser canvas fills remaining height between top bar and bottom panel

---

## Visual Effects

| Effect | Trigger | Implementation |
|---|---|---|
| White screen flash | `agent_created` | CSS overlay div, opacity 1→0 over 300ms |
| "Un agent X est apparu !" | `agent_created` | Centered text overlay, visible 2s then fade |
| Sparkle particles | `agent_completed` | Phaser particle emitter at Pokemon sprite position |
| Fade-out | `agent_completed` | Phaser tween alpha 1→0 over 1s, then destroy sprite |
| Speech bubble | `agent_updated` | Phaser text object above sprite, truncated to 24 chars |
| CRT scanlines | Always | CSS `repeating-linear-gradient` overlay on canvas |

---

## Tech Stack

| Component | Technology | Notes |
|---|---|---|
| Game / Map | Phaser.js 3 (CDN) | No build step |
| Server | Python 3.10+ `asyncio` + `websockets` lib | `pip install websockets` |
| Frontend | Plain `index.html` | No framework |
| Font | Press Start 2P (Google Fonts CDN) | Pixel art aesthetic |
| Assets | Programmatic Canvas 2D | Generated at runtime, no image files |

---

## Running the Project

```bash
# 1. Install Python dependency
pip install websockets

# 2. Configure Claude Code hooks (one-time setup)
python server.py --setup

# 3. Start the server
python server.py

# 4. Open in browser
open http://localhost:8765

# 5. Use Claude Code normally — agents appear on the map automatically
```

---

## Out of Scope (v1)

- Controlling or sending commands to agents
- Connecting to Pixeltable / PixelAgent Python framework
- Mobile / responsive layout
- Authentication
- Persistent history across sessions
- Real pathfinding / collision detection
- Per-agent log streaming to the browser (logs accumulated in server memory only)
