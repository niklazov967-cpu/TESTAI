const tavilyClient = require('../clients/tavilyClient');

/**
 * STAGE 1: Tavily Search для стандартов
 * Множественные поисковые запросы для сбора данных о стандартах
 */
async function execute(standardCode, standardType, config) {
  console.log(`[Этап 1] Поиск для стандарта: ${standardCode} (тип: ${standardType || 'general'})`);

  // Генерация множественных запросов
  const queries = generateSearchQueries(standardCode, standardType, config);
  
  console.log(`[Этап 1] Сгенерировано ${queries.length} поисковых запросов`);

  // Выполнение всех запросов
  const searchResults = await tavilyClient.multiSearch(queries, {
    tavily_max_results: config.search_settings.max_results_per_query || 5
  });

  // Агрегация результатов
  const aggregatedData = aggregateResults(searchResults);

  console.log(`[Этап 1] Агрегировано ${aggregatedData.sources_count} уникальных источников`);

  return {
    standard_code: standardCode,
    standard_type: standardType || 'general',
    queries_executed: queries.length,
    search_results: searchResults,
    aggregated_data: aggregatedData,
    sources_count: aggregatedData.sources_count,
    total_results: aggregatedData.total_results,
    total_results_from_queries: aggregatedData.total_results_from_queries,
    successful_queries: aggregatedData.successful_queries,
    duplicates_removed: aggregatedData.duplicates_removed
  };
}

/**
 * Генерация множественных поисковых запросов для стандартов
 */
function generateSearchQueries(standardCode, standardType, config) {
  const queriesCount = config.search_settings.tavily_queries_count || 9;
  
  // Базовые запросы
  const baseQueries = [
    `${standardCode} standard specification technical requirements scope application`,
    `${standardCode} equivalent Russia GOST ГОСТ ТУ standard comparison`,
    `${standardCode} equivalent China GB standard comparison`,
    `${standardCode} equivalent Europe EN DIN ISO standard comparison`,
    `${standardCode} technical parameters pressure temperature dimensions materials metric`,
    `${standardCode} standards comparison table cross-reference ГОСТ GB EN`,
    `${standardCode} dimensions DN PN compatibility metric system`,
    `${standardCode} materials steel grades GOST GB EN comparison`,
    `${standardCode} datasheet technical documentation PDF specification`
  ];

  // Дополнительные запросы (если нужно больше 9)
  const additionalQueries = [
    `${standardCode} testing methods inspection requirements NDT`,
    `${standardCode} manufacturing process fabrication requirements`,
    `${standardCode} safety factors design margins pressure vessels`,
    `${standardCode} certification approval regulatory compliance`,
    `${standardCode} case studies applications industry usage`,
    `${standardCode} supplier availability lead time cost`
  ];

  // Объединяем запросы
  const allQueries = [...baseQueries];
  if (queriesCount > 9) {
    allQueries.push(...additionalQueries.slice(0, queriesCount - 9));
  }

  return allQueries.slice(0, queriesCount);
}

/**
 * Агрегация результатов поиска
 */
function aggregateResults(searchResults) {
  const allResults = [];
  const uniqueUrls = new Set();
  let totalResultsFromQueries = 0;
  let successfulQueries = 0;

  for (const queryResult of searchResults) {
    if (queryResult.success) {
      successfulQueries++;
      const resultsCount = queryResult.results.length;
      totalResultsFromQueries += resultsCount;
      
      for (const result of queryResult.results) {
        if (!uniqueUrls.has(result.url)) {
          uniqueUrls.add(result.url);
          allResults.push({
            query: queryResult.query,
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score
          });
        }
      }
    }
  }

  // Сортировка по релевантности
  allResults.sort((a, b) => b.score - a.score);

  return {
    sources_count: allResults.length,
    total_results: allResults.length,
    total_results_from_queries: totalResultsFromQueries,
    successful_queries: successfulQueries,
    duplicates_removed: totalResultsFromQueries - allResults.length,
    top_sources: allResults.slice(0, 10),
    all_sources: allResults
  };
}

module.exports = {
  execute
};

