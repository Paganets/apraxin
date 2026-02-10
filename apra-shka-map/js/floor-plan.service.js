/**
 * FLOOR-PLAN.SERVICE.JS
 * Управление интерактивными планами этажей для всех корпусов
 * 
 * Поддерживает:
 * - Масштабируемость на все корпусы (33, A, B, C, D, и т.д.)
 * - Canvas overlay для точной привязки павильонов
 * - Подсвечивание павильонов на плане
 * - Offline кэширование планов (PWA)
 */

(function() {
  'use strict';

  // ================================================================
  // КОНФИГУРАЦИЯ ПЛАНОВ ПО КОРПУСАМ
  // ================================================================
  // Структура: { building: { floor: { imagePath, pavilionsLayout } } }
  const FLOOR_PLANS_CONFIG = {
    '33': {
      1: {
        image: '/images/floor-plans/building_33_floor_1.png',
        // Примеры координат павильонов (в процентах от ширины/высоты изображения)
        // Эти данные используются для подсвечивания и поиска павильонов
        pavilionsApprox: {
          // '1.10': { x: 50, y: 45, w: 8, h: 8 },  // 1.10 в центре
          // '1.12': { x: 30, y: 45, w: 8, h: 8 },  // 1.12 слева
          // и т.д.
        }
      },
      2: {
        image: '/images/floor-plans/building_33_floor_2.png',
        pavilionsApprox: {}
      },
      3: {
        image: '/images/floor-plans/building_33_floor_3.png',
        pavilionsApprox: {}
      },
      4: {
        image: '/images/floor-plans/building_33_floor_4.png',
        pavilionsApprox: {}
      },
      5: {
        image: '/images/floor-plans/building_33_floor_5.png',
        pavilionsApprox: {}
      }
    },
    // Для других корпусов (A, B, C, D) можно добавить аналогично
    'A': {
      1: { image: '/images/floor-plans/building_a_floor_1.png', pavilionsApprox: {} },
      2: { image: '/images/floor-plans/building_a_floor_2.png', pavilionsApprox: {} }
    }
    // и т.д.
  };

  // Состояние интерактивного плана
  let floorPlanState = {
    currentBuilding: null,
    currentFloor: null,
    imageElement: null,
    canvasElement: null,
    canvasCtx: null,
    selectedPavilion: null,  // номер павильона, который выделен на плане
    pavilionsList: []        // список всех павильонов для текущего пользователя
  };

  // ================================================================
  // ИНИЦИАЛИЗАЦИЯ ПЛАНА ЭТАЖА
  // ================================================================

  /**
   * Инициализирует интерактивный план для конкретного корпуса и этажа
   * @param {string} building - Код корпуса (33, A, B, C, D)
   * @param {number} floor - Номер этажа (1-5)
   * @param {Array} pavilions - Список павильонов для подсвечивания
   */
  window.FloorPlan = {
    init: initFloorPlan,
    loadPlan: loadFloorPlan,
    highlightPavilion: highlightPavilionOnPlan,
    updatePavilionsList: updatePavilionsList,
    getCoordinates: getSelectedCoordinates,
    getPavilionAtPoint: findPavilionAtPoint
  };

  function initFloorPlan(building, floor, pavilions = []) {
    console.log(`🗺️ FloorPlan: Инициализация плана ${building} / этаж ${floor}`);
    
    floorPlanState.currentBuilding = building;
    floorPlanState.currentFloor = floor;
    floorPlanState.pavilionsList = pavilions || [];

    // Получаем ссылки на элементы
    const imgEl = document.getElementById('floor-plan-image');
    const canvas = document.getElementById('floor-plan-canvas');

    if (!imgEl || !canvas) {
      console.warn('FloorPlan: Элементы плана не найдены в DOM');
      return false;
    }

    floorPlanState.imageElement = imgEl;
    floorPlanState.canvasElement = canvas;
    floorPlanState.canvasCtx = canvas.getContext('2d');

    // Загружаем изображение плана
    loadFloorPlan(building, floor);

    return true;
  }

  function loadFloorPlan(building, floor) {
    const config = FLOOR_PLANS_CONFIG[building]?.[floor];
    
    if (!config) {
      console.warn(`FloorPlan: План для ${building}/${floor} не найден в конфигурации`);
      hideFloorPlanContainer();
      return;
    }

    const imgEl = floorPlanState.imageElement;
    const canvas = floorPlanState.canvasElement;

    if (!imgEl || !canvas) {
      console.warn('FloorPlan: Элементы не инициализированы');
      return;
    }

    // Скрываем canvas до загрузки изображения
    canvas.style.display = 'none';
    imgEl.style.display = 'none';

    // Загружаем изображение
    imgEl.onload = function() {
      console.log(`✅ FloorPlan: Изображение загружено ${config.image}`);
      
      // Показываем изображение
      imgEl.style.display = 'block';

      // Инициализируем canvas с размерами изображения
      nextFrame(() => {
        setupCanvasOverlay(canvas, imgEl);
      });
    };

    imgEl.onerror = function() {
      console.error(`❌ FloorPlan: Ошибка загрузки ${config.image}`);
      hideFloorPlanContainer();
    };

    // Запускаем загрузку
    imgEl.src = config.image;
  }

  /**
   * Настраивает canvas overlay точному размеру изображения
   */
  function setupCanvasOverlay(canvas, img) {
    const rect = img.getBoundingClientRect();
    const parent = img.parentElement;
    
    // Берём размеры от контейнера или от изображения
    const width = img.offsetWidth || rect.width;
    const height = img.offsetHeight || rect.height;

    // Устанавливаем размер canvas
    canvas.width = width;
    canvas.height = height;

    // Позиционируем точно над изображением
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.cursor = 'crosshair';
    canvas.style.display = 'block';

    // Подключаем обработчик кликов
    canvas.onclick = handleCanvasClick;

    // Подсвечиваем уже привязанные павильоны
    redrawHighlights();

    console.log(`📐 Canvas размер: ${width}x${height}`);
  }

  // ================================================================
  // ОБРАБОТКА КЛИКОВ ПО ПЛАНУ
  // ================================================================

  function handleCanvasClick(event) {
    const canvas = floorPlanState.canvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Конвертируем в проценты от размера изображения
    const xPercent = (x / canvas.width) * 100;
    const yPercent = (y / canvas.height) * 100;

    console.log(`📍 Клик по плану: ${xPercent.toFixed(1)}%, ${yPercent.toFixed(1)}%`);

    // Сохраняем координаты
    saveFloorPlanCoordinates(xPercent, yPercent);

    // Попытаемся найти, какой павильон здесь находится
    const pavilion = findPavilionAtPoint(xPercent, yPercent);
    if (pavilion) {
      floorPlanState.selectedPavilion = pavilion.pavilion_number;
      showMessage(`✓ Выбран павильон №${pavilion.pavilion_number}`, 'success');
    } else {
      showMessage(`Координаты установлены: ${xPercent.toFixed(1)}%, ${yPercent.toFixed(1)}%`, 'info');
    }

    redrawHighlights();
  }

  /**
   * Сохраняет координаты в скрытые input поля
   */
  function saveFloorPlanCoordinates(xPercent, yPercent) {
    const xInput = document.getElementById('pavilion-x');
    const yInput = document.getElementById('pavilion-y');
    const coordsDisplay = document.getElementById('coords-display');

    if (xInput) xInput.value = xPercent.toFixed(2);
    if (yInput) yInput.value = yPercent.toFixed(2);
    if (coordsDisplay) {
      coordsDisplay.innerHTML = `<strong>Координаты:</strong> ${xPercent.toFixed(1)}% × ${yPercent.toFixed(1)}%`;
    }
  }

  /**
   * Попытается найти павильон в указанной точке плана
   * Простой алгоритм: проверяет существующие координаты павильонов пользователя
   */
  function findPavilionAtPoint(xPercent, yPercent) {
    if (!floorPlanState.pavilionsList || floorPlanState.pavilionsList.length === 0) {
      return null;
    }

    const tolerance = 5; // ±5% от точки клика

    for (const pavilion of floorPlanState.pavilionsList) {
      if (!pavilion.coordinates) continue;

      // Координаты хранятся как 0-100 проценты
      const px = pavilion.coordinates.x || 0;
      const py = pavilion.coordinates.y || 0;

      // Проверяем, в пределах ли клик
      if (Math.abs(px - xPercent) < tolerance && Math.abs(py - yPercent) < tolerance) {
        return pavilion;
      }
    }

    return null;
  }

  // ================================================================
  // ПОДСВЕЧИВАНИЕ ПАВИЛЬОНОВ НА ПЛАНЕ
  // ================================================================

  /**
   * Подсвечивает павильон по номеру
   */
  function highlightPavilionOnPlan(pavilionNumber) {
    console.log(`⭐ FloorPlan: Подсвечивание павильона ${pavilionNumber}`);
    
    const pavilion = floorPlanState.pavilionsList.find(
      p => p.pavilion_number === pavilionNumber
    );

    if (!pavilion) {
      console.warn(`FloorPlan: Павильон ${pavilionNumber} не найден`);
      return false;
    }

    if (!pavilion.coordinates) {
      console.warn(`FloorPlan: Павильон ${pavilionNumber} не имеет координат`);
      return false;
    }

    floorPlanState.selectedPavilion = pavilionNumber;
    saveFloorPlanCoordinates(pavilion.coordinates.x, pavilion.coordinates.y);
    redrawHighlights();

    return true;
  }

  /**
   * Перерисовывает все подсвечивания на canvas
   */
  function redrawHighlights() {
    const canvas = floorPlanState.canvasElement;
    const ctx = floorPlanState.canvasCtx;

    if (!canvas || !ctx) return;

    // Очищаем canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем все павильоны пользователя
    floorPlanState.pavilionsList.forEach(pavilion => {
      if (!pavilion.coordinates) return;

      const x = (pavilion.coordinates.x / 100) * canvas.width;
      const y = (pavilion.coordinates.y / 100) * canvas.height;
      const size = 12;

      // Обычный павильон - маленький кружок
      ctx.fillStyle = '#2196F3';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1976D2';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Выделяем выбранный павильон ярче
    if (floorPlanState.selectedPavilion) {
      const selected = floorPlanState.pavilionsList.find(
        p => p.pavilion_number === floorPlanState.selectedPavilion
      );

      if (selected && selected.coordinates) {
        const x = (selected.coordinates.x / 100) * canvas.width;
        const y = (selected.coordinates.y / 100) * canvas.height;
        const size = 20;

        // Яркое выделение
        ctx.strokeStyle = '#FFEB3B';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Центр
        ctx.fillStyle = '#FF6B35';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Текст (номер павильона)
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(selected.pavilion_number, x, y);
      }
    }
  }

  // ================================================================
  // ОБНОВЛЕНИЕ СПИСКА ПАВИЛЬОНОВ
  // ================================================================

  function updatePavilionsList(pavilions) {
    console.log(`📋 FloorPlan: Обновление списка павильонов (${pavilions.length} шт)`);
    floorPlanState.pavilionsList = pavilions || [];
    redrawHighlights();
  }

  function getSelectedCoordinates() {
    const xInput = document.getElementById('pavilion-x');
    const yInput = document.getElementById('pavilion-y');

    return {
      x: xInput ? parseFloat(xInput.value) || 0 : 0,
      y: yInput ? parseFloat(yInput.value) || 0 : 0
    };
  }

  // ================================================================
  // УТИЛИТЫ
  // ================================================================

  function hideFloorPlanContainer() {
    const container = document.getElementById('floor-plan-container');
    if (container) container.style.display = 'none';
  }

  function showFloorPlanContainer() {
    const container = document.getElementById('floor-plan-container');
    if (container) container.style.display = 'block';
  }

  /**
   * Показывает сообщение (требует инициализации в admin.js)
   */
  function showMessage(msg, type) {
    if (window.Admin) {
      // Если есть функция в admin.js, используем её
      const notice = document.getElementById('admin-notice') || createNoticeArea();
      notice.textContent = msg;
      notice.className = 'admin-notice admin-notice-' + type;
      setTimeout(() => {
        notice.textContent = '';
        notice.className = 'admin-notice';
      }, 4000);
    }
  }

  function createNoticeArea() {
    const area = document.createElement('div');
    area.id = 'admin-notice';
    area.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: #2196F3;
      color: white;
      border-radius: 4px;
      z-index: 10000;
      max-width: 400px;
    `;
    document.body.appendChild(area);
    return area;
  }

  /**
   * Следующий frame (для нормального расчёта размеров после отрисовки)
   */
  function nextFrame(callback) {
    requestAnimationFrame(callback);
  }

})();
