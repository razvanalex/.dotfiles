#!/usr/bin/env bash
: "${ILLOGICAL_IMPULSE_VIRTUAL_ENV:=$HOME/.local/share/quickshell-venv}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${ILLOGICAL_IMPULSE_VIRTUAL_ENV}/bin/activate"
"$SCRIPT_DIR/token_from_key.py" "$@"
deactivate
