const openaiClient = require('../clients/openaiClient');
const promptBuilder = require('../promptBuilder');

/**
 * STAGE 3: OpenAI Validation для стандартов
 * Валидация результатов через OpenAI с настраиваемыми критериями
 */
async function execute(standardCode, equivalents, config) {
  console.log(`[Этап 3] Валидация через OpenAI для: ${standardCode}`);

  // Сборка промпта валидации из активных блоков
  const prompt = await promptBuilder.buildStandardsStage3Prompt(
    equivalents,
    standardCode,
    config
  );

  console.log(`[Этап 3] Промпт валидации собран из ${Object.values(config.prompt_blocks.stage3_openai).filter(v => v).length} активных блоков`);

  // Отправка в OpenAI
  const validationData = await openaiClient.validate(prompt, {
    temperature: 0.3,
    model: 'gpt-4o-mini',
    max_tokens: 3000
  });

  console.log(`[Этап 3] Валидация завершена. Общий балл: ${validationData.overall_score || 'N/A'}`);

  return validationData;
}

module.exports = {
  execute
};

