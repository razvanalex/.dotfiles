#!/usr/bin/env python3
import json


def parse(raw_output):
    try:
        data = json.loads(raw_output)
    except (json.JSONDecodeError, ValueError):
        return {"provider": "GitHub Copilot", "metrics": []}

    snapshots = data.get("quota_snapshots", {})
    reset = data.get("quota_reset_date_utc") or data.get("quota_reset_date") or ""
    metrics = []

    for key, label in [("chat", "Chat"), ("completions", "Completions"), ("premium_interactions", "Premium")]:
        q = snapshots.get(key) or {}
        if not q:
            continue
        if q.get("unlimited"):
            metrics.append({"name": label, "percentage": 0, "detail": "unlimited"})
            continue
        pct = q.get("percent_remaining")
        if pct is None:
            ent, rem = q.get("entitlement") or 0, q.get("remaining") or 0
            pct = round(100 * rem / ent) if ent else 100
        metrics.append({
            "name": label,
            "percentage": round(100 - float(pct)),
            "detail": f"{q.get("remaining", "?")}/{q.get("entitlement", "?")} left",
            "reset_in_seconds": None,
            "reset_at": reset or None,
        })

    return {"provider": "GitHub Copilot", "metrics": metrics}
