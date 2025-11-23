/**
 * promptBuilder.js - Построитель промптов для всех этапов
 */

/**
 * Построение промпта для Stage 2 (DeepSeek Processing)
 */
function buildStage2Prompt(steelGrade, searchData, config) {
  // Извлечение топ-источников
  const topSources = searchData.aggregated_data.top_sources || [];
  const sourcesText = topSources
    .map((source, index) => `[${index + 1}] ${source.title}\n${source.content.substring(0, 300)}...`)
    .join('\n\n');

  const prompt = `Ты - эксперт по металлургии и подбору аналогов сталей.

ЗАДАЧА: Проанализируй данные поиска и найди эквивалентные марки стали для трёх стран: США, Россия, Китай.

ВХОДНАЯ СТАЛЬ: ${steelGrade}

ДАННЫЕ ПОИСКА (из Tavily, ${searchData.sources_count} источников):
${sourcesText}

ТРЕБОВАНИЯ:
1. Для каждой страны найди наиболее подходящий аналог
2. Укажи полный химический состав (C, Mn, Si, Cr, Ni, Mo, V, Ti, P, S, Fe)
   - Если элемент отсутствует в стали, укажи "0" или "0.0"

3. КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К МЕХАНИЧЕСКИМ СВОЙСТВАМ:

⚠️ ИСПОЛЬЗУЙ ТОЛЬКО РЕАЛЬНЫЕ ДАННЫЕ ИЗ ИСТОЧНИКОВ!

Для КАЖДОГО аналога (USA, Russia, China) ищи механические свойства ОТДЕЛЬНО:

   a) **yield_strength** (предел текучести, МПа):
      - Ищи КОНКРЕТНОЕ значение для ЭТОЙ марки стали в источниках
      - Если НЕ найдено в источниках - укажи null
      - НЕ копируй значение от других аналогов
      - НЕ выдумывай "типичные" значения

   b) **tensile_strength** (предел прочности, МПа):
      - Ищи КОНКРЕТНОЕ значение для ЭТОЙ марки стали в источниках
      - Если НЕ найдено в источниках - укажи null
      - НЕ копируй значение от других аналогов
      - НЕ выдумывай "типичные" значения

   c) **elongation** (относительное удлинение, %):
      - Ищи КОНКРЕТНОЕ значение для ЭТОЙ марки стали в источниках
      - Если НЕ найдено в источниках - укажи null
      - НЕ копируй значение от других аналогов
      - НЕ выдумывай "типичные" значения

   d) **impact_toughness** (ударная вязкость, Дж):
      - Ищи КОНКРЕТНОЕ значение для ЭТОЙ марки стали в источниках
      - Если НЕ найдено в источниках - укажи null (это допустимо)
      - НЕ копируй значение от других аналогов
      - Для нержавеющих сталей (304, 316, 904L и т.д.) этот параметр часто не указывается - это нормально
      - Для углеродистых сталей старайся найти значение, но если нет данных - укажи null

   ⛔ СТРОГО ЗАПРЕЩЕНО:
   - Копировать одинаковые механические свойства для разных аналогов
   - Выдумывать "типичные" значения если нет реальных данных в источниках
   - Использовать значения одного аналога для другого
   - Указывать "0" вместо null когда данных нет

   ✅ ПРАВИЛЬНО:
   - Каждый аналог имеет СВОИ уникальные механические свойства (или null если нет данных)
   - Если для какого-то аналога нет данных - указать null для этого свойства
   - Использовать только данные из источников поиска
   - Разные аналоги ДОЛЖНЫ иметь разные значения (если они есть в источниках)

4. Укажи стандарт (AISI/ASTM для США, ГОСТ для России, GB для Китая)

ПРИОРИТЕТЫ (по важности):
1. Механические свойства (30%) - должны быть близки (±15%)
2. Химический состав (25%) - основные элементы близки (±20%)
3. Класс стали (15%) - должен совпадать (аустенитная, ферритная и т.д.)

ВАЖНО:
- Если входная сталь из США, то для США укажи ту же марку
- Если входная сталь из России, то для России укажи ту же марку
- Если входная сталь из Китая, то для Китая укажи ту же марку
- Для остальных стран найди реальные аналоги
- Все значения должны быть числовыми или диапазонами (например, "18.0-20.0")
- Если нет данных для механического свойства - используй null, а НЕ "0" или выдуманное значение

ФОРМАТ ОТВЕТА (строго JSON):
{
  "analogs": {
    "USA": {
      "grade": "AISI 304",
      "standard": "AISI",
      "chemical_composition": {
        "C": "0.08",
        "Cr": "18.0-20.0",
        "Ni": "8.0-10.5",
        "Mn": "2.0",
        "Si": "1.0",
        "P": "0.045",
        "S": "0.030",
        "Mo": "0",
        "V": "0",
        "Ti": "0",
        "Fe": "balance"
      },
      "mechanical_properties": {
        "yield_strength": "205",
        "tensile_strength": "515",
        "elongation": "40",
        "impact_toughness": null
      }
    },
    "Russia": {
      "grade": "08Х18Н10",
      "standard": "ГОСТ 5632-2014",
      "chemical_composition": { ... },
      "mechanical_properties": {
        "yield_strength": "196",
        "tensile_strength": "530",
        "elongation": "40",
        "impact_toughness": null
      }
    },
    "China": {
      "grade": "0Cr18Ni9",
      "standard": "GB/T 1220-2007",
      "chemical_composition": { ... },
      "mechanical_properties": {
        "yield_strength": "205",
        "tensile_strength": "520",
        "elongation": "40",
        "impact_toughness": null
      }
    }
  },
  "iterations_used": 1
}

ОБРАТИ ВНИМАНИЕ: В примере выше каждый аналог имеет РАЗНЫЕ значения механических свойств (205/196/205 для yield_strength, 515/530/520 для tensile_strength), даже если различия небольшие. Это правильно, потому что разные марки стали имеют разные свойства!`;

  return prompt;
}

/**
 * Построение промпта для Stage 3 (OpenAI Validation)
 */
function buildStage3Prompt(steelGrade, processedData, searchData, config) {
  const analogsText = JSON.stringify(processedData.analogs, null, 2);
  
  const topSources = searchData.aggregated_data.top_sources || [];
  const sourcesText = topSources
    .slice(0, 5)
    .map((source, index) => `[${index + 1}] ${source.title}: ${source.content.substring(0, 200)}...`)
    .join('\n');

  const prompt = `You are an expert metallurgist specializing in steel grades validation and fact-checking.

TASK: Validate the accuracy of the following steel analog data through comprehensive fact-checking.

INPUT STEEL: ${steelGrade}

PROPOSED ANALOGS:
${analogsText}

ORIGINAL SEARCH DATA (for cross-reference, top 5 sources):
${sourcesText}

VALIDATION CRITERIA (with weights):
1. **Mechanical Properties (30%)** - Check if values are realistic and properly sourced
   - ⚠️ IMPORTANT: null values are ACCEPTABLE if no data was found in sources
   - If a property is null, do NOT penalize - this is honest reporting of missing data
   - If values are present, check if they are realistic for the steel grade
   - If ALL three analogs have IDENTICAL mechanical properties - this is SUSPICIOUS and should be flagged
   - Yield strength MUST be < tensile strength (if both are present)
   - Cross-reference with known standards when values are present

2. **Chemical Composition (25%)** - Verify elements are within standard ranges
   - Check C, Cr, Ni, Mn, Si, Mo, V, Ti content
   - Для титаностабилизированных сталей (например, 321, 08Х18Н10Т) Ti должен быть > 0
   - Если элемент отсутствует, значение должно быть "0" или "0.0"
   - Verify ranges are realistic for the steel grade

3. **Carbon Equivalent (20%)** - Verify CE calculation and weldability assessment
   - Recalculate: CE = C + (Mn/6) + (Ni/20) + (Cr/10) + (Mo/50) + (V/10)
   - ВАЖНО: Формула CE применима ТОЛЬКО для углеродистых и низколегированных сталей!
   - Для нержавеющих сталей формула CE дает завышенные значения и НЕ должна использоваться для оценки свариваемости

4. **Steel Class (15%)** - Confirm all analogs belong to the same class
   - Austenitic, ferritic, martensitic, low/medium/high carbon
   - All three analogs must be in the same class

5. **Weldability (5%)** - Check if weldability matches steel class and CE value
   - ВАЖНО: Для нержавеющих сталей свариваемость оценивается по классу, а НЕ по CE!
   - Аустенитные нержавеющие стали: отличная свариваемость (excellent) независимо от CE
   - Ферритные и мартенситные нержавеющие стали: хорошая свариваемость (good)
   - Для углеродистых сталей используй CE:
     * CE ≤ 0.35: excellent
     * CE 0.36-0.45: good
     * CE 0.46-0.55: requires_preheat
     * CE > 0.55: difficult

6. **Popularity (3%)** - Verify if grades are real and commonly used
   - Check if steel grades actually exist in respective countries
   - Verify they are commonly available

7. **Impurities (2%)** - Check S and P content
   - S should be < 0.05%
   - P should be < 0.05%

FACT-CHECKING STEPS:
1. Cross-reference chemical composition with known standards
2. Verify mechanical properties are realistic for the steel class (if present)
3. Check if all three analogs have identical mechanical properties - if yes, FLAG THIS as suspicious
4. Accept null values for mechanical properties - this is honest reporting of missing data
5. Recalculate carbon equivalent for each analog (но помни: для нержавеющих сталей CE не используется для оценки свариваемости!)
6. Check if steel grades actually exist in respective countries
7. Verify weldability classification:
   - Для нержавеющих сталей: проверь, что свариваемость соответствует классу стали (аустенитные = excellent)
   - Для углеродистых сталей: проверь, что свариваемость соответствует CE значению
8. Check for any obvious errors or inconsistencies

SCORING GUIDE:
- 100: Perfect match, no issues
- 90-99: Excellent match, minor differences or some null values
- 80-89: Good match, acceptable differences or multiple null values
- 70-79: Acceptable match, some concerns or many null values
- Below 70: Significant issues, needs revision

⚠️ CRITICAL: If all three analogs have IDENTICAL mechanical properties (same yield_strength, tensile_strength, elongation), this indicates data was copied rather than sourced individually. Score mechanical_properties as 0 and add critical error.

OUTPUT FORMAT (strict JSON):
{
  "overall_score": 95.3,
  "criteria_scores": {
    "mechanical_properties": 98,
    "chemical_composition": 95,
    "carbon_equivalent": 100,
    "steel_class": 100,
    "weldability": 100,
    "popularity": 100,
    "impurities": 85
  },
  "errors": [
    "Critical error description (if any)"
  ],
  "warnings": [
    "Warning description (if any)"
  ],
  "recommendations": [
    "All analogs have excellent weldability (CE ≤ 0.35)",
    "No preheat required for welding",
    "All grades are widely available with high popularity"
  ]
}`;

  return prompt;
}

const fs = require('fs').promises;
const path = require('path');

/**
 * Загрузка блока промпта для стандартов
 */
async function loadPromptBlock(blockName) {
  const filePath = path.join(__dirname, '../prompts/standards_blocks', `${blockName}.txt`);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`[PromptBuilder] Error loading prompt block ${blockName}:`, error.message);
    return '';
  }
}

/**
 * Сборка промпта Stage 2 для стандартов из активных блоков
 */
async function buildStandardsStage2Prompt(searchResults, standardCode, standardType, config) {
  let prompt = '';

  // Базовый системный промпт (всегда включен)
  prompt += await loadPromptBlock('base_system_prompt');
  prompt += '\n\n---\n\n';

  // Добавляем активные блоки
  const blocks = config?.prompt_blocks?.stage2_deepseek || {};

  if (blocks.block_methodology) {
    prompt += await loadPromptBlock('block_methodology');
    prompt += '\n\n';
  }

  if (blocks.block_technical_comparison) {
    prompt += await loadPromptBlock('block_technical_comparison');
    prompt += '\n\n';
  }

  if (blocks.block_compatibility_check) {
    prompt += await loadPromptBlock('block_compatibility_check');
    prompt += '\n\n';
  }

  if (blocks.block_material_crossref) {
    prompt += await loadPromptBlock('block_material_crossref');
    prompt += '\n\n';
  }

  if (blocks.block_safety_analysis) {
    prompt += await loadPromptBlock('block_safety_analysis');
    prompt += '\n\n';
  }

  if (blocks.block_economic_eval) {
    prompt += await loadPromptBlock('block_economic_eval');
    prompt += '\n\n';
  }

  // Добавляем формат вывода
  prompt += '\n\n---\n\nOUTPUT FORMAT: JSON\n\n';
  prompt += 'Provide your analysis in structured JSON format with all required fields.';

  // Замена переменных
  prompt = prompt.replace(/{standardCode}/g, standardCode);
  prompt = prompt.replace(/{standardType}/g, standardType || 'general');
  prompt = prompt.replace(/{searchResults}/g, JSON.stringify(searchResults, null, 2));

  return prompt;
}

/**
 * Сборка промпта Stage 3 для стандартов из активных блоков
 */
async function buildStandardsStage3Prompt(equivalents, standardCode, config) {
  let prompt = '';

  // Базовый промпт валидации (всегда включен)
  prompt += await loadPromptBlock('validation_base');
  prompt += '\n\n---\n\n';

  // Добавляем активные блоки валидации
  const blocks = config.prompt_blocks.stage3_openai;
  const weights = config.validation_settings.criteria_weights;

  if (blocks.validation_technical) {
    let block = await loadPromptBlock('validation_technical');
    block = block.replace(/{weight}/g, weights.technical_accuracy);
    prompt += block + '\n\n';
  }

  if (blocks.validation_dimensional) {
    let block = await loadPromptBlock('validation_dimensional');
    block = block.replace(/{weight}/g, weights.dimensional_compatibility);
    prompt += block + '\n\n';
  }

  if (blocks.validation_material) {
    let block = await loadPromptBlock('validation_material');
    block = block.replace(/{weight}/g, weights.material_equivalence);
    prompt += block + '\n\n';
  }

  if (blocks.validation_safety) {
    let block = await loadPromptBlock('validation_safety');
    block = block.replace(/{weight}/g, weights.safety_considerations);
    prompt += block + '\n\n';
  }

  if (blocks.validation_practical) {
    let block = await loadPromptBlock('validation_practical');
    block = block.replace(/{weight}/g, weights.practical_applicability);
    prompt += block + '\n\n';
  }

  // Добавляем инструкции по строгости
  const strictnessInstructions = {
    'relaxed': 'Be lenient in your validation. Accept equivalents with minor discrepancies.',
    'normal': 'Apply standard validation criteria. Flag significant issues.',
    'strict': 'Be strict in your validation. Flag even minor discrepancies.',
    'very_strict': 'Be very strict. Only accept near-perfect equivalents. Flag any concerns.'
  };

  prompt += '\n\n---\n\nVALIDATION STRICTNESS: ' + config.validation_settings.strictness.toUpperCase() + '\n';
  prompt += strictnessInstructions[config.validation_settings.strictness] || strictnessInstructions['normal'];
  prompt += '\n\n';

  // Добавляем минимальный балл
  prompt += `MINIMUM ACCEPTABLE SCORE: ${config.validation_settings.min_overall_score}/100\n\n`;

  // Добавляем формат вывода
  prompt += '---\n\nOUTPUT FORMAT: JSON\n\n';
  prompt += 'Provide your validation in structured JSON format with all scores and assessments.';

  // Замена переменных
  prompt = prompt.replace(/{standardCode}/g, standardCode);
  prompt = prompt.replace(/{equivalents}/g, JSON.stringify(equivalents, null, 2));

  return prompt;
}


/**
 * Построение промпта для DeepSeek Reasoner с целевыми данными
 */
function buildStage2ReasonerPrompt(steelGrade, originalResult, validationResult, targetedSearchData, config) {
  // Группируем новые источники по фокусу
  const sourcesByFocus = targetedSearchData.sources_by_focus || {};
  
  let sourcesText = '';
  for (const [focus, sources] of Object.entries(sourcesByFocus)) {
    sourcesText += `\n### ЦЕЛЕВЫЕ ДАННЫЕ: ${focus.toUpperCase()}\n`;
    sources.slice(0, 5).forEach((source, index) => {
      sourcesText += `[${focus}-${index + 1}] ${source.title}\n`;
      sourcesText += `${source.content.substring(0, 300)}...\n\n`;
    });
  }
  
  const criteriaScores = validationResult.criteria_scores || {};
  const weakCriteria = Object.entries(criteriaScores)
    .filter(([_, score]) => score < 85)
    .map(([criterion, score]) => `- ${criterion}: ${score}/100`)
    .join('\n');
  
  const prompt = `Ты - эксперт по металлургии. Тебе нужно УЛУЧШИТЬ существующий результат поиска аналогов стали.

ВХОДНАЯ СТАЛЬ: ${steelGrade}

ТЕКУЩИЙ РЕЗУЛЬТАТ (требует улучшения):
${JSON.stringify(originalResult.analogs, null, 2)}

ПРОБЛЕМЫ ВАЛИДАЦИИ (балл: ${validationResult.overall_score}/100):
${weakCriteria}

ОШИБКИ:
${validationResult.errors.map(e => `- ${e}`).join('\n')}

ПРЕДУПРЕЖДЕНИЯ:
${validationResult.warnings.map(w => `- ${w}`).join('\n')}

ДОПОЛНИТЕЛЬНЫЕ ЦЕЛЕВЫЕ ДАННЫЕ (новый поиск):
${sourcesText}

ТВОЯ ЗАДАЧА:
1. Проанализируй ТЕКУЩИЙ результат и НОВЫЕ целевые данные
2. ИСПРАВЬ ошибки и заполни пробелы, используя новые источники
3. Сохрани корректные данные из текущего результата
4. Улучши слабые критерии (балл < 85)

КРИТИЧЕСКИ ВАЖНО:
⚠️ Используй ТОЛЬКО реальные данные из источников!
⚠️ Если для какого-то свойства нет данных - укажи null
⚠️ НЕ копируй одинаковые значения между аналогами
⚠️ Каждый аналог должен иметь СВОИ уникальные механические свойства

ПРИОРИТЕТЫ УЛУЧШЕНИЯ:
${Object.entries(criteriaScores)
  .filter(([_, score]) => score < 85)
  .sort((a, b) => a[1] - b[1])
  .map(([criterion, score]) => `${criterion} (текущий балл: ${score}/100)`)
  .join(' → ')}

ФОРМАТ ОТВЕТА (строго JSON):
{
  "analogs": {
    "USA": { 
      "grade": "...",
      "standard": "...",
      "chemical_composition": { ... },
      "mechanical_properties": { ... }
    },
    "Russia": { ... },
    "China": { ... }
  },
  "improvements_made": [
    "Добавлены механические свойства для 03Х20Н16АГ6 из ГОСТ 5632-2014",
    "Уточнен химический состав 022Cr19Ni13Mo4"
  ],
  "data_sources_used": [
    "mechanical_properties-1",
    "chemical_composition-2"
  ]
}`;

  return prompt;
}
module.exports = {
  buildStage2ReasonerPrompt,
  buildStage2Prompt,
  buildStage3Prompt,
  buildStandardsStage2Prompt,
  buildStandardsStage3Prompt,
  loadPromptBlock
};
