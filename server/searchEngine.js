const cacheManager = require('./cacheManager');
const stage1Search = require('./stages/stage1_search');
const stage2Process = require('./stages/stage2_process');
const stage3Validate = require('./stages/stage3_validate');
const translator = require('./translator');

/**
 * Главная функция поиска аналогов (3-этапный конвейер)
 * @param {string} steelGrade - Марка стали
 * @param {object} config - Конфигурация
 * @param {function} progressCallback - Функция для отправки обновлений прогресса (опционально)
 */
async function findSteelAnalogs(steelGrade, config, progressCallback = null) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Запуск 3-этапного конвейера поиска для: ${steelGrade}`);
    console.log(`${'='.repeat(60)}\n`);

  // Функция для отправки событий
  const sendProgress = (event, data) => {
    if (progressCallback) {
      progressCallback(event, data);
    }
  };

  // Проверка кэша
  if (config.cache_enabled) {
    const cached = cacheManager.get(steelGrade);
    if (cached) {
      console.log('✅ Найдено в кэше, возвращаем закэшированный результат');
      sendProgress('cached', { cached: true });
      return {
        ...cached,
        cached: true
      };
    }
  }

  try {
    // ========================================
    // ЭТАП 1: Tavily Search (Поиск данных)
    // ========================================
    console.log('\n📡 ЭТАП 1: Поиск через Tavily');
    console.log('─'.repeat(60));
    
    sendProgress('stage1_start', { 
      stage: 1, 
      message: 'Запуск поиска данных через Tavily...',
      timestamp: Date.now()
    });
    
    const searchData = await stage1Search.execute(steelGrade, config);
    
    console.log(`✅ Этап 1 завершен: найдено ${searchData.sources_count} источников`);
    console.log(`   - Выполнено поисковых запросов: ${searchData.queries_executed}`);
    console.log(`   - Всего результатов: ${searchData.total_results}`);
    
    sendProgress('stage1_complete', {
      stage: 1,
      message: 'Поиск данных завершен',
      sources_count: searchData.sources_count,
      queries_executed: searchData.queries_executed,
      timestamp: Date.now()
    });

    // ========================================
    // ЭТАП 2: DeepSeek Processing (Обработка)
    // ========================================
    console.log('\n🤖 ЭТАП 2: Обработка через DeepSeek');
    console.log('─'.repeat(60));
    
    sendProgress('stage2_start', {
      stage: 2,
      message: 'Обработка данных через DeepSeek...',
      timestamp: Date.now()
    });
    
    const processedData = await stage2Process.execute(steelGrade, searchData, config);
    
    console.log(`✅ Этап 2 завершен: аналоги найдены`);
    console.log(`   - США: ${processedData.analogs.USA.grade}`);
    console.log(`   - Россия: ${processedData.analogs.Russia.grade}`);
    console.log(`   - Китай: ${processedData.analogs.China.grade}`);
    
    sendProgress('stage2_complete', {
      stage: 2,
      message: 'Обработка данных завершена',
      iterations: processedData.iterations_used || 1,
      analogs: {
        USA: processedData.analogs.USA.grade,
        Russia: processedData.analogs.Russia.grade,
        China: processedData.analogs.China.grade
      },
      timestamp: Date.now()
    });

    // ========================================
    // ЭТАП 3: OpenAI Validation (Валидация)
    // ========================================
    console.log('\n✅ ЭТАП 3: Валидация через OpenAI');
    console.log('─'.repeat(60));
    
    sendProgress('stage3_start', {
      stage: 3,
      message: 'Валидация результатов через OpenAI...',
      timestamp: Date.now()
    });
    
    const validatedData = await stage3Validate.execute(steelGrade, processedData, searchData, config);
    
    console.log(`✅ Этап 3 завершен: оценка валидации ${validatedData.validation.overall_score}/100`);
    console.log(`   - Валидация пройдена: ${validatedData.validation.passed}`);
    console.log(`   - Ошибки: ${validatedData.validation.errors.length}`);
    console.log(`   - Предупреждения: ${validatedData.validation.warnings.length}`);
    
    sendProgress('stage3_complete', {
      stage: 3,
      message: 'Валидация завершена',
      score: validatedData.validation.overall_score,
      passed: validatedData.validation.passed,
      timestamp: Date.now()
    });

    // Финальный результат
    let finalResult = {
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

    // Перевод всех текстов на русский язык
    console.log('\n🌐 Перевод результатов на русский язык...');
    sendProgress('translation_start', {
      message: 'Перевод результатов на русский язык...',
      timestamp: Date.now()
    });
    
    try {
      // Переводим валидацию
      finalResult.validation = await translator.translateValidation(finalResult.validation);
      
      // Переводим классы стали, свариваемость, популярность
      for (const country of ['USA', 'Russia', 'China']) {
        if (finalResult.analogs[country]) {
          const analog = finalResult.analogs[country];
          if (analog.steel_class && !translator.isRussian(analog.steel_class)) {
            analog.steel_class = await translator.translateToRussian(analog.steel_class);
          }
          if (analog.weldability && !translator.isRussian(analog.weldability)) {
            analog.weldability = await translator.translateToRussian(analog.weldability);
          }
          if (analog.popularity && !translator.isRussian(analog.popularity)) {
            analog.popularity = await translator.translateToRussian(analog.popularity);
          }
        }
      }
      console.log('✅ Перевод завершен');
      sendProgress('translation_complete', {
        message: 'Перевод завершен',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('⚠️ Ошибка перевода (продолжаем без перевода):', error.message);
      sendProgress('translation_error', {
        message: 'Ошибка перевода (продолжаем без перевода)',
        timestamp: Date.now()
      });
    }

    // Сохранение в кэш
    if (config.cache_enabled && validatedData.validation.passed) {
      cacheManager.save(steelGrade, finalResult);
      console.log('\n💾 Результат сохранен в кэш');
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 3-этапный конвейер завершен`);
    console.log(`${'='.repeat(60)}\n`);

    return finalResult;

  } catch (error) {
    console.error('\n❌ Ошибка конвейера:', error);
    throw error;
  }
}

module.exports = {
  findSteelAnalogs
};

