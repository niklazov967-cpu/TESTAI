const openaiClient = require('../clients/openaiClient');
const promptBuilder = require('../promptBuilder');

/**
 * Гарантирует наличие титана (Ti) во всех аналогах
 */
function ensureTitaniumPresence(processedData) {
  if (!processedData || !processedData.analogs) return;
  
  for (const country of ['USA', 'Russia', 'China']) {
    if (processedData.analogs[country] && processedData.analogs[country].chemical_composition) {
      const comp = processedData.analogs[country].chemical_composition;
      if (comp.Ti === undefined || comp.Ti === null || comp.Ti === '') {
        console.warn(`[Stage 3] CRITICAL: Missing Ti in ${country} analog. Adding Ti=0`);
        comp.Ti = '0';
      }
      console.log(`[Stage 3] ${country} (${processedData.analogs[country].grade}): Ti = ${comp.Ti}`);
    }
  }
}

/**
 * STAGE 3: OpenAI Validation
 * Фактчекинг и валидация результатов
 */
async function execute(steelGrade, processedData, searchData, config) {
  console.log(`[Этап 3] Валидация результатов для: ${steelGrade}`);

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся, что Ti присутствует во всех аналогах
  ensureTitaniumPresence(processedData);

  // Построение промпта валидации
  const prompt = promptBuilder.buildStage3Prompt(steelGrade, processedData, searchData, config);

  // Валидация через OpenAI
  const validationResult = await openaiClient.validate(prompt, {
    model: config.openai_model || 'gpt-4o-mini',
    temperature: config.openai_temperature || 0.3
  });

  // Объединение результатов
  const finalResult = {
    analogs: processedData.analogs,
    validation: {
      passed: validationResult.overall_score >= 70,
      overall_score: validationResult.overall_score,
      criteria_scores: validationResult.criteria_scores,
      errors: validationResult.errors || [],
      warnings: validationResult.warnings || [],
      recommendations: validationResult.recommendations || [],
      checks_performed: 8
    },
    iterations_used: processedData.iterations_used || 1
  };

  console.log(`[Этап 3] Валидация завершена: ${validationResult.overall_score}/100`);

  return finalResult;
}

module.exports = {
  execute
};

