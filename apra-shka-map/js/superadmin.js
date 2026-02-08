(function() {
  'use strict';

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  let state = {
    currentUser: null,
    allPavilions: [],
    allTenants: [],
    adBanner: null,
    projectSettings: {
      name: 'Карта Апрашки',
      themeColor: '#FF6B35',
      categories: []
    },
    stats: {
      totalPavilions: 0,
      premiumPavilions: 0,
      totalTenants: 0,
      approvedTenants: 0,
      pageViews: 0,
      monthlyRevenue: 0
    },
    filters: {
      pavilions: { floor: '', category: '', premium: '', search: '' },
      tenants: { status: '', search: '' }
    },
    currentTab: 'stats'
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Безопасное получение элемента по ID
   */
  function el(id) {
    return document.getElementById(id);
  }

  /**
   * Логирование в консоль
   */
  function log(message, data = null) {
    if (data) {
      console.log(`[SuperAdmin] ${message}`, data);
    } else {
      console.log(`[SuperAdmin] ${message}`);
    }
  }

  /**
   * Предупреждение в консоль
   */
  function warn(message) {
    console.warn(`[SuperAdmin Warning] ${message}`);
  }

  /**
   * Показать сообщение пользователю
   */
  function showMessage(message, type = 'info') {
    const msgEl = document.createElement('div');
    msgEl.className = `message message-${type}`;
    msgEl.textContent = message;
    msgEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
      color: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(msgEl);
    
    setTimeout(() => {
      msgEl.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => msgEl.remove(), 300);
    }, 3000);
  }

  /**
   * Обработка ошибок
   */
  function handleError(err, context = '') {
    warn(`${context}: ${err.message || String(err)}`);
    showMessage(`Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'error');
  }

  /**
   * Экранирование HTML
   */
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // ============================================================================
  // AUTHORIZATION & INITIALIZATION
  // ============================================================================

  /**
   * Проверить права владельца (is_owner = true)
   */
  async function checkOwnerAccess() {
    try {
      if (!window.Auth) {
        throw new Error('Auth module not available');
      }

      const tenant = await window.Auth.getCurrentTenant?.();
      if (!tenant || !tenant.is_owner) {
        const accessDenied = el('access-denied');
        if (accessDenied) {
          accessDenied.style.display = 'block';
        }
        return false;
      }

      state.currentUser = tenant;
      return true;
    } catch (err) {
      handleError(err, 'checkOwnerAccess');
      return false;
    }
  }

  /**
   * Главная инициализация супер-админки
   */
  async function init() {
    try {
      log('Initializing SuperAdmin...');

      // Проверить права
      const hasAccess = await checkOwnerAccess();
      if (!hasAccess) {
        return;
      }

      // Показать основной контент
      const adminContent = el('admin-content');
      if (adminContent) {
        adminContent.style.display = 'block';
      }

      // Инициализировать табы
      initTabs();

      // Загрузить данные
      await loadOwnerInfo();
      await loadStats();
      await loadAllPavilions();
      await loadAllTenants();
      await loadAdBanner();
      await loadProjectSettings();

      // Инициализировать обработчики
      setupEventListeners();

      log('SuperAdmin initialized successfully');
    } catch (err) {
      handleError(err, 'init');
    }
  }

  /**
   * Установить обработчики событий
   */
  function setupEventListeners() {
    // Фильтры павильонов
    const pavilionFilters = document.querySelectorAll('[data-filter="pavilion"]');
    pavilionFilters.forEach(filter => {
      filter.addEventListener('change', (e) => {
        const filterType = e.target.getAttribute('data-filter-type');
        state.filters.pavilions[filterType] = e.target.value;
        filterAndRenderPavilions();
      });
    });

    // Фильтры арендаторов
    const tenantFilters = document.querySelectorAll('[data-filter="tenant"]');
    tenantFilters.forEach(filter => {
      filter.addEventListener('change', (e) => {
        const filterType = e.target.getAttribute('data-filter-type');
        state.filters.tenants[filterType] = e.target.value;
        filterAndRenderTenants();
      });
    });

    // Кнопки добавления
    const addTenantBtn = el('btn-add-tenant');
    if (addTenantBtn) {
      addTenantBtn.addEventListener('click', showAddTenantModal);
    }

    const addCategoryBtn = el('btn-add-category');
    if (addCategoryBtn) {
      addCategoryBtn.addEventListener('click', showAddCategoryModal);
    }
  }

  // ============================================================================
  // STATS & OWNER INFO
  // ============================================================================

  /**
   * Загрузить информацию владельца
   */
  async function loadOwnerInfo() {
    try {
      if (!state.currentUser) {
        throw new Error('Current user not available');
      }

      const ownerName = el('owner-name');
      if (ownerName) {
        ownerName.textContent = state.currentUser.name || 'Владелец';
      }

      log('Owner info loaded', state.currentUser);
    } catch (err) {
      handleError(err, 'loadOwnerInfo');
    }
  }

  /**
   * Загрузить статистику проекта
   */
  async function loadStats() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      const stat1 = el('stat-pavilions');
      const stat2 = el('stat-premium');
      const stat3 = el('stat-tenants');
      const stat4 = el('stat-approved');
      const stat5 = el('stat-views');
      const stat6 = el('stat-revenue');

      // Получить данные (в реальном приложении из БД)
      state.stats.totalPavilions = state.allPavilions.length;
      state.stats.premiumPavilions = state.allPavilions.filter(p => p.is_premium).length;
      state.stats.totalTenants = state.allTenants.length;
      state.stats.approvedTenants = state.allTenants.filter(t => t.approved).length;
      state.stats.pageViews = parseInt(localStorage.getItem('pageViews') || '0');

      // Обновить UI
      if (stat1) stat1.textContent = state.stats.totalPavilions;
      if (stat2) stat2.textContent = state.stats.premiumPavilions;
      if (stat3) stat3.textContent = state.stats.totalTenants;
      if (stat4) stat4.textContent = state.stats.approvedTenants;
      if (stat5) stat5.textContent = state.stats.pageViews.toLocaleString('ru-RU');
      if (stat6) stat6.textContent = `${state.stats.monthlyRevenue.toLocaleString('ru-RU')} ₽`;

      log('Stats loaded', state.stats);
    } catch (err) {
      handleError(err, 'loadStats');
    }
  }

  // ============================================================================
  // PAVILIONS MANAGEMENT
  // ============================================================================

  /**
   * Загрузить все павильоны
   */
  async function loadAllPavilions() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      // Получить павильоны (используй функцию из data.js)
      state.allPavilions = await window.Data.getAllPavilions?.() || [];

      log(`Loaded ${state.allPavilions.length} pavilions`);
      renderPavilionsList();
    } catch (err) {
      handleError(err, 'loadAllPavilions');
      state.allPavilions = [];
    }
  }

  /**
   * Отрендерить список павильонов
   */
  function renderPavilionsList() {
    const tableBody = el('pavilions-table-body');
    if (!tableBody) return;

    const filtered = getFilteredPavilions();
    
    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Павильоны не найдены</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(pavilion => `
      <tr>
        <td>${pavilion.floor || '—'}</td>
        <td>${pavilion.location_x || '—'}</td>
        <td><strong>${escapeHtml(pavilion.shop_name || '')}</strong></td>
        <td>${escapeHtml(pavilion.category || '')}</td>
        <td>${escapeHtml(pavilion.owner_name || '—')}</td>
        <td>
          <span class="badge ${pavilion.is_premium ? 'badge-gold' : 'badge-info'}">
            ${pavilion.is_premium ? 'Премиум' : 'Стандарт'}
          </span>
        </td>
        <td>
          <button onclick="window.SuperAdmin.editPavilion('${pavilion.id}')" class="btn btn-sm">Редакт.</button>
          <button onclick="window.SuperAdmin.togglePavPremium('${pavilion.id}')" class="btn btn-sm">Премиум</button>
          <button onclick="window.SuperAdmin.deletePavilion('${pavilion.id}')" class="btn btn-sm btn-danger">Удал.</button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Получить отфильтрованные павильоны
   */
  function getFilteredPavilions() {
    let filtered = [...state.allPavilions];

    const { floor, category, premium, search } = state.filters.pavilions;

    if (floor && floor !== '') {
      filtered = filtered.filter(p => String(p.floor) === floor);
    }

    if (category && category !== '') {
      filtered = filtered.filter(p => p.category === category);
    }

    if (premium === 'premium') {
      filtered = filtered.filter(p => p.is_premium);
    } else if (premium === 'standard') {
      filtered = filtered.filter(p => !p.is_premium);
    }

    if (search && search.trim() !== '') {
      const query = search.toLowerCase();
      filtered = filtered.filter(p => 
        (p.shop_name || '').toLowerCase().includes(query) ||
        (p.owner_name || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  /**
   * Фильтровать и отобразить павильоны
   */
  function filterAndRenderPavilions() {
    renderPavilionsList();
  }

  /**
   * Открыть форму редактирования павильона
   */
  async function editPavilion(id) {
    try {
      const pavilion = state.allPavilions.find(p => p.id === id);
      if (!pavilion) {
        throw new Error('Pavilion not found');
      }

      // Заполнить форму (реализация зависит от HTML структуры)
      const modal = el('edit-pavilion-modal');
      if (modal) {
        // Заполнить поля формы
        const nameInput = modal.querySelector('[name="pavilion-name"]');
        if (nameInput) nameInput.value = pavilion.shop_name || '';
        
        // Показать модальное окно
        modal.style.display = 'block';
      }

      log('Editing pavilion', id);
    } catch (err) {
      handleError(err, 'editPavilion');
    }
  }

  /**
   * Удалить павильон с подтверждением
   */
  async function deletePavilion(id) {
    try {
      const confirmed = confirm('Вы уверены? Это действие необратимо.');
      if (!confirmed) return;

      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.deletePavilion?.(id);

      state.allPavilions = state.allPavilions.filter(p => p.id !== id);
      renderPavilionsList();

      showMessage('Павильон удалён', 'success');
      log('Pavilion deleted', id);
    } catch (err) {
      handleError(err, 'deletePavilion');
    }
  }

  /**
   * Изменить владельца павильона
   */
  async function changeOwner(pavilionId, newOwnerId) {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.updatePavilion?.(pavilionId, { owner_id: newOwnerId });

      // Обновить локальное состояние
      const pavilion = state.allPavilions.find(p => p.id === pavilionId);
      if (pavilion) {
        pavilion.owner_id = newOwnerId;
      }

      renderPavilionsList();
      showMessage('Владелец изменён', 'success');
    } catch (err) {
      handleError(err, 'changeOwner');
    }
  }

  /**
   * Переключить премиум-статус павильона
   */
  async function togglePavPremium(pavilionId) {
    try {
      const pavilion = state.allPavilions.find(p => p.id === pavilionId);
      if (!pavilion) {
        throw new Error('Pavilion not found');
      }

      if (!window.Data) {
        throw new Error('Data module not available');
      }

      const newStatus = !pavilion.is_premium;
      await window.Data.updatePavilion?.(pavilionId, { is_premium: newStatus });

      pavilion.is_premium = newStatus;
      renderPavilionsList();

      showMessage(
        newStatus ? 'Павильон переведён в премиум' : 'Премиум отключен',
        'success'
      );
    } catch (err) {
      handleError(err, 'togglePavPremium');
    }
  }

  // ============================================================================
  // TENANTS MANAGEMENT
  // ============================================================================

  /**
   * Загрузить всех арендаторов
   */
  async function loadAllTenants() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      state.allTenants = await window.Data.getAllTenants?.() || [];

      log(`Loaded ${state.allTenants.length} tenants`);
      renderTenantsList();
    } catch (err) {
      handleError(err, 'loadAllTenants');
      state.allTenants = [];
    }
  }

  /**
   * Отрендерить список арендаторов
   */
  function renderTenantsList() {
    const tableBody = el('tenants-table-body');
    if (!tableBody) return;

    const filtered = getFilteredTenants();

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Арендаторы не найдены</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(tenant => `
      <tr>
        <td><strong>${escapeHtml(tenant.name || '')}</strong></td>
        <td>${escapeHtml(tenant.phone || '—')}</td>
        <td>
          <span class="badge ${tenant.approved ? 'badge-success' : 'badge-warning'}">
            ${tenant.approved ? 'Одобрен' : 'На модерации'}
          </span>
        </td>
        <td>
          <span class="badge ${tenant.is_premium ? 'badge-gold' : ''}">
            ${tenant.is_premium ? '⭐ Премиум' : ''}
          </span>
        </td>
        <td>${tenant.pavilion_count || 0}</td>
        <td>
          ${!tenant.approved ? `<button onclick="window.SuperAdmin.approveTenant('${tenant.id}')" class="btn btn-sm">Одобр.</button>` : ''}
          ${tenant.approved ? `<button onclick="window.SuperAdmin.rejectTenant('${tenant.id}')" class="btn btn-sm">Отклон.</button>` : ''}
          <button onclick="window.SuperAdmin.toggleTenantPremium('${tenant.id}')" class="btn btn-sm">Премиум</button>
          <button onclick="window.SuperAdmin.deleteTenant('${tenant.id}')" class="btn btn-sm btn-danger">Удал.</button>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Получить отфильтрованных арендаторов
   */
  function getFilteredTenants() {
    let filtered = [...state.allTenants];

    const { status, search } = state.filters.tenants;

    if (status === 'approved') {
      filtered = filtered.filter(t => t.approved);
    } else if (status === 'pending') {
      filtered = filtered.filter(t => !t.approved);
    }

    if (search && search.trim() !== '') {
      const query = search.toLowerCase();
      filtered = filtered.filter(t =>
        (t.name || '').toLowerCase().includes(query) ||
        (t.phone || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  }

  /**
   * Фильтровать и отобразить арендаторов
   */
  function filterAndRenderTenants() {
    renderTenantsList();
  }

  /**
   * Одобрить арендатора
   */
  async function approveTenant(id) {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.updateTenant?.(id, { approved: true });

      const tenant = state.allTenants.find(t => t.id === id);
      if (tenant) {
        tenant.approved = true;
      }

      renderTenantsList();
      showMessage('Арендатор одобрен', 'success');
    } catch (err) {
      handleError(err, 'approveTenant');
    }
  }

  /**
   * Отклонить арендатора
   */
  async function rejectTenant(id) {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.updateTenant?.(id, { approved: false });

      const tenant = state.allTenants.find(t => t.id === id);
      if (tenant) {
        tenant.approved = false;
      }

      renderTenantsList();
      showMessage('Арендатор отклонен', 'success');
    } catch (err) {
      handleError(err, 'rejectTenant');
    }
  }

  /**
   * Переключить премиум-статус арендатора
   */
  async function toggleTenantPremium(id) {
    try {
      const tenant = state.allTenants.find(t => t.id === id);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      if (!window.Data) {
        throw new Error('Data module not available');
      }

      const newStatus = !tenant.is_premium;
      await window.Data.updateTenant?.(id, { is_premium: newStatus });

      tenant.is_premium = newStatus;
      renderTenantsList();

      showMessage(
        newStatus ? 'Премиум активирован' : 'Премиум отключен',
        'success'
      );
    } catch (err) {
      handleError(err, 'toggleTenantPremium');
    }
  }

  /**
   * Добавить арендатора вручную
   */
  async function addTenantManually(data) {
    try {
      if (!data.name || !data.phone) {
        throw new Error('Name and phone are required');
      }

      if (!window.Data) {
        throw new Error('Data module not available');
      }

      const newTenant = await window.Data.createTenant?.(data) || {
        id: 'new-' + Date.now(),
        ...data,
        approved: false,
        is_premium: data.is_premium || false
      };

      state.allTenants.push(newTenant);
      renderTenantsList();

      showMessage('Арендатор добавлен', 'success');
      hideAddTenantModal();
    } catch (err) {
      handleError(err, 'addTenantManually');
    }
  }

  /**
   * Удалить арендатора
   */
  async function deleteTenant(id) {
    try {
      const confirmed = confirm('Удалить этого арендатора? Это действие необратимо.');
      if (!confirmed) return;

      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.deleteTenant?.(id);

      state.allTenants = state.allTenants.filter(t => t.id !== id);
      renderTenantsList();

      showMessage('Арендатор удалён', 'success');
    } catch (err) {
      handleError(err, 'deleteTenant');
    }
  }

  // ============================================================================
  // AD BANNER MANAGEMENT
  // ============================================================================

  /**
   * Загрузить баннер
   */
  async function loadAdBanner() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      // Получить баннер (реализация зависит от data.js)
      state.adBanner = await window.Data.getAdBanner?.() || {
        id: null,
        image_url: null,
        html_code: '',
        is_active: false,
        impressions: 0,
        clicks: 0
      };

      renderBannerStatus();
    } catch (err) {
      handleError(err, 'loadAdBanner');
    }
  }

  /**
   * Отрендерить статус баннера
   */
  function renderBannerStatus() {
    const statusEl = el('banner-status');
    const activateBtn = el('btn-activate-banner');
    const deactivateBtn = el('btn-deactivate-banner');

    if (statusEl) {
      statusEl.innerHTML = state.adBanner?.is_active 
        ? '<span class="badge badge-success">🟢 Активный</span>'
        : '<span class="badge badge-warning">⚪ Неактивный</span>';
    }

    if (activateBtn) {
      activateBtn.style.display = state.adBanner?.is_active ? 'none' : 'inline-block';
    }
    if (deactivateBtn) {
      deactivateBtn.style.display = state.adBanner?.is_active ? 'inline-block' : 'none';
    }
  }

  /**
   * Активировать баннер
   */
  async function activateBanner() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.updateAdBanner?.(state.adBanner?.id, { is_active: true });

      if (state.adBanner) {
        state.adBanner.is_active = true;
      }

      renderBannerStatus();
      showMessage('Баннер активирован', 'success');
    } catch (err) {
      handleError(err, 'activateBanner');
    }
  }

  /**
   * Деактивировать баннер
   */
  async function deactivateBanner() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      await window.Data.updateAdBanner?.(state.adBanner?.id, { is_active: false });

      if (state.adBanner) {
        state.adBanner.is_active = false;
      }

      renderBannerStatus();
      showMessage('Баннер деактивирован', 'success');
    } catch (err) {
      handleError(err, 'deactivateBanner');
    }
  }

  /**
   * Загрузить изображение баннера (макс 500 КБ)
   */
  async function uploadAdImage(file) {
    try {
      if (!file) {
        throw new Error('No file selected');
      }

      const maxSize = 500 * 1024; // 500 KB
      if (file.size > maxSize) {
        throw new Error('Файл too large (max 500 KB)');
      }

      if (!window.Data) {
        throw new Error('Data module not available');
      }

      // Загрузить в хранилище
      const imageUrl = await window.Data.uploadFile?.(file) || URL.createObjectURL(file);

      state.adBanner = state.adBanner || {};
      state.adBanner.image_url = imageUrl;

      previewBanner();
      showMessage('Изображение загружено', 'success');
    } catch (err) {
      handleError(err, 'uploadAdImage');
    }
  }

  /**
   * Предпросмотр баннера
   */
  function previewBanner() {
    const preview = el('banner-preview');
    if (!preview) return;

    if (state.adBanner?.image_url) {
      preview.innerHTML = `<img src="${state.adBanner.image_url}" alt="Banner" style="max-width: 100%; max-height: 200px;">`;
    } else {
      preview.innerHTML = '<p>Нет изображения</p>';
    }
  }

  /**
   * Получить статистику баннера
   */
  function getBannerStats() {
    return {
      impressions: state.adBanner?.impressions || 0,
      clicks: state.adBanner?.clicks || 0,
      ctr: state.adBanner?.impressions ? 
        ((state.adBanner.clicks / state.adBanner.impressions) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  // ============================================================================
  // PROJECT SETTINGS
  // ============================================================================

  /**
   * Загрузить настройки проекта
   */
  async function loadProjectSettings() {
    try {
      if (!window.Data) {
        throw new Error('Data module not available');
      }

      // Получить настройки из storage или БД
      const stored = localStorage.getItem('projectSettings');
      if (stored) {
        state.projectSettings = JSON.parse(stored);
      }

      renderProjectSettings();
    } catch (err) {
      handleError(err, 'loadProjectSettings');
    }
  }

  /**
   * Отрендерить настройки проекта
   */
  function renderProjectSettings() {
    const nameInput = el('project-name');
    const colorInput = el('project-color');
    const categoriesContainer = el('categories-list');

    if (nameInput) {
      nameInput.value = state.projectSettings.name;
    }

    if (colorInput) {
      colorInput.value = state.projectSettings.themeColor;
    }

    if (categoriesContainer) {
      categoriesContainer.innerHTML = (state.projectSettings.categories || [])
        .map(cat => `
          <div style="padding: 8px; border-bottom: 1px solid #eee;">
            <span>${cat.emoji || ''} ${escapeHtml(cat.name)}</span>
            <button onclick="window.SuperAdmin.removeGlobalCategory('${cat.id}')" class="btn btn-sm btn-danger" style="float: right;">✕</button>
          </div>
        `).join('');
    }
  }

  /**
   * Обновить название проекта
   */
  async function updateProjectName(name) {
    try {
      if (!name || name.trim() === '') {
        throw new Error('Project name cannot be empty');
      }

      state.projectSettings.name = name;
      saveProjectSettings();

      showMessage('Название проекта обновлено', 'success');
    } catch (err) {
      handleError(err, 'updateProjectName');
    }
  }

  /**
   * Обновить цветовую схему
   */
  async function updateThemeColor(color) {
    try {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        throw new Error('Invalid color format');
      }

      state.projectSettings.themeColor = color;
      document.documentElement.style.setProperty('--color-primary', color);
      saveProjectSettings();

      showMessage('Цвет темы обновлён', 'success');
    } catch (err) {
      handleError(err, 'updateThemeColor');
    }
  }

  /**
   * Добавить глобальную категорию
   */
  async function addGlobalCategory(categoryData) {
    try {
      if (!categoryData.name || categoryData.name.trim() === '') {
        throw new Error('Category name is required');
      }

      const newCategory = {
        id: 'cat-' + Date.now(),
        name: categoryData.name,
        emoji: categoryData.emoji || ''
      };

      state.projectSettings.categories = state.projectSettings.categories || [];
      state.projectSettings.categories.push(newCategory);
      saveProjectSettings();
      renderProjectSettings();

      showMessage('Категория добавлена', 'success');
      hideAddCategoryModal();
    } catch (err) {
      handleError(err, 'addGlobalCategory');
    }
  }

  /**
   * Удалить глобальную категорию
   */
  async function removeGlobalCategory(categoryId) {
    try {
      const confirmed = confirm('Удалить эту категорию?');
      if (!confirmed) return;

      state.projectSettings.categories = (state.projectSettings.categories || [])
        .filter(c => c.id !== categoryId);

      saveProjectSettings();
      renderProjectSettings();

      showMessage('Категория удалена', 'success');
    } catch (err) {
      handleError(err, 'removeGlobalCategory');
    }
  }

  /**
   * Сохранить настройки проекта
   */
  function saveProjectSettings() {
    localStorage.setItem('projectSettings', JSON.stringify(state.projectSettings));
  }

  // ============================================================================
  // TABS MANAGEMENT
  // ============================================================================

  /**
   * Инициализировать табы
   */
  function initTabs() {
    const navTabs = document.querySelectorAll('[data-tab]');
    navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = tab.getAttribute('data-tab');
        switchTab(tabName);
      });
    });

    // Показать первый таб по умолчанию
    switchTab('stats');
  }

  /**
   * Переключиться между табами
   */
  function switchTab(tabName) {
    // Скрыть все табы
    const allTabs = document.querySelectorAll('[id$="-tab"]');
    allTabs.forEach(tab => {
      tab.style.display = 'none';
    });

    // Показать выбранный таб
    const selectedTab = el(`${tabName}-tab`);
    if (selectedTab) {
      selectedTab.style.display = 'block';
    }

    // Обновить активность навигации
    const navTabs = document.querySelectorAll('[data-tab]');
    navTabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-tab') === tabName) {
        tab.classList.add('active');
      }
    });

    state.currentTab = tabName;
    log(`Switched to tab: ${tabName}`);
  }

  // ============================================================================
  // MODAL MANAGEMENT
  // ============================================================================

  /**
   * Показать модаль добавления арендатора
   */
  function showAddTenantModal() {
    const modal = el('add-tenant-modal');
    if (modal) {
      modal.style.display = 'block';
      const form = modal.querySelector('form');
      if (form) form.reset();
    }
  }

  /**
   * Скрыть модаль добавления арендатора
   */
  function hideAddTenantModal() {
    const modal = el('add-tenant-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Показать модаль добавления категории
   */
  function showAddCategoryModal() {
    const modal = el('add-category-modal');
    if (modal) {
      modal.style.display = 'block';
      const form = modal.querySelector('form');
      if (form) form.reset();
    }
  }

  /**
   * Скрыть модаль добавления категории
   */
  function hideAddCategoryModal() {
    const modal = el('add-category-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Закрыть модали при клике на фон
   */
  function setupModalCloseOnBackground() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
      }
    });
  }

  // ============================================================================
  // FORM SUBMISSION HANDLERS
  // ============================================================================

  /**
   * Сохранить настройки баннера
   */
  async function saveBannerSettings() {
    try {
      const htmlCode = el('banner-html-code')?.value || '';

      state.adBanner = state.adBanner || {};
      state.adBanner.html_code = htmlCode;

      // В реальном приложении сохранить в БД
      await window.Data.updateAdBanner?.(state.adBanner.id, { html_code: htmlCode });

      showMessage('Настройки баннера сохранены', 'success');
    } catch (err) {
      handleError(err, 'saveBannerSettings');
    }
  }

  /**
   * Сохранить настройки проекта
   */
  async function saveProjectSettings() {
    try {
      const nameInput = el('project-name');
      const colorInput = el('project-color');

      if (nameInput) {
        await updateProjectName(nameInput.value);
      }

      if (colorInput) {
        await updateThemeColor(colorInput.value);
      }

      saveProjectSettings();
      showMessage('Настройки проекта сохранены', 'success');
    } catch (err) {
      handleError(err, 'saveProjectSettings');
    }
  }

  // ============================================================================
  // PUBLIC API EXPORT
  // ============================================================================

  window.SuperAdmin = {
    init,
    
    // Павильоны
    loadAllPavilions,
    editPavilion,
    deletePavilion,
    changeOwner,
    togglePavPremium,
    filterAndRenderPavilions,
    
    // Арендаторы
    loadAllTenants,
    approveTenant,
    rejectTenant,
    toggleTenantPremium,
    addTenantManually,
    deleteTenant,
    filterAndRenderTenants,
    
    // Баннер
    loadAdBanner,
    activateBanner,
    deactivateBanner,
    uploadAdImage,
    previewBanner,
    getBannerStats,
    saveBannerSettings,
    
    // Настройки
    loadProjectSettings,
    updateProjectName,
    updateThemeColor,
    addGlobalCategory,
    removeGlobalCategory,
    saveProjectSettings,
    
    // Табы
    switchTab,
    initTabs,
    
    // Модали
    showAddTenantModal,
    hideAddTenantModal,
    showAddCategoryModal,
    hideAddCategoryModal,
    
    // Статистика
    loadStats,
    loadOwnerInfo
  };

  // ============================================================================
  // AUTO-INITIALIZATION
  // ============================================================================

  document.addEventListener('DOMContentLoaded', () => {
    if (el('admin-content') || el('access-denied')) {
      init();
      setupModalCloseOnBackground();
    }
  });

})();
