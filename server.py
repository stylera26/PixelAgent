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
