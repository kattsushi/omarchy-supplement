#!/bin/bash
echo "✅ Instalación completada: ejecuta '$APP_NAME' desde el menú o con 'conar'"

set -e

echo "🧹 Desinstalando Conar..."

APP_PATH="/usr/local/bin/conar"
DESKTOP_FILE="/usr/share/applications/conar.desktop"
ICON_PATH="/usr/share/icons/conar.png"

# Eliminar binario
if [ -f "$APP_PATH" ]; then
  echo "❌ Eliminando binario..."
  sudo rm -f "$APP_PATH"
fi

# Eliminar acceso de escritorio
if [ -f "$DESKTOP_FILE" ]; then
  echo "❌ Eliminando acceso del menú..."
  sudo rm -f "$DESKTOP_FILE"
fi

# Eliminar icono
if [ -f "$ICON_PATH" ]; then
  echo "❌ Eliminando icono..."
  sudo rm -f "$ICON_PATH"
fi

# Refrescar caché de iconos y menús
echo "🔄 Actualizando caché..."
sudo update-desktop-database >/dev/null 2>&1 || true
sudo gtk-update-icon-cache -f /usr/share/icons >/dev/null 2>&1 || true

echo "✅ Conar ha sido completamente desinstalado."
