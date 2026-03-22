import json
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

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
    assert len(data["hooks"]["PreToolUse"]) == 1

def test_setup_hooks_preserves_existing(tmp_path):
    from server import setup_hooks
    settings_file = tmp_path / "settings.json"
    settings_file.write_text(json.dumps({"theme": "dark", "hooks": {}}))
    setup_hooks(settings_path=str(settings_file))
    data = json.loads(settings_file.read_text())
    assert data["theme"] == "dark"
    assert "PreToolUse" in data["hooks"]
