const tavilyClient = require('../clients/tavilyClient');

/**
 * STAGE 1: Tavily Search
 * Множественные поисковые запросы для сбора данных
 */
async function execute(steelGrade, config) {
  console.log(`[Stage 1] Searching for: ${steelGrade}`);

  // Генерация множественных запросов
  const queries = generateSearchQueries(steelGrade);
  
  console.log(`[Stage 1] Generated ${queries.length} search queries`);

  // Выполнение всех запросов
  const searchResults = await tavilyClient.multiSearch(queries);

  // Агрегация результатов
  const aggregatedData = aggregateResults(searchResults);

  console.log(`[Stage 1] Aggregated ${aggregatedData.sources_count} unique sources`);

  return {
    steel_grade: steelGrade,
    queries_executed: queries.length,
    search_results: searchResults,
    aggregated_data: aggregatedData,
    sources_count: aggregatedData.sources_count,
    total_results: aggregatedData.total_results
  };
}

/**
 * Генерация множественных поисковых запросов
 */
function generateSearchQueries(steelGrade) {
  return [
    // Основной запрос
    `${steelGrade} steel properties chemical composition mechanical properties`,
    
    // Запросы по аналогам
    `${steelGrade} equivalent USA AISI ASTM`,
    `${steelGrade} equivalent Russia GOST ГОСТ`,
    `${steelGrade} equivalent China GB`,
    
    // Запросы по параметрам
    `${steelGrade} chemical composition C Cr Ni Mn`,
    `${steelGrade} mechanical properties yield strength tensile strength`,
    `${steelGrade} carbon equivalent weldability`,
    
    // Запросы по стандартам
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

  for (const queryResult of searchResults) {
    if (queryResult.success) {
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
    top_sources: allResults.slice(0, 10),
    all_sources: allResults
  };
}

module.exports = {
  execute
};

