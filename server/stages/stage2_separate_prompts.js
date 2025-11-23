const deepseekClient = require('../clients/deepseekClient');
const promptBuilder = require('../promptBuilder');

/**
 * STAGE 2: ОТДЕЛЬНЫЕ ПРОМПТЫ ДЛЯ КАЖДОЙ МАРКИ
 * 
 * Принцип: Каждая марка обрабатывается ОТДЕЛЬНЫМ промптом
 * 
 * ПОЧЕМУ ЭТО ВАЖНО:
 * - DeepSeek НЕ ВИДИТ данные других марок
 * - НЕВОЗМОЖНО скопировать то, чего не видишь
 * - Каждая марка ищется независимо в источниках
 * 
 * АРХИТЕКТУРА:
 * ┌─────────────────────────────────────┐
 * │ Промпт 1: USA аналог для 904L       │ ─┐
 * ├─────────────────────────────────────┤  │
 * │ Промпт 2: Russia аналог для 904L    │  ├─ Параллельно
 * ├─────────────────────────────────────┤  │
 * │ Промпт 3: China аналог для 904L     │ ─┘
 * └─────────────────────────────────────┘
 */

/**
 * Поиск ОДНОЙ марки стали (отдельный промпт)
 */
async function findSingleAnalog(sourceGrade, targetCountry, searchData, config) {
  console.log(`\n🔍 [${targetCountry}] Поиск аналога для ${sourceGrade}`);
  
  const startTime = Date.now();
  
  // Строим промпт ТОЛЬКО для одной марки
  const prompt = buildSingleCountryPrompt(sourceGrade, targetCountry, searchData, config);
  
  // Вызываем DeepSeek
  const model = config.deepseek_model || 'deepseek-chat';
  
  try {
    const result = await deepseekClient.processData(prompt, model, config);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [${targetCountry}] Найден аналог: ${result.grade} (${(duration / 1000).toFixed(1)}с)`);
    
    return result;
  } catch (error) {
    console.error(`❌ [${targetCountry}] Ошибка поиска:`, error.message);
    
    // Возвращаем пустой результат
    return {
      grade: `Unknown ${targetCountry}`,
      standard: 'Unknown',
      chemical_composition: {},
      mechanical_properties: {
        yield_strength: null,
        tensile_strength: null,
        elongation: null,
        impact_toughness: null
      },
      steel_class: 'Неизвестная',
      carbon_equivalent: 0,
      weldability: 'Неизвестная',
      popularity: 'Неизвестная'
    };
  }
}

/**
 * Строит промпт для ОДНОЙ конкретной страны
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
  relevantSources.slice(0, 25).forEach((source, index) => {
    sourcesText += `[Источник ${index + 1}] ${source.title}\n`;
    sourcesText += `${source.content.substring(0, 500)}...\n\n`;
  });
  
  // Загружаем блоки промпта
  const promptBlocks = config.prompt_blocks?.stage2_deepseek || {};
  
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
    "S": "0.030",
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
  "steel_class": "Нержавеющая (аустенитная)",
  "carbon_equivalent": 3.5,
  "weldability": "Хорошая",
  "popularity": "Высокая"
}

ВАЖНО: 
- Ответ должен содержать ТОЛЬКО JSON
- Все значения из источников для ${targetCountry}
- НЕ копируй данные из примера, используй источники!`;

  return prompt;
}

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
  
  // Сортируем по релевантности
  const sorted = scored.sort((a, b) => b.relevance_score - a.relevance_score);
  
  // Возвращаем релевантные или все если релевантных мало
  const relevant = sorted.filter(s => s.relevance_score > 0);
  return relevant.length > 5 ? relevant : allSources;
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Обработка через отдельные промпты
 */
async function execute(steelGrade, searchData, config) {
  console.log('\n' + '='.repeat(60));
  console.log('🔀 STAGE 2: ОТДЕЛЬНЫЕ ПРОМПТЫ ДЛЯ КАЖДОЙ МАРКИ');
  console.log('='.repeat(60));
  console.log('Принцип: Каждая марка ищется НЕЗАВИСИМО');
  console.log('Результат: Нет копирования данных между марками');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  // Параллельный поиск всех трех марок (ОТДЕЛЬНЫЕ ПРОМПТЫ!)
  const [usaData, russiaData, chinaData] = await Promise.all([
    findSingleAnalog(steelGrade, 'USA', searchData, config),
    findSingleAnalog(steelGrade, 'Russia', searchData, config),
    findSingleAnalog(steelGrade, 'China', searchData, config)
  ]);
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ STAGE 2 ЗАВЕРШЕН за ${(duration / 1000).toFixed(1)}с`);
  console.log('='.repeat(60));
  console.log(`   USA: ${usaData.grade}`);
  console.log(`   Russia: ${russiaData.grade}`);
  console.log(`   China: ${chinaData.grade}`);
  console.log('='.repeat(60));
  
  return {
    analogs: {
      USA: usaData,
      Russia: russiaData,
      China: chinaData
    },
    processing_metadata: {
      strategy: 'separate_prompts',
      prompts_used: 3,
      duration_ms: duration,
      timestamp: Date.now()
    }
  };
}

module.exports = {
  execute,
  findSingleAnalog
};

