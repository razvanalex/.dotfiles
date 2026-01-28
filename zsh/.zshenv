# Paths
export PATH="/opt/homebrew/opt/trash-cli/bin:$PATH"
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
export PATH="${HOME}/.opencode/bin:$PATH"
export PATH="${HOME}/.local/bin:$PATH"

# Save huggingface data on a separate spare drive
if [ -d "/mnt/data/razvanalex-local/huggingface/" ]; then
    export HF_HOME="/mnt/data/razvanalex-local/huggingface/"
fi

# Editor
export VISUAL=nvim
export EDITOR=nvim
export SYSTEMD_EDITOR=nvim

# GPG
export GPG_TTY=$(tty)

# FZF
export FZF_DEFAULT_COMMAND="rg --hidden --no-ignore --follow --files --no-messages"

# Neovim
export TRANSPARENT=true
