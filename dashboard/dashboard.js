/* منطق داشبورد؛ پس از بارگذاری index.js و آماده‌شدن API هسته اجرا می‌شود. */
function renderDataQualityReport() {
      const anchor = document.querySelector('.dashboard-note');
      if (!anchor) return;
      let report = document.getElementById('dashboard-data-quality-report');
      if (!report) {
        report = document.createElement('p');
        report.id = 'dashboard-data-quality-report';
        report.className = 'dashboard-note';
        report.setAttribute('role', 'status');
        report.setAttribute('aria-live', 'polite');
        anchor.insertAdjacentElement('afterend', report);
      }
      const findings = inspectStoredDataQuality();
      if (findings.length) {
        report.className = 'dashboard-note feedback';
        report.textContent = 'هشدار کیفیت داده: ' + findings.length + ' مورد مشکوک شناسایی شد؛ هیچ داده‌ای خودکار حذف یا اصلاح نشده است. ' +
          findings.slice(0, 3).join(' ');
        if (findings.length > 3) report.textContent += ' و ' + (findings.length - 3) + ' مورد دیگر؛ برای جزئیات بیشتر نسخه پشتیبان خام تهیه و سوابق را بررسی کنید.';
      } else {
        report.className = 'dashboard-note';
        report.textContent = 'کنترل کیفیت داده‌های ذخیره‌شده: ناسازگاری ساختاری، مقدار نامعتبر یا شناسه تکراری قابل تشخیص پیدا نشد.';
      }
    }

function refreshDataQualityReportSafely() {
      try { renderDataQualityReport(); }
      catch (error) { console.error('به‌روزرسانی گزارش کیفیت داده با خطا مواجه شد:', error); }
    }

function formatDashboardNumber(value) {
      const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
      return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(safeValue);
    }

function updateDashboardSummary() {
      const setMetric = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = formatDashboardNumber(value);
      };
      try {
        // موجودی از loader نرمال‌شده خوانده می‌شود تا کالاهای قدیمی نیز آستانه پیش‌فرض را داشته باشند.
        const inventory = loadInventory();
        const entryData = JSON.parse(localStorage.getItem(ENTRY_HISTORY_KEY) || '[]');
        const shipmentData = JSON.parse(localStorage.getItem(SHIPMENT_KEY) || '[]');
        const entries = Array.isArray(entryData) ? entryData : [];
        const shipments = Array.isArray(shipmentData) ? shipmentData : [];
        const zeroStockCount = inventory.filter(item => {
          const quantity = Number(item.stock);
          return Number.isFinite(quantity) && quantity <= 0;
        }).length;
        setMetric('dashboard-item-count', inventory.length);
        setMetric('dashboard-entry-count', entries.length);
        setMetric('dashboard-shipment-count', shipments.length);
        setMetric('dashboard-zero-stock-count', zeroStockCount);
        const lowStockItems = inventory.filter(isLowStockItem);
        setMetric('dashboard-low-stock-count', lowStockItems.length);
        renderDashboardStockList(inventory);
        renderDashboardLowStockList(lowStockItems);
      } catch (error) {
        ['dashboard-item-count', 'dashboard-entry-count',
          'dashboard-shipment-count', 'dashboard-zero-stock-count', 'dashboard-low-stock-count'].forEach(id => setMetric(id, 0));
        renderDashboardStockList([]);
        renderDashboardLowStockList([]);
      }
      refreshDataQualityReportSafely();
    }

function renderDashboardStockList(inventory) {
      const container = document.getElementById('dashboard-stock-list');
      if (!container) return;
      container.replaceChildren();
      const zeroStockItems = inventory.filter(item => {
        const quantity = Number(item.stock);
        return Number.isFinite(quantity) && quantity <= 0;
      });
      if (!zeroStockItems.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'dashboard-stock-empty';
        emptyMessage.textContent = 'در حال حاضر قلمی با موجودی صفر یا منفی ثبت نشده است.';
        container.append(emptyMessage);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'dashboard-stock-items';
      zeroStockItems.forEach(item => {
        const row = document.createElement('li');
        row.className = 'dashboard-stock-item';
        const details = document.createElement('span');
        details.className = 'dashboard-stock-item-details';
        const description = document.createElement('strong');
        description.textContent = String(item.description || 'بدون شرح');
        const code = document.createElement('small');
        code.textContent = 'کد: ' + String(item.code || 'ثبت نشده');
        const quantity = document.createElement('span');
        quantity.className = 'dashboard-stock-item-quantity';
        quantity.textContent = formatDashboardNumber(item.stock);
        details.append(description, code);
        row.append(details, quantity);
        list.append(row);
      });
      container.append(list);
    }

function renderDashboardLowStockList(lowStockItems) {
      const container = document.getElementById('dashboard-low-stock-list');
      if (!container) return;
      container.replaceChildren();
      if (!lowStockItems.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'dashboard-stock-empty';
        emptyMessage.textContent = 'در حال حاضر کالایی در محدوده هشدار کمبود نیست.';
        container.append(emptyMessage);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'dashboard-stock-items';
      lowStockItems.forEach(item => {
        const row = document.createElement('li');
        row.className = 'dashboard-stock-item';
        const details = document.createElement('span');
        details.className = 'dashboard-stock-item-details';
        const description = document.createElement('strong');
        description.textContent = String(item.description || 'بدون شرح');
        const code = document.createElement('small');
        code.textContent = 'کد: ' + String(item.code || 'ثبت نشده') +
          '؛ حداقل موجودی: ' + formatDashboardNumber(item.minimumStock);
        const quantity = document.createElement('span');
        quantity.className = 'dashboard-stock-item-quantity is-low';
        quantity.textContent = formatDashboardNumber(item.stock);
        details.append(description, code);
        row.append(details, quantity);
        list.append(row);
      });
      container.append(list);
    }

function setupDashboard() {
      document.querySelectorAll('[data-section-target]').forEach(link => {
        // رویداد «کلیک» برای پیوند ناوبری؛ بازکردن بخش مقصد بدون بارگذاری دوباره صفحه.
        link.addEventListener('click', event => {
          event.preventDefault();
          const sectionId = link.getAttribute('data-section-target');
          if (sectionId && document.getElementById(sectionId)) openSection(sectionId);
        });
      });
      const stockToggle = document.getElementById('dashboard-stock-toggle');
      const stockList = document.getElementById('dashboard-stock-list');
      if (stockToggle && stockList) {
        stockToggle.addEventListener('click', () => {
          const isExpanded = stockToggle.getAttribute('aria-expanded') === 'true';
          stockToggle.setAttribute('aria-expanded', String(!isExpanded));
          stockList.hidden = isExpanded;
          stockToggle.textContent = isExpanded
            ? 'نمایش اقلام با موجودی صفر یا منفی'
            : 'بستن فهرست اقلام';
        });
      }
      const lowStockToggle = document.getElementById('dashboard-low-stock-toggle');
      const lowStockList = document.getElementById('dashboard-low-stock-list');
      if (lowStockToggle && lowStockList) {
        lowStockToggle.addEventListener('click', () => {
          const isExpanded = lowStockToggle.getAttribute('aria-expanded') === 'true';
          lowStockToggle.setAttribute('aria-expanded', String(!isExpanded));
          lowStockList.hidden = isExpanded;
          lowStockToggle.textContent = isExpanded
            ? 'نمایش اقلام دارای کمبود'
            : 'بستن فهرست اقلام کم‌موجودی';
        });
      }
      updateDashboardSummary();
      // رویداد «تغییر ذخیره‌سازی در زبانه دیگر» برای عنصر رابط کاربری؛ همگام‌سازی شاخص‌ها با تغییر داده در زبانه دیگر.
      window.addEventListener('storage', event => {
        if (event.key === STORAGE_KEY || event.key === null) {
          refreshInventoryFromStorage();
        }
        if (event.key === ENTRY_HISTORY_KEY || event.key === null) renderEntryHistory();
        if (event.key === SHIPMENT_KEY || event.key === null) {
          renderShipmentHistory();
          renderKardex();
        }
        if (event.key === LOCATION_KEY || event.key === null) {
          renderShipmentLocationOptions();
          renderLocationManager();
        }
        updateDashboardSummary();
      });
      if (typeof MutationObserver === 'function') {
        ['inventory-grid', 'entry-history-body', 'shipment-history-body'].forEach(id => {
          const target = document.getElementById(id);
          if (!target) return;
          const observer = new MutationObserver(updateDashboardSummary);
          observer.observe(target, { childList: true, subtree: true, characterData: true });
        });
      }
    }
