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
   - КРИТИЧЕСКИ ВАЖНО: Титан (Ti) ОБЯЗАТЕЛЕН в химическом составе для ВСЕХ сталей!
   - Если в стали нет титана, ОБЯЗАТЕЛЬНО укажи "Ti": "0" или "Ti": "0.0"
   - Поле "Ti" должно присутствовать в JSON для КАЖДОГО аналога (USA, Russia, China)
   - Без поля "Ti" ответ будет считаться невалидным!
3. Укажи механические свойства:
   - yield_strength (предел текучести, МПа)
   - tensile_strength (предел прочности, МПа)
   - elongation (относительное удлинение, %)
   - impact_toughness (ударная вязкость, Дж/см²)
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
- КРИТИЧЕСКИ ВАЖНО: В каждом chemical_composition ДОЛЖНО быть поле "Ti"! Проверь это перед отправкой ответа!

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
        "impact_toughness": "120"
      }
    },
    "Russia": {
      "grade": "08Х18Н10",
      "standard": "ГОСТ 5632-2014",
      "chemical_composition": { ... },
      "mechanical_properties": { ... }
    },
    "China": {
      "grade": "0Cr18Ni9",
      "standard": "GB/T 1220-2007",
      "chemical_composition": { ... },
      "mechanical_properties": { ... }
    }
  },
  "iterations_used": 1
}`;

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
1. **Mechanical Properties (30%)** - Check if values are realistic and within ±15% tolerance
   - Verify yield strength, tensile strength, elongation, impact toughness
   - Cross-reference with known standards

2. **Chemical Composition (25%)** - Verify elements are within standard ranges
   - Check C, Cr, Ni, Mn, Si, Mo, V, Ti content
   - ВАЖНО: Поле "Ti" должно присутствовать в chemical_composition для всех аналогов
   - Если поле "Ti" отсутствует - добавь в errors, но НЕ снижай оценку, если сталь не требует титан
   - Для титаностабилизированных сталей (321, 08Х18Н10Т, 0Cr18Ni10Ti и т.д.):
     * Ti должен быть > 0 (обычно 0.4-0.8%)
     * Если Ti = 0 или отсутствует - это ОШИБКА, снизь chemical_composition score на 15-20 баллов
   - Для обычных сталей (304, 316, 08Х18Н10 и т.д.):
     * Ti может быть 0 - это нормально
     * Если Ti отсутствует, но значение должно быть 0 - это не ошибка, просто добавь в warnings
   - Verify ranges are realistic for the steel grade

3. **Carbon Equivalent (20%)** - Verify CE calculation and weldability assessment
   - Recalculate: CE = C + (Mn/6) + (Ni/20) + (Cr/10) + (Mo/50) + (V/10)
   - Check if CE matches weldability classification

4. **Steel Class (15%)** - Confirm all analogs belong to the same class
   - Austenitic, ferritic, martensitic, low/medium/high carbon
   - All three analogs must be in the same class

5. **Weldability (5%)** - Check if weldability matches CE value
   - CE ≤ 0.35: excellent
   - CE 0.36-0.45: good
   - CE 0.46-0.55: requires_preheat
   - CE > 0.55: difficult

6. **Popularity (3%)** - Verify if grades are real and commonly used
   - Check if steel grades actually exist in respective countries
   - Verify they are commonly available

7. **Impurities (2%)** - Check S and P content
   - S should be < 0.05%
   - P should be < 0.05%

FACT-CHECKING STEPS:
1. ПЕРВЫМ ДЕЛОМ: Определи, является ли входная сталь титаностабилизированной
   - Титаностабилизированные: 321, 08Х18Н10Т, 0Cr18Ni10Ti, 12Х18Н10Т и т.д. (содержат "Т" или "Ti" в названии)
   - Обычные: 304, 316, 08Х18Н10, 0Cr18Ni9 и т.д.
   
2. Проверь наличие поля "Ti" в chemical_composition для ВСЕХ аналогов (USA, Russia, China)
   - Если "Ti" отсутствует - добавь в errors, но НЕ снижай оценку автоматически
   - Если сталь титаностабилизированная И Ti = 0 или отсутствует - это ОШИБКА, снизь chemical_composition score
   - Если сталь обычная И Ti = 0 - это нормально, не снижай оценку
3. Cross-reference chemical composition with known standards
4. Verify mechanical properties are realistic for the steel class
5. Recalculate carbon equivalent for each analog (CE = C + Mn/6 + Ni/20 + Cr/10 + Mo/50 + V/10)
   - ВАЖНО: Для нержавеющих сталей CE обычно < 1.0, если CE > 2.0 - проверь расчет!
6. Check if steel grades actually exist in respective countries
7. Verify weldability classification matches CE value
8. Check for any obvious errors or inconsistencies

SCORING GUIDE:
- 100: Perfect match, no issues
- 90-99: Excellent match, minor differences (это ОТЛИЧНАЯ оценка!)
- 80-89: Good match, acceptable differences (это ХОРОШАЯ оценка, не низкая!)
- 70-79: Acceptable match, some concerns
- Below 70: Significant issues, needs revision

ВАЖНО: Оценка 85/100 - это ХОРОШАЯ оценка, не низкая! Не снижай оценку без серьезных причин.
Если подбор аналогов правильный и параметры соответствуют стандартам - давай высокую оценку (90+).

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

module.exports = {
  buildStage2Prompt,
  buildStage3Prompt
};

