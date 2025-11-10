
#!/bin/bash
set -e


# 📦 Instalar Discord desde AUR sin confirmaciones
echo "⬇️  Instalando Discord..."
yay -S --noconfirm discord

# ⚙️ Instalar BetterDiscord CLI (desde AUR también)
echo "⬇️  Instalando BetterDiscord..."
yay -S --noconfirm betterdiscord-installer

# 🧩 Aplicar instalación de BetterDiscord a Discord
echo "⚙️  Parchando Discord con BetterDiscord..."
betterdiscordctl install

# 🔄 Limpiar cache y procesos background
kill "$!" 2>/dev/null || true

echo "✅ Instalación completada."
echo "🎨 Ahora puedes añadir temas desde ~/.config/BetterDiscord/themes/"
echo "🔁 Reinicia Discord para aplicar los cambios."
