#!/bin/bash
# Скрипт для отката .cursorrules к состоянию без файла

echo "🔄 Откат .cursorrules..."
echo ""

# Проверяем, существует ли файл
if [ -f ".cursorrules" ]; then
    # Создаем резервную копию
    echo "📦 Создание резервной копии..."
    cp .cursorrules .cursorrules.backup
    echo "✅ Резервная копия сохранена: .cursorrules.backup"
    echo ""
    
    # Удаляем файл
    echo "🗑️  Удаление .cursorrules..."
    rm .cursorrules
    echo "✅ Файл удален"
    echo ""
    echo "📝 Cursor теперь будет использовать настройки по умолчанию"
    echo ""
    echo "💡 Чтобы вернуть файл обратно:"
    echo "   mv .cursorrules.backup .cursorrules"
    echo ""
    echo "   Или из git:"
    echo "   git checkout HEAD -- .cursorrules"
else
    echo "⚠️  Файл .cursorrules не найден"
    echo ""
    if [ -f ".cursorrules.backup" ]; then
        echo "📦 Найдена резервная копия: .cursorrules.backup"
        echo "💡 Чтобы восстановить: mv .cursorrules.backup .cursorrules"
    fi
fi
