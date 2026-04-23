#!/usr/bin/env bash

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
CONFIG_DIR="$XDG_CONFIG_HOME/ags"
CACHE_DIR="$XDG_CACHE_HOME/ags"
STATE_DIR="$XDG_STATE_HOME/ags"

term_alpha=100 
if [ ! -d "$CACHE_DIR"/user/generated ]; then
    mkdir -p "$CACHE_DIR"/user/generated
fi
cd "$CONFIG_DIR" || exit

colornames=$(cat $STATE_DIR/scss/_material.scss | cut -d: -f1)
colorstrings=$(cat $STATE_DIR/scss/_material.scss | cut -d: -f2 | cut -d ' ' -f2 | cut -d ";" -f1)
IFS=$'\n'
colorlist=( $colornames )
colorvalues=( $colorstrings )

# Create temporary sed scripts
sed_script_curly_file=$(mktemp)
sed_script_term_file=$(mktemp)
sed_script_gradience_file=$(mktemp)

for i in "${!colorlist[@]}"; do
    name="${colorlist[$i]}" # e.g. $primary
    val="${colorvalues[$i]}" # e.g. #F0F0F0
    val_no_hash="${val#\#}" # e.g. F0F0F0
    
    clean_name="${name#\$}"
    # In a sed script file, a literal $ must be escaped as \$
    # To get \$ into the file using echo, we need \\\$
    sed_name="\\\$${clean_name}"
    
    echo "s/{{ ${sed_name} }}/${val_no_hash}/g" >> "$sed_script_curly_file"
    echo "s/${sed_name} #/${val_no_hash}/g" >> "$sed_script_term_file"
    echo "s/{{ ${sed_name} }}/${val}/g" >> "$sed_script_gradience_file"
done

get_light_dark() {
    lightdark=""
    if [ ! -f "$STATE_DIR/user/colormode.txt" ]; then
        echo "" > "$STATE_DIR/user/colormode.txt"
    else
        lightdark=$(sed -n '1p' "$STATE_DIR/user/colormode.txt")
    fi
    echo "$lightdark"
}

apply_fuzzel() {
    if [ ! -f "scripts/templates/fuzzel/fuzzel.ini" ]; then
        return
    fi
    mkdir -p "$CACHE_DIR"/user/generated/fuzzel
    mkdir -p "$XDG_CONFIG_HOME"/fuzzel
    sed -f "$sed_script_curly_file" "scripts/templates/fuzzel/fuzzel.ini" > "$CACHE_DIR"/user/generated/fuzzel/fuzzel.ini
    cp "$CACHE_DIR"/user/generated/fuzzel/fuzzel.ini "$XDG_CONFIG_HOME"/fuzzel/fuzzel.ini
}

apply_term() {
    if [ ! -f "scripts/templates/terminal/sequences.txt" ]; then
        return
    fi
    mkdir -p "$CACHE_DIR"/user/generated/terminal
    sed -f "$sed_script_term_file" "scripts/templates/terminal/sequences.txt" | sed "s/\$alpha/$term_alpha/g" > "$CACHE_DIR"/user/generated/terminal/sequences.txt

    for file in /dev/pts/*; do
      if [[ $file =~ ^/dev/pts/[0-9]+$ ]]; then
        cat "$CACHE_DIR"/user/generated/terminal/sequences.txt > "$file" 2>/dev/null
      fi
    done
}

apply_hyprland() {
    if [ ! -f "scripts/templates/hypr/hyprland/colors.sh" ]; then
        return
    fi
    mkdir -p "$CACHE_DIR"/user/generated/hypr/hyprland
    sed -f "$sed_script_curly_file" "scripts/templates/hypr/hyprland/colors.sh" > "$CACHE_DIR"/user/generated/hypr/hyprland/colors.sh
    chmod +x "$CACHE_DIR"/user/generated/hypr/hyprland/colors.sh
    "$CACHE_DIR"/user/generated/hypr/hyprland/colors.sh
}

apply_hyprlock() {
    if [ ! -f "scripts/templates/hypr/hyprlock.conf" ]; then
        return
    fi
    mkdir -p "$CACHE_DIR"/user/generated/hypr
    mkdir -p "$XDG_CONFIG_HOME"/hypr
    sed -f "$sed_script_curly_file" "scripts/templates/hypr/hyprlock.conf" > "$CACHE_DIR"/user/generated/hypr/hyprlock.conf
    cp "$CACHE_DIR"/user/generated/hypr/hyprlock.conf "$XDG_CONFIG_HOME"/hypr/hyprlock.conf
}

apply_lightdark() {
    lightdark=$(get_light_dark)
    if [ "$lightdark" = "light" ]; then
        gsettings set org.gnome.desktop.interface color-scheme 'prefer-light'
    else
        gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
    fi
}

apply_gtk() {
    usegradience=$(sed -n '4p' "$STATE_DIR/user/colormode.txt")
    if [[ "$usegradience" = "nogradience" ]]; then
        rm -f "$XDG_CONFIG_HOME/gtk-3.0/gtk.css"
        rm -f "$XDG_CONFIG_HOME/gtk-4.0/gtk.css"
        return
    fi

    if [ ! -f "scripts/templates/gradience/preset.json" ]; then
        return
    fi

    mkdir -p "$CACHE_DIR"/user/generated/gradience
    
    sed -f "$sed_script_gradience_file" "scripts/templates/gradience/preset.json" > "$CACHE_DIR"/user/generated/gradience/preset.json

    mkdir -p "$XDG_CONFIG_HOME/presets"
    flatpak run --command=gradience-cli com.github.GradienceTeam.Gradience \
        apply -p "$CACHE_DIR"/user/generated/gradience/preset.json --gtk both &
    
    lightdark=$(get_light_dark)
    if [ "$lightdark" = "light" ]; then
        gsettings set org.gnome.desktop.interface gtk-theme 'adw-gtk3'
    else
        gsettings set org.gnome.desktop.interface gtk-theme adw-gtk3-dark
    fi
}

apply_ags() {
    ags request handleStyles
}

should_apply_ags() {
    local cooldown_seconds=2 # Reduced from 10 to be more responsive
    local stamp_file="$STATE_DIR/user/ags_last_style_reload"
    local now
    now=$(date +%s)

    if [ -f "$stamp_file" ]; then
        local last
        last=$(cat "$stamp_file" 2>/dev/null || echo 0)
        if [ -n "$last" ] && [ $((now - last)) -lt $cooldown_seconds ]; then
            return 1
        fi
    fi

    mkdir -p "$(dirname "$stamp_file")"
    printf '%s\n' "$now" > "$stamp_file"
    return 0
}

# Run applications
apply_fuzzel &
apply_term &
apply_hyprland &
apply_hyprlock &
apply_lightdark &
apply_gtk &

if should_apply_ags; then
    apply_ags &
fi

wait

# Cleanup temporary files
rm "$sed_script_curly_file" "$sed_script_term_file" "$sed_script_gradience_file"
