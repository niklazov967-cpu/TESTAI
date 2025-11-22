const deepseekClient = require('../clients/deepseekClient');
const promptBuilder = require('../promptBuilder');
const utils = require('../utils');

/**
 * STAGE 2: DeepSeek Processing
 * Обработка данных и поиск аналогов
 */
async function execute(steelGrade, searchData, config) {
  console.log(`[Этап 2] Обработка данных для: ${steelGrade}`);

  // Построение промпта с данными поиска
  const prompt = promptBuilder.buildStage2Prompt(steelGrade, searchData, config);

  // Обработка через DeepSeek
  const result = await deepseekClient.processData(prompt, {
    temperature: config.deepseek_temperature || 0.7
  });

  // Расчет дополнительных параметров
  const enhancedResult = enhanceResults(result);
  
  // Устанавливаем количество итераций (всегда 1, так как повторных попыток нет)
  enhancedResult.iterations_used = 1;

  console.log(`[Этап 2] Обработка завершена`);

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
        analog.carbon_equivalent = utils.calculateCE(analog.chemical_composition);
        
        // Оценка свариваемости
        analog.weldability = utils.assessWeldability(analog.carbon_equivalent);
        
        // Классификация стали
        const steelClass = utils.classifySteelGrade(analog.chemical_composition);
        analog.steel_class = utils.formatSteelClass(steelClass);
        
        // Оценка популярности
        const popularity = utils.assessPopularity(analog.grade, country);
        analog.popularity = utils.formatPopularity(popularity);
        
        // Форматирование свариваемости
        analog.weldability = utils.formatWeldability(analog.weldability);
      }
    }
  }

  return enhanced;
}

module.exports = {
  execute
};

