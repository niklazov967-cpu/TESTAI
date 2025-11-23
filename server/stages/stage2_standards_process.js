const deepseekClient = require('../clients/deepseekClient');
const promptBuilder = require('../promptBuilder');

/**
 * STAGE 2: DeepSeek Processing для стандартов
 * Обработка данных через DeepSeek с модульными промптами
 */
async function execute(standardCode, standardType, searchData, config) {
  console.log(`[Этап 2] Обработка через DeepSeek для: ${standardCode}`);

  // Сборка промпта из активных блоков
  const prompt = await promptBuilder.buildStandardsStage2Prompt(
    searchData,
    standardCode,
    standardType || 'general',
    config
  );

  console.log(`[Этап 2] Промпт собран из ${Object.values(config.prompt_blocks.stage2_deepseek).filter(v => v).length} активных блоков`);

  // Отправка в DeepSeek с указанием модели
  const model = config.deepseek_model || 'deepseek-chat';
  const processedData = await deepseekClient.processData(prompt, {
    model: model,
    temperature: 0.7,
    max_tokens: 4000
  });

  console.log(`[Этап 2] Обработка завершена`);

  return {
    ...processedData,
    standard_code: standardCode,
    standard_type: standardType || 'general'
  };
}

module.exports = {
  execute
};

