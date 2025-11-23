#!/bin/bash
# Скрипт для автоматической настройки Cursor через settings.json

echo "🔧 Настройка Cursor IDE..."
echo ""

# Путь к settings.json Cursor (macOS)
CURSOR_SETTINGS="$HOME/Library/Application Support/Cursor/User/settings.json"

if [ ! -f "$CURSOR_SETTINGS" ]; then
    echo "⚠️  Файл settings.json не найден по пути:"
    echo "   $CURSOR_SETTINGS"
    echo ""
    echo "Попробуйте найти файл вручную:"
    echo "1. Откройте Command Palette (Cmd+Shift+P)"
    echo "2. Введите: Preferences: Open User Settings (JSON)"
    echo ""
    exit 1
fi

echo "✅ Найден файл настроек: $CURSOR_SETTINGS"
echo ""
echo "📝 Добавьте следующие настройки в settings.json:"
echo ""
cat << 'SETTINGS'
{
  "cursor.aiModel": "claude-3.5-sonnet",
  "cursor.chatModel": "claude-3.5-sonnet",
  "cursor.composerModel": "claude-3.5-sonnet",
  "cursor.autocompleteModel": "claude-3.5-sonnet",
  "cursor.enableAutoComplete": true,
  "cursor.enableInlineCompletion": true,
  "cursor.maxTokens": 8000,
  "cursor.temperature": 0.2,
  "cursor.maxContextFiles": 15
}
SETTINGS

echo ""
echo "💡 Инструкция:"
echo "1. Откройте Command Palette (Cmd+Shift+P)"
echo "2. Введите: Preferences: Open User Settings (JSON)"
echo "3. Добавьте настройки выше в файл"
echo "4. Сохраните (Cmd+S)"
echo ""
