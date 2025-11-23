#!/bin/bash
# Быстрая настройка Cursor через settings.json

echo "🔧 Настройка Cursor IDE 2.1.20..."
echo ""

# Путь к settings.json Cursor (macOS)
CURSOR_SETTINGS="$HOME/Library/Application Support/Cursor/User/settings.json"

if [ ! -f "$CURSOR_SETTINGS" ]; then
    echo "⚠️  Файл settings.json не найден."
    echo ""
    echo "📝 Создайте файл вручную:"
    echo "1. Откройте Command Palette (Cmd+Shift+P)"
    echo "2. Введите: Preferences: Open User Settings (JSON)"
    echo "3. Файл откроется автоматически"
    echo ""
    exit 1
fi

echo "✅ Найден файл: $CURSOR_SETTINGS"
echo ""
echo "📋 Добавьте следующие настройки в settings.json:"
echo ""
cat << 'SETTINGS'
{
  "cursor.model": "claude-4-sonnet",
  "cursor.chatModel": "claude-4-sonnet",
  "cursor.composerModel": "claude-4-sonnet",
  "cursor.autocompleteModel": "claude-4-sonnet",
  "cursor.enableAutoComplete": true,
  "cursor.enableInlineCompletion": true,
  "cursor.maxTokens": 8000,
  "cursor.temperature": 0.2,
  "cursor.maxContextFiles": 15
}
SETTINGS

echo ""
echo "💡 Инструкция:"
echo "1. Откройте Command Palette: Cmd+Shift+P"
echo "2. Введите: Preferences: Open User Settings (JSON)"
echo "3. Добавьте настройки выше в файл"
echo "4. Сохраните: Cmd+S"
echo "5. Перезапустите Cursor"
echo ""
echo "🎯 Или выберите модель через интерфейс:"
echo "   - Откройте чат: Cmd+K"
echo "   - Кликните на название модели вверху"
echo "   - Выберите: Claude 4 Sonnet"
echo ""
