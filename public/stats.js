const API_BASE = '/api';

// Загрузка статистики при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    setupTabs();
    setupButtons();
});

// Настройка вкладок
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Удаляем active у всех
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));
            
            // Добавляем active к выбранным
            button.classList.add('active');
            document.getElementById(`${targetTab}-panel`).classList.add('active');
        });
    });
}

// Настройка кнопок
function setupButtons() {
    document.getElementById('refresh-btn').addEventListener('click', loadStats);
    
    document.getElementById('reset-btn').addEventListener('click', async () => {
        if (!confirm('Вы уверены, что хотите сбросить всю статистику API? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/monitor/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                showNotification('Статистика успешно сброшена', 'success');
                loadStats();
            } else {
                throw new Error('Ошибка сброса статистики');
            }
        } catch (error) {
            showNotification('Ошибка: ' + error.message, 'error');
        }
    });
}

// Загрузка статистики
async function loadStats() {
    const overviewLoading = document.getElementById('overview-loading');
    const overviewContent = document.getElementById('overview-content');
    
    overviewLoading.style.display = 'block';
    overviewContent.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE}/monitor/stats`);
        if (!response.ok) {
            throw new Error('Ошибка загрузки статистики');
        }
        
        const stats = await response.json();
        
        // Отображаем обзор
        displayOverview(stats);
        
        // Детальная статистика для каждого API
        displayAPIDetails('tavily', stats.tavily);
        displayAPIDetails('deepseek', stats.deepseek);
        displayAPIDetails('openai', stats.openai);
        
        overviewLoading.style.display = 'none';
        overviewContent.style.display = 'grid';
        
    } catch (error) {
        overviewLoading.innerHTML = `<p style="color: #dc3545;">Ошибка загрузки статистики: ${error.message}</p>`;
    }
}

// Отображение обзора
function displayOverview(stats) {
    const container = document.getElementById('overview-content');
    
    const apis = [
        { name: 'tavily', title: 'Tavily API', icon: '📡', data: stats.tavily },
        { name: 'deepseek', title: 'DeepSeek API', icon: '🤖', data: stats.deepseek },
        { name: 'openai', title: 'OpenAI API', icon: '✅', data: stats.openai }
    ];
    
    container.innerHTML = apis.map(api => {
        const data = api.data;
        const successRate = data.total_requests > 0 
            ? ((data.successful_requests / data.total_requests) * 100).toFixed(1)
            : 0;
        
        return `
            <div class="api-card">
                <h3>${api.icon} ${api.title}</h3>
                <div class="stat-row">
                    <span class="stat-label">Всего запросов:</span>
                    <span class="stat-value">${data.total_requests}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Успешных:</span>
                    <span class="stat-value success">${data.successful_requests} (${successRate}%)</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Ошибок:</span>
                    <span class="stat-value error">${data.failed_requests}</span>
                </div>
                ${data.total_tokens.total > 0 ? `
                    <div class="stat-row">
                        <span class="stat-label">Токенов:</span>
                        <span class="stat-value">${data.total_tokens.total.toLocaleString()}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Стоимость:</span>
                        <span class="stat-value cost">$${data.total_cost_usd.toFixed(4)}</span>
                    </div>
                ` : ''}
                <div class="stat-row">
                    <span class="stat-label">Среднее время:</span>
                    <span class="stat-value">${Math.round(data.performance.avg_response_time_ms)} мс</span>
                </div>
            </div>
        `;
    }).join('');
}

// Детальное отображение для API
function displayAPIDetails(apiName, data) {
    const panel = document.getElementById(`${apiName}-panel`);
    
    const today = new Date().toISOString().split('T')[0];
    const todayStats = data.daily[today] || { requests: 0, tokens: 0 };
    
    const month = new Date().toISOString().substring(0, 7);
    const monthStats = data.monthly[month] || { requests: 0, tokens: 0 };
    
    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
                <h4 style="color: #667eea; margin-bottom: 15px;">📊 Общая статистика</h4>
                <div style="line-height: 2;">
                    <div><strong>Всего запросов:</strong> ${data.total_requests}</div>
                    <div><strong>Успешных:</strong> ${data.successful_requests}</div>
                    <div><strong>Ошибок:</strong> ${data.failed_requests}</div>
                    ${data.total_tokens.total > 0 ? `
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
                            <div><strong>Input tokens:</strong> ${data.total_tokens.input.toLocaleString()}</div>
                            <div><strong>Output tokens:</strong> ${data.total_tokens.output.toLocaleString()}</div>
                            <div><strong>Total tokens:</strong> ${data.total_tokens.total.toLocaleString()}</div>
                            <div style="margin-top: 8px; color: #ffc107; font-size: 1.2em;"><strong>Стоимость:</strong> $${data.total_cost_usd.toFixed(4)}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
                <h4 style="color: #667eea; margin-bottom: 15px;">⚡ Производительность</h4>
                <div style="line-height: 2;">
                    <div><strong>Среднее время:</strong> ${Math.round(data.performance.avg_response_time_ms)} мс</div>
                    <div><strong>Минимум:</strong> ${data.performance.min_response_time_ms === Infinity ? 'N/A' : Math.round(data.performance.min_response_time_ms) + ' мс'}</div>
                    <div><strong>Максимум:</strong> ${data.performance.max_response_time_ms > 0 ? Math.round(data.performance.max_response_time_ms) + ' мс' : 'N/A'}</div>
                </div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
                <h4 style="color: #667eea; margin-bottom: 15px;">📅 Сегодня (${today})</h4>
                <div style="line-height: 2;">
                    <div><strong>Запросов:</strong> ${todayStats.requests}</div>
                    ${todayStats.tokens > 0 ? `<div><strong>Токенов:</strong> ${todayStats.tokens.toLocaleString()}</div>` : ''}
                </div>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
                <h4 style="color: #667eea; margin-bottom: 15px;">📆 Этот месяц (${month})</h4>
                <div style="line-height: 2;">
                    <div><strong>Запросов:</strong> ${monthStats.requests}</div>
                    ${monthStats.tokens > 0 ? `<div><strong>Токенов:</strong> ${monthStats.tokens.toLocaleString()}</div>` : ''}
                </div>
            </div>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
            <h4 style="color: #667eea; margin-bottom: 15px;">📜 Последние запросы (${data.recent_requests.length})</h4>
            <div class="request-log">
    `;
    
    if (data.recent_requests.length === 0) {
        html += `
            <div class="empty-state">
                <div class="icon">📭</div>
                <p>Нет запросов</p>
            </div>
        `;
    } else {
        html += data.recent_requests.map(req => {
            const date = new Date(req.timestamp);
            const timeStr = date.toLocaleTimeString('ru-RU');
            const dateStr = date.toLocaleDateString('ru-RU');
            
            return `
                <div class="request-item ${req.success ? '' : 'error'}">
                    <div class="request-header">
                        <span>${req.operation}</span>
                        <span class="badge ${req.success ? 'success' : 'error'}">${req.success ? '✓ Успех' : '✗ Ошибка'}</span>
                    </div>
                    <div class="request-details">
                        <span>🕐 ${dateStr} ${timeStr}</span>
                        <span>⏱️ ${Math.round(req.response_time_ms)} мс</span>
                        ${req.tokens ? `<span>📝 ${req.tokens.input + req.tokens.output} tokens</span>` : ''}
                        ${req.model ? `<span>🤖 ${req.model}</span>` : ''}
                        ${!req.success && req.error ? `<span style="color: #dc3545;">❌ ${req.error}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    html += `
            </div>
        </div>
    `;
    
    panel.innerHTML = html;
}

// Показать уведомление
function showNotification(message, type) {
    // Простое уведомление через alert (можно улучшить)
    if (type === 'success') {
        alert('✅ ' + message);
    } else {
        alert('❌ ' + message);
    }
}

