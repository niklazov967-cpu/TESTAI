const deepseekClient = require('../clients/deepseekClient');
const tavilyClient = require('../clients/tavilyClient');
const promptBuilder = require('../promptBuilder');

/**
 * ПОСЛЕДОВАТЕЛЬНЫЙ ПОИСК АНАЛОГОВ (Sequential Search Strategy)
 * 
 * Стратегия: Ищем каждый аналог отдельно, затем перекрестно проверяем
 * 
 * ФАЗА 1: Прямой поиск от исходной стали (параллельно)
 *   - 904L → Russia
 *   - 904L → China
 * 
 * ФАЗА 2: Перекрестный поиск между аналогами (параллельно)
 *   - Russia → China
 *   - China → Russia
 * 
 * ФАЗА 3: Выбор лучшего результата для каждого аналога
 */

/**
 * Поиск одного аналога для заданной стали
 */
async function findAnalog(sourceGrade, targetCountry, searchData, config) {
  console.log(`\n🔍 Поиск ${targetCountry} аналога для ${sourceGrade}`);
  
  const startTime = Date.now();
  
  // Строим специальный промпт для поиска ОДНОГО аналога
  const prompt = buildSingleAnalogPrompt(sourceGrade, targetCountry, searchData, config);
  
  // Используем DeepSeek для поиска
  const model = config.deepseek_model || 'deepseek-chat';
  const result = await deepseekClient.processData(prompt, model, config);
  
  const duration = Date.now() - startTime;
  
  console.log(`✅ Найден ${targetCountry} аналог: ${result.grade} (${duration}мс)`);
  
  // Добавляем метаданные
  return {
    ...result,
    search_metadata: {
      source_grade: sourceGrade,
      target_country: targetCountry,
      duration_ms: duration,
      model: model,
      timestamp: Date.now()
    }
  };
}

/**
 * Строит промпт для поиска ОДНОГО аналога
 */
function buildSingleAnalogPrompt(sourceGrade, targetCountry, searchData, config) {
  // Определяем стандарт для целевой страны
  const standards = {
    'Russia': 'GOST (ГОСТ)',
    'China': 'GB (国标)',
    'USA': 'ASTM, AISI, UNS'
  };
  
  const targetStandard = standards[targetCountry] || '';
  
  // Фильтруем источники по релевантности для целевой страны
  const relevantSources = filterSourcesByCountry(searchData, targetCountry);
  
  // Строим текст источников
  let sourcesText = '';
  relevantSources.slice(0, 20).forEach((source, index) => {
    sourcesText += `[${index + 1}] ${source.title}\n`;
    sourcesText += `${source.content.substring(0, 400)}...\n\n`;
  });
  
  const prompt = `Ты - эксперт по металлургии. Твоя задача - найти ТОЧНЫЙ аналог стали для конкретной страны.

ИСХОДНАЯ СТАЛЬ: ${sourceGrade}

ЦЕЛЕВАЯ СТРАНА: ${targetCountry}
ЦЕЛЕВОЙ СТАНДАРТ: ${targetStandard}

ДОСТУПНЫЕ ИСТОЧНИКИ ДАННЫХ:
${sourcesText}

ТВОЯ ЗАДАЧА:
Найти ОДИН аналог стали ${sourceGrade} для страны ${targetCountry} по стандарту ${targetStandard}.

КРИТИЧЕСКИ ВАЖНО:
✅ Ищи ТОЛЬКО аналог для ${targetCountry}
✅ Используй ТОЛЬКО реальные данные из источников
✅ Если для какого-то свойства нет данных - укажи null
✅ НЕ придумывай данные, НЕ копируй из исходной стали

ОБЯЗАТЕЛЬНЫЕ ДАННЫЕ:
1. Марка стали (grade) - по стандарту ${targetStandard}
2. Стандарт (standard) - точное название стандарта
3. Химический состав (chemical_composition) - все элементы из источников
4. Механические свойства (mechanical_properties):
   - yield_strength (предел текучести, МПа)
   - tensile_strength (предел прочности, МПа)
   - elongation (относительное удлинение, %)
   - impact_toughness (ударная вязкость, Дж/см²) - если есть в источниках

ФОРМАТ ОТВЕТА (строго JSON):
{
  "grade": "марка стали по стандарту ${targetStandard}",
  "standard": "точное название стандарта",
  "chemical_composition": {
    "C": "0.020",
    "Cr": "19.0-23.0",
    "Ni": "24.0-26.0",
    ...
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
  "popularity": "Высокая",
  "data_sources": ["source-1", "source-3"]
}

ВАЖНО: Ответ должен содержать ТОЛЬКО JSON, без дополнительного текста!`;

  return prompt;
}

/**
 * Фильтрует источники по релевантности для целевой страны
 */
function filterSourcesByCountry(searchData, targetCountry) {
  const keywords = {
    'Russia': ['GOST', 'ГОСТ', 'Russia', 'Russian', 'РФ', 'российск'],
    'China': ['GB', 'China', 'Chinese', 'Китай', 'китайск', '国标'],
    'USA': ['ASTM', 'AISI', 'UNS', 'USA', 'American', 'США', 'американск']
  };
  
  const countryKeywords = keywords[targetCountry] || [];
  const allSources = searchData.aggregated_data?.top_sources || [];
  
  // Сортируем источники по релевантности
  const scored = allSources.map(source => {
    let score = 0;
    const text = (source.title + ' ' + source.content).toLowerCase();
    
    countryKeywords.forEach(keyword => {
      const matches = (text.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
      score += matches * 10;
    });
    
    return { ...source, relevance_score: score };
  });
  
  // Возвращаем отсортированные по релевантности
  return scored
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .filter(s => s.relevance_score > 0 || scored.length < 10); // Берем релевантные или все если мало
}

/**
 * Выбирает лучший результат из нескольких вариантов
 */
function selectBest(variants, sourceGrade) {
  if (variants.length === 1) return variants[0];
  
  console.log(`\n🏆 Выбор лучшего из ${variants.length} вариантов:`);
  
  const scored = variants.map((variant, index) => {
    let score = 0;
    const mp = variant.mechanical_properties || {};
    
    // 1. Полнота механических свойств (40 баллов)
    if (mp.yield_strength && mp.yield_strength !== 'null' && mp.yield_strength !== '0') score += 10;
    if (mp.tensile_strength && mp.tensile_strength !== 'null' && mp.tensile_strength !== '0') score += 10;
    if (mp.elongation && mp.elongation !== 'null' && mp.elongation !== '0') score += 10;
    if (mp.impact_toughness && mp.impact_toughness !== 'null' && mp.impact_toughness !== '0') score += 10;
    
    // 2. Полнота химического состава (30 баллов)
    const composition = variant.chemical_composition || {};
    const elementsCount = Object.keys(composition).length;
    score += Math.min(elementsCount * 3, 30);
    
    // 3. Наличие стандарта (10 баллов)
    if (variant.standard && variant.standard !== 'null') score += 10;
    
    // 4. Наличие класса стали (10 баллов)
    if (variant.steel_class && variant.steel_class !== 'null') score += 10;
    
    // 5. Наличие источников данных (10 баллов)
    if (variant.data_sources && variant.data_sources.length > 0) {
      score += Math.min(variant.data_sources.length * 2, 10);
    }
    
    console.log(`  Вариант ${index + 1}: ${variant.grade} - ${score} баллов`);
    console.log(`    Свойства: yield=${mp.yield_strength}, tensile=${mp.tensile_strength}, elong=${mp.elongation}`);
    
    return { variant, score, index };
  });
  
  // Сортируем по баллам
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0];
  console.log(`  ✅ Выбран вариант ${best.index + 1}: ${best.variant.grade} (${best.score} баллов)`);
  
  return best.variant;
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Последовательный поиск аналогов
 */
async function execute(steelGrade, searchData, config) {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 ПОСЛЕДОВАТЕЛЬНЫЙ ПОИСК АНАЛОГОВ (Sequential Search)');
  console.log('='.repeat(60));
  
  const totalStartTime = Date.now();
  
  // ============================================
  // ФАЗА 1: Прямой поиск от исходной стали
  // ============================================
  console.log('\n📍 ФАЗА 1: Прямой поиск от исходной стали (параллельно)');
  console.log('─'.repeat(60));
  
  const phase1Start = Date.now();
  
  const [russia1, china1] = await Promise.all([
    findAnalog(steelGrade, 'Russia', searchData, config),
    findAnalog(steelGrade, 'China', searchData, config)
  ]);
  
  const phase1Duration = Date.now() - phase1Start;
  console.log(`\n✅ ФАЗА 1 завершена за ${(phase1Duration / 1000).toFixed(1)}с`);
  console.log(`   Russia: ${russia1.grade}`);
  console.log(`   China: ${china1.grade}`);
  
  // ============================================
  // ФАЗА 2: Перекрестный поиск между аналогами
  // ============================================
  console.log('\n🔀 ФАЗА 2: Перекрестная проверка между аналогами (параллельно)');
  console.log('─'.repeat(60));
  
  const phase2Start = Date.now();
  
  const [china2, russia2] = await Promise.all([
    findAnalog(russia1.grade, 'China', searchData, config),
    findAnalog(china1.grade, 'Russia', searchData, config)
  ]);
  
  const phase2Duration = Date.now() - phase2Start;
  console.log(`\n✅ ФАЗА 2 завершена за ${(phase2Duration / 1000).toFixed(1)}с`);
  console.log(`   China (через Russia): ${china2.grade}`);
  console.log(`   Russia (через China): ${russia2.grade}`);
  
  // ============================================
  // ФАЗА 3: Выбор лучшего результата
  // ============================================
  console.log('\n🏆 ФАЗА 3: Выбор лучших вариантов');
  console.log('─'.repeat(60));
  
  const bestRussia = selectBest([russia1, russia2], steelGrade);
  const bestChina = selectBest([china1, china2], steelGrade);
  
  const totalDuration = Date.now() - totalStartTime;
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ПОСЛЕДОВАТЕЛЬНЫЙ ПОИСК ЗАВЕРШЕН за ${(totalDuration / 1000).toFixed(1)}с`);
  console.log('='.repeat(60));
  console.log(`   USA: ${steelGrade}`);
  console.log(`   Russia: ${bestRussia.grade}`);
  console.log(`   China: ${bestChina.grade}`);
  console.log('='.repeat(60));
  
  // Формируем результат в стандартном формате
  return {
    analogs: {
      USA: {
        grade: steelGrade,
        standard: 'ASTM A240',
        chemical_composition: {},
        mechanical_properties: {},
        steel_class: 'Нержавеющая',
        carbon_equivalent: 0,
        weldability: 'Хорошая',
        popularity: 'Высокая'
      },
      Russia: bestRussia,
      China: bestChina
    },
    search_strategy: 'sequential_2phase',
    search_metadata: {
      total_duration_ms: totalDuration,
      phase1_duration_ms: phase1Duration,
      phase2_duration_ms: phase2Duration,
      variants_compared: {
        russia: 2,
        china: 2
      },
      timestamp: Date.now()
    }
  };
}

module.exports = {
  execute,
  findAnalog,
  selectBest
};

