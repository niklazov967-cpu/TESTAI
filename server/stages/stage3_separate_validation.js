const openaiClient = require('../clients/openaiClient');
const promptBuilder = require('../promptBuilder');

/**
 * STAGE 3: ОТДЕЛЬНЫЕ ВАЛИДАЦИИ ДЛЯ КАЖДОЙ МАРКИ
 * 
 * Принцип: Каждая марка валидируется ОТДЕЛЬНО
 * 
 * ПОЧЕМУ ЭТО ВАЖНО:
 * - OpenAI НЕ ВИДИТ данные других марок
 * - Валидация фокусируется на ОДНОЙ марке
 * - Более точная оценка без сравнения с другими
 * 
 * АРХИТЕКТУРА:
 * ┌─────────────────────────────────────┐
 * │ Валидация 1: USA данные             │ ─┐
 * ├─────────────────────────────────────┤  │
 * │ Валидация 2: Russia данные          │  ├─ Параллельно
 * ├─────────────────────────────────────┤  │
 * │ Валидация 3: China данные           │ ─┘
 * └─────────────────────────────────────┘
 * 
 * Затем: Агрегация результатов
 */

/**
 * Валидация ОДНОЙ марки стали
 */
async function validateSingleAnalog(analogData, country, sourceGrade, searchData, config) {
  console.log(`\n✓ [${country}] Валидация ${analogData.grade}`);
  
  const startTime = Date.now();
  
  // Строим промпт для валидации ТОЛЬКО одной марки
  const prompt = buildSingleValidationPrompt(analogData, country, sourceGrade, searchData, config);
  
  try {
    const result = await openaiClient.validate(prompt, config);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [${country}] Валидация завершена: ${result.overall_score}/100 (${(duration / 1000).toFixed(1)}с)`);
    
    return {
      country: country,
      analog: analogData,
      validation: result,
      duration_ms: duration
    };
  } catch (error) {
    console.error(`❌ [${country}] Ошибка валидации:`, error.message);
    
    // Возвращаем минимальную валидацию
    return {
      country: country,
      analog: analogData,
      validation: {
        passed: false,
        overall_score: 0,
        criteria_scores: {},
        errors: [`Ошибка валидации: ${error.message}`],
        warnings: [],
        recommendations: []
      },
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Строит промпт для валидации ОДНОЙ марки
 */
function buildSingleValidationPrompt(analogData, country, sourceGrade, searchData, config) {
  const sources = searchData.aggregated_data?.top_sources || [];
  
  let sourcesText = '';
  sources.slice(0, 15).forEach((source, index) => {
    sourcesText += `[${index + 1}] ${source.title}\n`;
    sourcesText += `${source.content.substring(0, 400)}...\n\n`;
  });
  
  const prompt = `Ты - эксперт по валидации данных о сталях.

ЗАДАЧА: Проверить точность данных для ОДНОЙ марки стали (${country}).

ИСХОДНАЯ СТАЛЬ: ${sourceGrade}
НАЙДЕННЫЙ АНАЛОГ (${country}): ${analogData.grade}

ДАННЫЕ ДЛЯ ПРОВЕРКИ:
${JSON.stringify(analogData, null, 2)}

ДОСТУПНЫЕ ИСТОЧНИКИ:
${sourcesText}

КРИТЕРИИ ВАЛИДАЦИИ:

1. МЕХАНИЧЕСКИЕ СВОЙСТВА (25 баллов):
   - Наличие yield_strength, tensile_strength, elongation
   - Значения в типичных диапазонах для данного типа стали
   - Соответствие источникам

2. ХИМИЧЕСКИЙ СОСТАВ (25 баллов):
   - Наличие всех основных элементов (C, Cr, Ni, Mn, Si, Mo, Cu)
   - Диапазоны соответствуют стандарту
   - Баланс Fe указан корректно

3. УГЛЕРОДНЫЙ ЭКВИВАЛЕНТ (15 баллов):
   - Рассчитан корректно
   - Соответствует типу стали

4. КЛАСС СТАЛИ (10 баллов):
   - Указан правильный класс
   - Соответствует составу

5. СВАРИВАЕМОСТЬ (10 баллов):
   - Оценка соответствует углеродному эквиваленту
   - Реалистичная оценка

6. ПОПУЛЯРНОСТЬ (10 баллов):
   - Оценка соответствует распространенности
   - Реалистичная для данной страны

7. ВРЕДНЫЕ ПРИМЕСИ (5 баллов):
   - P и S в допустимых пределах

ФОРМАТ ОТВЕТА (JSON):
{
  "passed": true/false,
  "overall_score": 85,
  "criteria_scores": {
    "mechanical_properties": 80,
    "chemical_composition": 90,
    "carbon_equivalent": 85,
    "steel_class": 100,
    "weldability": 90,
    "popularity": 80,
    "impurities": 100
  },
  "errors": ["Список критических ошибок"],
  "warnings": ["Список предупреждений"],
  "recommendations": ["Рекомендации по улучшению"]
}

ВАЖНО:
⚠️ Валидируй ТОЛЬКО данные для ${country}
⚠️ НЕ сравнивай с другими странами
⚠️ Оценивай по источникам выше
⚠️ Ответ ТОЛЬКО JSON`;

  return prompt;
}

/**
 * Агрегация результатов валидации
 */
function aggregateValidations(validationResults) {
  console.log('\n📊 Агрегация результатов валидации:');
  
  // Собираем общую статистику
  const totalScore = validationResults.reduce((sum, r) => sum + r.validation.overall_score, 0);
  const avgScore = totalScore / validationResults.length;
  
  const allErrors = [];
  const allWarnings = [];
  const allRecommendations = [];
  
  validationResults.forEach(result => {
    const { country, validation } = result;
    
    console.log(`  [${country}] Оценка: ${validation.overall_score}/100`);
    
    // Префиксы для ошибок/предупреждений
    validation.errors.forEach(err => allErrors.push(`[${country}] ${err}`));
    validation.warnings.forEach(warn => allWarnings.push(`[${country}] ${warn}`));
    validation.recommendations.forEach(rec => allRecommendations.push(`[${country}] ${rec}`));
  });
  
  // Агрегированные оценки по критериям
  const criteriaScores = {};
  const criteriaNames = Object.keys(validationResults[0].validation.criteria_scores || {});
  
  criteriaNames.forEach(criterion => {
    const scores = validationResults.map(r => r.validation.criteria_scores[criterion] || 0);
    criteriaScores[criterion] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  });
  
  console.log(`  Средняя оценка: ${avgScore.toFixed(1)}/100`);
  console.log(`  Ошибок: ${allErrors.length}`);
  console.log(`  Предупреждений: ${allWarnings.length}`);
  
  return {
    passed: avgScore >= 70,
    overall_score: Math.round(avgScore * 10) / 10,
    criteria_scores: criteriaScores,
    errors: allErrors,
    warnings: allWarnings,
    recommendations: allRecommendations,
    individual_scores: validationResults.map(r => ({
      country: r.country,
      score: r.validation.overall_score
    }))
  };
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Валидация через отдельные промпты
 */
async function execute(steelGrade, processedData, searchData, config) {
  console.log('\n' + '='.repeat(60));
  console.log('✓ STAGE 3: ОТДЕЛЬНЫЕ ВАЛИДАЦИИ ДЛЯ КАЖДОЙ МАРКИ');
  console.log('='.repeat(60));
  console.log('Принцип: Каждая марка валидируется НЕЗАВИСИМО');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  // Параллельная валидация всех трех марок (ОТДЕЛЬНЫЕ ПРОМПТЫ!)
  const validationResults = await Promise.all([
    validateSingleAnalog(processedData.analogs.USA, 'USA', steelGrade, searchData, config),
    validateSingleAnalog(processedData.analogs.Russia, 'Russia', steelGrade, searchData, config),
    validateSingleAnalog(processedData.analogs.China, 'China', steelGrade, searchData, config)
  ]);
  
  // Агрегируем результаты
  const aggregatedValidation = aggregateValidations(validationResults);
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ STAGE 3 ЗАВЕРШЕН за ${(duration / 1000).toFixed(1)}с`);
  console.log(`   Общая оценка: ${aggregatedValidation.overall_score}/100`);
  console.log('='.repeat(60));
  
  return {
    analogs: processedData.analogs,
    validation: aggregatedValidation,
    validation_metadata: {
      strategy: 'separate_validations',
      validations_performed: 3,
      individual_results: validationResults,
      duration_ms: duration,
      timestamp: Date.now()
    }
  };
}

module.exports = {
  execute,
  validateSingleAnalog,
  aggregateValidations
};

