/* js/admin.js — Управление панелью администратора павильонов
   Чистый JavaScript. Интеграция с Auth (auth.js) и Data (data.js).
   Экспортирует API через window.Admin
*/

(function () {
  'use strict';

  const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB

  // Локальные состояния
  let currentUser = null;
  let currentPavilions = [];
  let currentEditingPavilion = null;
  let miniMapState = {
    floor: null,
    coords: null,
    mapInstance: null
  };

  // -----------------------------
  // Утилиты UI
  // -----------------------------
  function el(id) { return document.getElementById(id); }
  function showMessage(msg, type = 'info') {
    // simple notification area fallback
    try {
      const area = el('admin-notice') || createNoticeArea();
      area.textContent = msg;
      area.className = 'admin-notice admin-notice-' + type;
      setTimeout(() => { area.textContent = ''; area.className = 'admin-notice'; }, 6000);
    } catch (e) { console.log('Notice:', msg); }
  }
  function createNoticeArea() {
    const area = document.createElement('div');
    area.id = 'admin-notice';
    document.body.prepend(area);
    return area;
  }
  function handleError(err, userMsg = 'Произошла ошибка') {
    console.error(err);
    showMessage(userMsg, 'error');
  }

  // -----------------------------
  // 1. Инициализация при загрузке
  // -----------------------------
  async function initAdmin() {
    try {
      // Проверка авторизации
      if (!window.Auth || !window.Auth.requireAuth) {
        throw new Error('Auth API недоступен');
      }

      const authed = await window.Auth.requireAuth();
      if (!authed) {
        showMessage('Нужно авторизоваться', 'error');
        return;
      }

      // Получаем текущего пользователя
      if (window.Data && window.Data.getCurrentUser) {
        currentUser = await window.Data.getCurrentUser();
      }

      if (!currentUser) {
        showMessage('Не удалось получить данные пользователя', 'error');
        return;
      }

      // Обновляем информацию пользователя в шапке
      updateUserInfo();

      // Загружаем павильоны пользователя
      await loadUserPavilions();

      // Обновляем статистику (UI)
      updateStatsUI();

      // Инициализируем мини-карту
      initMiniMap();

      console.log('Admin: Инициализация завершена', currentUser);
    } catch (err) {
      handleError(err, 'Ошибка инициализации панели');
    }
  }

  // Обновляет статистику
  async function updateStatsUI() {
    try {
      if (!currentPavilions) currentPavilions = [];
      
      const totalDiscounts = currentPavilions.reduce((sum, p) => {
        return sum + (Array.isArray(p.discounts) ? p.discounts.length : 0);
      }, 0);

      if (el('stat-pavilions')) el('stat-pavilions').textContent = currentPavilions.length;
      if (el('stat-discounts')) el('stat-discounts').textContent = totalDiscounts;
    } catch (err) {
      console.error('updateStatsUI error', err);
    }
  }

  // Обновляет информацию пользователя в шапке
  function updateUserInfo() {
    try {
      const userNameEl = document.getElementById('user-name');
      if (userNameEl && currentUser) {
        userNameEl.textContent = `👤 ${currentUser.name || currentUser.phone}`;
      }
    } catch (err) {
      console.error('updateUserInfo error', err);
    }
  }

  // -----------------------------
  // 2. Работа с формой павильона
  // -----------------------------
  // Заполняет DOM форму данными павильона
  async function loadPavilionForm(pavilionId) {
    try {
      if (!window.Data || !window.Data.getPavilionById) throw new Error('Data.getPavilionById не найден');
      showMessage('Загрузка данных павильона...');
      const p = await window.Data.getPavilionById(pavilionId);
      if (!p) throw new Error('Павильон не найден');
      currentEditingPavilion = p;

      // Проставляем поля (под именами полей в admin.html)
      if (el('form-pavilion-id')) el('form-pavilion-id').value = p.id || '';
      if (el('building-select')) el('building-select').value = p.building || '';
      if (el('floor-input')) el('floor-input').value = p.floor || '';
      if (el('location-input')) el('location-input').value = p.pavilion_number || '';
      if (el('name-input')) el('name-input').value = p.shop_name || '';
      if (el('category-select')) el('category-select').value = p.category || '';
      if (el('form-pavilion-desc')) el('form-pavilion-desc').value = p.description || '';

      // Координаты - сохраняем в hidden inputs
      if (p.coordinates) {
        // Если это процентная координата (0-100), заполняем напрямую
        const xVal = typeof p.coordinates.x === 'number' ? p.coordinates.x : 0;
        const yVal = typeof p.coordinates.y === 'number' ? p.coordinates.y : 0;
        if (el('pavilion-x')) el('pavilion-x').value = xVal;
        if (el('pavilion-y')) el('pavilion-y').value = yVal;
      }

      // Показываем план если это корпус 33
      if (p.building === '33' && window.FloorPlan) {
        const container = el('floor-plan-container');
        if (container) container.style.display = 'block';
        
        // Инициализируем план
        const allPavilions = currentPavilions || [];
        window.FloorPlan.init(p.building, parseInt(p.floor) || 1, allPavilions);
        
        // Подсвечиваем текущий павильон, если у него есть координаты
        if (p.pavilion_number && p.coordinates) {
          setTimeout(() => {
            window.FloorPlan.highlightPavilion(p.pavilion_number);
          }, 100);
        }
      }

      // Изображение предпросмотр
      if (p.image_url && el('form-pavilion-image-preview')) {
        el('form-pavilion-image-preview').src = p.image_url;
      }

      // Скидки
      if (p.discounts) renderDiscountsForm(p.discounts);

      // Входы
      if (p.entrances) renderEntrances(p.entrances);

      showMessage('Данные загружены', 'success');
    } catch (err) {
      handleError(err, 'Не удалось загрузить данные павильона');
    }
  }

  // Проверка валидности формы; возвращает {ok: boolean, errors: []}
  function validateFormData(formData) {
    const errors = [];
    if (!formData.name || String(formData.name).trim().length < 2) errors.push('Укажите корректное название');
    if (!formData.category) errors.push('Укажите категорию');
    if (formData.floor && isNaN(Number(formData.floor))) errors.push('Этаж должен быть числом');

    // discounts validation (если есть)
    if (Array.isArray(formData.discounts)) {
      formData.discounts.forEach((d, i) => {
        if (d.endDate && new Date(d.endDate) < new Date()) errors.push(`Скидка №${i+1}: дата окончания в прошлом`);
      });
    }

    return { ok: errors.length === 0, errors };
  }

  // Считает поля формы и отправляет данные на сохранение
  async function savePavilion() {
    try {
      const id = el('form-pavilion-id') ? el('form-pavilion-id').value : null;
      const building = el('building-select') ? el('building-select').value : '';
      const floorValue = el('floor-input') ? el('floor-input').value : '';
      
      // Захватываем координаты из скрытых полей для плана этажа (корпус 33)
      let coordinates = miniMapState.coords || null;
      if (building === '33') {
        const pavX = el('pavilion-x') ? parseFloat(el('pavilion-x').value) : null;
        const pavY = el('pavilion-y') ? parseFloat(el('pavilion-y').value) : null;
        if (pavX !== null && pavY !== null && !isNaN(pavX) && !isNaN(pavY)) {
          coordinates = { x: pavX, y: pavY };
        }
      }
      
      const data = {
        id,
        name: el('form-pavilion-name') ? el('form-pavilion-name').value.trim() : '',
        category: el('form-pavilion-category') ? el('form-pavilion-category').value : '',
        floor: floorValue,
        building: building,
        description: el('form-pavilion-desc') ? el('form-pavilion-desc').value : '',
        coordinates: coordinates,
        discounts: collectDiscountsFromForm(),
        entrances: collectEntrancesFromForm()
      };

      const validated = validateFormData(data);
      if (!validated.ok) {
        showMessage(validated.errors.join('; '), 'error');
        return;
      }

      showMessage('Сохранение павильона...');

      if (!window.Data) throw new Error('Data API недоступен');

      let result;
      if (id) {
        if (!window.Data.savePavilion) throw new Error('Data.savePavilion не реализован');
        result = await window.Data.savePavilion(data);
      } else {
        if (!window.Data.createPavilion) throw new Error('Data.createPavilion не реализован');
        result = await window.Data.createPavilion(data);
      }

      showMessage('Павильон сохранён', 'success');
      await loadUserPavilions();
      renderPavilionsList();
      return result;
    } catch (err) {
      handleError(err, 'Ошибка при сохранении павильона');
    }
  }

  // Создать новый павильон: очищает форму и готовит UI
  function createNewPavilion() {
    currentEditingPavilion = null;
    if (el('pavilion-form')) el('pavilion-form').reset();
    if (el('form-pavilion-image-preview')) el('form-pavilion-image-preview').src = '';
    miniMapState.coords = null;
    showMessage('Готово: создайте новый павильон', 'info');
  }

  // -----------------------------
  // 3. Загрузка изображений
  // -----------------------------
  async function handleImageUpload(inputEl) {
    try {
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (file.size > MAX_IMAGE_SIZE) {
        showMessage('Файл слишком большой (макс 2 МБ)', 'error');
        return;
      }

      // Предпросмотр
      const reader = new FileReader();
      reader.onload = function (e) {
        if (el('form-pavilion-image-preview')) el('form-pavilion-image-preview').src = e.target.result;
      };
      reader.readAsDataURL(file);

      // Загрузка в хранилище Supabase (если есть реализация)
      if (window.Data && (window.Data.uploadImage || window.Data.uploadFile)) {
        showMessage('Загрузка изображения...');
        const uploadFn = window.Data.uploadImage || window.Data.uploadFile;
        // path: pavilions/{userId}/{timestamp}_{filename}
        const filename = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const path = `pavilions/${currentUser?.id || 'anon'}/${filename}`;
        const res = await uploadFn(file, path);
        // Ожидаем, что res содержит публичный URL или {publicURL}
        const url = res?.publicURL || res?.url || res;
        if (url && el('form-pavilion-image-url')) el('form-pavilion-image-url').value = url;
        showMessage('Изображение загружено', 'success');
        return url;
      } else {
        showMessage('Файл подготовлен, загрузка отсутствует (Data.uploadImage не реализован)', 'info');
        return null;
      }
    } catch (err) {
      handleError(err, 'Ошибка загрузки изображения');
    }
  }

  // -----------------------------
  // 4. Управление скидками
  // -----------------------------
  function collectDiscountsFromForm() {
    const list = [];
    const container = el('discounts-container');
    if (!container) return list;
    const nodes = container.querySelectorAll('.discount-item');
    nodes.forEach(node => {
      const id = node.dataset.id || null;
      const title = node.querySelector('[name="discount-title"]').value;
      const desc = node.querySelector('[name="discount-desc"]').value;
      const endDate = node.querySelector('[name="discount-end"]').value || null;
      const categories = (node.querySelector('[name="discount-cats"]').value || '').split(',').map(s => s.trim()).filter(Boolean);
      list.push({ id, title, description: desc, endDate, categories });
    });
    return list;
  }

  function renderDiscountsForm(discounts = []) {
    const container = el('discounts-container');
    if (!container) return;
    container.innerHTML = '';
    discounts.forEach((d, idx) => {
      const item = createDiscountNode(d, idx);
      container.appendChild(item);
    });
  }

  function createDiscountNode(discount = {}, idx = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'discount-item';
    if (discount.id) wrapper.dataset.id = discount.id;
    wrapper.innerHTML = `
      <input type="text" name="discount-title" placeholder="Заголовок" value="${escapeHtml(discount.title||'')}" />
      <textarea name="discount-desc" placeholder="Описание">${escapeHtml(discount.description||'')}</textarea>
      <input type="date" name="discount-end" value="${discount.endDate ? isoDate(discount.endDate) : ''}" />
      <input type="text" name="discount-cats" placeholder="Категории (через запятую)" value="${(discount.categories||[]).join(', ')}" />
      <button type="button" class="btn-discount-remove">Удалить</button>
    `;
    const btn = wrapper.querySelector('.btn-discount-remove');
    btn.addEventListener('click', () => wrapper.remove());
    return wrapper;
  }

  function addDiscount() {
    const container = el('discounts-container');
    if (!container) return;
    const node = createDiscountNode({}, Date.now());
    container.appendChild(node);
  }

  function editDiscount(id) {
    // Открывает форму редактирования — если у нас есть перечисление, скроллим к элементу
    const item = (el('discounts-container') || document).querySelector(`.discount-item[data-id="${id}"]`);
    if (item) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function removeDiscount(id) {
    const item = (el('discounts-container') || document).querySelector(`.discount-item[data-id="${id}"]`);
    if (item) item.remove();
  }

  function isoDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d)) return '';
    return d.toISOString().split('T')[0];
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
  }

  // -----------------------------
  // 5. Управление входами в здание
  // -----------------------------
  function renderEntrances(entrances = []) {
    const container = el('entrances-container');
    if (!container) return;
    container.innerHTML = '';
    entrances.forEach((en, i) => {
      const div = document.createElement('div');
      div.className = 'entrance-item';
      div.dataset.idx = i;
      div.innerHTML = `Вход ${i+1}: ${escapeHtml(en.name || '')} <button data-idx="${i}" class="btn-select-entrance">Показать</button>`;
      container.appendChild(div);
    });
    container.querySelectorAll('.btn-select-entrance').forEach(btn => btn.addEventListener('click', (e)=>{
      const idx = e.currentTarget.dataset.idx;
      selectEntrance(idx);
    }));
  }

  function addEntrance() {
    const container = el('entrances-container');
    if (!container) return;
    const idx = container.children.length;
    const div = document.createElement('div');
    div.className = 'entrance-item';
    div.dataset.idx = idx;
    div.innerHTML = `Вход ${idx+1}: <input name="entrance-name" placeholder="Имя входа" /> <button class="btn-set-coords">Указать на карте</button>`;
    container.appendChild(div);
    div.querySelector('.btn-set-coords').addEventListener('click', () => {
      showMessage('Кликните на мини-карте для установки координат этого входа', 'info');
      // подготовка для setCoordinates — можно реализовать связывание
    });
  }

  function selectEntrance(idx) {
    const container = el('entrances-container');
    if (!container) return;
    const item = container.querySelector(`.entrance-item[data-idx="${idx}"]`);
    if (!item) return;
    // отображаем на мини-карте — предположим, вход хранит coords в data-attributes
    const x = item.dataset.x; const y = item.dataset.y;
    if (x && y) {
      setCoordinates(Number(x), Number(y));
      showMessage(`Показан вход №${Number(idx)+1}`,'success');
    } else {
      showMessage('У этого входа ещё нет координат', 'info');
    }
  }

  function collectEntrancesFromForm() {
    const container = el('entrances-container');
    if (!container) return [];
    const items = container.querySelectorAll('.entrance-item');
    return Array.from(items).map(item => {
      return {
        name: item.querySelector('[name="entrance-name"]')?.value || item.textContent || '',
        x: item.dataset.x ? Number(item.dataset.x) : null,
        y: item.dataset.y ? Number(item.dataset.y) : null
      };
    });
  }

  // -----------------------------
  // 6. Мини-карта
  // -----------------------------
  function initMiniMap() {
    // Заготовка для мини-карты. Поддерживает отрисовку точек и выбор координат кликом.
    // Предполагается, что в admin.html есть элемент #mini-map
    const container = el('mini-map');
    if (!container) return;

    // Простая SVG мини-карта (инициализация)
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '300');
    svg.setAttribute('viewBox', '0 0 1000 600');
    svg.style.border = '1px solid var(--color-border)';
    container.innerHTML = '';
    container.appendChild(svg);

    miniMapState.mapInstance = svg;

    // клики для установки координат
    svg.addEventListener('click', (e) => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1000;
      const y = ((e.clientY - rect.top) / rect.height) * 600;
      setCoordinates(Math.round(x), Math.round(y));
    });

    // отрисовать павильоны пользователя
    renderPavilionsOnMiniMap();
  }

  function setCoordinates(x, y) {
    miniMapState.coords = { x, y };
    // показать маркер на мини-карте
    const svg = miniMapState.mapInstance;
    if (!svg) return;
    // удалить старый маркер
    const old = svg.querySelector('#admin-marker'); if (old) old.remove();
    const svgNS = 'http://www.w3.org/2000/svg';
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('id', 'admin-marker');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', 8);
    circle.setAttribute('fill', '#FF6B35');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);

    // обновить поля формы (если есть)
    if (el('form-pavilion-coords')) el('form-pavilion-coords').value = `${x},${y}`;
  }

  function selectFloor(floor) {
    miniMapState.floor = floor;
    
    const building = el('building-select') ? el('building-select').value : '';
    const floorPlanContainer = el('floor-plan-container');
    
    // План этажа доступен ТОЛЬКО для корпуса 33 и ТОЛЬКО для этажа 1
    if (building === '33' && floor === '1' && window.FloorPlan) {
      if (floorPlanContainer) floorPlanContainer.style.display = 'block';
      
      const allPavilions = currentPavilions || [];
      window.FloorPlan.init(building, 1, allPavilions);
      
      showMessage('✓ План этажа загружен', 'success');
    } else {
      // Скрываем контейнер если этаж не 1 или корпус не 33
      if (floorPlanContainer) floorPlanContainer.style.display = 'none';
      if (floor) {
        showMessage(`Этаж ${floor} выбран`, 'info');
      }
    }
  }

  /**
   * Обработчик выбора корпуса
   * Скрывает план если не корпус 33 или если этаж не 1
   */
  function selectBuilding(building) {
    miniMapState.building = building;
    
    const floorPlanContainer = el('floor-plan-container');
    const floorInput = el('floor-input');
    
    // Для корпуса 33: скрываем план до выбора этажа 1
    if (building === '33') {
      if (floorPlanContainer) floorPlanContainer.style.display = 'none';
      showMessage('Выбранный корпус: 33. План появится при выборе этажа 1', 'info');
    } else {
      if (floorPlanContainer) floorPlanContainer.style.display = 'none';
      showMessage(`Корпус ${building} выбран`, 'info');
    }
  }

  async function renderPavilionsOnMiniMap() {
    try {
      if (!miniMapState.mapInstance) return;
      // Удаляем старые
      miniMapState.mapInstance.querySelectorAll('.admin-pavilion-point').forEach(n=>n.remove());

      // отрисовать текущие павильоны
      if (!currentPavilions || currentPavilions.length === 0) return;
      const svgNS = 'http://www.w3.org/2000/svg';
      currentPavilions.forEach(p => {
        if (!p.coordinates) return;
        const circle = document.createElementNS(svgNS, 'circle');
        circle.classList.add('admin-pavilion-point');
        circle.setAttribute('cx', p.coordinates.x);
        circle.setAttribute('cy', p.coordinates.y);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', '#222');
        circle.setAttribute('opacity', '0.9');
        circle.style.cursor = 'pointer';
        circle.addEventListener('click', () => loadPavilionForm(p.id));
        miniMapState.mapInstance.appendChild(circle);
      });
    } catch (err) {
      console.error('renderPavilionsOnMiniMap', err);
    }
  }

  // -----------------------------
  // 7. Список павильонов
  // -----------------------------
  async function loadUserPavilions() {
    try {
      if (!window.Data || !window.Data.getPavilionsByTenant) throw new Error('Data.getPavilionsByTenant не найден');
      currentPavilions = await window.Data.getPavilionsByTenant(currentUser.id);
      renderPavilionsList();
      renderPavilionsOnMiniMap();
    } catch (err) {
      handleError(err, 'Не удалось загрузить список павильонов');
    }
  }

  function renderPavilionsList() {
    const table = el('pavilions-table-body');
    if (!table) return;
    table.innerHTML = '';
    currentPavilions.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(p.name || '')}</td>
        <td>${escapeHtml(p.category || '')}</td>
        <td>${p.floor || ''}</td>
        <td>${p.id}</td>
        <td>
          <button data-id="${p.id}" class="btn-edit">Изменить</button>
          <button data-id="${p.id}" class="btn-delete">Удалить</button>
        </td>
      `;
      table.appendChild(tr);
    });

    table.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e => editPavilion(e.currentTarget.dataset.id)));
    table.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', e => deletePavilion(e.currentTarget.dataset.id)));
  }

  function editPavilion(id) {
    loadPavilionForm(id);
    // переключаем вкладку/фокус на форму — если у admin.html есть вкладки
    if (el('tab-form')) el('tab-form').click?.();
  }

  async function deletePavilion(id) {
    try {
      if (!confirm('Удалить павильон? Это действие необратимо.')) return;
      if (!window.Data || !window.Data.deletePavilion) throw new Error('Data.deletePavilion не реализован');
      await window.Data.deletePavilion(id);
      showMessage('Павильон удалён', 'success');
      await loadUserPavilions();
    } catch (err) {
      handleError(err, 'Не удалось удалить павильон');
    }
  }

  // -----------------------------
  // 8. Обработка ошибок (дополнительно)
  // -----------------------------
  // (см. handleError и showMessage выше)

  // -----------------------------
  // 9. Глобальный API экспорт
  // -----------------------------
  window.Admin = {
    init: initAdmin,    updateUserInfo,
    updateStatsUI,    loadPavilionForm,
    savePavilion,
    createNewPavilion,
    handleImageUpload,
    addDiscount,
    editDiscount,
    removeDiscount,
    addEntrance,
    selectEntrance,
    initMiniMap,
    setCoordinates,
    selectFloor,
    selectBuilding,
    renderPavilionsList,
    editPavilion,
    deletePavilion
  };
  
  // Экспортируем функции в глобальную область для вызова из HTML
  window.selectFloor = selectFloor;
  window.selectBuilding = selectBuilding;

  // Автоинициализация, если админская страница загружена
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => { if (el('admin-root')) initAdmin(); }, 200);
  } else {
    window.addEventListener('DOMContentLoaded', () => { if (el('admin-root')) initAdmin(); });
  }

})();
