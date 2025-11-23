const API_BASE = '/api/standards';

// Элементы DOM
const standardCodeInput = document.getElementById('standard-code');
const standardTypeSelect = document.getElementById('standard-type');
const searchBtn = document.getElementById('search-btn');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const resultsDiv = document.getElementById('results');
const validationScore = document.getElementById('validation-score');

// Таймеры для этапов
let stageTimers = {
    stage1: null,
    stage2: null,
    stage3: null,
    total: null
};

let stageStartTimes = {
    stage1: null,
    stage2: null,
    stage3: null,
    total: null
};

// Обработчик поиска
searchBtn.addEventListener('click', handleSearch);
standardCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

async function handleSearch() {
    const standardCode = standardCodeInput.value.trim();
    const standardType = standardTypeSelect.value;
    
    if (!standardCode) {
        showError('Пожалуйста, введите код стандарта');
        return;
    }

    // Сброс состояния
    hideError();
    hideResults();
    showLoading();
    searchBtn.disabled = true;

    try {
        // Запуск общего таймера
        startTotalTimer();
        updateLoadingStatus('Инициализация поиска...');
        
        // Создаем запрос
        const response = await fetch(`${API_BASE}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                standard_code: standardCode,
                standard_type: standardType || undefined
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Ошибка при выполнении запроса');
        }

        // Читаем поток SSE
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const chunk of lines) {
                if (!chunk.trim()) continue;
                
                const lines = chunk.split('\n');
                let eventType = 'message';
                let data = '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.substring(7);
                    } else if (line.startsWith('data: ')) {
                        data = line.substring(6);
                    }
                }

                if (data) {
                    try {
                        const eventData = JSON.parse(data);
                        handleProgressEvent(eventType, eventData);
                    } catch (e) {
                        console.error('Ошибка парсинга события:', e);
                    }
                }
            }
        }

    } catch (error) {
        resetTimers();
        showError(`Ошибка: ${error.message}`);
        hideLoading();
        searchBtn.disabled = false;
    }
}

function handleProgressEvent(eventType, data) {
    switch (eventType) {
        case 'stage1_start':
            updateStageStatus(1, data.message || 'Поиск данных...');
            startStageTimer(1);
            updateLoadingStatus(data.message || 'Этап 1: Поиск данных...');
            break;
            
        case 'stage1_complete':
            stopStageTimer(1);
            updateStageStatus(1, 'Завершено');
            if (data.queries_executed && data.sources_count) {
                let infoText = `Запросов: ${data.queries_executed} | Источников: ${data.sources_count}`;
                if (data.total_results_from_queries) {
                    infoText += ` (получено: ${data.total_results_from_queries}`;
                    if (data.duplicates_removed > 0) {
                        infoText += `, дубликатов удалено: ${data.duplicates_removed}`;
                    }
                    infoText += ')';
                }
                document.getElementById('stage1-iterations').textContent = infoText;
            }
            updateLoadingStatus('Этап 1 завершен. Запуск этапа 2...');
            break;
            
        case 'stage2_start':
            updateStageStatus(2, data.message || 'Обработка данных...');
            startStageTimer(2);
            updateLoadingStatus(data.message || 'Этап 2: Обработка данных...');
            break;
            
        case 'stage2_complete':
            stopStageTimer(2);
            updateStageStatus(2, 'Завершено');
            updateStageIterations(2, 1);
            updateLoadingStatus('Этап 2 завершен. Запуск этапа 3...');
            break;
            
        case 'stage3_start':
            updateStageStatus(3, data.message || 'Валидация результатов...');
            startStageTimer(3);
            updateLoadingStatus(data.message || 'Этап 3: Валидация результатов...');
            break;
            
        case 'stage3_complete':
            stopStageTimer(3);
            updateStageStatus(3, 'Завершено');
            updateStageIterations(3, 7); // Количество критериев валидации
            updateLoadingStatus('Этап 3 завершен. Завершение обработки...');
            break;
            
        case 'complete':
            if (stageTimers.total) {
                clearInterval(stageTimers.total);
            }
            updateLoadingStatus('Все этапы завершены!');
            displayResults(data);
            hideLoading();
            searchBtn.disabled = false;
            break;
            
        case 'error':
            resetTimers();
            showError(`Ошибка: ${data.message || 'Неизвестная ошибка'}`);
            hideLoading();
            searchBtn.disabled = false;
            break;
            
        case 'cached':
            updateLoadingStatus('Результат найден в кэше...');
            break;
    }
}

function showLoading() {
    loadingDiv.classList.remove('hidden');
    resetTimers();
    resetStages();
}

function resetTimers() {
    if (stageTimers.stage1) clearInterval(stageTimers.stage1);
    if (stageTimers.stage2) clearInterval(stageTimers.stage2);
    if (stageTimers.stage3) clearInterval(stageTimers.stage3);
    if (stageTimers.total) clearInterval(stageTimers.total);
    
    stageStartTimes.stage1 = null;
    stageStartTimes.stage2 = null;
    stageStartTimes.stage3 = null;
    stageStartTimes.total = null;
}

function resetStages() {
    document.getElementById('stage1').classList.remove('active');
    document.getElementById('stage2').classList.remove('active');
    document.getElementById('stage3').classList.remove('active');
    
    document.getElementById('stage1-time').textContent = '00:00';
    document.getElementById('stage2-time').textContent = '00:00';
    document.getElementById('stage3-time').textContent = '00:00';
    
    document.getElementById('stage1-status').textContent = 'Ожидание...';
    document.getElementById('stage2-status').textContent = 'Ожидание...';
    document.getElementById('stage3-status').textContent = 'Ожидание...';
    
    document.getElementById('stage1-iterations').textContent = 'Запросов: 0';
    document.getElementById('stage2-iterations').textContent = 'Итераций: 0';
    document.getElementById('stage3-iterations').textContent = 'Проверок: 0';
}

function startTotalTimer() {
    stageStartTimes.total = Date.now();
    stageTimers.total = setInterval(() => {
        if (stageStartTimes.total) {
            const elapsed = Math.floor((Date.now() - stageStartTimes.total) / 1000);
            document.getElementById('total-time').textContent = formatTime(elapsed);
        }
    }, 100);
}

function startStageTimer(stageNum) {
    const stageId = `stage${stageNum}`;
    const timeElement = document.getElementById(`${stageId}-time`);
    
    stageStartTimes[stageId] = Date.now();
    document.getElementById(stageId).classList.add('active');
    
    stageTimers[stageId] = setInterval(() => {
        if (stageStartTimes[stageId]) {
            const elapsed = Math.floor((Date.now() - stageStartTimes[stageId]) / 1000);
            timeElement.textContent = formatTime(elapsed);
        }
    }, 100);
}

function stopStageTimer(stageNum) {
    const stageId = `stage${stageNum}`;
    if (stageTimers[stageId]) {
        clearInterval(stageTimers[stageId]);
        stageTimers[stageId] = null;
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateLoadingStatus(message) {
    document.getElementById('loading-status').textContent = message;
}

function updateStageStatus(stageNum, status) {
    document.getElementById(`stage${stageNum}-status`).textContent = status;
}

function updateStageIterations(stageNum, iterations) {
    const stageId = `stage${stageNum}`;
    const iterationsElement = document.getElementById(`${stageId}-iterations`);
    
    if (stageNum === 1) {
        iterationsElement.textContent = `Запросов: ${iterations}`;
    } else if (stageNum === 2) {
        iterationsElement.textContent = `Итераций: ${iterations}`;
    } else if (stageNum === 3) {
        iterationsElement.textContent = `Проверок: ${iterations}`;
    }
}

function hideLoading() {
    resetTimers();
    loadingDiv.classList.add('hidden');
    document.getElementById('stage1').classList.remove('active');
    document.getElementById('stage2').classList.remove('active');
    document.getElementById('stage3').classList.remove('active');
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    errorDiv.classList.add('hidden');
}

function hideResults() {
    resultsDiv.classList.add('hidden');
}

function displayResults(data) {
    resultsDiv.classList.remove('hidden');

    // Отображение оценки валидации
    const score = data.validation?.overall_score || 0;
    validationScore.textContent = `${score.toFixed(1)}/100`;
    validationScore.style.color = score >= 80 ? '#28a745' : score >= 70 ? '#ffc107' : '#dc3545';

    // Отображение эквивалентов
    displayEquivalent('analog-russia', data.equivalents?.Russia);
    displayEquivalent('analog-china', data.equivalents?.China);
    displayEquivalent('analog-europe', data.equivalents?.Europe);

    // Отображение деталей валидации
    displayValidationDetails(data.validation);

    // Отображение совместимости
    if (data.compatibility_assessment) {
        displayCompatibility(data.compatibility_assessment);
    }
}

function displayEquivalent(cardId, equivalent) {
    const card = document.getElementById(cardId);
    const content = card.querySelector('.analog-content');

    if (!equivalent) {
        content.innerHTML = '<p style="color: #999;">Данные не найдены</p>';
        return;
    }

    const equivalenceType = equivalent.equivalence_type || 'unknown';
    const confidence = equivalent.confidence || 0;
    const typeLabels = {
        'exact': 'Точный',
        'close': 'Близкий',
        'approximate': 'Приблизительный'
    };

    let html = `
        <div class="property-group">
            <h4>Стандарт</h4>
            <div class="property-item">
                <span class="property-label">Код:</span>
                <span class="property-value"><strong>${equivalent.standard_code || '-'}</strong></span>
            </div>
            ${equivalent.full_name ? `
            <div class="property-item">
                <span class="property-label">Название:</span>
                <span class="property-value">${equivalent.full_name}</span>
            </div>
            ` : ''}
            <div class="property-item">
                <span class="property-label">Тип эквивалентности:</span>
                <span class="property-value">${typeLabels[equivalenceType] || equivalenceType}</span>
            </div>
            <div class="property-item">
                <span class="property-label">Уверенность:</span>
                <span class="property-value">${confidence}%</span>
            </div>
        </div>
    `;

    if (equivalent.notes) {
        html += `
            <div class="property-group">
                <h4>Примечания</h4>
                <p style="color: #666; font-size: 0.9em;">${equivalent.notes}</p>
            </div>
        `;
    }

    content.innerHTML = html;
}

function displayValidationDetails(validation) {
    const validationInfo = document.getElementById('validation-info');
    
    if (!validation) {
        validationInfo.innerHTML = '<p>Данные валидации недоступны</p>';
        return;
    }

    let html = '';

    if (validation.criteria_scores) {
        html += '<div class="criteria-scores">';
        html += '<h4>Оценки по критериям:</h4>';
        html += '<ul>';
        
        const criteriaLabels = {
            'technical_accuracy': 'Техническая точность',
            'dimensional_compatibility': 'Размерная совместимость',
            'pressure_temperature_ratings': 'Классы давления/температуры',
            'material_equivalence': 'Эквивалентность материалов',
            'regulatory_compliance': 'Соответствие регуляциям',
            'practical_applicability': 'Практическая применимость',
            'safety_considerations': 'Безопасность'
        };

        for (const [key, score] of Object.entries(validation.criteria_scores)) {
            const label = criteriaLabels[key] || key;
            const color = score >= 80 ? '#28a745' : score >= 70 ? '#ffc107' : '#dc3545';
            html += `<li><strong>${label}:</strong> <span style="color: ${color}">${score}/100</span></li>`;
        }
        
        html += '</ul>';
        html += '</div>';
    }

    if (validation.errors && validation.errors.length > 0) {
        html += '<div class="validation-errors">';
        html += '<h4 style="color: #dc3545;">Ошибки:</h4>';
        html += '<ul>';
        validation.errors.forEach(error => {
            html += `<li style="color: #dc3545;">${error}</li>`;
        });
        html += '</ul>';
        html += '</div>';
    }

    if (validation.warnings && validation.warnings.length > 0) {
        html += '<div class="validation-warnings">';
        html += '<h4 style="color: #ffc107;">Предупреждения:</h4>';
        html += '<ul>';
        validation.warnings.forEach(warning => {
            html += `<li style="color: #ffc107;">${warning}</li>`;
        });
        html += '</ul>';
        html += '</div>';
    }

    if (validation.recommendations && validation.recommendations.length > 0) {
        html += '<div class="validation-recommendations">';
        html += '<h4 style="color: #28a745;">Рекомендации:</h4>';
        html += '<ul>';
        validation.recommendations.forEach(rec => {
            html += `<li style="color: #28a745;">${rec}</li>`;
        });
        html += '</ul>';
        html += '</div>';
    }

    validationInfo.innerHTML = html;
}

function displayCompatibility(compatibility) {
    const compatibilitySection = document.getElementById('compatibility-section');
    const compatibilityInfo = document.getElementById('compatibility-info');
    
    compatibilitySection.style.display = 'block';

    let html = '';

    const pairs = [
        { key: 'GOST_to_GB', label: 'ГОСТ ↔ GB' },
        { key: 'GOST_to_EN', label: 'ГОСТ ↔ EN' },
        { key: 'GB_to_EN', label: 'GB ↔ EN' }
    ];

    pairs.forEach(pair => {
        const assessment = compatibility[pair.key];
        if (assessment) {
            const riskColors = {
                'low': '#28a745',
                'medium': '#ffc107',
                'high': '#ff9800',
                'critical': '#dc3545'
            };

            html += `
                <div class="compatibility-pair">
                    <h4>${pair.label}</h4>
                    <div class="property-item">
                        <span class="property-label">Физическая взаимозаменяемость:</span>
                        <span class="property-value">${assessment.physical_interchange || '-'}</span>
                    </div>
                    <div class="property-item">
                        <span class="property-label">Функциональная эквивалентность:</span>
                        <span class="property-value">${assessment.functional_equivalence || '-'}</span>
                    </div>
                    <div class="property-item">
                        <span class="property-label">Уровень риска:</span>
                        <span class="property-value" style="color: ${riskColors[assessment.risk_level] || '#666'}">
                            ${assessment.risk_level || '-'}
                        </span>
                    </div>
                    ${assessment.notes ? `
                    <div class="property-item">
                        <span class="property-label">Примечания:</span>
                        <span class="property-value" style="font-size: 0.9em; color: #666;">${assessment.notes}</span>
                    </div>
                    ` : ''}
                </div>
            `;
        }
    });

    compatibilityInfo.innerHTML = html;
}

