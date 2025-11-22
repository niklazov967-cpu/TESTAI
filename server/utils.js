/**
 * utils.js - Утилиты для расчетов и классификации
 */

/**
 * Расчет углеродного эквивалента (CE)
 * Формула: CE = C + (Mn/6) + (Ni/20) + (Cr/10) + (Mo/50) + (V/10)
 */
function calculateCE(composition) {
  const parseElement = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Обработка диапазонов типа "18.0-20.0"
      if (value.includes('-')) {
        const [min, max] = value.split('-').map(v => parseFloat(v.trim()));
        return (min + max) / 2;
      }
      return parseFloat(value) || 0;
    }
    return 0;
  };

  const C = parseElement(composition.C);
  const Mn = parseElement(composition.Mn);
  const Ni = parseElement(composition.Ni);
  const Cr = parseElement(composition.Cr);
  const Mo = parseElement(composition.Mo);
  const V = parseElement(composition.V);

  const CE = C + (Mn / 6) + (Ni / 20) + (Cr / 10) + (Mo / 50) + (V / 10);
  
  return parseFloat(CE.toFixed(3));
}

/**
 * Оценка свариваемости на основе CE
 */
function assessWeldability(CE) {
  if (CE <= 0.35) return 'excellent';
  if (CE <= 0.45) return 'good';
  if (CE <= 0.55) return 'requires_preheat';
  return 'difficult';
}

/**
 * Классификация стали по химическому составу
 */
function classifySteelGrade(composition) {
  const parseElement = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.includes('-')) {
        const [min, max] = value.split('-').map(v => parseFloat(v.trim()));
        return (min + max) / 2;
      }
      return parseFloat(value) || 0;
    }
    return 0;
  };

  const Cr = parseElement(composition.Cr);
  const Ni = parseElement(composition.Ni);
  const C = parseElement(composition.C);

  // Нержавеющие стали (Cr >= 10.5%)
  if (Cr >= 10.5) {
    // Аустенитные (Cr 16-26%, Ni 6-22%, C <= 0.08%)
    if (Ni >= 6 && Ni <= 22 && Cr >= 16 && Cr <= 26 && C <= 0.08) {
      return 'austenitic_stainless';
    }
    // Мартенситные (Cr 11.5-18%, Ni < 2.5%, C 0.15-1.2%)
    if (Ni < 2.5 && Cr >= 11.5 && Cr <= 18 && C >= 0.15) {
      return 'martensitic_stainless';
    }
    // Ферритные (Cr 10.5-18%, Ni < 1%, C <= 0.12%)
    if (Ni < 1 && Cr >= 10.5 && Cr <= 18 && C <= 0.12) {
      return 'ferritic_stainless';
    }
    return 'stainless_other';
  }

  // Углеродистые стали (Cr < 10.5%)
  if (C <= 0.25) return 'low_carbon_steel';
  if (C <= 0.6) return 'medium_carbon_steel';
  if (C <= 1.4) return 'high_carbon_steel';

  return 'tool_steel';
}

/**
 * Оценка популярности марки в стране
 */
function assessPopularity(grade, country) {
  const POPULAR_GRADES = {
    USA: {
      high: [
        'A36', 'A572 Gr.50', 'A572 Grade 50', 'A514',
        '1018', '1020', '1045', '4140', '4340',
        '304', '304L', '316', '316L', '410', '420', '17-4PH'
      ],
      medium: [
        'A588', 'A633', 'A709',
        '1095', '4130', '8620',
        '430', '440C', '15-5PH'
      ]
    },
    Russia: {
      high: [
        'Ст3', 'Ст3сп', 'Ст3пс', '09Г2С', '09Г2', '10ХСНД',
        '20', '35', '40', '45', '40Х', '40ХН', '30ХГСА', '38ХА',
        '08Х18Н10', '08Х18Н10Т', '12Х18Н10Т', '03Х17Н14М2', '08Х17Н13М2'
      ],
      medium: [
        '15ХСНД', '16ГС',
        '30', '50', '30ХМА', '35ХМ',
        '14Х17Н2', '20Х13', '30Х13', '40Х13'
      ]
    },
    China: {
      high: [
        'Q235', 'Q235B', 'Q345', 'Q345B', 'Q390', 'Q420',
        '20#', '35#', '45#', '40Cr', '42CrMo',
        '304', '316', '316L', '0Cr18Ni9', '0Cr17Ni12Mo2'
      ],
      medium: [
        'Q460', 'Q500', 'Q550',
        '50#', '35CrMo', '30CrMnSi',
        '430', '410', '420'
      ]
    }
  };

  const countryGrades = POPULAR_GRADES[country];
  if (!countryGrades) return 'unknown';

  const gradeUpper = grade.toUpperCase().trim();

  // Проверка точного совпадения или частичного
  for (const popularGrade of countryGrades.high) {
    if (gradeUpper === popularGrade.toUpperCase() || 
        gradeUpper.includes(popularGrade.toUpperCase()) ||
        popularGrade.toUpperCase().includes(gradeUpper)) {
      return 'high';
    }
  }

  for (const popularGrade of countryGrades.medium) {
    if (gradeUpper === popularGrade.toUpperCase() || 
        gradeUpper.includes(popularGrade.toUpperCase()) ||
        popularGrade.toUpperCase().includes(gradeUpper)) {
      return 'medium';
    }
  }

  return 'low';
}

/**
 * Форматирование названия класса стали
 */
function formatSteelClass(steelClass) {
  const names = {
    austenitic_stainless: 'Аустенитная нержавеющая',
    ferritic_stainless: 'Ферритная нержавеющая',
    martensitic_stainless: 'Мартенситная нержавеющая',
    low_carbon_steel: 'Низкоуглеродистая',
    medium_carbon_steel: 'Среднеуглеродистая',
    high_carbon_steel: 'Высокоуглеродистая',
    tool_steel: 'Инструментальная',
    stainless_other: 'Нержавеющая (другая)'
  };
  return names[steelClass] || steelClass;
}

/**
 * Форматирование свариваемости
 */
function formatWeldability(weldability) {
  const names = {
    excellent: 'Отличная',
    good: 'Хорошая',
    requires_preheat: 'Требуется подогрев',
    difficult: 'Сложная'
  };
  return names[weldability] || weldability;
}

/**
 * Форматирование популярности
 */
function formatPopularity(popularity) {
  const names = {
    high: 'Высокая',
    medium: 'Средняя',
    low: 'Низкая',
    unknown: 'Неизвестно'
  };
  return names[popularity] || popularity;
}

module.exports = {
  calculateCE,
  assessWeldability,
  classifySteelGrade,
  assessPopularity,
  formatSteelClass,
  formatWeldability,
  formatPopularity
};

