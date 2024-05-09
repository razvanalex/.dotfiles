#!/bin/bash

DOTFILES_REPO="https://github.com/razvanalex/.dotfiles.git"

# Usage: log level message
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +'%d-%m-%y %H:%M:%S.%3N')

    declare -A LOG_COLORS
    LOG_COLORS["DEBUG"]="\e[94m"       # Blue
    LOG_COLORS["INFO"]="\e[92m"        # Green
    LOG_COLORS["WARN"]="\e[93m"        # Yellow
    LOG_COLORS["ERROR"]="\e[91m"       # Red
    LOG_COLORS["CRITICAL"]="\e[1;91m"  # Bold Red
    RESET_COLOR="\e[0m"

    level=${LOG_COLORS[$level]}${level}${RESET_COLOR}

    echo -e "[$timestamp][${level}]: $message"
}

# Usage: log_critical message
log_critical() {
    local message=$1
    log CRITICAL "$message"
}

# Usage: log_error message
log_error() {
    local message=$1
    log ERROR "$message"
}

# Usage: log_warn message
log_warn() {
    local message=$1
    log WARN "$message"
}

# Usage: log_info message
log_info() {
    local message=$1
    log INFO "$message"
}

# Usage: log_debug message
log_debug() {
    local message=$1
    log DEBUG "$message"
}

# Kills the installed on error
die_on_error() {
    local rc=$?
    local msg=$1

    if [ $rc -ne 0 ]; then
        log_error "installation failed: $1"
        exit $rc
    fi
}

# Log error if command failed
log_if_failed() {
    local rc=$?
    local msg=$1

    if [ $rc -ne 0 ]; then
        log_error "command failed: $msg"
    fi
}

# Install packages for Ubuntu systems.
install_ubuntu_packages() {
    local apt_packages=(
        trash-cli
        ripgrep
        git
        tmux
        make
        zsh
        wget
        curl
        htop
    )
    local snap_packages=(
        nvim
    )

    sudo apt update && \
    sudo apt install -y "${apt_packages[@]}" && \
    sudo snap install "${snap_packages[@]}"

    log_if_failed "failed updating packages"
}

# Install OMZ
install_omz() {
    local OMZ_PATH="$HOME/.oh-my-zsh"

    if [ ! -d "$OMZ_PATH" ]; then
        log_info "Installing OMZ..."
        sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
        die_on_error "omz failed"
    else
        log_info "Updating OMS..."
        "$OMZ_PATH/tools/upgrade.sh"
        log_if_failed "omz failed"
    fi
}

# Install tmux plugins manager
install_tpm() {
    local TPM_PATH="$HOME/.tmux/plugins/tpm"

    if [ ! -d "$TPM_PATH" ]; then
        log_info "Installing TPM..."
        git clone https://github.com/tmux-plugins/tpm "$TPM_PATH"
        die_on_error "tpm failed"
    else
        log_info "TPM already installed. Updating..."
        (cd "$TPM_PATH" && git pull)
        log_if_failed "tpm update failed"
    fi
}

# Install fzf
install_fzf() {
    local FZF_PATH="$HOME/.fzf"

    if ! command -v fzf &>/dev/null; then
        log_info "Installing fzf from source..."

        git clone --depth 1 https://github.com/junegunn/fzf.git "$FZF_PATH" && \
            "$FZF_PATH/install" && \
            eval "$(fzf --zsh)" \
            eval "$(fzf --bash)"

        die_on_error "fzf failed"

    elif [ -d "$FZF_HOME" ]; then
        log_info "Updating fzf from sources..."

        cd "$FZF_PATH" && git pull && \
            "$FZF_PATH/install" && \
            eval "$(fzf --zsh)" \
            eval "$(fzf --bash)"

        log_if_failed "fzf update failed"

    else
        log_warn "Could not update fzf. Probably was installed using the package manager. Update manually."
    fi
}

# Install kitty
install_kitty() {
    if ! command -v kitty &> /dev/null; then
        log_info "Installing kitty..."

        curl -L https://sw.kovidgoyal.net/kitty/installer.sh | sh /dev/stdin launch=n && \
            ln -sf "$HOME"/.local/kitty.app/bin/kitty "$HOME"/.local/kitty.app/bin/kitten && \
            cp "$HOME"/.local/kitty.app/share/applications/kitty.desktop "$HOME"/.local/share/applications/ && \
            sed -i "s|Icon=kitty|Icon=/home/$USER/.local/kitty.app/share/icons/hicolor/256x256/apps/kitty.png|g" "$HOME"/.local/share/applications/kitty*.desktop && \
            sed -i "s|Exec=kitty|Exec=/home/$USER/.local/kitty.app/bin/kitty|g" "$HOME"/.local/share/applications/kitty*.desktop

        log_if_failed "installing kitty failed"

    else
        log_info "Kitty already installed. Updating..."
        curl -L https://sw.kovidgoyal.net/kitty/installer.sh | sh /dev/stdin launch=n
        log_if_failed "kitty update failed"
    fi
}

# Install dotfiles
install_dotfiles() {
    local DOTFILES_PATH="$HOME/.dotfiles"
    local dotfiles="/usr/bin/git --git-dir=$DOTFILES_PATH/ --work-tree=$HOME"

    if [ ! -d "$DOTFILES_PATH" ]; then
        log_info "Installing dotfiles..."

        git clone --bare $DOTFILES_REPO "$DOTFILES_PATH" && \
            $dotfiles config --local status.showUntrackedFiles no && \
            $dotfiles checkout

        die_on_error "dotfiles failed"

    else
        log_info "Updating dotfiles..."
        $dotfiles pull
        log_if_failed "updating dotfiles failed"
    fi
}

main() {
    source /etc/os-release
    if [ "$ID" == "ubuntu" ]; then
        install_ubuntu_packages
    else
        log_warn "Could not install system packages. Platform not supported! Install them manually."
    fi

    install_omz
    install_tpm

    if [ -z "$DISABLE_KITTY" ]; then
        install_kitty
    fi

    install_dotfiles
}

main
