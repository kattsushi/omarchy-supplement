#!/bin/bash
# Install Cursor GUI + Cursor CLI on Omarchy / Arch Linux
set -e

echo "🚀 Instalando Cursor GUI + CLI..."

# --- Crear directorio local para binarios si no existe ---
mkdir -p ~/.local/bin

# --- Instalar Cursor GUI desde AUR ---
echo "Instalando Cursor GUI desde AUR..."
yay -S --noconfirm --needed cursor-bin || echo "⚠️ No se pudo instalar cursor-bin desde AUR. Continuando con CLI..."

# --- Instalar Cursor CLI oficial ---
if ! command -v cursor-agent &>/dev/null; then
  echo "Instalando Cursor CLI desde script oficial..."
  curl -fsSL https://cursor.com/install | bash
else
  echo "✅ Cursor CLI ya instalado. Verificando versión..."
  cursor-agent --version
fi

# --- Asegurar que ~/.local/bin esté en PATH ---
SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
  SHELL_RC="$HOME/.bashrc"
else
  SHELL_RC="$HOME/.profile"
fi

if ! grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$SHELL_RC"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >>"$SHELL_RC"
  export PATH="$HOME/.local/bin:$PATH"
  echo "🔧 Agregado ~/.local/bin al PATH en $SHELL_RC"
fi

# --- Crear alias opcional para abrir proyectos con Cursor CLI ---
if ! grep -q "alias cursor-cli=" "$SHELL_RC"; then
  echo "alias cursor-cli='cursor-agent .'" >>"$SHELL_RC"
  echo "🔧 Alias 'cursor-cli' agregado. Usa 'cursor-cli' para abrir proyectos desde terminal."
  source "$SHELL_RC"
fi

# --- Verificación final ---
echo "✅ Instalación completada!"
command -v cursor &>/dev/null && echo "GUI disponible: ejecuta 'cursor'"
command -v cursor-agent &>/dev/null && echo "CLI disponible: ejecuta 'cursor-agent' o 'cursor-cli'"

