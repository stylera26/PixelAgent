import asyncio
import json
import threading
import time
import pytest
import aiohttp
from aiohttp import web
from server import build_app
import server as server_module


@pytest.fixture
def running_server():
    """Start the aiohttp app in a background thread on port 8766 (not 8765 to avoid conflict)."""
    loop = asyncio.new_event_loop()
    app = build_app()
    runner = web.AppRunner(app)

    async def start():
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 8766)
        await site.start()

    loop.run_until_complete(start())
    thread = threading.Thread(target=loop.run_forever, daemon=True)
    thread.start()
    time.sleep(0.2)
    yield "http://127.0.0.1:8766"
    loop.call_soon_threadsafe(loop.stop)


@pytest.mark.asyncio
async def test_full_session(running_server):
    # Reset module-level state between test runs
    server_module.sessions.clear()
    server_module.agents.clear()

    base = running_server
    ws_url = base.replace("http", "ws") + "/ws"
    received = []

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(ws_url) as ws:
            # Send an agent_created event
            await session.post(f"{base}/event", json={
                "hook_event_name": "PostToolUse",
                "session_id": "sess1",
                "tool_name": "Agent",
                "tool_input": {"subagent_type": "Explore", "prompt": "Find files"},
            })
            await asyncio.sleep(0.2)

            # Collect all pending messages
            while True:
                try:
                    msg = await asyncio.wait_for(ws.receive(), timeout=0.3)
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        received.append(json.loads(msg.data))
                    else:
                        break
                except asyncio.TimeoutError:
                    break

    events = [e["event"] for e in received]
    assert "session_started" in events, f"Expected session_started, got: {events}"
    assert "agent_created" in events, f"Expected agent_created, got: {events}"

    agent_evt = next(e for e in received if e["event"] == "agent_created")
    assert agent_evt["agent"]["pokemon"] == "Ronflex"
    assert agent_evt["agent"]["type"] == "Explore"
    assert agent_evt["agent"]["status"] == "pending"
