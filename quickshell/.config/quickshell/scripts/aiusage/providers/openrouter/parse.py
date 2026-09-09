#!/usr/bin/env python3
import json


def parse(raw_output):
    try:
        data = json.loads(raw_output)
    except (json.JSONDecodeError, ValueError):
        return {"provider": "OpenRouter", "metrics": []}

    if data.get("_error"):
        return {"provider": "OpenRouter", "metrics": [], "detail": data["_error"]}

    total = float(data.get("total_credits") or 0)
    usage = float(data.get("total_usage") or 0)
    remaining = max(total - usage, 0.0)
    pct = round(100 * usage / total) if total > 0 else 0

    return {
        "provider": "OpenRouter",
        "metrics": [
            {
                "type": "credits",
                "percentage": pct,
                "remaining": round(remaining, 2),
                "detail": f"${remaining:.2f} of ${total:.2f} left",
            }
        ],
    }
