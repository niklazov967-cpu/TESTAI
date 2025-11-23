const tavilyClient = require('../clients/tavilyClient');

/**
 * STAGE 1: Tavily Search
 * Множественные поисковые запросы для сбора данных
 */
async function execute(steelGrade, config) {
  console.log(`[Этап 1] Поиск для: ${steelGrade}`);

  // Генерация множественных запросов
  const queries = generateSearchQueries(steelGrade);
  
  console.log(`[Этап 1] Сгенерировано ${queries.length} поисковых запросов`);

  // Выполнение всех запросов с передачей конфигурации
  const searchResults = await tavilyClient.multiSearch(queries, config);

  // Агрегация результатов
  const aggregatedData = aggregateResults(searchResults);

  console.log(`[Этап 1] Агрегировано ${aggregatedData.sources_count} уникальных источников`);

  return {
    steel_grade: steelGrade,
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
 * Генерация множественных поисковых запросов
 * Стратегия: 60% английские запросы, 40% русские запросы
 */
function generateSearchQueries(steelGrade) {
  return [
    // Английские запросы (международные стандарты, документация)
    `${steelGrade} steel properties chemical composition mechanical properties`,
    `${steelGrade} equivalent USA AISI ASTM`,
    `${steelGrade} equivalent Russia GOST ГОСТ`,
    `${steelGrade} equivalent China GB`,
    `${steelGrade} chemical composition C Cr Ni Mn Ti`,
    `${steelGrade} mechanical properties yield strength tensile strength`,
    `${steelGrade} carbon equivalent weldability`,
    
    // Русские запросы (ГОСТ, российские источники, форумы)
    `${steelGrade} сталь химический состав механические свойства`,
    `${steelGrade} аналог ГОСТ марка стали таблица`,
    `${steelGrade} предел текучести прочность ударная вязкость`,
    `${steelGrade} углеродный эквивалент свариваемость ГОСТ`,
    `${steelGrade} российский аналог ГОСТ AISI GB сравнение`,
    
    // Дополнительные запросы (общие)
    `${steelGrade} standard specification datasheet`,
    `${steelGrade} steel grade comparison table`
  ];
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

