#!/usr/bin/env python3
"""PixelAgent — Pokemon Gameboy Agents Visualizer server."""
import asyncio
import json
import os
import pathlib
import time
import uuid
from aiohttp import web

clients: set[web.WebSocketResponse] = set()

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

        file_path = tool_input.get("file_path") or tool_input.get("path") or tool_input.get("command", "")
        return {
            "event": "tool_used",
            "tool": tool_name,
            "command": str(file_path)[:80],
            "session_id": session_id,
        }

    if event_name == "PreToolUse":
        # session_started is emitted upstream in handle_event; PreToolUse itself produces no named WS event
        return None

    return None

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
        for agent in agents.values():
            if agent["status"] in ("pending", "in_progress"):
                agent["status"] = "done"
                await broadcast({
                    "event": "agent_completed",
                    "agent_id": agent["id"],
                    "result": "Session ended",
                    "duration_ms": int((time.time() - agent["started_at"]) * 1000)
                })
        sessions.discard(session_id)
        await broadcast(parsed)

    return web.Response(text="OK")

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
