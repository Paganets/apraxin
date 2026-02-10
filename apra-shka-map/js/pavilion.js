/* js/pavilion.js — Логика страницы павильона
   - Поддержка двух форматов URL: ?id=UUID и ЧПУ /pavilion/slug
   - Загрузка данных павильона и владельца через window.Data
   - Рендер контента и премиум-фич
   - Экспорт функций через window.Pavilion
*/

(function () {
  'use strict';

  let currentPavilion = null;
  let currentTenant = null;
  let isPremium = false;

  // -----------------------------
  // Утилиты
  // -----------------------------
  function el(id) { return document.getElementById(id); }
  function log(...args) { console.log('Pavilion:', ...args); }
  function warn(...args) { console.warn('Pavilion:', ...args); }
  function handleError(err, userMsg) {
    console.error('Pavilion error:', err);
    if (userMsg) showMessage(userMsg, 'error');
  }

  function showMessage(msg, type = 'info') {
    try {
      let area = el('pavilion-notice');
      if (!area) {
        area = document.createElement('div');
        area.id = 'pavilion-notice';
        area.style.position = 'fixed';
        area.style.right = '16px';
        area.style.top = '16px';
        area.style.padding = '10px 14px';
        area.style.borderRadius = '8px';
        area.style.zIndex = 9999;
        document.body.appendChild(area);
      }
      area.textContent = msg;
      area.style.background = type === 'error' ? '#ffdddd' : '#111';
      area.style.color = type === 'error' ? '#900' : '#fff';
      setTimeout(() => { area.textContent = ''; }, 5000);
    } catch (e) { alert(msg); }
  }

  // -----------------------------
  // 1. Инициализация
  // -----------------------------
  async function init() {
    try {
      log('init()');

      const { id, slug } = parseUrl();
      let pavilion = null;

      if (id) {
        pavilion = await fetchPavilionById(id);
      } else if (slug) {
        pavilion = await getPavilionBySlug(slug);
      }

      if (!pavilion) {
        handleError(new Error('Pavilion not found'), 'Павильон не найден');
        return;
      }

      currentPavilion = pavilion;

      // Загрузить владельца
      if (window.Data && window.Data.getTenantById) {
        try { currentTenant = await window.Data.getTenantById(pavilion.tenant_id); } catch (e) { warn('tenant fetch failed', e); }
      }

      // Проверить премиум
      isPremium = checkPremiumStatus(currentTenant || pavilion.tenant);

      // Если премиум и у нас есть имя, можно обновить URL на ЧПУ
      if (isPremium && canUseSlug()) {
        const generated = generateSlug(pavilion.name || pavilion.title || ('p_' + pavilion.id));
        const uniqueSlug = await ensureUniqueSlug(generated, pavilion.id);
        updateURLWithSlug(uniqueSlug);
      }

      // Отрисовка
      renderAll();

      // Загрузить рекламу
      loadAdBanner();

      log('init done');
    } catch (err) {
      handleError(err, 'Ошибка инициализации страницы павильона');
    }
  }

  // -----------------------------
  // Parse URL
  // -----------------------------
  function parseUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('pavilion') || null;

    // ЧПУ: ищем сегмент после /pavilion/ или последний сегмент
    const path = window.location.pathname.replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    let slug = null;
    const pavilionIndex = parts.indexOf('pavilion');
    if (pavilionIndex >= 0 && parts.length > pavilionIndex + 1) {
      slug = parts[pavilionIndex + 1];
    } else if (!id && parts.length === 1) {
      // если URL корневой уровень /nazvanie-magazina — допустим как slug
      slug = parts[0];
    } else if (!id && parts.length > 0 && parts[parts.length-2] === 'pavilion') {
      slug = parts[parts.length-1];
    }

    return { id, slug };
  }

  // -----------------------------
  // 2. Поддержка ЧПУ
  // -----------------------------
  // Простая транслитерация + очистка
  function generateSlug(shopName) {
    if (!shopName) return '';
    const map = {
      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
    };
    let s = shopName.toLowerCase().trim();
    s = s.replace(/\s+/g, '-');
    // translit
    s = s.split('').map(ch => map[ch] !== undefined ? map[ch] : ch).join('');
    // remove invalid chars
    s = s.replace(/[^a-z0-9\-]/g, '');
    s = s.replace(/\-+/g, '-');
    s = s.replace(/(^\-+|\-+$)/g, '');
    return s || ('p' + Date.now());
  }

  async function getPavilionBySlug(slug) {
    try {
      if (!slug) return null;
      if (window.Data && window.Data.getPavilionBySlug) {
        return await window.Data.getPavilionBySlug(slug);
      }
      // Fallback: getAll and match by slug property
      if (window.Data && window.Data.getAllPavilions) {
        const all = await window.Data.getAllPavilions();
        return all.find(p => p.slug === slug || p.url_slug === slug) || null;
      }
      return null;
    } catch (err) {
      warn('getPavilionBySlug failed', err);
      return null;
    }
  }

  function updateURLWithSlug(slug) {
    try {
      if (!slug) return;
      const newPath = '/pavilion/' + slug;
      if (window.location.pathname !== newPath) {
        history.replaceState({}, '', newPath + window.location.search);
        log('URL updated to', newPath);
      }
    } catch (err) { warn('updateURLWithSlug', err); }
  }

  async function ensureUniqueSlug(base, pavilionId) {
    let candidate = base;
    let suffix = 1;
    while (!(await isSlugAvailable(candidate, pavilionId))) {
      candidate = base + '-' + suffix;
      suffix++;
      if (suffix > 9999) break;
    }
    return candidate;
  }

  async function isSlugAvailable(slug, pavilionId) {
    if (!slug) return false;
    try {
      if (window.Data && window.Data.getPavilionBySlug) {
        const found = await window.Data.getPavilionBySlug(slug);
        if (!found) return true;
        // если найден павильон и это тот же объект — считаем доступным
        if (pavilionId && String(found.id) === String(pavilionId)) return true;
        return false;
      }
      if (window.Data && window.Data.getAllPavilions) {
        const all = await window.Data.getAllPavilions();
        const found = all.find(p => p.slug === slug || p.url_slug === slug);
        if (!found) return true;
        if (pavilionId && String(found.id) === String(pavilionId)) return true;
        return false;
      }
    } catch (err) { warn('isSlugAvailable', err); }
    // если Data не доступен — не рискуем
    return false;
  }

  function canUseSlug() {
    // Право на ЧПУ только для премиум
    return isPremium === true;
  }

  // -----------------------------
  // 3. Загрузка данных
  // -----------------------------
  async function fetchPavilionById(id) {
    try {
      if (!id) return null;
      if (window.Data && window.Data.getPavilionById) return await window.Data.getPavilionById(id);
      if (window.Data && window.Data.getAllPavilions) {
        const all = await window.Data.getAllPavilions();
        return all.find(p => String(p.id) === String(id)) || null;
      }
      return null;
    } catch (err) { warn('fetchPavilionById', err); return null; }
  }

  // -----------------------------
  // 4. Рендеринг
  // -----------------------------
  function renderAll() {
    try {
      renderHeader(currentPavilion);
      renderCategories([currentPavilion.category].concat(currentPavilion.additional_categories || []));
      renderDiscounts(currentPavilion.discounts || []);
      renderContacts(currentTenant || currentPavilion.tenant || {});
      togglePremiumFeatures(isPremium);
    } catch (err) { handleError(err, 'Ошибка отрисовки страницы'); }
  }

  function renderHeader(p) {
    if (!p) return;
    if (el('pavilion-name')) el('pavilion-name').textContent = p.name || p.title || '—';
    if (el('pavilion-location')) el('pavilion-location').textContent = p.location || '—';
    if (el('pavilion-floor')) el('pavilion-floor').textContent = p.floor ? `${p.floor} этаж` : '—';

    // категория
    const mainCat = p.category || (p.categories && p.categories[0]) || '—';
    if (el('pavilion-category')) el('pavilion-category').innerHTML = `<span class="pavilion-category">${mainCat}</span>`;
    if (el('pavilion-category-large')) el('pavilion-category-large').textContent = mainCat;

    // изображение
    if (p.image_url && el('pavilion-hero')) {
      const hero = el('pavilion-hero');
      const img = document.createElement('img');
      img.src = p.image_url;
      img.alt = p.name || '';
      img.className = 'pavilion-hero';
      hero.replaceWith(img);
    }

    // premium badge handled in togglePremiumFeatures
  }

  function renderDiscounts(discounts) {
    try {
      const container = el('discounts-list');
      if (!container) return;
      if (!discounts || discounts.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📦</div><p>Скидок нет</p></div>`;
        return;
      }
      container.innerHTML = discounts.map(d => {
        const end = d.endDate ? ` <span class="discount-meta-item">📅 До ${new Date(d.endDate).toLocaleDateString('ru-RU')}</span>` : '';
        return `
          <div class="discount-card">
            <div class="discount-title">${escapeHtml(d.title || 'Скидка')}</div>
            <div class="discount-description">${escapeHtml(d.description || '')}</div>
            ${end}
          </div>
        `;
      }).join('');
    } catch (err) { warn('renderDiscounts', err); }
  }

  function renderCategories(categories) {
    try {
      if (!categories || categories.length === 0) return;
      const list = el('additional-categories-list');
      if (!list) return;
      list.innerHTML = categories.filter(Boolean).map(c => `<span class="category-badge">${escapeHtml(c)}</span>`).join('');
    } catch (err) { warn('renderCategories', err); }
  }

  function renderContacts(tenant) {
    try {
      const contactsSection = el('contacts-section');
      const callBtn = el('call-btn');
      const messageBtn = el('message-btn');
      if (!contactsSection || !callBtn || !messageBtn) return;

      if (!tenant) {
        contactsSection.style.display = 'none';
        return;
      }

      const phone = tenant.phone || tenant.tenant_phone || currentPavilion.tenant_phone;
      if (phone) {
        callBtn.href = `tel:${phone}`;
        const wa = `https://wa.me/${String(phone).replace(/\D/g,'')}?text=${encodeURIComponent('Привет! Я интересуюсь вашим павильоном')}`;
        messageBtn.href = wa;
        messageBtn.target = '_blank';
        // show
        contactsSection.style.display = isPremium ? 'block' : 'none';
      } else {
        contactsSection.style.display = 'none';
      }
    } catch (err) { warn('renderContacts', err); }
  }

  function renderAdBanner() {
    try {
      const adBanner = el('ad-banner');
      const adContainer = el('ad-container');
      if (!adBanner || !adContainer) return;
      if (!currentPavilion) return;

      // Try pavilion.ad_code first
      if (currentPavilion.ad_active && currentPavilion.ad_code) {
        adContainer.innerHTML = currentPavilion.ad_code;
        adBanner.style.display = 'block';
        return;
      }

      // Otherwise try data API
      if (window.Data && window.Data.getAdByPavilionId) {
        window.Data.getAdByPavilionId(currentPavilion.id).then(ad => {
          if (ad && ad.code) {
            adContainer.innerHTML = ad.code;
            adBanner.style.display = 'block';
          } else {
            adBanner.style.display = 'none';
          }
        }).catch(err => { warn('getAdByPavilionId', err); adBanner.style.display = 'none'; });
      } else {
        adBanner.style.display = 'none';
      }
    } catch (err) { warn('renderAdBanner', err); }
  }

  // -----------------------------
  // 5. Кнопки действий
  // -----------------------------
  function showOnMap() {
    if (!currentPavilion) return;
    window.location.href = `./index.html?pavilion=${currentPavilion.id}`;
  }

  function sharePavilion() {
    if (!currentPavilion) return;
    const slug = currentPavilion.slug || currentPavilion.url_slug;
    const shareUrl = (isPremium && slug) ? `${location.origin}/pavilion/${slug}` : window.location.href;
    const shareText = `Посмотрите павильон "${currentPavilion.name}" на Карта Апрашки`;

    if (navigator.share) {
      navigator.share({ title: currentPavilion.name, text: shareText, url: shareUrl }).catch(e => console.warn('share fail', e));
    } else {
      navigator.clipboard?.writeText(shareUrl).then(()=> showMessage('Ссылка скопирована')) .catch(()=> alert(shareUrl));
    }

    // increment local share counter if premium (localStorage fallback)
    if (isPremium) {
      const key = `pavilion_shares_${currentPavilion.id}`;
      const v = parseInt(localStorage.getItem(key) || '0') + 1;
      localStorage.setItem(key, String(v));
    }
  }

  function showRoute() {
    if (!currentPavilion) return;
    const lat = currentPavilion.coordinates?.lat || currentPavilion.coordinates?.y || null;
    const lng = currentPavilion.coordinates?.lng || currentPavilion.coordinates?.x || null;
    if (!lat || !lng) {
      showMessage('Координаты не заданы', 'info');
      return;
    }
    const maps = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(maps, '_blank');
  }

  function contactOwner() {
    if (!currentPavilion) return;
    if (!isPremium) { showMessage('Контакты доступны только для премиум', 'info'); return; }
    const phone = currentPavilion.tenant_phone || currentTenant?.phone;
    if (!phone) { showMessage('Номер телефона не указан', 'info'); return; }
    const wa = `https://wa.me/${String(phone).replace(/\D/g,'')}?text=${encodeURIComponent('Привет! Я заинтересован в вашем павильоне')}`;
    window.open(wa, '_blank');
  }

  // -----------------------------
  // 6. Проверка премиум-статуса
  // -----------------------------
  function checkPremiumStatus(tenant) {
    try {
      if (!tenant) return false;
      return !!tenant.is_premium;
    } catch (err) { warn('checkPremiumStatus', err); return false; }
  }

  function togglePremiumFeatures(flag) {
    try {
      isPremium = !!flag;
      // badge
      const badge = el('premium-badge');
      if (badge) badge.style.display = isPremium ? 'inline-block' : 'none';

      // discounts section
      const discounts = el('discounts-section'); if (discounts) discounts.style.display = isPremium ? 'block' : 'none';
      // contacts
      const contacts = el('contacts-section'); if (contacts) contacts.style.display = isPremium ? 'block' : 'none';
      // additional categories
      const addCats = el('additional-categories'); if (addCats) addCats.style.display = isPremium ? 'block' : 'none';
      // stats
      const stats = el('stats-section'); if (stats) stats.style.display = isPremium ? 'block' : 'none';
    } catch (err) { warn('togglePremiumFeatures', err); }
  }

  // -----------------------------
  // 7. Реклама
  // -----------------------------
  function loadAdBanner() {
    try {
      // Try to get ad info from pavilion object or via Data API
      if (!currentPavilion) return;
      if (currentPavilion.ad_active) {
        renderAdBanner();
        return;
      }
      if (window.Data && window.Data.getAdByPavilionId) {
        window.Data.getAdByPavilionId(currentPavilion.id).then(ad => {
          if (ad && ad.active) {
            currentPavilion.ad_active = true;
            currentPavilion.ad_code = ad.code;
            renderAdBanner();
          }
        }).catch(err => warn('loadAdBanner', err));
      }
    } catch (err) { warn('loadAdBanner', err); }
  }

  // -----------------------------
  // 8. Вспомогательные функции
  // -----------------------------
  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]); }

  // -----------------------------
  // Export API
  // -----------------------------
  window.Pavilion = {
    init,
    generateSlug,
    getPavilionBySlug,
    updateURLWithSlug,
    renderHeader,
    renderDiscounts,
    renderCategories,
    renderContacts,
    renderAdBanner,
    showOnMap,
    sharePavilion,
    showRoute,
    contactOwner,
    checkPremiumStatus,
    togglePremiumFeatures,
    loadAdBanner
  };

  // Автоинициализация
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => init(), 200);
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

})();
