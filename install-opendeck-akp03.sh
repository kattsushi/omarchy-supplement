#!/bin/bash

# Setup OpenDeck for Ajazz AKP03 / Mirabox N3-family devices on Omarchy.
#
# What this script does:
# - Installs the Linux tools we used to make OpenDeck actions work on Hyprland.
# - Installs udev rules for the AKP03/N3 hardware plugin.
# - Creates documented helper commands in ~/.local/bin for OpenDeck Run Command.
# - Optionally seeds a disposable OpenDeck test profile when --seed-test-profile is used.
#
# What this script intentionally does NOT do by default:
# - It does not install the OpenDeck AKP03 plugin. Install it from OpenDeck UI:
#   Plugins -> Install from file -> https://github.com/4ndv/opendeck-akp03/releases
# - It does not overwrite your OpenDeck profile unless explicitly requested.
# - It does not edit Omarchy source files in ~/.local/share/omarchy.
#
# Usage:
#   ./install-opendeck-akp03.sh
#   ./install-opendeck-akp03.sh --seed-test-profile
#
# OpenDeck UI gotcha we discovered:
# - Drag and drop only works on EMPTY slots.
# - If a key/encoder already has an action, right-click it -> Delete first.
# - Then drag Run Command or copy/paste it into the empty slot.

set -euo pipefail

readonly UDEV_RULES_FILE="/etc/udev/rules.d/40-opendeck-akp03.rules"
readonly USER_BIN_DIR="$HOME/.local/bin"
readonly SEED_TEST_PROFILE_FLAG="--seed-test-profile"

seed_test_profile=false

for arg in "$@"; do
  case "$arg" in
    "$SEED_TEST_PROFILE_FLAG")
      seed_test_profile=true
      ;;
    -h|--help)
      sed -n '1,36p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--seed-test-profile]"
      exit 1
      ;;
  esac
done

install_packages() {
  local packages=(opendeck libnotify wtype)

  echo "Installing OpenDeck/Wayland helper packages: ${packages[*]}"

  if command -v yay >/dev/null 2>&1; then
    yay -S --noconfirm --needed "${packages[@]}"
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm --needed "${packages[@]}"
  else
    echo "Neither yay nor pacman was found. Install manually: ${packages[*]}"
    exit 1
  fi
}

install_udev_rules() {
  echo "Installing AKP03/N3 udev rules at $UDEV_RULES_FILE"

  sudo tee "$UDEV_RULES_FILE" >/dev/null <<'RULES'
SUBSYSTEM=="usb", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="1001", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="1002", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="1003", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="3002", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="3003", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0b00", ATTRS{idProduct}=="1001", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="1500", ATTRS{idProduct}=="3001", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="6602", ATTRS{idProduct}=="1002", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="6603", ATTRS{idProduct}=="1003", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="6603", ATTRS{idProduct}=="1002", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="5548", ATTRS{idProduct}=="1001", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0200", ATTRS{idProduct}=="2000", MODE="0660", TAG+="uaccess"

KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="1001", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="1002", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="1003", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="3002", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0300", ATTRS{idProduct}=="3003", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0b00", ATTRS{idProduct}=="1001", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1500", ATTRS{idProduct}=="3001", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="6602", ATTRS{idProduct}=="1002", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="6603", ATTRS{idProduct}=="1003", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="6603", ATTRS{idProduct}=="1002", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="5548", ATTRS{idProduct}=="1001", MODE="0660", TAG+="uaccess"
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0200", ATTRS{idProduct}=="2000", MODE="0660", TAG+="uaccess"
RULES

  sudo udevadm control --reload-rules
  sudo udevadm trigger
}

install_open_deck_helpers() {
  mkdir -p "$USER_BIN_DIR"

  cat > "$USER_BIN_DIR/opendeck-volume" <<'SCRIPT'
#!/usr/bin/env bash

# Volume helper for OpenDeck encoder actions.
# Use it from Starter Pack -> Run Command -> Dial rotate:
#   /home/andresdavid/.local/bin/opendeck-volume %d
#
# OpenDeck replaces %d with the encoder tick delta:
# - positive means clockwise
# - negative means counter-clockwise

set -euo pipefail

delta="${1:-0}"

if [ "$delta" -gt 0 ]; then
  wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+
elif [ "$delta" -lt 0 ]; then
  wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-
fi
SCRIPT

  cat > "$USER_BIN_DIR/opendeck-test-command" <<'SCRIPT'
#!/usr/bin/env bash

# Smoke-test helper for OpenDeck Starter Pack -> Run Command.
# Use it in Key down:
#   /home/andresdavid/.local/bin/opendeck-test-command

set -euo pipefail

date >> /tmp/opendeck-run-command.log
/usr/bin/notify-send "OpenDeck" "Run Command funciona"
SCRIPT

  cat > "$USER_BIN_DIR/opendeck-type" <<'SCRIPT'
#!/usr/bin/env bash

# Text typing helper for OpenDeck on Hyprland/Wayland.
# Use it from Starter Pack -> Run Command -> Key down:
#   /home/andresdavid/.local/bin/opendeck-type "texto a escribir"

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: opendeck-type <text>"
  exit 1
fi

/usr/bin/wtype "$*"
SCRIPT

  chmod +x \
    "$USER_BIN_DIR/opendeck-volume" \
    "$USER_BIN_DIR/opendeck-test-command" \
    "$USER_BIN_DIR/opendeck-type"
}

seed_test_profile() {
  local profile_path

  profile_path=$(find "$HOME/.config/opendeck/profiles" -path '*/Default.json' -print -quit 2>/dev/null || true)

  if [ -z "$profile_path" ]; then
    echo "No OpenDeck Default.json profile found. Start OpenDeck once with the device connected, then retry."
    exit 1
  fi

  echo "Seeding OpenDeck test profile at $profile_path"
  cp "$profile_path" "$profile_path.bak.$(date +%Y%m%d%H%M%S)"

  PROFILE_PATH="$profile_path" python - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["PROFILE_PATH"])
device_id = path.parent.name

def run_command_action(context, label, settings):
    return {
        "action": {
            "name": "Run Command",
            "uuid": "com.amansprojects.starterpack.runcommand",
            "plugin": "com.amansprojects.starterpack.sdPlugin",
            "tooltip": "Run a command",
            "icon": "icons/runCommand",
            "property_inspector": "propertyInspector/runCommand.html",
            "controllers": ["Keypad", "Encoder"],
            "states": [{"image": "actionDefaultImage"}],
        },
        "context": context,
        "states": [{"image": "actionDefaultImage", "text": label}],
        "current_state": 0,
        "settings": settings,
        "children": None,
    }

keys = []
for i in range(9):
    keys.append(run_command_action(
        f"{device_id}.Default.Keypad.{i}.0",
        f"K{i}",
        {
            "down": f"/usr/bin/notify-send 'OpenDeck tecla K{i}'",
            "up": "",
            "rotate": "",
            "file": "",
            "show": False,
        },
    ))

sliders = []
for i in range(3):
    sliders.append(run_command_action(
        f"{device_id}.Default.Encoder.{i}.0",
        f"E{i}",
        {
            "down": "wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle" if i == 0 else f"/usr/bin/notify-send 'Encoder E{i} presionado'",
            "up": "",
            "rotate": "/home/andresdavid/.local/bin/opendeck-volume %d" if i == 0 else f"/usr/bin/notify-send 'Encoder E{i}' 'giro: %d'",
            "file": "",
            "show": False,
        },
    ))

path.write_text(json.dumps({"keys": keys, "sliders": sliders}, indent=2))
PY
}

print_summary() {
  cat <<EOF

OpenDeck AKP03 setup complete.

Next steps:
1. Unplug and reconnect the device so the udev rules apply cleanly.
2. Restart OpenDeck:
   pkill opendeck || true
   opendeck

3. Install/verify the AKP03 plugin in OpenDeck:
   Plugins -> Install from file -> opendeck-akp03 release archive
   https://github.com/4ndv/opendeck-akp03/releases

4. Program actions in OpenDeck:
   - Empty occupied slots first: right-click slot -> Delete
   - Then drag actions like Starter Pack -> Run Command into the empty slot

Useful Run Command values:
   Test key:
     $USER_BIN_DIR/opendeck-test-command

   Type text on Hyprland/Wayland:
     $USER_BIN_DIR/opendeck-type "hola desde OpenDeck"

   Encoder volume:
     $USER_BIN_DIR/opendeck-volume %d

   Encoder press mute:
     wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle

Known physical layout for your AKP03:
   Screen keys: K0 K1 K2 / K3 K4 K5
   Extra buttons: K6 K7 K8
   Encoders: E0 E1 E2

EOF
}

install_packages
install_udev_rules
install_open_deck_helpers

if [ "$seed_test_profile" = true ]; then
  seed_test_profile
fi

print_summary
