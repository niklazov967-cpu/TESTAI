const API_BASE = '/api';

// Загрузка конфигурации при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    setupTabs();
    setupForm();
    setupCacheButton();
    setupBalanceCheck();
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
                document.getElementById('cache-status').innerHTML = 
                    '<p style="color: green;">Кэш очищен: ' + new Date().toLocaleString('ru-RU') + '</p>';
            } else {
                showAlert('Ошибка очистки кэша: ' + result.message, 'error');
            }
        } catch (error) {
            showAlert('Ошибка: ' + error.message, 'error');
        }
    });
}

// Настройка проверки баланса
function setupBalanceCheck() {
    const btn = document.getElementById('check-balance-btn');
    const valueSpan = document.getElementById('deepseek-balance-value');
    const detailsSmall = document.getElementById('deepseek-balance-details');

    const checkBalance = async () => {
        btn.disabled = true;
        valueSpan.textContent = 'Загрузка...';
        detailsSmall.textContent = '';

        try {
            const response = await fetch(`${API_BASE}/balance/deepseek`);
            const data = await response.json();
            
            if (response.ok) {
                // DeepSeek balance response usually looks like:
                // { "is_available": true, "balance_infos": [{ "currency": "CNY", "total_balance": "10.00", "granted_balance": "0.00", "topped_up_balance": "10.00" }] }
                
                if (data.balance_infos && data.balance_infos.length > 0) {
                    const info = data.balance_infos[0];
                    valueSpan.textContent = `${info.total_balance} ${info.currency}`;
                    valueSpan.style.color = 'green';
                    valueSpan.style.fontWeight = 'bold';
                    
                    detailsSmall.textContent = `Доступно: ${data.is_available ? 'Да' : 'Нет'}. Пополнено: ${info.topped_up_balance}, Гранты: ${info.granted_balance}`;
                } else {
                    valueSpan.textContent = 'Нет данных о балансе';
                    valueSpan.style.color = 'orange';
                }
            } else {
                valueSpan.textContent = 'Ошибка';
                valueSpan.style.color = 'red';
                showAlert('Ошибка получения баланса: ' + (data.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            valueSpan.textContent = 'Ошибка сети';
            valueSpan.style.color = 'red';
            showAlert('Ошибка: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
        }
    };

    btn.addEventListener('click', checkBalance);
    
    // Автоматическая загрузка при открытии
    checkBalance();
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

