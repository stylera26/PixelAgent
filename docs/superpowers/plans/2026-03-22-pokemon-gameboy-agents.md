# Pokemon Gameboy Agents Visualizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time browser dashboard styled as a Pokemon GBA map that shows Claude Code and its dispatched subagents as animated pixel art characters, fed by Claude Code hooks via a local Python WebSocket server.

**Architecture:** A single Python `aiohttp` server handles both HTTP (serving static files + receiving hook events at `/event`) and WebSocket (`/ws`) on port 8765. The browser loads `index.html` from `http://localhost:8765/`, initializes a Phaser 3 game, connects to `/ws`, and renders agents as Pokemon sprites on a pixel art map. All sprites and tiles are generated programmatically in JavaScript — no external image files needed.

**Tech Stack:** Python 3.10+ · `aiohttp` (pip) · Phaser.js 3 (CDN) · Press Start 2P font (Google Fonts CDN) · Plain HTML/JS (no build step)

---

## File Map

| File | Responsibility |
|---|---|
| `server.py` | HTTP server (static files + `/event` POST) + WebSocket (`/ws`) + agent state |
| `index.html` | Page shell: top bar, Phaser canvas container, bottom panel, CRT overlay |
| `game.js` | Phaser 3 game: asset generation, map, Sacha, Pokemon, visual effects |

No `assets/` folder — everything is generated at runtime in the browser.

---

## Task 1: Project Bootstrap

**Files:**
- Create: `server.py`
- Create: `index.html`
- Create: `game.js`

- [ ] **Step 1: Install aiohttp**

```bash
pip install aiohttp
```

Expected: `Successfully installed aiohttp-...`

- [ ] **Step 2: Write `server.py` skeleton**

```python
#!/usr/bin/env python3
"""PixelAgent — Pokemon Gameboy Agents Visualizer server."""
import asyncio
import json
import os
import pathlib
from aiohttp import web

clients: set[web.WebSocketResponse] = set()

async def handle_index(request: web.Request) -> web.Response:
    index_path = os.path.join(os.path.dirname(__file__), "index.html")
    return web.FileResponse(index_path)

async def handle_static(request: web.Request) -> web.Response:
    filename = request.match_info["filename"]
    filepath = os.path.join(os.path.dirname(__file__), filename)
    if not os.path.exists(filepath):
        raise web.HTTPNotFound()
    return web.FileResponse(filepath)

async def handle_ws(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    try:
        async for msg in ws:
            pass  # read-only, ignore client messages
    finally:
        clients.discard(ws)
    return ws

async def broadcast(event: dict) -> None:
    if not clients:
        return
    data = json.dumps(event)
    await asyncio.gather(*(ws.send_str(data) for ws in set(clients)), return_exceptions=True)

async def handle_event(request: web.Request) -> web.Response:
    return web.Response(text="OK")  # placeholder

def build_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/ws", handle_ws)
    app.router.add_post("/event", handle_event)
    app.router.add_get("/{filename}", handle_static)
    return app

if __name__ == "__main__":
    import sys
    if "--setup" in sys.argv:
        print("Setup not yet implemented")
        sys.exit(0)
    app = build_app()
    print("PixelAgent server running at http://localhost:8765")
    web.run_app(app, host="127.0.0.1", port=8765)
```

- [ ] **Step 3: Write `index.html` skeleton**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>PixelAgent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #e8e8e8; font-family: 'Press Start 2P', monospace; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    #top-bar { background: #1a1a2e; border-bottom: 2px solid #4a4a8a; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    #top-bar .title { color: #a0c8ff; font-size: 10px; }
    #top-bar .session-info { color: #80ff80; font-size: 9px; text-align: right; }

    #game-container { flex: 1; position: relative; overflow: hidden; }

    #bottom-panel { background: #1a1a2e; border-top: 2px solid #4a4a8a; height: 96px; overflow-y: auto; flex-shrink: 0; }
    #agent-list { list-style: none; }
    .agent-row { display: flex; align-items: center; gap: 8px; padding: 4px 12px; border-bottom: 1px solid #2a2a4a; font-size: 8px; }
    .agent-row .pokemon-name { color: #ffd700; width: 80px; flex-shrink: 0; }
    .agent-row .agent-tool { color: #80c8ff; width: 60px; flex-shrink: 0; }
    .agent-row .agent-file { color: #c0c0c0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .agent-row .progress-bar { width: 80px; height: 8px; background: #2a2a4a; border: 1px solid #4a4a8a; flex-shrink: 0; }
    .agent-row .progress-fill { height: 100%; background: #80ff80; transition: width 0.5s linear; }

    /* CRT scanlines overlay */
    #crt-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px); }

    /* Flash overlay */
    #flash-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 200; background: white; opacity: 0; }

    /* Spawn text overlay */
    #spawn-text { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 201; font-family: 'Press Start 2P', monospace; font-size: 12px; color: #fff; text-shadow: 2px 2px #000; opacity: 0; text-align: center; }
  </style>
</head>
<body>
  <div id="top-bar">
    <span class="title">CLAUDE CODE</span>
    <div class="session-info">
      <div id="timer">SESSION: 00:00:00</div>
      <div id="agent-count">0 agents actifs</div>
    </div>
  </div>

  <div id="game-container"></div>

  <div id="bottom-panel">
    <ul id="agent-list"></ul>
  </div>

  <div id="crt-overlay"></div>
  <div id="flash-overlay"></div>
  <div id="spawn-text"></div>

  <script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js"></script>
  <script src="game.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `game.js` skeleton**

```javascript
// game.js — PixelAgent Pokemon Gameboy Visualizer

const WS_URL = "ws://localhost:8765/ws";
const TILE_SIZE = 16;
const MAP_COLS = 30;
const MAP_ROWS = 20;

let game;
let sessionStart = null;
let timerInterval = null;
const agents = {}; // agent_id → { state, sprite, bubble, progressInterval }

// --- Phaser Game Config ---
const config = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: MAP_COLS * TILE_SIZE,   // 480
  height: MAP_ROWS * TILE_SIZE,  // 320
  backgroundColor: "#1a3a1a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: { preload, create, update },
};

function preload() { generateAssets(this); }
function create() { buildMap(this); spawnSacha(this); connectWebSocket(this); }
function update() {}

window.addEventListener("load", () => { game = new Phaser.Game(config); });
```

- [ ] **Step 5: Start server and verify the page loads**

```bash
python server.py
```

Open `http://localhost:8765` — expect: black page with top bar "CLAUDE CODE", empty bottom panel, no errors in browser console.

- [ ] **Step 6: Commit**

```bash
git init
git add server.py index.html game.js
git commit -m "feat: project bootstrap — server + page shell + game skeleton"
```

---

## Task 2: Asset Generation

**Files:**
- Modify: `game.js` (add `generateAssets()` function)

Generates all pixel art tiles and sprites programmatically using Canvas 2D. No external image files.

- [ ] **Step 1: Add `generateAssets()` to `game.js`**

Add after the `config` object and before `window.addEventListener`:

```javascript
// GBA-style palette
const PAL = {
  grass:    "#2d6a2d", grassDark: "#1e4a1e",
  water:    "#1a5aaa", waterLight: "#2a7acc",
  sand:     "#c8a84a", sandDark: "#a08030",
  brown:    "#7a4a1a",
  tree:     "#1a4a1a", treeTrunk: "#5a3a1a",
  building: "#7a6a9a", buildingDark: "#5a4a7a", roof: "#aa8aaa",
  path:     "#8a7a5a",
  skinLight:"#f0c878", skinDark: "#c8a050",
  hairBlack:"#1a1a1a", hatRed: "#cc2222", hatWhite: "#f0f0f0",
  shirt:    "#3355cc", pants:   "#2a2a88",
  yellow:   "#f8d030", black:   "#181818",
  white:    "#f8f8f8", red:     "#c82020",
  purple:   "#7040a8", blue:    "#3050c0",
  pink:     "#f880a0", orange:  "#e86020",
  gray:     "#888888", darkGray:"#444444",
};

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

function makeTile(scene, key, drawFn) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  drawFn(ctx);
  scene.textures.addCanvas(key, canvas);
}

function makeSprite(scene, key, frames, drawFn) {
  // frames: number of walk frames (usually 4)
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE * frames; canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < frames; i++) drawFn(ctx, i * TILE_SIZE, i);
  scene.textures.addSpriteSheet(key, canvas, { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE });
}

function generateAssets(scene) {
  // --- Tiles ---
  makeTile(scene, "tile_grass", ctx => {
    ctx.fillStyle = PAL.grass; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.grassDark;
    [[2,3],[5,7],[9,2],[12,11],[1,13],[7,5],[14,8]].forEach(([x,y]) => ctx.fillRect(x,y,1,1));
  });
  makeTile(scene, "tile_water", ctx => {
    ctx.fillStyle = PAL.water; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.waterLight;
    for (let i = 0; i < 16; i += 4) ctx.fillRect(i, 7, 3, 1);
    for (let i = 2; i < 16; i += 4) ctx.fillRect(i, 11, 3, 1);
  });
  makeTile(scene, "tile_tree", ctx => {
    ctx.fillStyle = PAL.grass; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.tree; ctx.fillRect(3, 1, 10, 10);
    ctx.fillStyle = PAL.treeTrunk; ctx.fillRect(6, 11, 4, 5);
  });
  makeTile(scene, "tile_building", ctx => {
    ctx.fillStyle = PAL.building; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.roof; ctx.fillRect(0, 0, 16, 5);
    ctx.fillStyle = PAL.buildingDark;
    ctx.fillRect(3, 6, 4, 5); ctx.fillRect(9, 6, 4, 5); // windows
    ctx.fillRect(5, 11, 6, 5); // door
  });
  makeTile(scene, "tile_sand", ctx => {
    ctx.fillStyle = PAL.sand; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.sandDark;
    [[3,2],[8,5],[13,3],[2,9],[7,12],[11,8],[15,14]].forEach(([x,y]) => ctx.fillRect(x,y,1,1));
  });
  makeTile(scene, "tile_path", ctx => {
    ctx.fillStyle = PAL.path; ctx.fillRect(0, 0, 16, 16);
  });

  // --- Sacha sprite (4 walk frames, facing down) ---
  makeSprite(scene, "sacha", 4, (ctx, ox, frame) => {
    // Body
    px(ctx, ox+7, 1, PAL.hairBlack); px(ctx, ox+8, 1, PAL.hairBlack);
    // Hat
    for (let x=5;x<=10;x++) px(ctx, ox+x, 0, PAL.hatRed);
    for (let x=6;x<=9;x++) px(ctx, ox+x, 1, PAL.hatWhite);
    // Face
    px(ctx, ox+7, 2, PAL.skinLight); px(ctx, ox+8, 2, PAL.skinLight);
    // Body
    for (let x=6;x<=9;x++) for (let y=4;y<=7;y++) px(ctx, ox+x, y, PAL.shirt);
    // Legs (animated)
    const legL = frame % 2 === 0 ? 9 : 10;
    const legR = frame % 2 === 0 ? 9 : 8;
    px(ctx, ox+6, legL, PAL.pants); px(ctx, ox+9, legR, PAL.pants);
    px(ctx, ox+6, legL+1, PAL.pants); px(ctx, ox+9, legR+1, PAL.pants);
  });

  // --- Pokemon sprites ---
  const pokemonDefs = [
    { key: "pikachu",  color: PAL.yellow,  accent: PAL.orange,  ear: PAL.black },
    { key: "ronflex",  color: PAL.blue,    accent: PAL.white,   ear: PAL.skinLight },
    { key: "alakazam", color: PAL.orange,  accent: PAL.yellow,  ear: PAL.brown },
    { key: "noctali",  color: PAL.black,   accent: PAL.yellow,  ear: PAL.gray },
    { key: "mewtwo",   color: PAL.gray,    accent: PAL.purple,  ear: PAL.purple },
    { key: "evoli",    color: PAL.orange,  accent: PAL.white,   ear: PAL.orange },
  ];

  pokemonDefs.forEach(({ key, color, accent, ear }) => {
    makeSprite(scene, key, 4, (ctx, ox, frame) => {
      // Simple 16x16 creature silhouette
      ctx.fillStyle = color;
      ctx.fillRect(ox+4, 4, 8, 8); // body
      ctx.fillRect(ox+5, 2, 6, 4); // head
      ctx.fillStyle = accent;
      ctx.fillRect(ox+6, 3, 2, 2); // eyes area
      ctx.fillStyle = PAL.black;
      px(ctx, ox+6, 3, PAL.black); px(ctx, ox+9, 3, PAL.black); // eyes
      // legs (animated)
      const bounce = frame % 2 === 0 ? 0 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(ox+5, 12+bounce, 2, 2);
      ctx.fillRect(ox+9, 12-bounce, 2, 2);
      // ears
      ctx.fillStyle = ear;
      px(ctx, ox+5, 1, ear); px(ctx, ox+10, 1, ear);
    });
  });
}
```

- [ ] **Step 2: Verify assets load without errors**

Open browser console. Expected: no errors. You should see the Phaser canvas (black/green area) in the page.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: programmatic pixel art asset generation for all sprites and tiles"
```

---

## Task 3: Map Rendering

**Files:**
- Modify: `game.js` (add `buildMap()` and zone constants)

Renders the 30×20 tile map with thematic zones.

- [ ] **Step 1: Add zone constants and `buildMap()` to `game.js`**

Add before `generateAssets`:

```javascript
// Zone definitions — pixel tile coordinates (col, row)
const ZONES = {
  town:    { col: 12, row: 7,  w: 6, h: 6,  tile: "tile_path",     tools: [] },
  forest:  { col: 0,  row: 0,  w: 10,h: 9,  tile: "tile_tree",     tools: ["Bash"] },
  library: { col: 20, row: 0,  w: 10,h: 9,  tile: "tile_building", tools: ["Read","Grep","Glob"] },
  forge:   { col: 0,  row: 11, w: 10,h: 9,  tile: "tile_sand",     tools: ["Edit","Write"] },
  ocean:   { col: 20, row: 11, w: 10,h: 9,  tile: "tile_water",    tools: ["WebSearch","WebFetch"] },
  lab:     { col: 12, row: 0,  w: 6, h: 6,  tile: "tile_building", tools: ["Agent","Plan"] },
};

function getZoneForTool(toolName) {
  for (const [name, zone] of Object.entries(ZONES)) {
    if (zone.tools.includes(toolName)) return zone;
  }
  return ZONES.town;
}

function randomPosInZone(zone) {
  return {
    x: (zone.col + 1 + Math.floor(Math.random() * (zone.w - 2))) * TILE_SIZE,
    y: (zone.row + 1 + Math.floor(Math.random() * (zone.h - 2))) * TILE_SIZE,
  };
}

function buildMap(scene) {
  // Fill base with grass
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      scene.add.image(col * TILE_SIZE + TILE_SIZE/2, row * TILE_SIZE + TILE_SIZE/2, "tile_grass");
    }
  }
  // Draw zones
  for (const zone of Object.values(ZONES)) {
    for (let r = zone.row; r < zone.row + zone.h; r++) {
      for (let c = zone.col; c < zone.col + zone.w; c++) {
        scene.add.image(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, zone.tile);
      }
    }
  }
  // Zone labels
  const labelStyle = { fontSize: "5px", fontFamily: "'Press Start 2P'", color: "#ffffff", stroke: "#000000", strokeThickness: 2 };
  scene.add.text(ZONES.forest.col  * TILE_SIZE + 4, ZONES.forest.row  * TILE_SIZE + 4, "FORET",    labelStyle);
  scene.add.text(ZONES.library.col * TILE_SIZE + 4, ZONES.library.row * TILE_SIZE + 4, "BIBLIO",   labelStyle);
  scene.add.text(ZONES.forge.col   * TILE_SIZE + 4, ZONES.forge.row   * TILE_SIZE + 4, "FORGE",    labelStyle);
  scene.add.text(ZONES.ocean.col   * TILE_SIZE + 4, ZONES.ocean.row   * TILE_SIZE + 4, "OCEAN",    labelStyle);
  scene.add.text(ZONES.lab.col     * TILE_SIZE + 4, ZONES.lab.row     * TILE_SIZE + 4, "LABO",     labelStyle);
  scene.add.text(ZONES.town.col    * TILE_SIZE + 4, ZONES.town.row    * TILE_SIZE + 4, "VILLE",    labelStyle);
}
```

- [ ] **Step 2: Verify map renders**

Reload browser. Expected: colored zones visible on the canvas (grass background, distinct zone tiles, small zone labels).

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: pixel art zone map with 6 thematic areas"
```

---

## Task 4: Sacha — Spawn and Zone Movement

**Files:**
- Modify: `game.js` (add `spawnSacha()` + `moveSachaToZone()`)

Sacha starts in Town Center and walks toward the zone matching the current tool.

- [ ] **Step 1: Add `spawnSacha()` and `moveSachaToZone()` to `game.js`**

Add before `connectWebSocket`:

```javascript
let sachaSprite = null;
let sachaScene = null;

function spawnSacha(scene) {
  sachaScene = scene;
  const startX = (ZONES.town.col + 3) * TILE_SIZE;
  const startY = (ZONES.town.row + 3) * TILE_SIZE;
  sachaSprite = scene.add.sprite(startX, startY, "sacha", 0);
  sachaSprite.setScale(1);
  sachaSprite.setDepth(10);

  scene.anims.create({
    key: "sacha_walk",
    frames: scene.anims.generateFrameNumbers("sacha", { start: 0, end: 3 }),
    frameRate: 8,
    repeat: -1,
  });
}

function moveSachaToZone(toolName) {
  if (!sachaSprite || !sachaScene) return;
  const zone = getZoneForTool(toolName);
  const target = randomPosInZone(zone);
  sachaSprite.play("sacha_walk");

  const dist = Phaser.Math.Distance.Between(sachaSprite.x, sachaSprite.y, target.x, target.y);
  const speed = 3 * TILE_SIZE; // pixels per second
  const duration = (dist / speed) * 1000;

  sachaScene.tweens.add({
    targets: sachaSprite,
    x: target.x,
    y: target.y,
    duration: Math.max(300, duration),
    ease: "Linear",
    onComplete: () => sachaSprite.stop(),
  });
}
```

- [ ] **Step 2: Verify Sacha appears in Town Center**

Reload browser. Expected: Sacha sprite visible in the center of the map.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: Sacha sprite spawns in Town Center with walk animation"
```

---

## Task 5: WebSocket Connection and Event Routing

**Files:**
- Modify: `game.js` (add `connectWebSocket()` + event handlers)

Connects to `ws://localhost:8765/ws` and routes events to game functions.

- [ ] **Step 1: Add `connectWebSocket()` and event handlers to `game.js`**

Add before `window.addEventListener`:

```javascript
const POKEMON_MAP = {
  "Explore":       { key: "ronflex",  name: "Ronflex",  emoji: "💤" },
  "Plan":          { key: "alakazam", name: "Alakazam", emoji: "🔮" },
  "general-purpose": { key: "pikachu", name: "Pikachu", emoji: "⚡" },
  "code-reviewer": { key: "noctali",  name: "Noctali",  emoji: "🌙" },
  "__mewtwo__":    { key: "mewtwo",   name: "Mewtwo",   emoji: "🌀" },
  "__default__":   { key: "evoli",    name: "Évoli",    emoji: "⭐" },
};

function getPokemonDef(agentType) {
  if (!agentType) return POKEMON_MAP["__default__"];
  if (agentType.startsWith("superpowers:")) return POKEMON_MAP["__mewtwo__"];
  return POKEMON_MAP[agentType] || POKEMON_MAP["__default__"];
}

let wsScene = null;

function connectWebSocket(scene) {
  wsScene = scene;
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => console.log("[WS] Connected");
  ws.onmessage = (msg) => {
    try { handleEvent(JSON.parse(msg.data)); }
    catch(e) { console.error("[WS] Parse error", e); }
  };
  ws.onclose = () => setTimeout(() => connectWebSocket(scene), 3000); // auto-reconnect
  ws.onerror = (e) => console.error("[WS] Error", e);
}

function handleEvent(evt) {
  switch (evt.event) {
    case "session_started":  onSessionStarted(evt); break;
    case "session_ended":    onSessionEnded(evt);   break;
    case "agent_created":    onAgentCreated(evt);   break;
    case "agent_updated":    onAgentUpdated(evt);   break;
    case "agent_completed":  onAgentCompleted(evt); break;
    case "tool_used":        onToolUsed(evt);       break;
  }
}

function onSessionStarted(evt) {
  sessionStart = Date.now();
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function onSessionEnded(evt) {
  clearInterval(timerInterval);
}

function onToolUsed(evt) {
  moveSachaToZone(evt.tool);
}

function onAgentCreated(evt) { /* Task 6 */ }
function onAgentUpdated(evt) { /* Task 7 */ }
function onAgentCompleted(evt) { /* Task 7 */ }

function updateTimer() {
  if (!sessionStart) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `SESSION: ${h}:${m}:${s}`;
}
```

- [ ] **Step 2: Verify WebSocket connects**

Reload browser, check console. Expected: `[WS] Connected`

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: WebSocket connection with auto-reconnect and event routing"
```

---

## Task 6: HTTP Event Endpoint + Agent State

**Files:**
- Modify: `server.py` (implement `handle_event()` + agent state management + broadcast logic)

Parses Claude Code hook payloads, maintains agent state, broadcasts WebSocket events.

- [ ] **Step 1: Write tests for event parsing**

Create `tests/test_server.py`:

```python
import json
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Import the parsing functions we'll add to server.py
from server import parse_hook_payload, get_pokemon_for_type, build_agent_created_event

def test_parse_posttooluse_agent():
    payload = {
        "hook_event_name": "PostToolUse",
        "session_id": "sess1",
        "tool_name": "Agent",
        "tool_input": {"subagent_type": "Explore", "prompt": "Find files"},
        "tool_response": "done"
    }
    result = parse_hook_payload(payload)
    assert result["event"] == "agent_created"
    assert result["session_id"] == "sess1"
    assert result["agent_type"] == "Explore"
    assert result["prompt"] == "Find files"

def test_parse_posttooluse_tool():
    payload = {
        "hook_event_name": "PostToolUse",
        "session_id": "sess1",
        "tool_name": "Read",
        "tool_input": {"file_path": "src/app.py"},
    }
    result = parse_hook_payload(payload)
    assert result["event"] == "tool_used"
    assert result["tool"] == "Read"

def test_parse_stop():
    payload = {"hook_event_name": "Stop", "session_id": "sess1"}
    result = parse_hook_payload(payload)
    assert result["event"] == "session_ended"

def test_pokemon_mapping():
    assert get_pokemon_for_type("Explore") == "Ronflex"
    assert get_pokemon_for_type("Plan") == "Alakazam"
    assert get_pokemon_for_type("general-purpose") == "Pikachu"
    assert get_pokemon_for_type("code-reviewer") == "Noctali"
    assert get_pokemon_for_type("superpowers:brainstorm") == "Mewtwo"
    assert get_pokemon_for_type("superpowers:tdd") == "Mewtwo"
    assert get_pokemon_for_type("unknown-thing") == "Évoli"
    assert get_pokemon_for_type(None) == "Évoli"

def test_build_agent_created_event():
    evt = build_agent_created_event("sess1", "Explore", "Find all files", "uuid-123")
    assert evt["event"] == "agent_created"
    assert evt["agent"]["pokemon"] == "Ronflex"
    assert evt["agent"]["status"] == "pending"
    assert evt["agent"]["type"] == "Explore"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pip install pytest
pytest tests/test_server.py -v
```

Expected: `ImportError` or `AttributeError` — functions don't exist yet.

- [ ] **Step 3: Implement parsing functions and state in `server.py`**

Add before `handle_index`:

```python
import time
import uuid

# --- Agent state ---
sessions: set[str] = set()
agents: dict[str, dict] = {}

POKEMON_MAP = {
    "Explore":         "Ronflex",
    "Plan":            "Alakazam",
    "general-purpose": "Pikachu",
    "code-reviewer":   "Noctali",
}

def get_pokemon_for_type(agent_type: str | None) -> str:
    if not agent_type:
        return "Évoli"
    if agent_type.startswith("superpowers:"):
        return "Mewtwo"
    return POKEMON_MAP.get(agent_type, "Évoli")

def build_agent_created_event(session_id: str, agent_type: str, prompt: str, agent_id: str) -> dict:
    return {
        "event": "agent_created",
        "agent": {
            "id": agent_id,
            "type": agent_type,
            "pokemon": get_pokemon_for_type(agent_type),
            "status": "pending",
            "prompt": prompt,
            "started_at": time.time(),
            "current_tool": None,
            "current_file": None,
            "logs": [],
            "result": None,
        }
    }

def parse_hook_payload(payload: dict) -> dict | None:
    event_name = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "")

    if event_name == "Stop":
        return {"event": "session_ended", "session_id": session_id}

    if event_name == "PostToolUse":
        tool_name = payload.get("tool_name", "")
        tool_input = payload.get("tool_input", {})

        if tool_name == "Agent":
            agent_type = tool_input.get("subagent_type")
            prompt = tool_input.get("prompt", "")
            return {
                "event": "agent_created",
                "session_id": session_id,
                "agent_type": agent_type,
                "prompt": prompt,
            }

        # All other tools — Sacha movement
        file_path = tool_input.get("file_path") or tool_input.get("path") or tool_input.get("command", "")
        return {
            "event": "tool_used",
            "tool": tool_name,
            "command": str(file_path)[:80],
            "session_id": session_id,
        }

    if event_name == "PreToolUse":
        return None  # ignored for now

    return None
```

- [ ] **Step 4: Implement `handle_event()` in `server.py`**

Replace the placeholder `handle_event` function:

```python
async def handle_event(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
    except Exception:
        return web.Response(status=400, text="Bad JSON")

    session_id = payload.get("session_id", "")

    # Emit session_started on first event from a new session
    if session_id and session_id not in sessions:
        sessions.add(session_id)
        await broadcast({"event": "session_started", "session_id": session_id, "timestamp": time.time()})

    parsed = parse_hook_payload(payload)
    if parsed is None:
        return web.Response(text="OK")

    evt_type = parsed["event"]

    if evt_type == "agent_created":
        agent_id = str(uuid.uuid4())
        evt = build_agent_created_event(session_id, parsed["agent_type"], parsed["prompt"], agent_id)
        agents[agent_id] = evt["agent"].copy()
        await broadcast(evt)

    elif evt_type == "tool_used":
        await broadcast(parsed)

    elif evt_type == "session_ended":
        # Mark all pending/in_progress agents as done
        for agent in agents.values():
            if agent["status"] in ("pending", "in_progress"):
                agent["status"] = "done"
                await broadcast({"event": "agent_completed", "agent_id": agent["id"], "result": "Session ended", "duration_ms": int((time.time() - agent["started_at"]) * 1000)})
        sessions.discard(session_id)
        await broadcast(parsed)

    return web.Response(text="OK")
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pytest tests/test_server.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server.py tests/test_server.py
git commit -m "feat: HTTP event endpoint with hook parsing, agent state, and WS broadcast"
```

---

## Task 7: Pokemon Spawning and Lifecycle

**Files:**
- Modify: `game.js` (implement `onAgentCreated`, `onAgentUpdated`, `onAgentCompleted`, `renderBottomPanel`)

Spawns Pokemon sprites on agent_created, updates speech bubbles, fades out on completion.

- [ ] **Step 1: Implement `onAgentCreated()` in `game.js`**

Replace the placeholder `onAgentCreated`:

```javascript
function onAgentCreated(evt) {
  const agent = evt.agent;
  const pokeDef = getPokemonDef(agent.type);
  const zone = ZONES.lab; // Pokemon spawn in lab zone initially
  const pos = randomPosInZone(zone);

  const sprite = wsScene.add.sprite(pos.x, pos.y, pokeDef.key, 0);
  sprite.setDepth(10);

  // Walk animation
  wsScene.anims.create({
    key: `walk_${agent.id}`,
    frames: wsScene.anims.generateFrameNumbers(pokeDef.key, { start: 0, end: 3 }),
    frameRate: 6,
    repeat: -1,
  });

  const bubble = wsScene.add.text(pos.x, pos.y - 12, "", {
    fontSize: "5px",
    fontFamily: "'Press Start 2P'",
    color: "#ffffff",
    backgroundColor: "#000000aa",
    padding: { x: 2, y: 1 },
    wordWrap: { width: 80 },
  });
  bubble.setDepth(20);
  bubble.setOrigin(0.5, 1);

  agents[agent.id] = {
    ...agent,
    sprite,
    bubble,
    progressStart: Date.now(),
    progressInterval: setInterval(() => updateProgressBar(agent.id), 500),
  };

  renderBottomPanel();
  triggerSpawnEffects(pokeDef.name);
}

function triggerSpawnEffects(pokemonName) {
  // White flash
  const flash = document.getElementById("flash-overlay");
  flash.style.opacity = "1";
  flash.style.transition = "opacity 0.3s ease";
  setTimeout(() => flash.style.opacity = "0", 50);

  // Spawn text
  const text = document.getElementById("spawn-text");
  text.textContent = `Un agent ${pokemonName.toUpperCase()} est apparu !`;
  text.style.opacity = "1";
  text.style.transition = "none";
  setTimeout(() => {
    text.style.transition = "opacity 0.5s ease";
    text.style.opacity = "0";
  }, 2000);
}
```

- [ ] **Step 2: Implement `onAgentUpdated()` in `game.js`**

Replace the placeholder `onAgentUpdated`:

```javascript
function onAgentUpdated(evt) {
  const a = agents[evt.agent_id];
  if (!a) return;
  a.status = "in_progress";
  a.current_tool = evt.tool;
  a.current_file = evt.file;
  a.progressStart = Date.now();

  // Update speech bubble
  const label = `${evt.tool || ""}${evt.file ? ": " + evt.file.slice(-16) : ""}`;
  a.bubble.setText(label.slice(0, 24));
  a.bubble.setPosition(a.sprite.x, a.sprite.y - 12);

  // Animate Pokemon
  a.sprite.play(`walk_${evt.agent_id}`);

  renderBottomPanel();
}
```

- [ ] **Step 3: Implement `onAgentCompleted()` in `game.js`**

Replace the placeholder `onAgentCompleted`:

```javascript
function onAgentCompleted(evt) {
  const a = agents[evt.agent_id];
  if (!a) return;
  a.status = "done";
  a.result = evt.result;
  clearInterval(a.progressInterval);

  // Stop walk animation
  a.sprite.stop();

  // Sparkle particles
  const particles = wsScene.add.particles(a.sprite.x, a.sprite.y, "tile_path", {
    speed: { min: 20, max: 60 },
    scale: { start: 0.5, end: 0 },
    lifespan: 600,
    quantity: 8,
    tint: [0xffd700, 0xffffff, 0x80ff80],
  });
  setTimeout(() => particles.destroy(), 800);

  // Hide bubble
  a.bubble.setText("");

  // Fade out sprite
  wsScene.tweens.add({
    targets: [a.sprite, a.bubble],
    alpha: 0,
    duration: 1000,
    onComplete: () => {
      a.sprite.destroy();
      a.bubble.destroy();
    },
  });

  renderBottomPanel();
}
```

- [ ] **Step 4: Implement `updateProgressBar()` and `renderBottomPanel()` in `game.js`**

```javascript
function updateProgressBar(agentId) {
  const el = document.getElementById(`progress-${agentId}`);
  if (!el) return;
  const a = agents[agentId];
  if (!a || a.status === "done") return;
  const elapsed = (Date.now() - a.progressStart) / 1000;
  const pct = Math.min(100, (elapsed / 30) * 100); // fills over 30s
  el.style.width = pct + "%";
}

function renderBottomPanel() {
  const list = document.getElementById("agent-list");
  const activeAgents = Object.values(agents).filter(a => a.status !== "done");
  document.getElementById("agent-count").textContent = `${activeAgents.length} agents actifs`;

  list.innerHTML = "";
  Object.values(agents).slice(-8).forEach(a => {
    const pokeDef = getPokemonDef(a.type);
    const tool = a.current_tool || "IDLE";
    const file = (a.current_file || "—").slice(-20);
    const li = document.createElement("li");
    li.className = "agent-row";
    li.innerHTML = `
      <span class="pokemon-name">${pokeDef.emoji} ${pokeDef.name}</span>
      <span class="agent-tool">${tool}</span>
      <span class="agent-file">${file}</span>
      <div class="progress-bar"><div class="progress-fill" id="progress-${a.id}" style="width:0%"></div></div>
    `;
    if (a.status === "done") li.style.opacity = "0.4";
    list.appendChild(li);
  });
}
```

- [ ] **Step 5: Test manually — simulate an agent event**

With server running, in a new terminal:

```bash
curl -s -X POST http://localhost:8765/event \
  -H "Content-Type: application/json" \
  -d '{"hook_event_name":"PostToolUse","session_id":"test1","tool_name":"Agent","tool_input":{"subagent_type":"Explore","prompt":"Find all files"}}'
```

Expected in browser: white flash, "Un agent RONFLEX est apparu!" text, Ronflex sprite appears on map, bottom panel shows 1 agent actif.

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -m "feat: Pokemon spawning, lifecycle, speech bubbles, sparkle, bottom panel"
```

---

## Task 8: Hook Setup (`--setup` flag)

**Files:**
- Modify: `server.py` (implement `setup_hooks()`)

Writes Claude Code hooks to `~/.claude/settings.json` idempotently.

- [ ] **Step 1: Write test for hook setup**

Add to `tests/test_server.py`:

```python
import tempfile, pathlib

def test_setup_hooks_creates_file(tmp_path):
    from server import setup_hooks
    settings_file = tmp_path / "settings.json"
    setup_hooks(settings_path=str(settings_file))
    data = json.loads(settings_file.read_text())
    assert "hooks" in data
    assert "PreToolUse" in data["hooks"]
    assert "PostToolUse" in data["hooks"]
    assert "Stop" in data["hooks"]

def test_setup_hooks_is_idempotent(tmp_path):
    from server import setup_hooks
    settings_file = tmp_path / "settings.json"
    setup_hooks(settings_path=str(settings_file))
    setup_hooks(settings_path=str(settings_file))
    data = json.loads(settings_file.read_text())
    # Should not duplicate entries
    assert len(data["hooks"]["PreToolUse"]) == 1

def test_setup_hooks_preserves_existing(tmp_path):
    from server import setup_hooks
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(json.dumps({"theme": "dark", "hooks": {}}))
    setup_hooks(settings_path=str(settings_file))
    data = json.loads(settings_file.read_text())
    assert data["theme"] == "dark"  # preserved
    assert "PreToolUse" in data["hooks"]  # added
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pytest tests/test_server.py::test_setup_hooks_creates_file -v
```

Expected: `ImportError: cannot import name 'setup_hooks'`

- [ ] **Step 3: Implement `setup_hooks()` in `server.py`**

Add before `build_app`:

```python
HOOK_COMMAND = "curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' -d @-"
HOOK_ENTRY = {"type": "command", "command": HOOK_COMMAND}

def setup_hooks(settings_path: str | None = None) -> None:
    if settings_path is None:
        settings_path = os.path.expanduser("~/.claude/settings.json")

    path = pathlib.Path(settings_path)
    if path.exists():
        data = json.loads(path.read_text())
    else:
        data = {}

    hooks = data.setdefault("hooks", {})

    for event in ("PreToolUse", "PostToolUse", "Stop"):
        entries = hooks.setdefault(event, [])
        # Idempotent: check if our command is already registered
        already_registered = any(
            h.get("command") == HOOK_COMMAND
            for entry in entries
            for h in (entry.get("hooks", [entry]) if isinstance(entry, dict) else [])
        )
        if not already_registered:
            entries.append({"matcher": "", "hooks": [HOOK_ENTRY]})

    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"✓ Hooks written to {settings_path}")
    print("  Restart Claude Code for hooks to take effect.")
```

Update the `--setup` branch in `__main__`:

```python
if "--setup" in sys.argv:
    setup_hooks()
    sys.exit(0)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pytest tests/test_server.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_server.py
git commit -m "feat: --setup flag writes Claude Code hooks to settings.json idempotently"
```

---

## Task 9: Sacha Tool Reactions + Session Timer

**Files:**
- Modify: `game.js` (wire `tool_used` → `moveSachaToZone`)
- Modify: `game.js` (wire `session_started` → start timer)

These are already stubbed in Task 5 — just verify and polish.

- [ ] **Step 1: Verify `onToolUsed` triggers Sacha movement**

Send a tool_used event:

```bash
curl -s -X POST http://localhost:8765/event \
  -H "Content-Type: application/json" \
  -d '{"hook_event_name":"PostToolUse","session_id":"test1","tool_name":"Read","tool_input":{"file_path":"src/app.py"}}'
```

Expected: Sacha walks toward the Library zone.

- [ ] **Step 2: Verify session timer starts**

```bash
curl -s -X POST http://localhost:8765/event \
  -H "Content-Type: application/json" \
  -d '{"hook_event_name":"PreToolUse","session_id":"newsession","tool_name":"Bash","tool_input":{}}'
```

Expected: top bar timer starts counting.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: verify Sacha movement and timer wiring — no code changes needed"
```

---

## Task 10: End-to-End Integration Test

**Files:**
- Create: `tests/test_integration.py`

Simulates a full Claude Code session and verifies all WebSocket events are broadcast correctly.

- [ ] **Step 1: Write integration test**

```python
import asyncio
import json
import threading
import time
import pytest
import aiohttp
from aiohttp import web
from server import build_app

@pytest.fixture
def running_server():
    """Start the aiohttp app in a background thread."""
    import asyncio
    loop = asyncio.new_event_loop()
    app = build_app()
    runner = web.AppRunner(app)

    async def start():
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 8766)  # test port
        await site.start()

    loop.run_until_complete(start())
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    time.sleep(0.2)
    yield "http://127.0.0.1:8766"
    loop.call_soon_threadsafe(loop.stop)

@pytest.mark.asyncio
async def test_full_session(running_server):
    base = running_server
    received = []

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(f"{base.replace('http','ws')}/ws") as ws:
            # Send session event
            await session.post(f"{base}/event", json={
                "hook_event_name": "PostToolUse",
                "session_id": "sess1",
                "tool_name": "Agent",
                "tool_input": {"subagent_type": "Explore", "prompt": "Find files"},
            })
            await asyncio.sleep(0.1)

            # Collect messages
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    received.append(json.loads(msg.data))
                if len(received) >= 2:
                    break

    events = [e["event"] for e in received]
    assert "session_started" in events
    assert "agent_created" in events
    agent_evt = next(e for e in received if e["event"] == "agent_created")
    assert agent_evt["agent"]["pokemon"] == "Ronflex"
```

- [ ] **Step 2: Install pytest-asyncio**

```bash
pip install pytest-asyncio
```

- [ ] **Step 3: Run integration test**

```bash
pytest tests/test_integration.py -v
```

Expected: PASS.

- [ ] **Step 4: Manual end-to-end test**

1. `python server.py`
2. Open `http://localhost:8765`
3. In another terminal, send a sequence of events:

```bash
# Session + agent spawn
curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"PostToolUse","session_id":"demo","tool_name":"Agent","tool_input":{"subagent_type":"Explore","prompt":"Find all files"}}'

sleep 2

# Tool use (Sacha movement)
curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"PostToolUse","session_id":"demo","tool_name":"Read","tool_input":{"file_path":"src/app.py"}}'

sleep 2

# Session end
curl -s -X POST http://localhost:8765/event -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"Stop","session_id":"demo"}'
```

Expected: Ronflex appears → Sacha walks to Library → Ronflex fades out.

- [ ] **Step 5: Final commit**

```bash
git add tests/test_integration.py
git commit -m "test: integration test for full session event flow"
```

---

## Task 11: Final Setup and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# PixelAgent — Pokemon Gameboy Agents Visualizer

Watch Claude Code and its subagents come to life as Pokemon characters on a pixel art map.

## Install

pip install aiohttp pytest pytest-asyncio

## Setup (one-time)

python server.py --setup

This writes Claude Code hooks to ~/.claude/settings.json.
Restart Claude Code after setup.

## Run

python server.py
open http://localhost:8765

## Use Claude Code normally — agents appear on the map automatically.

## Run Tests

pytest tests/ -v
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and run instructions"
```

---

## Running All Tests

```bash
pytest tests/ -v
```

Expected: all tests pass (unit + integration).
