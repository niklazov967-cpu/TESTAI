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

    try {
        // Симуляция этапов с обновлениями
        updateLoadingStatus('Запуск Stage 1: Поиск данных через Tavily...');
        startStageTimer(1);
        
        // Запуск запроса
        const response = await fetch(`${API_BASE}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steel_grade: steelGrade })
        });

        // Stage 1 завершен
        stopStageTimer(1);
        updateLoadingStatus('Stage 1 завершен. Запуск Stage 2: Обработка через DeepSeek...');
        startStageTimer(2);
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Ошибка при выполнении запроса');
        }

        // Stage 2 завершен
        stopStageTimer(2);
        updateLoadingStatus('Stage 2 завершен. Запуск Stage 3: Валидация через OpenAI...');
        startStageTimer(3);
        
        // Обновление информации об итерациях из данных
        if (data.pipeline) {
            updateStageIterations(1, data.pipeline.stage1_sources || 0);
            updateStageIterations(2, data.pipeline.stage2_iterations || 0);
            updateStageIterations(3, data.pipeline.stage3_checks || 0);
        }
        
        // Небольшая задержка для отображения Stage 3
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Stage 3 завершен
        stopStageTimer(3);
        updateLoadingStatus('Все этапы завершены!');
        
        // Остановка общего таймера
        if (stageTimers.total) {
            clearInterval(stageTimers.total);
        }

        displayResults(data);

    } catch (error) {
        resetTimers();
        showError(`Ошибка: ${error.message}`);
    } finally {
        hideLoading();
        searchBtn.disabled = false;
    }
}

function showLoading() {
    loadingDiv.classList.remove('hidden');
    
    // Сброс таймеров
    resetTimers();
    
    // Запуск общего таймера
    stageStartTimes.total = Date.now();
    startTotalTimer();
    
    // Обновление статуса
    updateLoadingStatus('Инициализация поиска...');
    
    // Сброс всех этапов
    resetStages();
}

function resetTimers() {
    // Остановка всех таймеров
    if (stageTimers.stage1) clearInterval(stageTimers.stage1);
    if (stageTimers.stage2) clearInterval(stageTimers.stage2);
    if (stageTimers.stage3) clearInterval(stageTimers.stage3);
    if (stageTimers.total) clearInterval(stageTimers.total);
    
    // Сброс времени
    stageStartTimes.stage1 = null;
    stageStartTimes.stage2 = null;
    stageStartTimes.stage3 = null;
    stageStartTimes.total = null;
}

function resetStages() {
    document.getElementById('stage1').classList.remove('active');
    document.getElementById('stage2').classList.remove('active');
    document.getElementById('stage3').classList.remove('active');
    
    document.getElementById('stage1-time').textContent = '--:--';
    document.getElementById('stage2-time').textContent = '--:--';
    document.getElementById('stage3-time').textContent = '--:--';
    
    document.getElementById('stage1-iterations').textContent = 'Итераций: 0';
    document.getElementById('stage2-iterations').textContent = 'Итераций: 0';
    document.getElementById('stage3-iterations').textContent = 'Проверок: 0';
}

function startTotalTimer() {
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
    // Остановка всех таймеров
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

