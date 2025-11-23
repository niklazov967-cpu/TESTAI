const openaiClient = require('../clients/openaiClient');
const promptBuilder = require('../promptBuilder');
const { enhanceResults } = require('./stage2_process');

/**
 * STAGE 2: OpenAI Processing (запасной вариант)
 * Используется только если DeepSeek Chat и Reasoner не смогли пройти валидацию
 * Это третий уровень эскалации
 */
async function execute(steelGrade, searchData, config) {
  console.log(`[Этап 2] 🚀 Обработка через OpenAI для: ${steelGrade}`);
  console.log('[Этап 2] Используется в качестве запасного варианта (попытка 3)');

  // Построение промпта с данными поиска (тот же промпт, что и для DeepSeek)
  const prompt = promptBuilder.buildStage2Prompt(steelGrade, searchData, config);

  // Обработка через OpenAI
  const result = await openaiClient.processData(prompt, {
    temperature: 0.3,  // Более детерминированно для точности
    model: 'gpt-4o-mini'
  });

  // Те же самые улучшения результатов, что и для DeepSeek
  const enhancedResult = enhanceResults(result);
  
  // Метаданные о попытке
  enhancedResult.iterations_used = 1;
  enhancedResult.model_used = 'gpt-4o-mini';

  console.log(`[Этап 2] Обработка через OpenAI завершена`);

  return enhancedResult;
}

module.exports = {
  execute
};

