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
