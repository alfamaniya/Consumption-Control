/* بارگذاری کنترل‌شده سکشن‌ها و مدیریت چرخه عمر ماژول‌ها */
(async function () {
  'use strict';
  const sectionFiles = {
    'section-dashboard': 'dashboard/dashboard.html',
    'section-1': 'entry/entry.html',
    'section-2': 'inventory/inventory.html',
    'section-4': 'reports/reports.html',
    'section-5': 'kardex/kardex.html',
    'section-admin': 'admin/admin.html',
    'section-3': 'settings/settings.html',
    'section-tag-explorer': 'tag-explorer/tag-explorer.html'
  };
  const resourceRegistry = window.__anbarResourceRegistry || (window.__anbarResourceRegistry = new Map());
  const styles = ['dashboard/dashboard.css', 'entry/entry.css', 'inventory/inventory.css', 'admin/admin.css', 'kardex/kardex.css', 'reports/reports.css', 'settings/settings.css', 'tag-explorer/tag-explorer.css'];
  const scripts = ['settings/backup-validation.js', 'settings/backup-engine.js', 'settings/backup-folder.js', 'settings/backup-restore.js', 'index.js', 'inventory/inventory.js', 'dashboard/dashboard.js', 'entry/entry.js', 'admin/admin.js', 'kardex/kardex.js', 'reports/reports.js', 'settings/settings.js', 'tag-explorer/tag-explorer.js'];
  try {
    const mounts = Array.from(document.querySelectorAll('[data-section-mount]'));
    const expectedIds = Object.keys(sectionFiles);
    const actualIds = mounts.map(mount => mount.dataset.sectionMount);
    if (mounts.length !== expectedIds.length || new Set(actualIds).size !== actualIds.length ||
        expectedIds.some(id => !actualIds.includes(id))) {
      throw new Error('تعداد یا شناسه محل‌های بارگذاری سکشن‌ها معتبر نیست.');
    }
    const loadedSections = await Promise.all(mounts.map(async mount => {
      const id = mount.dataset.sectionMount;
      const file = sectionFiles[id];
      const response = await fetch(file, { cache: 'no-cache' });
      if (!response.ok) throw new Error('بارگذاری ' + file + ' ناموفق بود (HTTP ' + response.status + ').');
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const section = parsed.body.firstElementChild;
      if (!section || section.tagName !== 'SECTION' || section.id !== id || !section.classList.contains('section-card')) {
        throw new Error('ساختار فایل ' + file + ' معتبر نیست.');
      }
      return { mount, section };
    }));
    loadedSections.forEach(({ mount, section }) => mount.replaceWith(section));
    for (const path of styles) await loadStylesheetOnce(path);
    for (const path of scripts) await loadScriptOnce(path);
    if (typeof setupInventorySection === 'function') setupInventorySection();
    if (typeof setupDashboard === 'function') setupDashboard();
    if (typeof setupEntrySection === 'function') setupEntrySection();
    if (typeof setupAdminSection === 'function') setupAdminSection();
    window.AnbarReports?.initializeEntryHistory();
    window.AnbarReports?.initializeShipmentHistory();
    if (typeof setupKardexSection === 'function') setupKardexSection();
    if (typeof window.initializeSettingsSection === 'function') window.initializeSettingsSection();
    if (typeof window.setupTagExplorer === 'function') window.setupTagExplorer();
  } catch (error) {
    console.error('Section loader:', error);
    showError('بارگذاری بخش‌ها کامل نشد: ' + error.message + '؛ نسخه چندفایلی را از طریق وب‌سرور محلی یا HTTPS اجرا کنید.');
  }
  function loadStylesheetOnce(path) {
    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(link => link.getAttribute('href') === path);
    if (existing) return Promise.resolve();
    const key = 'css:' + path;
    if (resourceRegistry.has(key)) return resourceRegistry.get(key);
    const promise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      link.dataset.anbarSectionStylesheet = path;
      link.onload = resolve;
      link.onerror = () => reject(new Error('بارگذاری شیوه‌نامه ' + path + ' ناموفق بود.'));
      document.head.appendChild(link);
    });
    resourceRegistry.set(key, promise);
    return promise;
  }
  function loadScriptOnce(path) {
    if (resourceRegistry.has(path)) return resourceRegistry.get(path);
    const existing = Array.from(document.scripts).find(script => script.getAttribute('src') === path);
    if (existing && existing.dataset.anbarLoaded === 'true') return Promise.resolve();
    const promise = new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');
      script.src = path;
      script.async = false;
      script.onload = () => { script.dataset.anbarLoaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error('بارگذاری اسکریپت ' + path + ' ناموفق بود.'));
      if (!existing) document.body.appendChild(script);
    });
    resourceRegistry.set(path, promise);
    return promise;
  }
  function showError(message) {
    const alert = document.createElement('p');
    alert.className = 'section-load-error';
    alert.setAttribute('role', 'alert');
    alert.textContent = message;
    document.querySelector('main')?.prepend(alert);
  }
})();
