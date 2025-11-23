const API_BASE = '/api/standards';

let currentConfig = null;

// Загрузка конфигурации при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupPresets();
    setupForm();
    setupCacheManagement();
    setupTabs();
});

// Загрузка настроек
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        if (!response.ok) {
            throw new Error('Конфигурация не найдена');
        }
        currentConfig = await response.json();
        applySettingsToUI(currentConfig);
    } catch (error) {
        showAlert('Ошибка загрузки настроек: ' + error.message, 'error');
    }
}

// Применение настроек к UI
function applySettingsToUI(config) {
    // Параметры поиска
    document.getElementById('tavily_queries_count').value = config.search_settings.tavily_queries_count;
    document.getElementById('search_depth').value = config.search_settings.search_depth;
    document.getElementById('max_results_per_query').value = config.search_settings.max_results_per_query;

    // Блоки промптов Stage 2
    document.getElementById('block_base_system').checked = config.prompt_blocks.stage2_deepseek.base_system_prompt;
    document.getElementById('block_methodology').checked = config.prompt_blocks.stage2_deepseek.block_methodology;
    document.getElementById('block_technical_comparison').checked = config.prompt_blocks.stage2_deepseek.block_technical_comparison;
    document.getElementById('block_compatibility_check').checked = config.prompt_blocks.stage2_deepseek.block_compatibility_check;
    document.getElementById('block_material_crossref').checked = config.prompt_blocks.stage2_deepseek.block_material_crossref;
    document.getElementById('block_safety_analysis').checked = config.prompt_blocks.stage2_deepseek.block_safety_analysis;
    document.getElementById('block_economic_eval').checked = config.prompt_blocks.stage2_deepseek.block_economic_eval;

    // Параметры валидации
    document.getElementById('validation_strictness').value = config.validation_settings.strictness;
    document.getElementById('min_overall_score').value = config.validation_settings.min_overall_score;

    // Настройки кэша
    document.getElementById('cache_enabled').checked = config.cache_settings.enabled;
}

// Сбор настроек из UI
function collectSettingsFromUI() {
    if (!currentConfig) {
        throw new Error('Конфигурация не загружена');
    }

    const config = JSON.parse(JSON.stringify(currentConfig)); // Deep copy

    // Параметры поиска
    config.search_settings.tavily_queries_count = parseInt(document.getElementById('tavily_queries_count').value);
    config.search_settings.search_depth = document.getElementById('search_depth').value;
    config.search_settings.max_results_per_query = parseInt(document.getElementById('max_results_per_query').value);

    // Блоки промптов Stage 2
    config.prompt_blocks.stage2_deepseek.block_methodology = document.getElementById('block_methodology').checked;
    config.prompt_blocks.stage2_deepseek.block_technical_comparison = document.getElementById('block_technical_comparison').checked;
    config.prompt_blocks.stage2_deepseek.block_compatibility_check = document.getElementById('block_compatibility_check').checked;
    config.prompt_blocks.stage2_deepseek.block_material_crossref = document.getElementById('block_material_crossref').checked;
    config.prompt_blocks.stage2_deepseek.block_safety_analysis = document.getElementById('block_safety_analysis').checked;
    config.prompt_blocks.stage2_deepseek.block_economic_eval = document.getElementById('block_economic_eval').checked;

    // Параметры валидации
    config.validation_settings.strictness = document.getElementById('validation_strictness').value;
    config.validation_settings.min_overall_score = parseInt(document.getElementById('min_overall_score').value);

    // Настройки кэша
    config.cache_settings.enabled = document.getElementById('cache_enabled').checked;

    config.last_updated = new Date().toISOString();

    return config;
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
async function applyPreset(presetName) {
    if (!currentConfig || !currentConfig.presets[presetName]) {
        showAlert('Пресет не найден', 'error');
        return;
    }

    const preset = currentConfig.presets[presetName];

    // Применяем изменения из пресета
    if (preset.search_settings) {
        Object.assign(currentConfig.search_settings, preset.search_settings);
    }
    if (preset.validation_settings) {
        Object.assign(currentConfig.validation_settings, preset.validation_settings);
    }
    if (preset.prompt_blocks) {
        if (preset.prompt_blocks.stage2_deepseek) {
            Object.assign(currentConfig.prompt_blocks.stage2_deepseek, preset.prompt_blocks.stage2_deepseek);
        }
    }
    if (preset.algorithm_settings) {
        Object.assign(currentConfig.algorithm_settings, preset.algorithm_settings);
    }

    applySettingsToUI(currentConfig);
    showAlert(`Пресет "${preset.name}" применён`, 'success');
}

// Настройка формы
function setupForm() {
    document.getElementById('save-btn').addEventListener('click', async () => {
        try {
            const config = collectSettingsFromUI();
            
            const response = await fetch(`${API_BASE}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                throw new Error('Ошибка сохранения');
            }

            currentConfig = config;
            showAlert('Настройки успешно сохранены', 'success');
        } catch (error) {
            showAlert('Ошибка сохранения настроек: ' + error.message, 'error');
        }
    });

    document.getElementById('reset-btn').addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите сбросить все настройки к умолчаниям?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/settings/reset`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Ошибка сброса');
            }

            await loadSettings();
            showAlert('Настройки сброшены к умолчаниям', 'success');
        } catch (error) {
            showAlert('Ошибка сброса настроек: ' + error.message, 'error');
        }
    });

    document.getElementById('load-prompts-btn').addEventListener('click', loadPrompts);
}

// Загрузка промптов
async function loadPrompts() {
    const container = document.getElementById('prompts-content');
    container.style.display = 'block';
    container.innerHTML = '<p>Загрузка промптов...</p>';

    try {
        const response = await fetch(`${API_BASE}/prompts`);
        if (!response.ok) {
            throw new Error('Ошибка загрузки промптов');
        }
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

// Настройка кнопки очистки кэша
function setupCacheButton() {
    document.getElementById('clear-cache-btn').addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите очистить кэш стандартов?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/cache`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Ошибка очистки кэша');
            }

            showAlert('Кэш успешно очищен', 'success');
            updateCacheInfo();
        } catch (error) {
            showAlert('Ошибка очистки кэша: ' + error.message, 'error');
        }
    });
}

// Обновление информации о кэше
async function updateCacheInfo() {
    try {
        const response = await fetch(`${API_BASE}/cache/info`);
        if (response.ok) {
            const info = await response.json();
            document.getElementById('cache-info').textContent = 
                `Кэш: ${info.count} записей, ${info.size_mb.toFixed(2)} MB`;
        }
    } catch (error) {
        document.getElementById('cache-info').textContent = 'Кэш: ошибка загрузки';
    }
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
            if (!confirm('Вы уверены, что хотите очистить весь кэш стандартов?')) {
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/cache`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error('Ошибка очистки кэша');
                }

                showAlert('Кэш успешно очищен', 'success');
                loadCacheList();
            } catch (error) {
                showAlert('Ошибка очистки кэша: ' + error.message, 'error');
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
                    <div class="cache-item-name">${escapeHtml(entry.standard)}</div>
                    <div class="cache-item-meta">
                        📅 ${new Date(entry.timestamp).toLocaleString('ru-RU')} | 
                        📊 Эквивалентов: ${entry.equivalents_count} | 
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
        const response = await fetch(`${API_BASE}/cache`);
        const allData = await response.json();
        
        // Найти запись по ключу
        const cache = allData.find(item => 
            (item.input_standard || item.standard_code || '').trim().toUpperCase() === key
        );
        
        if (cache) {
            // Открываем модальное окно с данными
            const jsonStr = JSON.stringify(cache, null, 2);
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

// Настройка вкладок
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
        });
    });
}

// Показать сообщение
function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert ${type}`;
    alert.style.display = 'block';

    setTimeout(() => {
        alert.style.display = 'none';
    }, 3000);
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

