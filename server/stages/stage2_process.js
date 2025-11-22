const deepseekClient = require('../clients/deepseekClient');
const promptBuilder = require('../promptBuilder');
const utils = require('../utils');

/**
 * STAGE 2: DeepSeek Processing
 * Обработка данных и поиск аналогов
 */
async function execute(steelGrade, searchData, config) {
  console.log(`[Stage 2] Processing data for: ${steelGrade}`);

  // Построение промпта с данными поиска
  const prompt = promptBuilder.buildStage2Prompt(steelGrade, searchData, config);

  // Обработка через DeepSeek с повторными попытками, если Ti отсутствует
  let result;
  let attempts = 0;
  const maxAttempts = config.max_iterations || 3;
  
  do {
    attempts++;
    result = await deepseekClient.processData(prompt, {
      temperature: config.deepseek_temperature || 0.7
    });
    
    // Проверка наличия Ti во всех аналогах
    const hasTi = checkTitaniumPresence(result);
    
    if (hasTi) {
      console.log(`[Stage 2] Titanium (Ti) found in all analogs`);
      break;
    } else {
      console.warn(`[Stage 2] Warning: Titanium (Ti) missing in some analogs. Attempt ${attempts}/${maxAttempts}`);
      if (attempts < maxAttempts) {
        // Добавляем более строгое требование в промпт
        prompt = promptBuilder.buildStage2Prompt(steelGrade, searchData, config) + 
          '\n\nКРИТИЧЕСКАЯ ОШИБКА: В предыдущем ответе отсутствовал титан (Ti)! ОБЯЗАТЕЛЬНО добавь поле "Ti" в chemical_composition для ВСЕХ аналогов!';
      }
    }
  } while (attempts < maxAttempts && !checkTitaniumPresence(result));

  // Расчет дополнительных параметров
  const enhancedResult = enhanceResults(result);

  console.log(`[Stage 2] Processing complete`);

  return enhancedResult;
}

/**
 * Проверка наличия титана (Ti) во всех аналогах
 */
function checkTitaniumPresence(result) {
  if (!result || !result.analogs) return false;
  
  for (const country of ['USA', 'Russia', 'China']) {
    if (result.analogs[country] && result.analogs[country].chemical_composition) {
      const comp = result.analogs[country].chemical_composition;
      if (comp.Ti === undefined || comp.Ti === null || comp.Ti === '') {
        console.warn(`[Stage 2] Missing Ti in ${country} analog: ${result.analogs[country].grade || 'unknown'}`);
        return false;
      }
    } else {
      return false;
    }
  }
  
  return true;
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
        // КРИТИЧЕСКИ ВАЖНО: Гарантируем наличие титана (Ti) в химическом составе
        if (analog.chemical_composition.Ti === undefined || 
            analog.chemical_composition.Ti === null || 
            analog.chemical_composition.Ti === '') {
          console.warn(`[Stage 2] Force adding Ti=0 to ${country} analog: ${analog.grade || 'unknown'}`);
          analog.chemical_composition.Ti = '0';
        }
        
        // Логирование для отладки
        console.log(`[Stage 2] ${country} (${analog.grade}): Ti = ${analog.chemical_composition.Ti}`);
        
        analog.carbon_equivalent = utils.calculateCE(analog.chemical_composition);
        
        // Оценка свариваемости
        analog.weldability = utils.assessWeldability(analog.carbon_equivalent);
        
        // Классификация стали
        analog.steel_class = utils.classifySteelGrade(analog.chemical_composition);
        
        // Оценка популярности
        analog.popularity = utils.assessPopularity(analog.grade, country);
      }
    }
  }

  return enhanced;
}

module.exports = {
  execute
};

