const openaiClient = require('../clients/openaiClient');
const promptBuilder = require('../promptBuilder');

/**
 * Парсинг значения с учетом диапазонов
 * Например: "490" -> 490, "490-540" -> 515 (среднее)
 */
function parseValue(valueStr) {
  if (!valueStr) return NaN;
  
  const str = valueStr.toString().trim();
  
  // Проверка на диапазон (например, "490-900")
  if (str.includes('-') && !str.startsWith('-')) {
    const parts = str.split('-').map(p => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      // Возвращаем среднее значение диапазона
      return (parts[0] + parts[1]) / 2;
    }
  }
  
  // Обычное значение
  return parseFloat(str);
}

/**
 * Валидация механических свойств на критические ошибки
 * Проверяет на нулевые значения, отсутствующие данные, нереалистичные значения
 */
function validateMechanicalProperties(processedData) {
  const errors = [];
  const warnings = [];
  
  if (!processedData || !processedData.analogs) {
    return { valid: false, errors: ['Отсутствуют данные аналогов'], warnings: [] };
  }
  
  // Диапазоны для типичных сталей (МПа, %, Дж)
  const validRanges = {
    yield_strength: { min: 150, max: 2500, name: 'предел текучести' },
    tensile_strength: { min: 300, max: 3000, name: 'предел прочности' },
    elongation: { min: 1, max: 80, name: 'относительное удлинение' },
    impact_toughness: { min: 10, max: 400, name: 'ударная вязкость' }
  };
  
  for (const country of ['USA', 'Russia', 'China']) {
    const analog = processedData.analogs[country];
    
    if (!analog || !analog.mechanical_properties) {
      errors.push(`[${country}] Отсутствуют механические свойства`);
      continue;
    }
    
    const props = analog.mechanical_properties;
    const grade = analog.grade || 'Unknown';
    
    // Проверка каждого свойства
    for (const [prop, range] of Object.entries(validRanges)) {
      const value = parseValue(props[prop]);  // Используем parseValue вместо parseFloat
      
      // Критическая ошибка: значение равно 0 или отсутствует
      if (!props[prop] || value === 0 || isNaN(value)) {
        
        // Специальная обработка для impact_toughness - может отсутствовать для нержавеющих сталей
        if (prop === 'impact_toughness') {
          const steelClass = analog.steel_class || '';
          const isStainless = 
            steelClass.toLowerCase().includes('аустенитн') || 
            steelClass.toLowerCase().includes('austenitic') ||
            steelClass.toLowerCase().includes('нержавеющ') ||
            grade.includes('904') || 
            grade.includes('316') || 
            grade.includes('304') ||
            grade.includes('18Н') ||
            grade.includes('Cr') ||
            grade.includes('Х');
          
          if (isStainless) {
            // Для нержавеющих сталей это допустимо - только предупреждение
            warnings.push(
              `[${country} - ${grade}] ${range.name} (${prop}) отсутствует. ` +
              `Для нержавеющих сталей это допустимо (типичное значение: 40-200 Дж).`
            );
            continue;
          }
        }
        
        // Для всех остальных свойств и для углеродистых сталей - это ошибка
        errors.push(
          `[${country} - ${grade}] ${range.name} (${prop}) равно 0 или отсутствует. ` +
          `Для стали ${grade} ожидается значение в диапазоне ${range.min}-${range.max}.`
        );
        continue;
      }
      
      // Предупреждение: значение вне типичного диапазона
      if (value < range.min || value > range.max) {
        warnings.push(
          `[${country} - ${grade}] ${range.name} (${prop}) = ${value} выходит за типичный диапазон ` +
          `${range.min}-${range.max}. Проверьте корректность данных.`
        );
      }
    }
    
    // Проверка соотношения yield_strength < tensile_strength
    const yieldStrength = parseValue(props.yield_strength);
    const tensileStrength = parseValue(props.tensile_strength);
    
    if (!isNaN(yieldStrength) && !isNaN(tensileStrength)) {
      if (yieldStrength >= tensileStrength) {
        errors.push(
          `[${country} - ${grade}] Предел текучести (${yieldStrength}) должен быть меньше ` +
          `предела прочности (${tensileStrength})`
        );
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Гарантирует наличие титана (Ti) во всех аналогах
 */
function ensureTitaniumPresence(processedData) {
  if (!processedData || !processedData.analogs) return;
  
  for (const country of ['USA', 'Russia', 'China']) {
    if (processedData.analogs[country] && processedData.analogs[country].chemical_composition) {
      const comp = processedData.analogs[country].chemical_composition;
      if (comp.Ti === undefined || comp.Ti === null || comp.Ti === '') {
        console.warn(`[Stage 3] CRITICAL: Missing Ti in ${country} analog. Adding Ti=0`);
        comp.Ti = '0';
      }
      console.log(`[Stage 3] ${country} (${processedData.analogs[country].grade}): Ti = ${comp.Ti}`);
    }
  }
}

/**
 * STAGE 3: OpenAI Validation
 * Фактчекинг и валидация результатов
 */
async function execute(steelGrade, processedData, searchData, config) {
  console.log(`[Этап 3] Валидация результатов для: ${steelGrade}`);

  // КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся, что Ti присутствует во всех аналогах
  ensureTitaniumPresence(processedData);

  // PRE-VALIDATION: Проверка механических свойств ПЕРЕД отправкой в OpenAI
  const preValidation = validateMechanicalProperties(processedData);
  
  if (!preValidation.valid) {
    console.error(`[Этап 3] ❌ Pre-validation failed для ${steelGrade}:`);
    preValidation.errors.forEach(err => console.error(`  - ${err}`));
    
    // Возвращаем результат с критическими ошибками, НЕ сохраняя в кэш
    return {
      analogs: processedData.analogs,
      validation: {
        passed: false,
        overall_score: 0,
        criteria_scores: {
          mechanical_properties: 0,
          chemical_composition: 0,
          carbon_equivalent: 0,
          steel_class: 0,
          weldability: 0,
          popularity: 0,
          impurities: 0
        },
        errors: preValidation.errors,
        warnings: preValidation.warnings,
        recommendations: [
          'Stage 2 (DeepSeek) вернул некорректные механические свойства.',
          'Данные НЕ будут сохранены в кэш.',
          'Рекомендуется повторить поиск или проверить исходные данные.'
        ],
        checks_performed: 8
      },
      iterations_used: processedData.iterations_used || 1
    };
  }
  
  // Если есть предупреждения, логируем их
  if (preValidation.warnings.length > 0) {
    console.warn(`[Этап 3] ⚠️ Pre-validation warnings для ${steelGrade}:`);
    preValidation.warnings.forEach(warn => console.warn(`  - ${warn}`));
  }

  // Построение промпта валидации
  const prompt = promptBuilder.buildStage3Prompt(steelGrade, processedData, searchData, config);

  // Валидация через OpenAI
  const validationResult = await openaiClient.validate(prompt, {
    model: config.openai_model || 'gpt-4o-mini',
    temperature: config.openai_temperature || 0.3
  });

  // Объединение результатов с pre-validation warnings
  const finalResult = {
    analogs: processedData.analogs,
    validation: {
      passed: validationResult.overall_score >= 70,
      overall_score: validationResult.overall_score,
      criteria_scores: validationResult.criteria_scores,
      errors: validationResult.errors || [],
      warnings: [
        ...preValidation.warnings,
        ...(validationResult.warnings || [])
      ],
      recommendations: validationResult.recommendations || [],
      checks_performed: 8
    },
    iterations_used: processedData.iterations_used || 1
  };

  console.log(`[Этап 3] Валидация завершена: ${validationResult.overall_score}/100`);

  return finalResult;
}

module.exports = {
  execute
};

