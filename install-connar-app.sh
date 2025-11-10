#!/bin/bash
set -e

echo "📦 Instalando Conar v0.23.3..."

# Variables
APP_NAME="Conar"
APP_VERSION="0.23.3"
APP_URL="https://github.com/wannabespace/conar/releases/download/v${APP_VERSION}/Conar-Linux-${APP_VERSION}.AppImage"
APP_PATH="/usr/local/bin/conar"
DESKTOP_FILE="/usr/share/applications/conar.desktop"
ICON_PATH="/usr/share/icons/conar.png"

# Descargar AppImage
echo "⬇️  Descargando AppImage..."
wget -q -O /tmp/conar.AppImage "$APP_URL"

# Mover y dar permisos
echo "⚙️  Configurando..."
sudo mv /tmp/conar.AppImage "$APP_PATH"
sudo chmod +x "$APP_PATH"

# Descargar icono (usa favicon del sitio si no existe uno local)
if [ ! -f "$ICON_PATH" ]; then
  echo "🖼️  Descargando icono..."
  sudo wget -q -O "$ICON_PATH" "https://conar.app/favicon.png" || true
fi

# Crear acceso de escritorio
echo "🧩  Creando acceso en menú..."
sudo tee "$DESKTOP_FILE" >/dev/null <<EOF
[Desktop Entry]
Name=$APP_NAME
Exec=$APP_PATH %U
Icon=conar
Type=Application
Categories=Utility;Network;
StartupNotify=true
EOF

# Actualizar caché de iconos y menús
echo "🔄  Actualizando iconos..."
sudo update-desktop-database >/dev/null 2>&1 || true
sudo gtk-update-icon-cache -f /usr/share/icons >/dev/null 2>&1 || true

echo "✅ Instalación completada: ejecuta '$APP_NAME' desde el menú o con 'conar'"
