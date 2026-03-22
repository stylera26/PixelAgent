# PixelAgent — Pokemon Gameboy Agents Visualizer

Visualise Claude Code et ses agents en temps réel sous forme de Pokémon sur une map pixel art style Game Boy.

**Sacha** (Claude Code principal) se déplace entre les zones selon les outils utilisés. Chaque subagent dispatché fait apparaître un Pokémon sur la carte.

| Agent | Pokémon |
|---|---|
| Explore | 💤 Ronflex |
| Plan | 🔮 Alakazam |
| general-purpose | ⚡ Pikachu |
| code-reviewer | 🌙 Noctali |
| superpowers:* | 🌀 Mewtwo |
| Autre | ⭐ Évoli |

## Installation

```bash
pip install aiohttp pytest pytest-asyncio
```

## Setup (une seule fois)

```bash
python3 server.py --setup
```

Écrit les hooks Claude Code dans `~/.claude/settings.json`.
**Redémarre Claude Code après le setup.**

## Lancer

```bash
python3 server.py
```

Puis ouvre **http://localhost:8765** dans ton navigateur.

Utilise Claude Code normalement — les agents apparaissent sur la carte automatiquement.

## Tests

```bash
pytest tests/ -v
```

## Architecture

```
Claude Code hooks → server.py (port 8765) → WebSocket → Phaser.js (browser)
```

- `server.py` — serveur aiohttp : HTTP + WebSocket + état des agents
- `index.html` — page shell : top bar, canvas Phaser, panneau agents
- `game.js` — jeu Phaser 3 : map, sprites générés programmatiquement, effets
