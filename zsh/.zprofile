eval "$(/opt/homebrew/bin/brew shellenv)"

export PATH="$HOME/.local/bin:/opt/homebrew/opt/openjdk/bin:$PATH"

export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh)"
