const API_BASE = '/api';

// Элементы DOM
const steelGradeInput = document.getElementById('steel-grade');
const searchBtn = document.getElementById('search-btn');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const resultsDiv = document.getElementById('results');
const validationScore = document.getElementById('validation-score');

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
        const response = await fetch(`${API_BASE}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steel_grade: steelGrade })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Ошибка при выполнении запроса');
        }

        displayResults(data);

    } catch (error) {
        showError(`Ошибка: ${error.message}`);
    } finally {
        hideLoading();
        searchBtn.disabled = false;
    }
}

function showLoading() {
    loadingDiv.classList.remove('hidden');
    // Анимация этапов
    setTimeout(() => {
        document.getElementById('stage1').classList.add('active');
    }, 500);
    setTimeout(() => {
        document.getElementById('stage2').classList.add('active');
    }, 2000);
    setTimeout(() => {
        document.getElementById('stage3').classList.add('active');
    }, 4000);
}

function hideLoading() {
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

