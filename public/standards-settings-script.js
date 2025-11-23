const API_BASE = '/api/standards';

let currentConfig = null;

// Загрузка конфигурации при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupPresets();
    setupForm();
    setupCacheButton();
    updateCacheInfo();
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
    document.getElementById('cache_ttl').value = config.cache_settings.ttl_hours;
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
    config.cache_settings.ttl_hours = parseInt(document.getElementById('cache_ttl').value);

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

