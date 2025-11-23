const deepseekClient = require('../clients/deepseekClient');
const promptBuilder = require('../promptBuilder');
const utils = require('../utils');

/**
 * STAGE 2: DeepSeek Processing
 * Обработка данных и поиск аналогов
 * Поддерживает выбор модели: deepseek-chat (по умолчанию) или deepseek-reasoner
 */
async function execute(steelGrade, searchData, config) {
  // Получаем модель из конфига (по умолчанию deepseek-chat)
  const model = config.deepseek_model || 'deepseek-chat';
  
  console.log(`[Этап 2] Обработка данных для: ${steelGrade}`);
  
  if (model === 'deepseek-reasoner') {
    console.log('[Этап 2] 🧠 Используется DeepSeek Reasoner (расширенное мышление)');
  } else {
    console.log('[Этап 2] 💬 Используется DeepSeek Chat (стандартная модель)');
  }

  // Построение промпта с данными поиска
  const prompt = promptBuilder.buildStage2Prompt(steelGrade, searchData, config);

  // Обработка через DeepSeek с выбранной моделью
  const result = await deepseekClient.processData(prompt, {
    temperature: config.deepseek_temperature || 0.7,
    model: model
  });

  // Расчет дополнительных параметров
  const enhancedResult = enhanceResults(result);
  
  // Устанавливаем количество итераций
  enhancedResult.iterations_used = 1;
  enhancedResult.model_used = model;

  console.log(`[Этап 2] Обработка завершена (модель: ${model})`);

  return enhancedResult;
}

/**
 * Улучшение результатов дополнительными расчетами
 */
function enhanceResults(result) {
  const enhanced = { ...result };

  // Расчет CE для каждого аналога
  for (const country of ['USA', 'Russia', 'China']) {
    if (enhanced.analogs && enhanced.analogs[country]) {
      const analog = enhanced.analogs[country];
      
      // Расчет углеродного эквивалента
      if (analog.chemical_composition) {
        // Сначала классифицируем сталь, чтобы правильно оценить свариваемость
        const steelClass = utils.classifySteelGrade(analog.chemical_composition);
        analog.steel_class = utils.formatSteelClass(steelClass);
        
        // Расчет углеродного эквивалента
        analog.carbon_equivalent = utils.calculateCE(analog.chemical_composition);
        
        // Оценка свариваемости с учетом класса стали
        // Для нержавеющих сталей формула CE не применима
        const weldabilityRaw = utils.assessWeldability(analog.carbon_equivalent, steelClass);
        analog.weldability = utils.formatWeldability(weldabilityRaw);
        
        // Оценка популярности
        const popularity = utils.assessPopularity(analog.grade, country);
        analog.popularity = utils.formatPopularity(popularity);
      }
    }
  }

  return enhanced;
}

module.exports = {
  execute,
  enhanceResults  // Экспортируем для использования в stage2_process_openai
};

