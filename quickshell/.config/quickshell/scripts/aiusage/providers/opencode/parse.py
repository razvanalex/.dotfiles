import json


def parse(raw_output):
    try:
        data = json.loads(raw_output)
    except (json.JSONDecodeError, ValueError):
        return {"provider": "OpenCode (Go)", "metrics": []}

    usage = (data.get("usage") or {})
    kind = {"rolling": "rolling", "weekly": "weekly", "monthly": "monthly"}
    metrics = []

    for key, label in kind.items():
        window = usage.get(key) or {}
        if not window:
            continue
        metrics.append({
            "type": label,
            "percentage": int(window.get("percent") or 0),
            "status": window.get("status") or "ok",
            "resets_at": window.get("resetsAt"),
        })

    return {"provider": "OpenCode (Go)", "metrics": metrics}
