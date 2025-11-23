/**
 * STAGE 2: Улучшение через DeepSeek Reasoner с ОТДЕЛЬНЫМИ ПРОМПТАМИ
 * 
 * Используется в попытке 2 (эскалация).
 * Каждая марка улучшается ОТДЕЛЬНО на основе:
 * - Исходного результата первой попытки
 * - Отчета валидации (ошибки/предупреждения)
 * - Дополнительных источников из целевого поиска
 */

const deepseekClient = require('../clients/deepseekClient');
const promptBuilder = require('../promptBuilder');

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
  const allSources = searchData.sources || [];
  
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
 * Строит промпт для улучшения ОДНОЙ марки через Reasoner
 */
function buildSingleAnalogReasonerPrompt(
  sourceGrade,
  targetCountry,
  originalAnalog,
  validationReport,
  targetedSearchData,
  config
) {
  const standards = {
    'USA': 'ASTM, AISI, UNS, SAE',
    'Russia': 'ГОСТ (GOST)',
    'China': 'GB (国标)'
  };
  
  const targetStandard = standards[targetCountry] || 'International';
  
  // Фильтруем новые источники по стране
  const relevantSources = filterSourcesByCountry(targetedSearchData, targetCountry);
  
  // Формируем текст источников
  let sourcesText = '';
  relevantSources.slice(0, 20).forEach((source, index) => {
    sourcesText += `[Источник ${index + 1}] ${source.title}\n`;
    sourcesText += `${source.content.substring(0, 500)}...\n\n`;
  });
  
  // Извлекаем ошибки и предупреждения для этой марки
  const countryKey = targetCountry.toLowerCase();
  const errors = validationReport.errors.filter(e => 
    e.toLowerCase().includes(countryKey) || 
    e.toLowerCase().includes(originalAnalog.grade?.toLowerCase() || 'unknown')
  );
  const warnings = validationReport.warnings.filter(w => 
    w.toLowerCase().includes(countryKey) || 
    w.toLowerCase().includes(originalAnalog.grade?.toLowerCase() || 'unknown')
  );
  
  const prompt = `Ты - эксперт по металлургии. Твоя задача - УЛУЧШИТЬ данные для ОДНОЙ марки стали.

═══════════════════════════════════════════════════════════
КОНТЕКСТ
═══════════════════════════════════════════════════════════

ИСХОДНАЯ СТАЛЬ: ${sourceGrade}

ЦЕЛЕВАЯ СТРАНА: ${targetCountry}
ЦЕЛЕВОЙ СТАНДАРТ: ${targetStandard}

═══════════════════════════════════════════════════════════
ТЕКУЩИЕ ДАННЫЕ (ПЕРВАЯ ПОПЫТКА)
═══════════════════════════════════════════════════════════

Марка: ${originalAnalog.grade || 'не найдено'}
Стандарт: ${originalAnalog.standard || 'не указан'}

Химический состав:
${JSON.stringify(originalAnalog.chemical_composition, null, 2)}

Механические свойства:
${JSON.stringify(originalAnalog.mechanical_properties, null, 2)}

Класс: ${originalAnalog.steel_class || 'не указан'}
Свариваемость: ${originalAnalog.weldability || 'не указана'}

═══════════════════════════════════════════════════════════
ПРОБЛЕМЫ ВАЛИДАЦИИ
═══════════════════════════════════════════════════════════

❌ Ошибки (${errors.length}):
${errors.map(e => `- ${e}`).join('\n') || 'Нет ошибок'}

⚠️ Предупреждения (${warnings.length}):
${warnings.map(w => `- ${w}`).join('\n') || 'Нет предупреждений'}

═══════════════════════════════════════════════════════════
ДОПОЛНИТЕЛЬНЫЕ ИСТОЧНИКИ (${relevantSources.length})
═══════════════════════════════════════════════════════════

${sourcesText || 'Нет новых источников'}

═══════════════════════════════════════════════════════════
ТВОЯ ЗАДАЧА
═══════════════════════════════════════════════════════════

1. ИСПРАВЬ ВСЕ ОШИБКИ используя новые источники
2. ЗАПОЛНИ ПРОПУСКИ (null → реальные данные)
3. УТОЧНИ неточные данные (диапазоны → конкретные значения)
4. ПРОВЕРЬ что марка соответствует стандарту ${targetStandard}

КРИТИЧЕСКИ ВАЖНО:
⚠️ Ты работаешь ТОЛЬКО со страной ${targetCountry}!
⚠️ НЕ используй данные для других стран (USA, Russia, China)
⚠️ Используй ТОЛЬКО реальные данные из источников выше
⚠️ Если НЕТ данных в источниках - оставь null (НЕ придумывай!)
⚠️ НЕ копируй значения из других марок - ${targetCountry} = уникальная сталь!

МЕХАНИЧЕСКИЕ СВОЙСТВА:
✓ Ищи КОНКРЕТНЫЕ значения (не диапазоны!)
✓ Если диапазон (200-250 МПа) - бери среднее (225 МПа)
✓ Если минимум (≥200 МПа) - бери минимум + 10% (220 МПа)
✓ Если НЕТ данных - укажи null (НЕ 0!)

═══════════════════════════════════════════════════════════
ФОРМАТ ОТВЕТА
═══════════════════════════════════════════════════════════

СТРОГО JSON (без комментариев):
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
  "weldability": "Хорошая",
  "improvements_made": ["список улучшений"]
}

═══════════════════════════════════════════════════════════
⚠️ ПРОВЕРЬ ПЕРЕД ОТВЕТОМ
═══════════════════════════════════════════════════════════

1. ✓ Все ошибки исправлены?
2. ✓ Данные взяты из источников выше?
3. ✓ Механические свойства НЕ скопированы из других марок?
4. ✓ Если данных нет - указал null (а не 0)?
5. ✓ Марка соответствует стандарту ${targetStandard}?

ОТВЕТЬ ТОЛЬКО JSON:`;

  return prompt;
}

/**
 * Улучшение ОДНОГО аналога через DeepSeek Reasoner
 */
async function improveSingleAnalog(
  sourceGrade,
  targetCountry,
  originalAnalog,
  validationReport,
  targetedSearchData,
  config
) {
  console.log(`🧠 [${targetCountry}] Улучшение через DeepSeek Reasoner`);
  
  const startTime = Date.now();
  
  // Строим промпт для конкретной марки
  const prompt = buildSingleAnalogReasonerPrompt(
    sourceGrade,
    targetCountry,
    originalAnalog,
    validationReport,
    targetedSearchData,
    config
  );
  
  try {
    // Отправляем в DeepSeek Reasoner
    const improved = await deepseekClient.processData(prompt, 'deepseek-reasoner', config);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ [${targetCountry}] Улучшено: ${improved.grade} (${elapsed}с)`);
    
    if (improved.improvements_made && improved.improvements_made.length > 0) {
      console.log(`   Улучшений: ${improved.improvements_made.length}`);
      improved.improvements_made.slice(0, 3).forEach(imp => console.log(`     - ${imp}`));
    }
    
    return improved;
  } catch (error) {
    console.error(`❌ [${targetCountry}] Ошибка улучшения:`, error.message);
    
    // Возвращаем исходные данные
    console.log(`⚠️ [${targetCountry}] Используем исходные данные`);
    return originalAnalog;
  }
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Улучшение с отдельными промптами (Reasoner)
 */
async function execute(
  steelGrade,
  originalData,
  validationReport,
  targetedSearchData,
  config
) {
  console.log('\n============================================================');
  console.log('🧠 STAGE 2 (ESCALATION): DEEPSEEK REASONER');
  console.log('============================================================');
  console.log('Стратегия: ОТДЕЛЬНЫЕ ПРОМПТЫ для каждой марки');
  console.log('Принцип: Каждая марка улучшается НЕЗАВИСИМО');
  console.log('============================================================\n');
  
  const startTime = Date.now();
  
  // ПАРАЛЛЕЛЬНОЕ улучшение всех трех аналогов
  const [usaImproved, russiaImproved, chinaImproved] = await Promise.all([
    improveSingleAnalog(
      steelGrade,
      'USA',
      originalData.analogs.USA,
      validationReport,
      targetedSearchData,
      config
    ),
    improveSingleAnalog(
      steelGrade,
      'Russia',
      originalData.analogs.Russia,
      validationReport,
      targetedSearchData,
      config
    ),
    improveSingleAnalog(
      steelGrade,
      'China',
      originalData.analogs.China,
      validationReport,
      targetedSearchData,
      config
    )
  ]);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Формируем финальную структуру
  const result = {
    steel_grade: steelGrade,
    analogs: {
      USA: usaImproved,
      Russia: russiaImproved,
      China: chinaImproved
    },
    metadata: {
      search_strategy: 'reasoner_separate_prompts',
      model: 'deepseek-reasoner',
      search_time: elapsed,
      targeted_sources: targetedSearchData.sources?.length || 0
    },
    improvements_made: [
      ...(usaImproved.improvements_made || []),
      ...(russiaImproved.improvements_made || []),
      ...(chinaImproved.improvements_made || [])
    ]
  };
  
  console.log('\n============================================================');
  console.log(`✅ REASONER ЗАВЕРШЕН за ${elapsed}с`);
  console.log(`   USA: ${usaImproved.grade || 'не найдено'}`);
  console.log(`   Russia: ${russiaImproved.grade || 'не найдено'}`);
  console.log(`   China: ${chinaImproved.grade || 'не найдено'}`);
  console.log(`   Улучшений: ${result.improvements_made.length}`);
  console.log('============================================================\n');
  
  return result;
}

module.exports = { execute };

