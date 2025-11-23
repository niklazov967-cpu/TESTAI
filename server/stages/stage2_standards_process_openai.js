const openaiClient = require('../clients/openaiClient');
const promptBuilder = require('../promptBuilder');

/**
 * Этап 2: Обработка данных через OpenAI (fallback для стандартов)
 * Используется, когда DeepSeek не справился с задачей
 */
async function execute(standardCode, standardType, searchData, config) {
  console.log('🚀 Stage 2 (OpenAI fallback): Обработка данных о стандарте через GPT-4o-mini...');
  
  try {
    // Строим промпт из блоков (как для DeepSeek)
    // Промпт уже содержит все необходимые данные поиска
    const fullPrompt = await promptBuilder.buildStandardsStage2Prompt(
      searchData.results || [],
      standardCode,
      standardType,
      config
    );
    
    // Вызываем OpenAI для обработки
    const processedData = await openaiClient.processData(
      fullPrompt,
      { model: 'gpt-4o-mini' }
    );
    
    console.log('✅ OpenAI успешно обработал данные о стандарте');
    
    return processedData;
    
  } catch (error) {
    console.error('❌ Ошибка OpenAI обработки стандарта:', error.message);
    throw new Error(`OpenAI processing failed: ${error.message}`);
  }
}

module.exports = { execute };

