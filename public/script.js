const API_BASE = '/api';

// Элементы DOM
const steelGradeInput = document.getElementById('steel-grade');
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
    stage4: null,
    total: null
};

let stageStartTimes = {
    stage1: null,
    stage2: null,
    stage3: null,
    stage4: null,
    total: null
};

let eventSource = null;

// Обработчик поиска
searchBtn.addEventListener('click', handleSearch);
steelGradeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

async function handleSearch() {
    const steelGrade = steelGradeInput.value.trim();
    
    if (!steelGrade) {
        showError('Пожалуйста, введите марку стали');
        return;
    }

    // Сброс состояния
    hideError();
    hideResults();
    showLoading();
    searchBtn.disabled = true;

    // Закрываем предыдущее соединение если есть
    if (eventSource) {
        eventSource.close();
    }

    try {
        // Запуск общего таймера
        startTotalTimer();
        updateLoadingStatus('Инициализация поиска...');
        
        // Создаем EventSource для получения обновлений через SSE
        const response = await fetch(`${API_BASE}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steel_grade: steelGrade })
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
            // Обновляем информацию о запросах и источниках
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
            } else {
                updateStageIterations(1, data.queries_executed || data.sources_count || 0);
            }
            updateLoadingStatus('Этап 1 завершен. Запуск этапа 2...');
            break;
        
        case 'stage1_targeted':
            // Целевой дополнительный поиск
            const targetedBadge = `<span style="background: #17a2b8; color: white; padding: 3px 8px; border-radius: 4px; margin-left: 8px; font-size: 0.85em;">🎯 ЦЕЛЕВОЙ ПОИСК</span>`;
            updateStageStatus(1, `Найдено ${data.sources_count} дополнительных источников` + targetedBadge);
            
            // Обновляем информацию
            const stage1Info = document.getElementById('stage1-iterations');
            if (stage1Info) {
                const currentText = stage1Info.textContent;
                stage1Info.textContent = currentText + ` + ${data.sources_count} целевых (запросов: ${data.queries_used})`;
            }
            break;
            
        case 'stage2_start':
            updateStageStatus(2, data.message || 'Обработка данных...');
            startStageTimer(2);
            updateLoadingStatus(data.message || 'Этап 2: Обработка данных...');
            
            // Показываем информацию о попытке
            if (data.attempt && data.attempt > 1) {
                const attemptBadge = `<span style="background: #ffc107; color: #000; padding: 3px 8px; border-radius: 4px; margin-left: 8px; font-size: 0.85em;">ПОПЫТКА ${data.attempt}/3</span>`;
                const statusEl = document.querySelector('#stage2 .status');
                if (statusEl) {
                    statusEl.innerHTML = data.message + attemptBadge;
                }
            }
            break;
            
        case 'stage2_retry':
            // Эскалация - повторная попытка
            updateStageStatus(2, data.message || 'Повторная обработка...');
            
            const retryBadge = `<span style="background: #ff6b6b; color: white; padding: 3px 8px; border-radius: 4px; margin-left: 8px; font-size: 0.85em; animation: pulse 1s infinite;">🔄 ПОПЫТКА ${data.attempt}/3</span>`;
            let retryStatusEl = document.querySelector('#stage2 .status');
            if (retryStatusEl) {
                retryStatusEl.innerHTML = data.message + retryBadge;
            }
            
            // Показываем информацию о причине эскалации
            if (data.reason) {
                updateLoadingStatus(`⚠️ ${data.reason}. Запуск повторной попытки...`);
            }
            
            // Добавляем визуальное выделение
            let retryStage2El = document.getElementById('stage2');
            if (retryStage2El) {
                retryStage2El.style.borderLeft = '4px solid #ffc107';
                retryStage2El.style.background = '#fff9e6';
                retryStage2El.style.color = '#856404'; // Темно-желтый текст для читаемости
            }
            break;
            
        case 'stage2_complete':
            stopStageTimer(2);
            
            // Показываем модель, если указана
            let completionMessage = 'Завершено';
            if (data.model) {
                const modelIcon = data.model.includes('reasoner') ? '🧠' : 
                                 data.model.includes('gpt') ? '🚀' : '💬';
                const modelName = data.model === 'deepseek-reasoner' ? 'Reasoner' :
                                 data.model === 'deepseek-chat' ? 'Chat' :
                                 data.model === 'gpt-4o-mini' ? 'GPT-4o-mini' : data.model;
                completionMessage = `${modelIcon} ${modelName}`;
            }
            
            // Добавляем попытку, если > 1
            if (data.attempt && data.attempt > 1) {
                completionMessage += ` <span style="font-size: 0.85em; color: #666;">(попытка ${data.attempt})</span>`;
            }
            
            updateStageStatus(2, completionMessage);
            updateStageIterations(2, data.iterations || 1);
            
            // Убираем подсветку эскалации
            let completeStage2El = document.getElementById('stage2');
            if (completeStage2El) {
                completeStage2El.style.borderLeft = '';
                completeStage2El.style.background = '';
                completeStage2El.style.color = ''; // Сбрасываем цвет текста
            }
            
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
            updateStageIterations(3, 8); // Стандартное количество проверок
            updateLoadingStatus('Этап 3 завершен. Запуск этапа 4...');
            break;
            
        case 'translation_start':
            // Запуск Stage 4 для перевода
            updateStageStatus(4, data.message || 'Перевод результатов на русский...');
            startStageTimer(4);
            updateLoadingStatus(data.message || 'Этап 4: Перевод результатов на русский...');
            break;
            
        case 'translation_complete':
            // Завершаем Stage 4
            stopStageTimer(4);
            updateStageStatus(4, 'Завершено');
            if (data.texts_translated) {
                updateStageIterations(4, data.texts_translated);
            }
            updateLoadingStatus('Перевод завершен. Завершение обработки...');
            break;
            
        case 'translation_error':
            stopStageTimer(4);
            updateStageStatus(4, 'Ошибка перевода');
            updateLoadingStatus('Ошибка перевода (продолжаем без перевода)...');
            break;
            
        case 'complete':
            // Остановка всех таймеров
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
    // Остановка всех таймеров
    if (stageTimers.stage1) clearInterval(stageTimers.stage1);
    if (stageTimers.stage2) clearInterval(stageTimers.stage2);
    if (stageTimers.stage3) clearInterval(stageTimers.stage3);
    if (stageTimers.stage4) clearInterval(stageTimers.stage4);
    if (stageTimers.total) clearInterval(stageTimers.total);
    
    // Сброс времени
    stageStartTimes.stage1 = null;
    stageStartTimes.stage2 = null;
    stageStartTimes.stage3 = null;
    stageStartTimes.stage4 = null;
    stageStartTimes.total = null;
}

function resetStages() {
    document.getElementById('stage1').classList.remove('active');
    document.getElementById('stage2').classList.remove('active');
    document.getElementById('stage3').classList.remove('active');
    document.getElementById('stage4').classList.remove('active');
    
    document.getElementById('stage1-time').textContent = '00:00';
    document.getElementById('stage2-time').textContent = '00:00';
    document.getElementById('stage3-time').textContent = '00:00';
    document.getElementById('stage4-time').textContent = '00:00';
    
    document.getElementById('stage1-status').textContent = 'Ожидание...';
    document.getElementById('stage2-status').textContent = 'Ожидание...';
    document.getElementById('stage3-status').textContent = 'Ожидание...';
    document.getElementById('stage4-status').textContent = 'Ожидание...';
    
    document.getElementById('stage1-iterations').textContent = 'Запросов: 0';
    document.getElementById('stage2-iterations').textContent = 'Итераций: 0';
    document.getElementById('stage3-iterations').textContent = 'Проверок: 0';
    document.getElementById('stage4-iterations').textContent = 'Текстов: 0';
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
    document.getElementById(`stage${stageNum}-status`).innerHTML = status;
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
    } else if (stageNum === 4) {
        iterationsElement.textContent = `Текстов: ${iterations}`;
    }
}

// Обновление информации о результатах Stage 1
function updateStage1Results(sourcesCount, queriesExecuted) {
    const iterationsElement = document.getElementById('stage1-iterations');
    iterationsElement.textContent = `Запросов: ${queriesExecuted} | Источников: ${sourcesCount}`;
}

function hideLoading() {
    resetTimers();
    loadingDiv.classList.add('hidden');
    document.getElementById('stage1').classList.remove('active');
    document.getElementById('stage2').classList.remove('active');
    document.getElementById('stage3').classList.remove('active');
    document.getElementById('stage4').classList.remove('active');
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

    // Отображение аналогов
    displayAnalog('analog-usa', data.analogs?.USA);
    displayAnalog('analog-russia', data.analogs?.Russia);
    displayAnalog('analog-china', data.analogs?.China);

    // Отображение деталей валидации
    displayValidationDetails(data.validation);
}

function displayAnalog(cardId, analog) {
    const card = document.getElementById(cardId);
    const content = card.querySelector('.analog-content');

    if (!analog) {
        content.innerHTML = '<p style="color: #999;">Данные не найдены</p>';
        return;
    }

    let html = `
        <div class="property-group">
            <h4>Марка и стандарт</h4>
            <div class="property-item">
                <span class="property-label">Марка:</span>
                <span class="property-value"><strong>${analog.grade || '-'}</strong></span>
            </div>
            <div class="property-item">
                <span class="property-label">Стандарт:</span>
                <span class="property-value">${analog.standard || '-'}</span>
            </div>
            ${analog.steel_class ? `
            <div class="property-item">
                <span class="property-label">Класс:</span>
                <span class="property-value">${analog.steel_class}</span>
            </div>
            ` : ''}
            ${analog.popularity ? `
            <div class="property-item">
                <span class="property-label">Популярность:</span>
                <span class="property-value">${analog.popularity}</span>
            </div>
            ` : ''}
        </div>
    `;

    if (analog.chemical_composition) {
        html += `
            <div class="property-group">
                <h4>Химический состав (%)</h4>
            `;
        for (const [element, value] of Object.entries(analog.chemical_composition)) {
            html += `
                <div class="property-item">
                    <span class="property-label">${element}:</span>
                    <span class="property-value">${value}</span>
                </div>
            `;
        }
        html += `</div>`;
    }

    if (analog.mechanical_properties) {
        html += `
            <div class="property-group">
                <h4>Механические свойства</h4>
            `;
        for (const [property, value] of Object.entries(analog.mechanical_properties)) {
            const label = {
                yield_strength: 'Предел текучести (МПа)',
                tensile_strength: 'Предел прочности (МПа)',
                elongation: 'Относительное удлинение (%)',
                impact_toughness: 'Ударная вязкость (Дж/см²)'
            }[property] || property;
            html += `
                <div class="property-item">
                    <span class="property-label">${label}:</span>
                    <span class="property-value">${value}</span>
                </div>
            `;
        }
        html += `</div>`;
    }

    if (analog.carbon_equivalent !== undefined) {
        html += `
            <div class="property-group">
                <h4>Свариваемость</h4>
                <div class="property-item">
                    <span class="property-label">Углеродный эквивалент (CE):</span>
                    <span class="property-value">${analog.carbon_equivalent.toFixed(3)}</span>
                </div>
                ${analog.weldability ? `
                <div class="property-item">
                    <span class="property-label">Свариваемость:</span>
                    <span class="property-value">${analog.weldability}</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    content.innerHTML = html;
}

function displayValidationDetails(validation) {
    const container = document.getElementById('validation-info');
    
    if (!validation) {
        container.innerHTML = '<p>Детали валидации недоступны</p>';
        return;
    }

    let html = '';

    if (validation.criteria_scores) {
        html += '<div class="criteria-scores">';
        for (const [criterion, score] of Object.entries(validation.criteria_scores)) {
            const label = {
                mechanical_properties: 'Механические свойства',
                chemical_composition: 'Химический состав',
                carbon_equivalent: 'Углеродный эквивалент',
                steel_class: 'Класс стали',
                weldability: 'Свариваемость',
                popularity: 'Популярность',
                impurities: 'Вредные примеси'
            }[criterion] || criterion;
            
            html += `
                <div class="criteria-item">
                    <strong>${label}</strong>
                    <span>${score}/100</span>
                </div>
            `;
        }
        html += '</div>';
    }

    if (validation.warnings && validation.warnings.length > 0) {
        html += `
            <div class="warnings">
                <h4>⚠️ Предупреждения</h4>
                <ul>
                    ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (validation.recommendations && validation.recommendations.length > 0) {
        html += `
            <div class="recommendations">
                <h4>✅ Рекомендации</h4>
                <ul>
                    ${validation.recommendations.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (validation.errors && validation.errors.length > 0) {
        html += `
            <div class="warnings">
                <h4>❌ Ошибки</h4>
                <ul>
                    ${validation.errors.map(e => `<li>${e}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    container.innerHTML = html || '<p>Нет дополнительной информации</p>';
}
