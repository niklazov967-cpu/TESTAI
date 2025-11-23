/**
 * STAGE 2: Обработка через OpenAI с ОТДЕЛЬНЫМИ ПРОМПТАМИ
 * 
 * Принцип: Каждая марка (USA, Russia, China) обрабатывается ОТДЕЛЬНЫМ промптом.
 * OpenAI НЕ ВИДИТ данные других марок → невозможно скопировать.
 * 
 * Используется в попытке 3 (fallback к OpenAI GPT-4o-mini).
 */

const openaiClient = require('../clients/openaiClient');
const utils = require('../utils');

/**
 * Фильтрует источники по релевантности для страны
 */
function filterSourcesByCountry(searchData, targetCountry) {
  const keywords = {
    'USA': ['ASTM', 'AISI', 'UNS', 'SAE', 'USA', 'American', 'США', 'американск'],
    'Russia': ['GOST', 'ГОСТ', 'Russia', 'Russian', 'РФ', 'российск', 'отечественн'],
    'China': ['GB', 'China', 'Chinese', 'Китай', 'китайск', '国标', 'китайск']
  };
  
  const countryKeywords = keywords[targetCountry] || [];
  const allSources = searchData.aggregated_data?.top_sources || [];
  
  // Оцениваем релевантность каждого источника
  const scored = allSources.map(source => {
    let score = 0;
    const text = (source.title + ' ' + source.content).toLowerCase();
    
    // Считаем упоминания ключевых слов
    countryKeywords.forEach(keyword => {
      const matches = (text.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
      score += matches * 5;
    });
    
    // Бонус если ключевое слово в заголовке
    countryKeywords.forEach(keyword => {
      if (source.title.toLowerCase().includes(keyword.toLowerCase())) {
        score += 20;
      }
    });
    
    return { ...source, relevance_score: score };
  });
  
  // Сортируем по релевантности и возвращаем топ источники
  return scored
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .filter(s => s.relevance_score > 0); // Только релевантные
}

/**
 * Строит промпт для поиска ОДНОЙ марки через OpenAI
 */
function buildSingleCountryPrompt(sourceGrade, targetCountry, searchData, config) {
  // Стандарты по странам
  const standards = {
    'USA': 'ASTM, AISI, UNS, SAE',
    'Russia': 'ГОСТ (GOST)',
    'China': 'GB (国标)'
  };
  
  const targetStandard = standards[targetCountry] || 'International';
  
  // Фильтруем источники по стране
  const relevantSources = filterSourcesByCountry(searchData, targetCountry);
  
  // Формируем текст источников
  let sourcesText = '';
  relevantSources.slice(0, 30).forEach((source, index) => {
    sourcesText += `[Источник ${index + 1}] ${source.title}\n`;
    sourcesText += `${source.content.substring(0, 600)}...\n\n`;
  });
  
  const prompt = `Ты - эксперт по металлургии и международным стандартам сталей.

ЗАДАЧА: Найти ТОЧНЫЙ аналог стали для страны ${targetCountry}.

ИСХОДНАЯ СТАЛЬ: ${sourceGrade}

ЦЕЛЕВАЯ СТРАНА: ${targetCountry}
ЦЕЛЕВОЙ СТАНДАРТ: ${targetStandard}

ДОСТУПНЫЕ ИСТОЧНИКИ (${relevantSources.length}):
${sourcesText}

КРИТИЧЕСКИ ВАЖНО:
⚠️ Ты работаешь ТОЛЬКО со страной ${targetCountry}!
⚠️ НЕ используй данные для других стран (USA, Russia, China)
⚠️ Ищи информацию ТОЛЬКО для стандарта ${targetStandard}
⚠️ Используй ТОЛЬКО реальные данные из источников выше
⚠️ Если данных нет в источниках - укажи null (НЕ придумывай!)
⚠️ НЕ копируй значения из других марок - каждая марка уникальна!

ТВОЯ ЗАДАЧА:
1. Найди марку стали по стандарту ${targetStandard}, которая соответствует ${sourceGrade}
2. Из источников извлеки:
   - Точное название марки (grade)
   - Полный химический состав (C, Cr, Ni, Mn, Si, P, S, Mo, Cu, V, Ti, Fe)
   - Механические свойства:
     * yield_strength (предел текучести, МПа)
     * tensile_strength (предел прочности, МПа)
     * elongation (относительное удлинение, %)
     * impact_toughness (ударная вязкость, Дж/см²) - опционально
   - Класс стали
   - Свариваемость

ВАЖНО ПРО МЕХАНИЧЕСКИЕ СВОЙСТВА:
✓ Ищи КОНКРЕТНЫЕ ЗНАЧЕНИЯ (не диапазоны!)
✓ Если в источниках диапазон (200-250 МПа) - бери среднее (225 МПа)
✓ Если МИНИМУМ (≥200 МПа) - бери минимум + 10% (220 МПа)
✓ Если НЕТ данных - укажи null (НЕ 0, НЕ придумывай!)
✓ Каждая страна (USA, Russia, China) = РАЗНЫЕ стали → РАЗНЫЕ свойства!

ФОРМАТ ОТВЕТА (строго JSON):
{
  "grade": "марка по стандарту ${targetStandard}",
  "standard": "${targetStandard}",
  "chemical_composition": {
    "C": "0.020",
    "Cr": "19.0-23.0",
    "Ni": "24.0-26.0",
    "Mn": "2.0",
    "Si": "1.0",
    "P": "0.045",
    "S": "0.035",
    "Mo": "4.0-5.0",
    "Cu": "1.0-2.0",
    "V": "0",
    "Ti": "0",
    "Fe": "balance"
  },
  "mechanical_properties": {
    "yield_strength": "220",
    "tensile_strength": "490",
    "elongation": "36",
    "impact_toughness": null
  },
  "steel_class": "Austenitic stainless steel",
  "weldability": "Хорошая"
}

⚠️ ПРОВЕРЬ ПЕРЕД ОТВЕТОМ:
1. Марка соответствует стандарту ${targetStandard}?
2. Все данные взяты из источников выше?
3. Механические свойства НЕ скопированы из других марок?
4. Если данных нет - указал null (а не 0)?

ОТВЕТЬ ТОЛЬКО JSON (без комментариев):`;

  return prompt;
}

/**
 * Поиск ОДНОГО аналога для конкретной страны (через OpenAI)
 */
async function findSingleAnalog(steelGrade, targetCountry, searchData, config) {
  console.log(`🔍 [${targetCountry}] Поиск аналога для ${steelGrade} через OpenAI`);
  
  const startTime = Date.now();
  
  // Строим промпт для конкретной страны
  const prompt = buildSingleCountryPrompt(steelGrade, targetCountry, searchData, config);
  
  try {
    // Отправляем в OpenAI
    const response = await openaiClient.processData(prompt, 'gpt-4o-mini');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [${targetCountry}] Найден аналог: ${response.grade} (${elapsed}с)`);
    
    return response;
  } catch (error) {
    console.error(`❌ [${targetCountry}] Ошибка поиска аналога:`, error.message);
    
    // Возвращаем пустую структуру
    return {
      grade: null,
      standard: null,
      chemical_composition: {
        C: null, Cr: null, Ni: null, Mn: null, Si: null,
        P: null, S: null, Mo: null, Cu: null, V: null, Ti: null, Fe: null
      },
      mechanical_properties: {
        yield_strength: null,
        tensile_strength: null,
        elongation: null,
        impact_toughness: null
      },
      steel_class: null,
      weldability: null,
      error: error.message
    };
  }
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Обработка с отдельными промптами (OpenAI)
 */
async function execute(steelGrade, searchData, config) {
  console.log('\n============================================================');
  console.log('🔀 STAGE 2: OPENAI С ОТДЕЛЬНЫМИ ПРОМПТАМИ');
  console.log('============================================================');
  console.log('Принцип: Каждая марка обрабатывается ОТДЕЛЬНО');
  console.log('Модель: GPT-4o-mini');
  console.log('============================================================\n');
  
  const startTime = Date.now();
  
  // ПАРАЛЛЕЛЬНЫЙ поиск всех трех аналогов
  const [usaResult, russiaResult, chinaResult] = await Promise.all([
    findSingleAnalog(steelGrade, 'USA', searchData, config),
    findSingleAnalog(steelGrade, 'Russia', searchData, config),
    findSingleAnalog(steelGrade, 'China', searchData, config)
  ]);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Формируем финальную структуру
  const result = {
    steel_grade: steelGrade,
    analogs: {
      USA: usaResult,
      Russia: russiaResult,
      China: chinaResult
    },
    metadata: {
      search_strategy: 'openai_separate_prompts',
      model: 'gpt-4o-mini',
      search_time: elapsed,
      total_sources: searchData.aggregated_data?.top_sources?.length || 0
    }
  };
  
  console.log('\n============================================================');
  console.log(`✅ STAGE 2 ЗАВЕРШЕН за ${elapsed}с`);
  console.log(`   USA: ${usaResult.grade || 'не найдено'}`);
  console.log(`   Russia: ${russiaResult.grade || 'не найдено'}`);
  console.log(`   China: ${chinaResult.grade || 'не найдено'}`);
  console.log('============================================================\n');
  
  return result;
}

module.exports = { execute };

