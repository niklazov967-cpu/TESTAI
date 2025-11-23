/**
 * stage1_targeted_search.js
 * Целевой дополнительный поиск на основе результатов валидации
 */

const tavilyClient = require('../clients/tavilyClient');

/**
 * Генерация целевых поисковых запросов на основе пробелов в данных
 */
function generateTargetedQueries(steelGrade, validationResult, existingAnalogs) {
  const queries = [];
  const criteriaScores = validationResult.criteria_scores || {};
  const errors = validationResult.errors || [];
  const warnings = validationResult.warnings || [];
  
  console.log('[Целевой поиск] Анализ пробелов в данных...');
  
  // Анализируем каждый критерий валидации
  const weakCriteria = [];
  for (const [criterion, score] of Object.entries(criteriaScores)) {
    if (score < 85) {
      weakCriteria.push({ criterion, score });
      console.log(`  - ${criterion}: ${score}/100 (требует улучшения)`);
    }
  }
  
  // 1. МЕХАНИЧЕСКИЕ СВОЙСТВА (если балл < 85)
  if (criteriaScores.mechanical_properties < 85) {
    console.log('[Целевой поиск] Фокус: механические свойства');
    
    for (const [country, analog] of Object.entries(existingAnalogs)) {
      const grade = analog.grade;
      
      // Специфичные запросы для каждого аналога
      queries.push({
        query: `${grade} mechanical properties datasheet`,
        focus: 'mechanical_properties',
        country: country,
        grade: grade
      });
      
      queries.push({
        query: `${grade} предел текучести прочности`,
        focus: 'mechanical_properties',
        country: country,
        grade: grade
      });
      
      // Если это российская сталь - добавляем запрос по ГОСТ
      if (country === 'Russia' && analog.standard) {
        queries.push({
          query: `${grade} ${analog.standard} механические свойства таблица`,
          focus: 'mechanical_properties',
          country: country,
          grade: grade
        });
      }
    }
  }
  
  // 2. УДАРНАЯ ВЯЗКОСТЬ (если отсутствует или есть warnings)
  const impactToughnessIssues = errors.concat(warnings).some(msg => 
    msg.includes('ударная вязкость') || msg.includes('impact_toughness') || msg.includes('impact toughness')
  );
  
  if (impactToughnessIssues) {
    console.log('[Целевой поиск] Фокус: ударная вязкость');
    
    for (const [country, analog] of Object.entries(existingAnalogs)) {
      const grade = analog.grade;
      
      queries.push({
        query: `${grade} impact toughness`,
        focus: 'impact_toughness',
        country: country,
        grade: grade
      });
      
      queries.push({
        query: `${grade} ударная вязкость`,
        focus: 'impact_toughness',
        country: country,
        grade: grade
      });
    }
  }
  
  // 3. ХИМИЧЕСКИЙ СОСТАВ (если балл < 85)
  if (criteriaScores.chemical_composition < 85) {
    console.log('[Целевой поиск] Фокус: химический состав');
    
    for (const [country, analog] of Object.entries(existingAnalogs)) {
      const grade = analog.grade;
      
      queries.push({
        query: `${grade} chemical composition`,
        focus: 'chemical_composition',
        country: country,
        grade: grade
      });
      
      queries.push({
        query: `${grade} химический состав`,
        focus: 'chemical_composition',
        country: country,
        grade: grade
      });
    }
  }
  
  // 4. УГЛЕРОДНЫЙ ЭКВИВАЛЕНТ И СВАРИВАЕМОСТЬ
  if (criteriaScores.carbon_equivalent < 85 || criteriaScores.weldability < 85) {
    console.log('[Целевой поиск] Фокус: свариваемость');
    
    queries.push({
      query: `${steelGrade} weldability`,
      focus: 'weldability'
    });
    
    queries.push({
      query: `${steelGrade} свариваемость`,
      focus: 'weldability'
    });
  }
  
  // 5. ПОПУЛЯРНОСТЬ И ДОСТУПНОСТЬ
  if (criteriaScores.popularity < 85) {
    console.log('[Целевой поиск] Фокус: популярность и доступность');
    
    for (const [country, analog] of Object.entries(existingAnalogs)) {
      const grade = analog.grade;
      
      queries.push({
        query: `${grade} suppliers availability`,
        focus: 'popularity',
        country: country,
        grade: grade
      });
    }
  }
  
  console.log(`[Целевой поиск] Сгенерировано ${queries.length} целевых запросов`);
  return queries;
}

/**
 * Выполнение целевого поиска
 */
async function execute(steelGrade, validationResult, existingAnalogs, existingSourceUrls, config) {
  console.log('\n[Целевой поиск] Запуск дополнительного поиска для улучшения данных');
  
  // Генерируем целевые запросы
  const targetedQueries = generateTargetedQueries(steelGrade, validationResult, existingAnalogs);
  
  if (targetedQueries.length === 0) {
    console.log('[Целевой поиск] Нет критериев для улучшения');
    return { sources: [], queries_used: 0 };
  }
  
  // Ограничиваем количество запросов (чтобы не перегрузить)
  const maxQueries = config.targeted_search_max_queries || 8;
  const limitedQueries = targetedQueries.slice(0, maxQueries);
  
  console.log(`[Целевой поиск] Выполнение ${limitedQueries.length} запросов (из ${targetedQueries.length} возможных)`);
  
  // Выполняем поиск
  const allResults = [];
  const maxResultsPerQuery = config.targeted_search_results_per_query || 5;
  
  for (let i = 0; i < limitedQueries.length; i++) {
    const queryObj = limitedQueries[i];
    console.log(`[Целевой поиск] Запрос ${i + 1}/${limitedQueries.length}: ${queryObj.query.substring(0, 60)}...`);
    
    try {
      const results = await tavilyClient.search(queryObj.query, maxResultsPerQuery);
      
      // Добавляем метаданные о фокусе поиска
      results.forEach(result => {
        result.search_focus = queryObj.focus;
        result.target_country = queryObj.country;
        result.target_grade = queryObj.grade;
      });
      
      allResults.push(...results);
    } catch (error) {
      console.error(`[Целевой поиск] Ошибка запроса ${i + 1}:`, error.message);
    }
  }
  
  // Фильтруем дубликаты (источники, которые уже были в первом поиске)
  const existingUrlsSet = new Set(existingSourceUrls);
  const newSources = allResults.filter(result => !existingUrlsSet.has(result.url));
  
  console.log(`[Целевой поиск] Найдено ${allResults.length} результатов, из них ${newSources.length} новых`);
  
  // Группируем по фокусу
  const sourcesByFocus = {};
  newSources.forEach(source => {
    const focus = source.search_focus || 'general';
    if (!sourcesByFocus[focus]) {
      sourcesByFocus[focus] = [];
    }
    sourcesByFocus[focus].push(source);
  });
  
  console.log('[Целевой поиск] Распределение по категориям:');
  for (const [focus, sources] of Object.entries(sourcesByFocus)) {
    console.log(`  - ${focus}: ${sources.length} источников`);
  }
  
  return {
    sources: newSources,
    sources_by_focus: sourcesByFocus,
    queries_used: limitedQueries.length,
    total_queries_available: targetedQueries.length
  };
}

module.exports = { execute, generateTargetedQueries };
