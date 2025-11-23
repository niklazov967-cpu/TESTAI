const API_BASE = '/api';

// Пресеты конфигурации
const PRESETS = {
    quick: {
        name: 'Быстрый поиск',
        cache_enabled: true,
        validation_strictness: 'low',
        max_iterations: 1,
        tavily_max_results: 5,
        deepseek_temperature: 0.8,
        openai_temperature: 0.3,
        openai_model: 'gpt-4o-mini'
    },
    balanced: {
        name: 'Сбалансированный',
        cache_enabled: true,
        validation_strictness: 'medium',
        max_iterations: 3,
        tavily_max_results: 5,
        deepseek_temperature: 0.7,
        openai_temperature: 0.3,
        openai_model: 'gpt-4o-mini'
    },
    precise: {
        name: 'Точный анализ',
        cache_enabled: true,
        validation_strictness: 'high',
        max_iterations: 5,
        tavily_max_results: 10,
        deepseek_temperature: 0.5,
        openai_temperature: 0.2,
        openai_model: 'gpt-4o'
    }
};

// Загрузка конфигурации при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    setupTabs();
    setupForm();
    setupCacheManagement();
    setupPresets();
});

// Загрузка конфигурации
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`);
        const config = await response.json();
        
        // Заполнение формы
        document.getElementById('cache_enabled').value = config.cache_enabled.toString();
        document.getElementById('validation_strictness').value = config.validation_strictness;
        document.getElementById('max_iterations').value = config.max_iterations;
        document.getElementById('tavily_max_results').value = config.tavily_max_results;
        document.getElementById('deepseek_temperature').value = config.deepseek_temperature;
        document.getElementById('openai_temperature').value = config.openai_temperature;
        document.getElementById('openai_model').value = config.openai_model;
    } catch (error) {
        showAlert('Ошибка загрузки конфигурации: ' + error.message, 'error');
    }
}

// Настройка табов
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Удаляем active у всех
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // Добавляем active к выбранным
            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Загружаем промпты при открытии вкладки
            if (targetTab === 'prompts') {
                loadPrompts();
            }
        });
    });
    
    // Загружаем промпты при первой загрузке
    loadPrompts();
}

// Загрузка промптов
async function loadPrompts() {
    const container = document.getElementById('prompts-content');
    container.innerHTML = '<p>Загрузка промптов...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/prompts`);
        const data = await response.json();
        
        let html = '<h4>Stage 2: DeepSeek Processing Prompt</h4>';
        html += '<pre>' + escapeHtml(data.stage2) + '</pre>';
        
        html += '<h4 style="margin-top: 30px;">Stage 3: OpenAI Validation Prompt</h4>';
        html += '<pre>' + escapeHtml(data.stage3) + '</pre>';
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Ошибка загрузки промптов: ' + error.message + '</p>';
    }
}

// Настройка формы
function setupForm() {
    const form = document.getElementById('config-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const config = {
            cache_enabled: document.getElementById('cache_enabled').value === 'true',
            validation_strictness: document.getElementById('validation_strictness').value,
            max_iterations: parseInt(document.getElementById('max_iterations').value),
            tavily_max_results: parseInt(document.getElementById('tavily_max_results').value),
            deepseek_temperature: parseFloat(document.getElementById('deepseek_temperature').value),
            openai_temperature: parseFloat(document.getElementById('openai_temperature').value),
            openai_model: document.getElementById('openai_model').value
        };
        
        try {
            const response = await fetch(`${API_BASE}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            if (response.ok) {
                showAlert('Настройки успешно сохранены!', 'success');
            } else {
                showAlert('Ошибка сохранения: ' + result.message, 'error');
            }
        } catch (error) {
            showAlert('Ошибка: ' + error.message, 'error');
        }
    });
    
    // Кнопка сброса
    document.getElementById('reset-config').addEventListener('click', () => {
        if (confirm('Сбросить настройки к значениям по умолчанию?')) {
            document.getElementById('cache_enabled').value = 'true';
            document.getElementById('validation_strictness').value = 'medium';
            document.getElementById('max_iterations').value = '3';
            document.getElementById('tavily_max_results').value = '5';
            document.getElementById('deepseek_temperature').value = '0.7';
            document.getElementById('openai_temperature').value = '0.3';
            document.getElementById('openai_model').value = 'gpt-4o-mini';
        }
    });
}

// Настройка кнопки очистки кэша
function setupCacheButton() {
    document.getElementById('clear-cache-btn').addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите очистить весь кэш? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/cache`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            if (response.ok) {
                showAlert('Кэш успешно очищен!', 'success');
                loadCacheList();
            } else {
                showAlert('Ошибка очистки кэша: ' + result.message, 'error');
            }
        } catch (error) {
            showAlert('Ошибка: ' + error.message, 'error');
        }
    });
}

// Настройка управления кэшем
function setupCacheManagement() {
    // Загрузка списка кэша
    loadCacheList();
    
    // Поиск по кэшу
    const searchInput = document.getElementById('cache-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterCacheList(e.target.value);
        });
    }
    
    // Обновление списка
    const refreshBtn = document.getElementById('refresh-cache-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadCacheList);
    }
    
    // Очистка всего кэша
    const clearBtn = document.getElementById('clear-cache-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (!confirm('Вы уверены, что хотите очистить весь кэш? Это действие нельзя отменить.')) {
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/cache`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                if (response.ok) {
                    showAlert('Кэш успешно очищен!', 'success');
                    loadCacheList();
                } else {
                    showAlert('Ошибка очистки кэша: ' + result.message, 'error');
                }
            } catch (error) {
                showAlert('Ошибка: ' + error.message, 'error');
            }
        });
    }
}

// Загрузка списка кэша
async function loadCacheList() {
    const container = document.getElementById('cache-list');
    const countSpan = document.getElementById('cache-count');
    const sizeSpan = document.getElementById('cache-size');
    
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center; color: #666;">Загрузка...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/cache/admin/list`);
        if (!response.ok) {
            throw new Error('Ошибка загрузки списка кэша');
        }
        
        const data = await response.json();
        
        // Обновляем счетчики
        if (countSpan) countSpan.textContent = data.count;
        if (sizeSpan) sizeSpan.textContent = data.size_mb + ' MB';
        
        // Отображаем список
        if (data.entries.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">Кэш пуст</p>';
            return;
        }
        
        container.innerHTML = data.entries.map(entry => `
            <div class="cache-item" data-key="${escapeHtml(entry.key)}">
                <div class="cache-item-info">
                    <div class="cache-item-name">${escapeHtml(entry.steel)}</div>
                    <div class="cache-item-meta">
                        📅 ${new Date(entry.timestamp).toLocaleString('ru-RU')} | 
                        📊 Аналогов: ${entry.analogs_count} | 
                        💾 ${(entry.size / 1024).toFixed(2)} KB
                    </div>
                </div>
                <div class="cache-item-actions">
                    <button class="btn-icon view" onclick="viewCacheEntry('${escapeHtml(entry.key)}')" title="Просмотр">👁️</button>
                    <button class="btn-icon delete" onclick="deleteCacheEntry('${escapeHtml(entry.key)}')" title="Удалить">🗑️</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        container.innerHTML = `<p style="color: red; text-align: center;">Ошибка: ${error.message}</p>`;
    }
}

// Фильтрация списка кэша
function filterCacheList(query) {
    const items = document.querySelectorAll('.cache-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
        const key = item.dataset.key.toLowerCase();
        if (key.includes(lowerQuery)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Просмотр записи кэша
async function viewCacheEntry(key) {
    try {
        const response = await fetch(`${API_BASE}/cache/${encodeURIComponent(key)}`);
        const data = await response.json();
        
        if (data.cached) {
            // Открываем модальное окно с данными
            const jsonStr = JSON.stringify(data.data, null, 2);
            const newWindow = window.open('', '_blank', 'width=800,height=600');
            newWindow.document.write(`
                <html>
                <head>
                    <title>Кэш: ${key}</title>
                    <style>
                        body { font-family: monospace; padding: 20px; background: #f5f5f5; }
                        pre { background: white; padding: 20px; border-radius: 8px; overflow: auto; }
                    </style>
                </head>
                <body>
                    <h2>Кэш: ${key}</h2>
                    <pre>${jsonStr}</pre>
                </body>
                </html>
            `);
        } else {
            showAlert('Запись не найдена в кэше', 'error');
        }
    } catch (error) {
        showAlert('Ошибка просмотра: ' + error.message, 'error');
    }
}

// Удаление записи кэша
async function deleteCacheEntry(key) {
    if (!confirm(`Удалить запись "${key}" из кэша?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/cache/admin/${encodeURIComponent(key)}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        if (response.ok) {
            showAlert(`Запись "${key}" удалена`, 'success');
            loadCacheList();
        } else {
            showAlert('Ошибка удаления: ' + result.message, 'error');
        }
    } catch (error) {
        showAlert('Ошибка: ' + error.message, 'error');
    }
}

// Настройка пресетов
function setupPresets() {
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyPreset(btn.dataset.preset);
        });
    });
}

// Применение пресета
function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) {
        showAlert('Пресет не найден', 'error');
        return;
    }
    
    // Применяем значения из пресета
    document.getElementById('cache_enabled').value = preset.cache_enabled.toString();
    document.getElementById('validation_strictness').value = preset.validation_strictness;
    document.getElementById('max_iterations').value = preset.max_iterations;
    document.getElementById('tavily_max_results').value = preset.tavily_max_results;
    document.getElementById('deepseek_temperature').value = preset.deepseek_temperature;
    document.getElementById('openai_temperature').value = preset.openai_temperature;
    document.getElementById('openai_model').value = preset.openai_model;
    
    showAlert(`Пресет "${preset.name}" применён. Не забудьте сохранить настройки!`, 'success');
}

// Показать уведомление
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.innerHTML = '';
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

