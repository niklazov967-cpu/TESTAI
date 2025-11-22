const cacheManager = require('./cacheManager');
const stage1Search = require('./stages/stage1_search');
const stage2Process = require('./stages/stage2_process');
const stage3Validate = require('./stages/stage3_validate');

/**
 * Главная функция поиска аналогов (3-этапный конвейер)
 */
async function findSteelAnalogs(steelGrade, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 Starting 3-Stage Search Pipeline for: ${steelGrade}`);
  console.log(`${'='.repeat(60)}\n`);

  // Проверка кэша
  if (config.cache_enabled) {
    const cached = cacheManager.get(steelGrade);
    if (cached) {
      console.log('✅ Found in cache, returning cached result');
      return {
        ...cached,
        cached: true
      };
    }
  }

  try {
    // ========================================
    // STAGE 1: Tavily Search (Поиск данных)
    // ========================================
    console.log('\n📡 STAGE 1: Tavily Search');
    console.log('─'.repeat(60));
    
    const searchData = await stage1Search.execute(steelGrade, config);
    
    console.log(`✅ Stage 1 complete: ${searchData.sources_count} sources found`);
    console.log(`   - Search queries executed: ${searchData.queries_executed}`);
    console.log(`   - Total results: ${searchData.total_results}`);

    // ========================================
    // STAGE 2: DeepSeek Processing (Обработка)
    // ========================================
    console.log('\n🤖 STAGE 2: DeepSeek Processing');
    console.log('─'.repeat(60));
    
    const processedData = await stage2Process.execute(steelGrade, searchData, config);
    
    console.log(`✅ Stage 2 complete: Analogs found`);
    console.log(`   - USA: ${processedData.analogs.USA.grade}`);
    console.log(`   - Russia: ${processedData.analogs.Russia.grade}`);
    console.log(`   - China: ${processedData.analogs.China.grade}`);

    // ========================================
    // STAGE 3: OpenAI Validation (Валидация)
    // ========================================
    console.log('\n✅ STAGE 3: OpenAI Validation');
    console.log('─'.repeat(60));
    
    const validatedData = await stage3Validate.execute(steelGrade, processedData, searchData, config);
    
    console.log(`✅ Stage 3 complete: Validation score ${validatedData.validation.overall_score}/100`);
    console.log(`   - Validation passed: ${validatedData.validation.passed}`);
    console.log(`   - Errors: ${validatedData.validation.errors.length}`);
    console.log(`   - Warnings: ${validatedData.validation.warnings.length}`);

    // Финальный результат
    const finalResult = {
      status: validatedData.validation.passed ? 'success' : 'partial_success',
      steel_input: steelGrade,
      analogs: validatedData.analogs,
      validation: validatedData.validation,
      pipeline: {
        stage1_sources: searchData.sources_count,
        stage2_iterations: processedData.iterations_used || 1,
        stage3_checks: validatedData.validation.checks_performed || 8
      },
      cached: false,
      timestamp: new Date().toISOString()
    };

    // Сохранение в кэш
    if (config.cache_enabled && validatedData.validation.passed) {
      cacheManager.save(steelGrade, finalResult);
      console.log('\n💾 Result saved to cache');
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 3-Stage Pipeline Complete`);
    console.log(`${'='.repeat(60)}\n`);

    return finalResult;

  } catch (error) {
    console.error('\n❌ Pipeline error:', error);
    throw error;
  }
}

module.exports = {
  findSteelAnalogs
};

