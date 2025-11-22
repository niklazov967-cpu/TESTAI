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
        console.log('✅ Найдено в кэше, проверяем перевод...');
      sendProgress('cached', { cached: true });
      
      // Проверяем, нужно ли перевести данные из кэша
      const needsTranslation = checkIfNeedsTranslation(cached);
      if (needsTranslation) {
        console.log('🌐 Обнаружен английский текст в кэше, переводим...');
        sendProgress('translation_start', {
          stage: 4,
          message: 'Перевод данных из кэша...',
          timestamp: Date.now()
        });
        
        try {
          let textsTranslated = 0;
          
          // Переводим валидацию (все поля, включая errors, warnings, recommendations)
          if (cached.validation) {
            const errorsCount = cached.validation.errors?.length || 0;
            const warningsCount = cached.validation.warnings?.length || 0;
            const recommendationsCount = cached.validation.recommendations?.length || 0;
            
            cached.validation = await translator.translateValidation(cached.validation);
            textsTranslated += errorsCount + warningsCount + recommendationsCount;
          }
          
          // Переводим классы стали, свариваемость, популярность
          for (const country of ['USA', 'Russia', 'China']) {
            if (cached.analogs && cached.analogs[country]) {
              const analog = cached.analogs[country];
              if (analog.steel_class && !translator.isRussian(analog.steel_class)) {
                analog.steel_class = await translator.translateToRussian(analog.steel_class);
                textsTranslated++;
              }
              if (analog.weldability && !translator.isRussian(analog.weldability)) {
                analog.weldability = await translator.translateToRussian(analog.weldability);
                textsTranslated++;
              }
              if (analog.popularity && !translator.isRussian(analog.popularity)) {
                analog.popularity = await translator.translateToRussian(analog.popularity);
                textsTranslated++;
              }
            }
          }
          
          // Проверяем, что перевод успешен перед сохранением
          const translationSuccessful = checkTranslationSuccess(cached);
          if (translationSuccessful) {
            // Сохраняем переведенную версию обратно в кэш
            cacheManager.save(steelGrade, cached);
            console.log(`✅ Перевод данных из кэша завершен (переведено ${textsTranslated} текстов)`);
            sendProgress('translation_complete', {
              stage: 4,
              message: 'Перевод завершен',
              texts_translated: textsTranslated,
              timestamp: Date.now()
            });
          } else {
            console.warn('⚠️ Перевод данных из кэша не завершен полностью');
          }
        } catch (error) {
          console.error('⚠️ Ошибка перевода данных из кэша:', error.message);
          sendProgress('translation_error', {
            stage: 4,
            message: 'Ошибка перевода данных из кэша',
            timestamp: Date.now()
          });
        }
      }
      
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
      total_results: searchData.total_results,
      total_results_from_queries: searchData.total_results_from_queries || searchData.sources_count,
      successful_queries: searchData.successful_queries || searchData.queries_executed,
      duplicates_removed: searchData.duplicates_removed || 0,
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

    // ========================================
    // ЭТАП 4: Перевод на русский язык
    // ========================================
    console.log('\n🌐 ЭТАП 4: Перевод результатов на русский язык');
    console.log('─'.repeat(60));
    
    sendProgress('translation_start', {
      stage: 4,
      message: 'Перевод результатов на русский язык...',
      timestamp: Date.now()
    });
    
    let textsTranslated = 0;
    try {
      // Переводим валидацию
      if (finalResult.validation) {
        const errorsCount = finalResult.validation.errors?.length || 0;
        const warningsCount = finalResult.validation.warnings?.length || 0;
        const recommendationsCount = finalResult.validation.recommendations?.length || 0;
        
        finalResult.validation = await translator.translateValidation(finalResult.validation);
        textsTranslated += errorsCount + warningsCount + recommendationsCount;
      }
      
      // Переводим классы стали, свариваемость, популярность
      for (const country of ['USA', 'Russia', 'China']) {
        if (finalResult.analogs[country]) {
          const analog = finalResult.analogs[country];
          if (analog.steel_class && !translator.isRussian(analog.steel_class)) {
            analog.steel_class = await translator.translateToRussian(analog.steel_class);
            textsTranslated++;
          }
          if (analog.weldability && !translator.isRussian(analog.weldability)) {
            analog.weldability = await translator.translateToRussian(analog.weldability);
            textsTranslated++;
          }
          if (analog.popularity && !translator.isRussian(analog.popularity)) {
            analog.popularity = await translator.translateToRussian(analog.popularity);
            textsTranslated++;
          }
        }
      }
      
      console.log(`✅ Этап 4 завершен: переведено ${textsTranslated} текстов`);
      sendProgress('translation_complete', {
        stage: 4,
        message: 'Перевод завершен',
        texts_translated: textsTranslated,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('⚠️ Ошибка перевода (продолжаем без перевода):', error.message);
      sendProgress('translation_error', {
        stage: 4,
        message: 'Ошибка перевода (продолжаем без перевода)',
        timestamp: Date.now()
      });
    }

    // Сохранение в кэш только после успешного перевода
    if (config.cache_enabled && validatedData.validation.passed) {
      // Проверяем, что перевод выполнен успешно
      const translationSuccessful = checkTranslationSuccess(finalResult);
      if (translationSuccessful) {
        cacheManager.save(steelGrade, finalResult);
        console.log('\n💾 Результат сохранен в кэш (с переводом)');
      } else {
        console.warn('\n⚠️ Перевод не завершен, результат не сохранен в кэш');
      }
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

/**
 * Проверяет, нужно ли перевести данные (есть ли английский текст)
 */
function checkIfNeedsTranslation(data) {
  if (!data) return false;
  
  // Проверяем валидацию
  if (data.validation) {
    const checkArray = (arr) => {
      if (!Array.isArray(arr)) return false;
      return arr.some(item => typeof item === 'string' && !translator.isRussian(item));
    };
    
    if (checkArray(data.validation.errors) || 
        checkArray(data.validation.warnings) || 
        checkArray(data.validation.recommendations)) {
      return true;
    }
  }
  
  // Проверяем аналоги
  if (data.analogs) {
    for (const country of ['USA', 'Russia', 'China']) {
      const analog = data.analogs[country];
      if (analog) {
        if (analog.steel_class && !translator.isRussian(analog.steel_class)) return true;
        if (analog.weldability && !translator.isRussian(analog.weldability)) return true;
        if (analog.popularity && !translator.isRussian(analog.popularity)) return true;
      }
    }
  }
  
  return false;
}

/**
 * Проверяет, успешно ли выполнен перевод
 */
function checkTranslationSuccess(data) {
  if (!data) return false;
  
  // Проверяем валидацию
  if (data.validation) {
    const checkArray = (arr) => {
      if (!Array.isArray(arr)) return true; // Если массива нет, считаем успешным
      return !arr.some(item => typeof item === 'string' && !translator.isRussian(item));
    };
    
    if (!checkArray(data.validation.errors) || 
        !checkArray(data.validation.warnings) || 
        !checkArray(data.validation.recommendations)) {
      return false;
    }
  }
  
  // Проверяем аналоги
  if (data.analogs) {
    for (const country of ['USA', 'Russia', 'China']) {
      const analog = data.analogs[country];
      if (analog) {
        if (analog.steel_class && !translator.isRussian(analog.steel_class)) return false;
        if (analog.weldability && !translator.isRussian(analog.weldability)) return false;
        if (analog.popularity && !translator.isRussian(analog.popularity)) return false;
      }
    }
  }
  
  return true;
}

module.exports = {
  findSteelAnalogs
};

