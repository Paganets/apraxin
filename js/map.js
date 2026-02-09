/**
 * MAP.JS - Логика интерактивной карты павильонов
 * 
 * Отвечает за:
 * - Инициализацию и отображение карты
 * - Загрузку данных павильонов из БД
 * - Взаимодействие пользователя с павильонами
 * - Поиск, фильтрацию и анимацию
 * - Управление состоянием карты (зум, панорамирование)
 */

// ============================================================
// СОСТОЯНИЕ И КОНФИГУРАЦИЯ
// ============================================================

const MapState = {
  // Текущий выбранный павильон
  selectedPavilion: null,
  
  // Все павильоны из БД
  allPavilions: [],
  
  // Отфильтрованные павильоны для отображения
  filteredPavilions: [],
  
  // Фильтры
  activeCategory: null,
  searchQuery: '',
  
  // Состояние viewport
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  
  // Категории павильонов
  categories: {
    'clothing': { name: 'Одежда', color: '#E91E63', icon: '👕' },
    'shoes': { name: 'Обувь', color: '#9C27B0', icon: '👞' },
    'accessories': { name: 'Аксессуары', color: '#00BCD4', icon: '✨' },
    'electronics': { name: 'Электроника', color: '#2196F3', icon: '📱' },
    'cosmetics': { name: 'Косметика', color: '#FF9800', icon: '💄' },
    'sports': { name: 'Спорт', color: '#4CAF50', icon: '⚽' },
    'other': { name: 'Прочее', color: '#9E9E9E', icon: '📦' }
  }
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ============================================================

/**
 * Инициализирует карту при загрузке страницы
 * Загружает данные, отрисовывает павильоны, подключает обработчики
 */
async function initializeMap() {
  console.log('📍 Map: Инициализация карты');
  
  try {
    // Загрузка всех павильонов из БД
    MapState.allPavilions = await Data.getAllPavilions();
    console.log(`📍 Map: Загружено ${MapState.allPavilions.length} павильонов`);
    
    // Отрисовка начального состояния
    applyFiltersAndRender();
    
    // Подключение обработчиков событий
    setupEventHandlers();
    
    console.log('✅ Map: Инициализация завершена');
  } catch (error) {
    console.error('❌ Map: Ошибка инициализации', error);
    showMapError('Ошибка при загрузке павильонов');
  }
}

// ============================================================
// ОТРИСОВКА ПАВИЛЬОНОВ НА КАРТЕ
// ============================================================

/**
 * Применяет фильтры и отрисовывает павильоны
 */
function applyFiltersAndRender() {
  // Применение фильтров к всем павильонам
  MapState.filteredPavilions = MapState.allPavilions.filter(pavilion => {
    // Фильтр по категориям
    if (MapState.activeCategory && pavilion.category !== MapState.activeCategory) {
      return false;
    }
    
    // Фильтр по поискому запросу
    if (MapState.searchQuery) {
      const query = MapState.searchQuery.toLowerCase();
      const matchesName = pavilion.name?.toLowerCase().includes(query);
      const matchesTenant = pavilion.tenant_name?.toLowerCase().includes(query);
      if (!matchesName && !matchesTenant) {
        return false;
      }
    }
    
    return true;
  });
  
  // Отрисовка карты
  renderMapSVG();
}

/**
 * Отрисовывает SVG карту с павильонами
 */
function renderMapSVG() {
  const mapContainer = document.getElementById('map-container');
  const marketMap = document.getElementsByClassName('market-map')[0];
  
  if (!mapContainer || !marketMap) {
    console.warn('Map: map-container или market-map не найдены');
    return;
  }
  
  // Получаем все элементы павильонов на карте
  const pavilionElements = marketMap.querySelectorAll('[data-pavilion-id]');
  
  // Обновляем видимость и стили павильонов
  pavilionElements.forEach(element => {
    const pavilionId = element.getAttribute('data-pavilion-id');
    const pavilion = MapState.filteredPavilions.find(p => p.id === pavilionId);
    
    if (pavilion) {
      // Павильон должен быть видим
      element.style.opacity = '1';
      element.style.pointerEvents = 'auto';
      
      // Устанавливаем класс категории для визуального отличия
      if (pavilion.category) {
        element.classList.add(`pavilion-${pavilion.category}`);
      }
      
      // Подключаем обработчики клика
      if (!element.hasListener) {
        element.addEventListener('click', () => selectPavilion(pavilion));
        element.hasListener = true;
      }
    } else {
      // Павильон скрыт по фильтру
      element.style.opacity = '0.2';
      element.style.pointerEvents = 'none';
    }
  });
  
  // Обновляем информацию о кол-ве видимых павильонов
  updateMapStats();
}

/**
 * Обновляет статистику карты (видимые павильоны из всех)
 */
function updateMapStats() {
  const totalCount = MapState.allPavilions.length;
  const visibleCount = MapState.filteredPavilions.length;
  
  // Обновляем счётчики в интерфейсе (если существуют)
  const statsElement = document.querySelector('[data-stats-pavilions]');
  if (statsElement) {
    statsElement.textContent = `${visibleCount}`;
  }
}

// ============================================================
// РАБОТА С ПАВИЛЬОНАМИ
// ============================================================

/**
 * Выбирает павильон и открывает его информацию в боковой панели
 * @param {Object} pavilion - Объект павильона из БД
 */
function selectPavilion(pavilion) {
  console.log(`📍 Map: Выбран павильон - ${pavilion.name}`);
  
  // Обновляем состояние
  MapState.selectedPavilion = pavilion;
  
  // Визуальное выделение на карте
  highlightSelected();
  
  // Отображение информации в боковой панели
  showPavilionInfo(pavilion);
}

/**
 * Deselect павильон и закрыть информацию
 */
function deselectPavilion() {
  console.log('📍 Map: Павильон деselected');
  
  MapState.selectedPavilion = null;
  highlightSelected();
  
  const infoPanel = document.getElementById('pavilion-info');
  if (infoPanel) {
    infoPanel.classList.add('hidden');
  }
}

/**
 * Выделяет выбранный павильон на карте
 */
function highlightSelected() {
  const marketMap = document.getElementsByClassName('market-map')[0];
  if (!marketMap) return;
  
  const all = marketMap.querySelectorAll('[data-pavilion-id]');
  all.forEach(element => {
    element.classList.remove('active');
  });
  
  if (MapState.selectedPavilion) {
    const selected = marketMap.querySelector(`[data-pavilion-id="${MapState.selectedPavilion.id}"]`);
    if (selected) {
      selected.classList.add('active');
    }
  }
}

/**
 * Отображает информацию павильона в боковой панели
 * @param {Object} pavilion - Объект павильона
 */
function showPavilionInfo(pavilion) {
  const infoPanel = document.getElementById('pavilion-info');
  if (!infoPanel) {
    console.warn('Map: pavilion-info панель не найдена');
    return;
  }
  
  // Формируем HTML информации
  let discountsHTML = '';
  if (pavilion.discounts && pavilion.discounts.length > 0) {
    discountsHTML = `
      <div class="detail-block">
        <h3>Скидки</h3>
        <ul>
          ${pavilion.discounts.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>
    `;
  } else {
    discountsHTML = `
      <div class="detail-block">
        <h3>Скидки</h3>
        <p class="no-discounts">Нет активных скидок</p>
      </div>
    `;
  }
  
  const categoryName = MapState.categories[pavilion.category]?.name || pavilion.category;
  
  const htmlContent = `
    <div class="pavilion-content">
      <div class="pavilion-header">
        <h2>${pavilion.name}</h2>
        <p class="pavilion-number">Павильон ${pavilion.location}</p>
      </div>
      
      <div class="pavilion-details">
        <div class="detail-block">
          <h3>Раздел</h3>
          <p>${categoryName}</p>
        </div>
        
        <div class="detail-block">
          <h3>Владелец</h3>
          <p>${pavilion.tenant_name || 'Не указан'}</p>
        </div>
        
        <div class="detail-block">
          <h3>Контакты</h3>
          <p>
            ${pavilion.phone ? `<a href="tel:${pavilion.phone}">${pavilion.phone}</a>` : 'Контакт не указан'}
          </p>
        </div>
        
        ${discountsHTML}
        
        <div class="detail-block">
          <h3>Часы работы</h3>
          <p class="help-text">Апраксин двор: пн-вс 10:00-18:00</p>
        </div>
      </div>
      
      <div class="pavilion-footer">
        <button class="btn btn-share" onclick="sharePavilion('${pavilion.id}')">
          📤 Поделиться
        </button>
      </div>
    </div>
  `;
  
  infoPanel.innerHTML = htmlContent;
  infoPanel.classList.remove('hidden');
  
  // Добавляем обработчик для кнопки закрытия
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.onclick = deselectPavilion;
  infoPanel.insertBefore(closeBtn, infoPanel.firstChild);
}

/**
 * Поделиться информацией павильона
 * @param {string} pavilionId - ID павильона
 */
function sharePavilion(pavilionId) {
  const pavilion = MapState.allPavilions.find(p => p.id === pavilionId);
  if (!pavilion) return;
  
  const text = `Я нашёл ${pavilion.name} в Апраксином дворе! 📍`;
  const url = window.location.href;
  
  if (navigator.share) {
    // Используем Web Share API, если доступен
    navigator.share({
      title: 'Карта Апрашки',
      text: text,
      url: url
    }).catch(err => console.log('Share ошибка:', err));
  } else {
    // Fallback - копируем в буфер обмена
    const shareText = `${text} ${url}`;
    navigator.clipboard.writeText(shareText).then(() => {
      alert('Скопировано в буфер обмена!');
    }).catch(() => {
      alert(`${text} ${url}`);
    });
  }
}

// ============================================================
// ПОИСК И ФИЛЬТРАЦИЯ
// ============================================================

/**
 * Устанавливает обработчики для фильтров и поиска
 */
function setupEventHandlers() {
  // Поле поиска
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      MapState.searchQuery = e.target.value;
      applyFiltersAndRender();
    });
    
    // Кнопка очистки поиска
    const clearBtn = document.querySelector('.search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        MapState.searchQuery = '';
        applyFiltersAndRender();
      });
    }
  }
  
  // Выпадающее меню категорий
  const categoryFilter = document.querySelector('.category-filter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      MapState.activeCategory = e.target.value || null;
      applyFiltersAndRender();
    });
  }
  
  // SVG карта
  const marketMap = document.getElementsByClassName('market-map')[0];
  if (marketMap) {
    setupSVGInteraction(marketMap);
  }
}

/**
 * Настраивает взаимодействие с SVG картой
 * (ховер, клик, панорамирование, зум)
 * @param {SVGElement} svgElement - SVG элемент карты
 */
function setupSVGInteraction(svgElement) {
  const mapContainer = svgElement.parentElement;
  
  // ПАНОРАМИРОВАНИЕ (Drag & Pan)
  svgElement.addEventListener('mousedown', (e) => {
    // Не паниремируем если кликнули на павильон
    if (e.target.hasAttribute('data-pavilion-id')) return;
    
    MapState.isDragging = true;
    MapState.dragStart.x = e.clientX - MapState.panX;
    MapState.dragStart.y = e.clientY - MapState.panY;
    svgElement.style.cursor = 'grabbing';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!MapState.isDragging) return;
    
    MapState.panX = e.clientX - MapState.dragStart.x;
    MapState.panY = e.clientY - MapState.dragStart.y;
    
    // Применяем трансформацию
    svgElement.style.transform = `translate(${MapState.panX}px, ${MapState.panY}px) scale(${MapState.zoom})`;
  });
  
  document.addEventListener('mouseup', () => {
    MapState.isDragging = false;
    svgElement.style.cursor = 'grab';
  });
  
  // ЗУМ (колёсико мыши)
  mapContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomSpeed = 0.1;
    const newZoom = MapState.zoom + (e.deltaY > 0 ? -zoomSpeed : zoomSpeed);
    
    // Ограничиваем зум от 0.5x до 3x
    if (newZoom >= 0.5 && newZoom <= 3) {
      MapState.zoom = newZoom;
      svgElement.style.transform = `translate(${MapState.panX}px, ${MapState.panY}px) scale(${MapState.zoom})`;
    }
  }, { passive: false });
  
  // ХОВЕР на павильоны
  const pavilionElements = svgElement.querySelectorAll('[data-pavilion-id]');
  pavilionElements.forEach(element => {
    element.addEventListener('mouseenter', (e) => {
      const pavilionId = element.getAttribute('data-pavilion-id');
      const pavilion = MapState.allPavilions.find(p => p.id === pavilionId);
      
      if (pavilion && MapState.filteredPavilions.includes(pavilion)) {
        // Показываем всплывающую подсказку
        showTooltip(element, pavilion.name);
      }
    });
    
    element.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  });
}

/**
 * Показывает всплывающую подсказку при ховере
 * @param {Element} element - Элемент павильона
 * @param {string} text - Текст подсказки
 */
function showTooltip(element, text) {
  let tooltip = document.getElementById('map-tooltip');
  
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'map-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 999;
      white-space: nowrap;
      pointer-events: none;
      animation: fadeIn 150ms ease-out;
    `;
    document.body.appendChild(tooltip);
  }
  
  tooltip.textContent = text;
  
  const rect = element.getBoundingClientRect();
  tooltip.style.left = (rect.left + rect.width / 2 - 50) + 'px';
  tooltip.style.top = (rect.top - 35) + 'px';
  tooltip.style.display = 'block';
}

/**
 * Скрывает всплывающую подсказку
 */
function hideTooltip() {
  const tooltip = document.getElementById('map-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// ============================================================
// ОБНОВЛЕНИЕ ДАННЫХ
// ============================================================

/**
 * Полностью обновляет данные карты из БД
 * Используется при добавлении нового павильона или обновлении существующего
 */
async function refreshMap() {
  console.log('🔄 Map: Обновление данных карты');
  
  try {
    MapState.allPavilions = await Data.getAllPavilions();
    applyFiltersAndRender();
    console.log('✅ Map: Карта обновлена');
  } catch (error) {
    console.error('❌ Map: Ошибка при обновлении', error);
  }
}

/**
 * Добавляет новый павильон на карту (при добавлении через форму)
 * @param {Object} pavilion - Новый объект павильона
 */
function addPavilionToMap(pavilion) {
  console.log(`➕ Map: Добавлен новый павильон - ${pavilion.name}`);
  
  MapState.allPavilions.push(pavilion);
  applyFiltersAndRender();
}

// ============================================================
// ОБРАБОТКА ОШИБОК
// ============================================================

/**
 * Показывает сообщение об ошибке на карте
 * @param {string} message - Текст ошибки
 */
function showMapError(message) {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) return;
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = `❌ ${message}`;
  mapContainer.appendChild(errorDiv);
}

/**
 * Показывает экран загрузки на карте
 */
function showMapLoading() {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) return;
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-message';
  loadingDiv.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
    <p>Загрузка павильонов...</p>
  `;
  mapContainer.appendChild(loadingDiv);
}

// ============================================================
// ЭКСПОРТИРУЕМ ФУНКЦИИ ДЛЯ ГЛОБАЛЬНОГО ДОСТУПА
// ============================================================

// Делаем функции доступными из HTML и других скриптов
window.Map = {
  initialize: initializeMap,
  selectPavilion,
  deselectPavilion,
  sharePavilion,
  refresh: refreshMap,
  addPavilion: addPavilionToMap,
  getSelectedPavilion: () => MapState.selectedPavilion,
  getFilteredPavilions: () => MapState.filteredPavilions,
  getAllPavilions: () => MapState.allPavilions
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Map: DOM готов, инициализируем карту');
  initializeMap();
});

// Также можно вызвать явно из других скриптов
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initializeMap();
}
