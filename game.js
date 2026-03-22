// game.js — PixelAgent Pokemon Gameboy Visualizer

const WS_URL = "ws://localhost:8765/ws";
const TILE_SIZE = 16;
const MAP_COLS = 30;
const MAP_ROWS = 20;

let game;
let sessionStart = null;
let timerInterval = null;
const agents = {}; // agent_id → { state, sprite, bubble, progressInterval }
let sachaSprite = null;
let sachaScene = null;

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
  // frames: number of walk animation frames — canvas width = TILE_SIZE * frames
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
  makeTile(scene, "tile_lab", ctx => {
    // Lab: dark purple floor with test tube dots
    ctx.fillStyle = PAL.darkGray; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.purple;
    ctx.fillRect(0, 0, 16, 3); // purple roof strip
    [[3,6],[3,7],[3,8],[11,6],[11,7],[11,8]].forEach(([x,y]) => ctx.fillRect(x,y,1,1)); // test tubes
    ctx.fillStyle = PAL.blue;
    [[4,9],[12,9]].forEach(([x,y]) => ctx.fillRect(x,y,1,1)); // liquid
  });

  // --- Sacha sprite (4 walk frames) ---
  makeSprite(scene, "sacha", 4, (ctx, ox, frame) => {
    // Hat
    for (let x=5;x<=10;x++) px(ctx, ox+x, 0, PAL.hatRed);
    for (let x=6;x<=9;x++) px(ctx, ox+x, 1, PAL.hatWhite);
    // Hair (overlaps hat brim)
    px(ctx, ox+7, 1, PAL.hairBlack); px(ctx, ox+8, 1, PAL.hairBlack);
    // Face
    px(ctx, ox+7, 2, PAL.skinLight); px(ctx, ox+8, 2, PAL.skinLight);
    // Body
    for (let x=6;x<=9;x++) for (let y=4;y<=7;y++) px(ctx, ox+x, y, PAL.shirt);
    // Legs (animated — alternate each frame)
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
      // Body
      ctx.fillStyle = color;
      ctx.fillRect(ox+4, 4, 8, 8);
      // Head
      ctx.fillRect(ox+5, 2, 6, 4);
      // Eyes (accent bg + black pupils)
      ctx.fillStyle = accent;
      ctx.fillRect(ox+6, 3, 2, 2);
      px(ctx, ox+6, 3, PAL.black); px(ctx, ox+9, 3, PAL.black); // pupils
      // Legs (animated bounce)
      const bounce = frame % 2 === 0 ? 0 : 1;
      ctx.fillStyle = color;
      ctx.fillRect(ox+5, 12+bounce, 2, 2);
      ctx.fillRect(ox+9, 12-bounce, 2, 2);
      // Ears
      ctx.fillStyle = ear;
      px(ctx, ox+5, 1, ear); px(ctx, ox+10, 1, ear);
    });
  });
}

// Zone definitions — pixel tile coordinates (col, row)
const ZONES = {
  town:    { col: 12, row: 7,  w: 6, h: 6,  tile: "tile_path",     tools: [] },
  forest:  { col: 0,  row: 0,  w: 10,h: 9,  tile: "tile_tree",     tools: ["Bash"] },
  library: { col: 20, row: 0,  w: 10,h: 9,  tile: "tile_building", tools: ["Read","Grep","Glob"] },
  forge:   { col: 0,  row: 11, w: 10,h: 9,  tile: "tile_sand",     tools: ["Edit","Write"] },
  ocean:   { col: 20, row: 11, w: 10,h: 9,  tile: "tile_water",    tools: ["WebSearch","WebFetch"] },
  lab:     { col: 12, row: 0,  w: 6, h: 6,  tile: "tile_lab",      tools: ["Agent","Plan"] },
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

// Stubs — implemented in later tasks
function buildMap(scene) {
  // Fill base with grass
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      scene.add.image(col * TILE_SIZE + TILE_SIZE/2, row * TILE_SIZE + TILE_SIZE/2, "tile_grass");
    }
  }
  // Draw zones over the grass base
  for (const zone of Object.values(ZONES)) {
    for (let r = zone.row; r < zone.row + zone.h; r++) {
      for (let c = zone.col; c < zone.col + zone.w; c++) {
        scene.add.image(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2, zone.tile);
      }
    }
  }
  // Zone labels
  const labelStyle = { fontSize: "5px", fontFamily: "'Press Start 2P'", color: "#ffffff", stroke: "#000000", strokeThickness: 2 };
  scene.add.text(ZONES.forest.col  * TILE_SIZE + 4, ZONES.forest.row  * TILE_SIZE + 4, "FORET",  labelStyle);
  scene.add.text(ZONES.library.col * TILE_SIZE + 4, ZONES.library.row * TILE_SIZE + 4, "BIBLIO", labelStyle);
  scene.add.text(ZONES.forge.col   * TILE_SIZE + 4, ZONES.forge.row   * TILE_SIZE + 4, "FORGE",  labelStyle);
  scene.add.text(ZONES.ocean.col   * TILE_SIZE + 4, ZONES.ocean.row   * TILE_SIZE + 4, "OCEAN",  labelStyle);
  scene.add.text(ZONES.lab.col     * TILE_SIZE + 4, ZONES.lab.row     * TILE_SIZE + 4, "LABO",   labelStyle);
  scene.add.text(ZONES.town.col    * TILE_SIZE + 4, ZONES.town.row    * TILE_SIZE + 4, "VILLE",  labelStyle);
}
function spawnSacha(scene) {
  sachaScene = scene;
  const startX = (ZONES.town.col + 3) * TILE_SIZE;
  const startY = (ZONES.town.row + 3) * TILE_SIZE;
  sachaSprite = scene.add.sprite(startX, startY, "sacha", 0);
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

const POKEMON_MAP = {
  "Explore":         { key: "ronflex",  name: "Ronflex",  emoji: "💤" },
  "Plan":            { key: "alakazam", name: "Alakazam", emoji: "🔮" },
  "general-purpose": { key: "pikachu",  name: "Pikachu",  emoji: "⚡" },
  "code-reviewer":   { key: "noctali",  name: "Noctali",  emoji: "🌙" },
  "__mewtwo__":      { key: "mewtwo",   name: "Mewtwo",   emoji: "🌀" },
  "__default__":     { key: "evoli",    name: "Évoli",    emoji: "⭐" },
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
  ws.onclose = () => setTimeout(() => connectWebSocket(scene), 3000);
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

function onAgentCreated(evt) {
  const agent = evt.agent;
  const pokeDef = getPokemonDef(agent.type);
  const zone = ZONES.lab;
  const pos = randomPosInZone(zone);

  const sprite = wsScene.add.sprite(pos.x, pos.y, pokeDef.key, 0);
  sprite.setDepth(10);

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

function onAgentUpdated(evt) {
  const a = agents[evt.agent_id];
  if (!a) return;
  a.status = "in_progress";
  a.current_tool = evt.tool;
  a.current_file = evt.file;
  a.progressStart = Date.now();

  const label = `${evt.tool || ""}${evt.file ? ": " + evt.file.slice(-16) : ""}`;
  a.bubble.setText(label.slice(0, 24));
  a.bubble.setPosition(a.sprite.x, a.sprite.y - 12);

  a.sprite.play(`walk_${evt.agent_id}`);

  renderBottomPanel();
}

function onAgentCompleted(evt) {
  const a = agents[evt.agent_id];
  if (!a) return;
  a.status = "done";
  a.result = evt.result;
  clearInterval(a.progressInterval);

  a.sprite.stop();
  a.bubble.setText("");

  // Sparkle particles
  const particles = wsScene.add.particles(a.sprite.x, a.sprite.y, "tile_path", {
    speed: { min: 20, max: 60 },
    scale: { start: 0.5, end: 0 },
    lifespan: 600,
    quantity: 8,
    tint: [0xffd700, 0xffffff, 0x80ff80],
  });
  setTimeout(() => particles.destroy(), 800);

  // Fade out sprite + bubble
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

function updateTimer() {
  if (!sessionStart) return;
  const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `SESSION: ${h}:${m}:${s}`;
}

window.addEventListener("load", () => { game = new Phaser.Game(config); });
