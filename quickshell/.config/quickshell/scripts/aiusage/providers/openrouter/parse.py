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
    # no percentage: total_* are lifetime-cumulative, so a pct would mean
    # lifetime utilization and would never reset on top-up. Dollar detail only.
    return {
        "provider": "OpenRouter",
        "metrics": [
            {
                "type": "credits",
                "percentage": None,
                "remaining": round(remaining, 2),
                "detail": f"${remaining:.2f} of ${total:.2f} left",
            }
        ],
    }
