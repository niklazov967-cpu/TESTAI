const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const searchEngine = require('./searchEngine');
const configManager = require('./config');
const cacheManager = require('./cacheManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes

// 1. Поиск аналогов (трёхэтапный процесс)
app.post('/api/search', async (req, res) => {
  try {
    const { steel_grade } = req.body;

    if (!steel_grade) {
      return res.status(400).json({
        status: 'error',
        message: 'steel_grade is required'
      });
    }

    console.log(`[API] Starting 3-stage search for: ${steel_grade}`);

    const config = configManager.getConfig();
    const result = await searchEngine.findSteelAnalogs(steel_grade, config);

    res.json(result);
  } catch (error) {
    console.error('[API] Search error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 2. Получить конфигурацию
app.get('/api/config', (req, res) => {
  const config = configManager.getConfig();
  res.json(config);
});

// 3. Обновить конфигурацию
app.post('/api/config', (req, res) => {
  try {
    configManager.updateConfig(req.body);
    res.json({
      status: 'success',
      message: 'Configuration updated'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 4. Очистить кэш
app.delete('/api/cache', (req, res) => {
  try {
    cacheManager.clear();
    res.json({
      status: 'success',
      message: 'Cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 5. Получить запись из кэша
app.get('/api/cache/:steel_grade', (req, res) => {
  const { steel_grade } = req.params;
  const cached = cacheManager.get(steel_grade);

  if (cached) {
    res.json({
      cached: true,
      data: cached
    });
  } else {
    res.json({
      cached: false,
      message: 'Not found in cache'
    });
  }
});

// 6. Получить промпты для просмотра
app.get('/api/prompts', (req, res) => {
  try {
    const promptBuilder = require('./promptBuilder');
    
    // Создаем пример данных для промптов
    const exampleSearchData = {
      sources_count: 45,
      aggregated_data: {
        top_sources: [
          { title: 'Пример источника', content: 'Пример содержимого...' }
        ]
      }
    };
    
    const exampleProcessedData = {
      analogs: {
        USA: { grade: 'AISI 304', chemical_composition: { C: '0.08', Ti: '0' } },
        Russia: { grade: '08Х18Н10', chemical_composition: { C: '0.08', Ti: '0' } },
        China: { grade: '0Cr18Ni9', chemical_composition: { C: '0.08', Ti: '0' } }
      }
    };
    
    const config = configManager.getConfig();
    
    const stage2Prompt = promptBuilder.buildStage2Prompt('AISI 304', exampleSearchData, config);
    const stage3Prompt = promptBuilder.buildStage3Prompt('AISI 304', exampleProcessedData, exampleSearchData, config);
    
    res.json({
      stage2: stage2Prompt,
      stage3: stage3Prompt
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
  console.log(`🔧 3-Stage Pipeline: Tavily → DeepSeek → OpenAI`);
});

