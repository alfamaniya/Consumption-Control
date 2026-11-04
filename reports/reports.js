/* ماژول گزارش‌ها: شاخص‌ها، گزارش تفصیلی و تاریخچه ورود/ارسال را مستقل مدیریت می‌کند. */
'use strict';

(function () {
  const core = window.AnbarCore;
  if (!core) throw new Error('هسته Anbar باید پیش از ماژول گزارش‌ها بارگذاری شود.');

  function updateOverview() {
    const shipmentCount = document.getElementById('reports-total-shipments');
    const entryCount = document.getElementById('reports-total-entries');
    const consumptionCount = document.getElementById('reports-total-consumption');
    const latestShipment = document.getElementById('reports-latest-shipment');
    if (!shipmentCount || !entryCount || !consumptionCount || !latestShipment) return;

    let shipments = [];
    let entries = [];
    try {
      const storedShipments = JSON.parse(localStorage.getItem(core.storage.keys.shipments) || '[]');
      shipments = Array.isArray(storedShipments)
        ? storedShipments.filter(item => item && typeof item === 'object' && !Array.isArray(item))
        : [];
    } catch (error) {
      shipments = [];
    }
    try {
      const storedEntries = JSON.parse(localStorage.getItem(core.storage.keys.entryHistory) || '[]');
      entries = Array.isArray(storedEntries)
        ? storedEntries.filter(item => item && typeof item === 'object' && !Array.isArray(item))
        : [];
    } catch (error) {
      entries = [];
    }

    shipmentCount.textContent = core.text.toEnglishDigits(shipments.length);
    entryCount.textContent = core.text.toEnglishDigits(entries.length);
    const totalConsumption = shipments.reduce((total, shipment) =>
      total + (Array.isArray(shipment.items) ? shipment.items.reduce((sum, item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return sum;
        const quantity = Number(item.quantity);
        return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
      }, 0) : 0), 0);
    consumptionCount.textContent = core.text.toEnglishDigits(totalConsumption);

    const latest = shipments.reduce((best, item) => {
      const timestamp = typeof item.timestamp === 'string' ? Date.parse(item.timestamp) : NaN;
      const candidate = Number.isFinite(timestamp)
        ? { timestamp, label: core.dates.solarDateTime(new Date(timestamp)).label }
        : { timestamp: NaN, label: String(item.date || '') };
      if (!best || (Number.isFinite(candidate.timestamp) && candidate.timestamp > best.timestamp)) return candidate;
      return best;
    }, null);
    latestShipment.textContent = latest ? latest.label : '—';
  }


  const SHIPMENT_PAGE_SIZE = 10;
  let shipmentHistoryPage = 0;
  let shipmentHistorySort = { key: 'date', direction: 'desc' };

  function loadShipments() {
    try {
      const records = JSON.parse(localStorage.getItem(core.storage.keys.shipments) || '[]');
      return Array.isArray(records) ? records : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * هدف: ساخت جدول تاریخچه ارسال با مرتب‌سازی و صفحه‌بندی.
   * ورودی: پارامتر ندارد.
   * خروجی: DOM تاریخچه ارسال و وضعیت صفحه به‌روزرسانی می‌شود.
   */
  function renderShipmentHistory() {
    const body = document.getElementById('shipment-history-body');
    const pageLabel = document.getElementById('shipment-history-page');
    const previousButton = document.getElementById('shipment-history-prev');
    const nextButton = document.getElementById('shipment-history-next');
    if (!body || !pageLabel || !previousButton || !nextButton) return;

    const records = loadShipments().filter(record =>
      record && typeof record === 'object' && !Array.isArray(record)
    );
    const getItems = record => Array.isArray(record.items)
      ? record.items.filter(item => item && typeof item === 'object' && !Array.isArray(item))
      : [];
    const getPieceCount = record => getItems(record).reduce((sum, item) => {
      const quantity = Number(item.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
    const { key, direction } = shipmentHistorySort;
    records.sort((a, b) => {
      let left, right, comparison;
      if (key === 'itemCount') {
        left = getItems(a).length;
        right = getItems(b).length;
        comparison = left - right;
      } else if (key === 'pieceCount') {
        comparison = getPieceCount(a) - getPieceCount(b);
      } else if (key === 'date') {
        comparison = String(a.timestamp || a.date || '').localeCompare(String(b.timestamp || b.date || ''), 'fa');
      } else {
        comparison = String(a[key] || '').localeCompare(String(b[key] || ''), 'fa', { numeric: true });
      }
      return direction === 'asc' ? comparison : -comparison;
    });

    const pageCount = Math.max(1, Math.ceil(records.length / SHIPMENT_PAGE_SIZE));
    shipmentHistoryPage = Math.min(shipmentHistoryPage, pageCount - 1);
    const pageRecords = records.slice(shipmentHistoryPage * SHIPMENT_PAGE_SIZE, (shipmentHistoryPage + 1) * SHIPMENT_PAGE_SIZE);
    body.replaceChildren();
    if (!pageRecords.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.className = 'preview-empty';
      cell.textContent = 'هنوز ارسالی ثبت نشده است.';
      row.append(cell);
      body.append(row);
    } else {
      pageRecords.forEach(record => {
        const row = document.createElement('tr');
        const values = [
          record.voucherNumber || '—',
          record.exitNumber || '—',
          { date: record.date || '—', time: record.time || '' },
          (record.location || '—') + (record.sublocation ? ' / ' + record.sublocation : ''),
          getItems(record).length,
          getPieceCount(record)
        ];
        values.forEach((value, index) => {
          const cell = document.createElement('td');
          if (index === 0) {
            cell.className = 'entry-history-number shipment-document-cell';
            const numberText = document.createElement('span');
            numberText.textContent = String(value);
            cell.append(numberText);
            if (record.id) cell.title = 'شناسه سند: ' + record.id;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            const rawItems = Array.isArray(record.items) ? record.items : [];
            summary.textContent = 'جزئیات اقلام (' + core.text.toEnglishDigits(rawItems.length) + ')';
            const list = document.createElement('ul');
            rawItems.forEach(line => {
              const detail = document.createElement('li');
              if (!line || typeof line !== 'object' || Array.isArray(line)) {
                detail.textContent = 'ردیف نامعتبر؛ برای بررسی، گزارش کیفیت داده را ببینید.';
                list.append(detail);
                return;
              }
              detail.textContent = 'کد: ' + String(line.code || '—') +
                '؛ شرح: ' + String(line.description || '—') +
                '؛ تعداد: ' + core.text.toEnglishDigits(line.quantity ?? '—') +
                '؛ شناسه قلم: ' + String(line.itemId || 'قدیمی/ثبت‌نشده') +
                '؛ شناسه ردیف: ' + String(line.id || 'قدیمی/ثبت‌نشده');
              list.append(detail);
            });
            details.append(summary, list);
            cell.append(details);
          } else if (index === 2 && value && typeof value === 'object') {
            cell.className = 'date-time-cell';
            const dateText = document.createElement('span');
            dateText.className = 'date-part';
            dateText.textContent = value.date;
            cell.append(dateText);
            if (value.time) {
              const timeText = document.createElement('span');
              timeText.className = 'time-part';
              timeText.textContent = value.time;
              cell.append(timeText);
            }
          } else {
            cell.textContent = index >= 4 ? core.text.toEnglishDigits(value) : String(value);
          }
          if (index < 2) cell.className = 'entry-history-number';
          row.append(cell);
        });
        body.append(row);
      });
    }
    pageLabel.textContent = 'صفحه ' + core.text.toEnglishDigits(shipmentHistoryPage + 1) + ' از ' + core.text.toEnglishDigits(pageCount) + ' — ' + core.text.toEnglishDigits(records.length) + ' ارسال';
    previousButton.disabled = shipmentHistoryPage === 0;
    nextButton.disabled = shipmentHistoryPage >= pageCount - 1;
    updateOverview();
    renderConsumptionReport();
    document.querySelectorAll('[data-shipment-sort]').forEach(button => {
      const active = button.dataset.shipmentSort === key;
      const marker = button.querySelector('span');
      if (marker) marker.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
      const heading = button.closest('th');
      if (heading) heading.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      const label = button.textContent.replace(/[↑↓↕]/g, '').trim();
      button.setAttribute('aria-label', 'مرتب‌سازی بر اساس ' + label + (active ? (direction === 'asc' ? '، صعودی' : '، نزولی') : ''));
    });
  }

  function initializeShipmentHistory() {
    if (document.documentElement.dataset.anbarShipmentHistoryBound !== 'true') {
      document.documentElement.dataset.anbarShipmentHistoryBound = 'true';
      document.querySelectorAll('[data-shipment-sort]').forEach(button => {
        button.addEventListener('click', () => {
          const key = button.dataset.shipmentSort;
          if (shipmentHistorySort.key === key) {
            shipmentHistorySort.direction = shipmentHistorySort.direction === 'asc' ? 'desc' : 'asc';
          } else {
            shipmentHistorySort = { key, direction: key === 'date' ? 'desc' : 'asc' };
          }
          shipmentHistoryPage = 0;
          renderShipmentHistory();
        });
      });
      document.getElementById('shipment-history-prev')?.addEventListener('click', () => {
        if (shipmentHistoryPage > 0) {
          shipmentHistoryPage -= 1;
          renderShipmentHistory();
        }
      });
      document.getElementById('shipment-history-next')?.addEventListener('click', () => {
        if ((shipmentHistoryPage + 1) * SHIPMENT_PAGE_SIZE < loadShipments().length) {
          shipmentHistoryPage += 1;
          renderShipmentHistory();
        }
      });
    }
    renderShipmentHistory();
  }


  const ENTRY_PAGE_SIZE = 10;
  let entryHistoryPage = 0;
  let entryHistorySort = { key: 'entryNumber', direction: 'desc' };

  function loadEntryHistory() {
    try {
      const records = JSON.parse(localStorage.getItem(core.storage.keys.entryHistory) || '[]');
      if (!Array.isArray(records)) return [];
      return records
        .filter(record => record && typeof record === 'object' && !Array.isArray(record))
        .map(record => ({
          ...record,
          timestamp: typeof record.timestamp === 'string' && Number.isFinite(Date.parse(record.timestamp))
            ? record.timestamp
            : ''
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * هدف: نمایش تاریخچه ورود در سکشن گزارش‌ها با مرتب‌سازی و صفحه‌بندی.
   * داده اصلی فقط خوانده می‌شود و تغییری در سوابق ذخیره‌شده ایجاد نمی‌شود.
   */
  function renderEntryHistory() {
    const body = document.getElementById('entry-history-body');
    const pageLabel = document.getElementById('entry-history-page');
    const previousButton = document.getElementById('entry-history-prev');
    const nextButton = document.getElementById('entry-history-next');
    if (!body || !pageLabel || !previousButton || !nextButton) return;

    const records = loadEntryHistory();
    const { key, direction } = entryHistorySort;
    records.sort((a, b) => {
      let comparison;
      if (key === 'entryNumber') comparison = String(a.entryNumber || '').localeCompare(String(b.entryNumber || ''), 'fa');
      else if (key === 'date') comparison = String(a.timestamp || a.date || '').localeCompare(String(b.timestamp || b.date || ''), 'fa');
      else comparison = (Number(a[key]) || 0) - (Number(b[key]) || 0);
      return direction === 'asc' ? comparison : -comparison;
    });

    const pageCount = Math.max(1, Math.ceil(records.length / ENTRY_PAGE_SIZE));
    entryHistoryPage = Math.min(entryHistoryPage, pageCount - 1);
    const start = entryHistoryPage * ENTRY_PAGE_SIZE;
    const pageRecords = records.slice(start, start + ENTRY_PAGE_SIZE);
    body.replaceChildren();

    if (!pageRecords.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'preview-empty';
      cell.textContent = 'هنوز ورودی ثبت نشده است.';
      row.append(cell);
      body.append(row);
    } else {
      pageRecords.forEach(record => {
        const row = document.createElement('tr');
        const numberCell = document.createElement('td');
        numberCell.className = 'entry-history-number';
        numberCell.textContent = String(record.entryNumber || '—');
        const dateCell = document.createElement('td');
        dateCell.className = 'date-time-cell';
        const dateText = document.createElement('span');
        dateText.className = 'date-part';
        dateText.textContent = record.date || '—';
        dateCell.append(dateText);
        if (record.time) {
          const timeText = document.createElement('span');
          timeText.className = 'time-part';
          timeText.textContent = record.time;
          dateCell.append(timeText);
        }
        const itemCell = document.createElement('td');
        itemCell.textContent = core.text.toEnglishDigits(record.itemCount ?? 0);
        const pieceCell = document.createElement('td');
        pieceCell.textContent = core.text.toEnglishDigits(record.pieceCount ?? 0);
        row.append(numberCell, dateCell, itemCell, pieceCell);
        body.append(row);
      });
    }

    pageLabel.textContent = 'صفحه ' + core.text.toEnglishDigits(entryHistoryPage + 1) + ' از ' + core.text.toEnglishDigits(pageCount) +
      ' — ' + core.text.toEnglishDigits(records.length) + ' ورود';
    previousButton.disabled = entryHistoryPage === 0;
    nextButton.disabled = entryHistoryPage >= pageCount - 1;
    updateOverview();

    document.querySelectorAll('[data-entry-sort]').forEach(button => {
      const active = button.dataset.entrySort === key;
      const marker = button.querySelector('span');
      if (marker) marker.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
      button.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function initializeEntryHistory() {
    if (document.documentElement.dataset.anbarEntryHistoryBound !== 'true') {
      document.documentElement.dataset.anbarEntryHistoryBound = 'true';
      document.querySelectorAll('[data-entry-sort]').forEach(button => {
        button.addEventListener('click', () => {
          const key = button.dataset.entrySort;
          if (entryHistorySort.key === key) {
            entryHistorySort.direction = entryHistorySort.direction === 'asc' ? 'desc' : 'asc';
          } else {
            entryHistorySort = { key, direction: key === 'entryNumber' ? 'desc' : 'asc' };
          }
          entryHistoryPage = 0;
          renderEntryHistory();
        });
      });
      document.getElementById('entry-history-prev')?.addEventListener('click', () => {
        if (entryHistoryPage > 0) {
          entryHistoryPage -= 1;
          renderEntryHistory();
        }
      });
      document.getElementById('entry-history-next')?.addEventListener('click', () => {
        if ((entryHistoryPage + 1) * ENTRY_PAGE_SIZE < loadEntryHistory().length) {
          entryHistoryPage += 1;
          renderEntryHistory();
        }
      });
    }
    renderEntryHistory();
  }

  let currentConsumptionReportRows = [];
  let currentConsumptionReportMode = 'detail';
  let currentConsumptionReportViewRows = [];

  /**
   * هدف: ایجاد پنل گزارش مصرف از ردیف‌های واقعی تاریخچه ارسال.
   * فیلترها بر اساس تاریخ سند، شماره‌ها، کد، محل ارسال و گروه ثبت‌شده هستند.
   */
  function ensureConsumptionReportPanel() {
    const existing = document.getElementById('consumption-report-panel');
    if (existing) return existing;
    const overview = document.querySelector('.reports-overview');
    if (!overview) return null;
    const panel = document.createElement('article');
    panel.id = 'consumption-report-panel';
    panel.className = 'settings-box reports-consumption-panel';
    const heading = document.createElement('h4');
    heading.textContent = 'گزارش تفصیلی مصرف';
    const description = document.createElement('p');
    description.textContent = 'گزارش بر پایهٔ سوابق واقعی ارسال است. بر اساس بازه تاریخ شمسی، شماره حواله، شماره خروج، کد تدارکاتی، محل ارسال و گروه کالا فیلتر کنید و نتیجه را به Excel، CSV یا JSON دریافت کنید.';
    const viewField = document.createElement('div');
    viewField.className = 'field-group report-view-field';
    const viewLabel = document.createElement('label');
    viewLabel.htmlFor = 'consumption-report-view';
    viewLabel.textContent = 'نمای گزارش';
    const viewSelect = document.createElement('select');
    viewSelect.id = 'consumption-report-view';
    [['detail', 'ریز گردش‌ها'], ['item-summary', 'خلاصه به تفکیک کالا']].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      viewSelect.append(option);
    });
    viewSelect.addEventListener('change', () => {
      currentConsumptionReportMode = viewSelect.value;
      renderConsumptionReport();
    });
    viewField.append(viewLabel, viewSelect);
    const filters = document.createElement('div');
    filters.className = 'report-filter-grid';
    const makeField = (labelText, id, type) => {
      const group = document.createElement('div');
      group.className = 'field-group report-filter-field';
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = labelText;
      const input = document.createElement(type === 'select' ? 'select' : 'input');
      input.id = id;
      if (type === 'date') {
        input.type = 'text';
        input.className = 'solar-date-input';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.placeholder = '۱۴۰۵/۰۱/۰۱';
        input.setAttribute('aria-haspopup', 'dialog');
        input.setAttribute('aria-expanded', 'false');
      } else if (type !== 'select') {
        input.type = type;
      }
      group.append(label, input);
      filters.append(group);
      return input;
    };
    makeField('از تاریخ (خورشیدی)', 'consumption-report-start-date', 'date');
    makeField('تا تاریخ (خورشیدی)', 'consumption-report-end-date', 'date');
    makeField('شماره حواله', 'consumption-report-voucher', 'search');
    makeField('شماره خروج', 'consumption-report-exit-number', 'search');
    makeField('کد تدارکاتی', 'consumption-report-item-code', 'search');
    makeField('محل ارسال', 'consumption-report-location', 'select');
    makeField('گروه کالا', 'consumption-report-category', 'select');
    const summary = document.createElement('div');
    summary.className = 'reports-overview report-filter-summary';
    [['consumption-report-line-count', 'ردیف‌های مصرف'], ['consumption-report-total-quantity', 'مجموع تعداد مصرف'], ['consumption-report-document-count', 'تعداد اسناد']].forEach(([id, labelText]) => {
      const metric = document.createElement('article');
      metric.className = 'report-metric';
      const label = document.createElement('span');
      label.textContent = labelText;
      const value = document.createElement('strong');
      value.id = id;
      value.textContent = '۰';
      metric.append(label, value);
      summary.append(metric);
    });
    const actions = document.createElement('div');
    actions.className = 'report-filter-actions';
    const exportButton = document.createElement('button');
    exportButton.id = 'export-consumption-report';
    exportButton.type = 'button';
    exportButton.className = 'action-button';
    exportButton.textContent = 'دانلود CSV';
    exportButton.addEventListener('click', () => exportConsumptionReport('csv'));
    const excelButton = document.createElement('button');
    excelButton.id = 'export-consumption-report-xlsx';
    excelButton.type = 'button';
    excelButton.className = 'action-button';
    excelButton.textContent = 'دانلود Excel';
    excelButton.addEventListener('click', () => exportConsumptionReport('xlsx'));
    const jsonButton = document.createElement('button');
    jsonButton.id = 'export-consumption-report-json';
    jsonButton.type = 'button';
    jsonButton.className = 'action-button';
    jsonButton.textContent = 'دانلود JSON';
    jsonButton.addEventListener('click', () => exportConsumptionReport('json'));
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'action-button secondary';
    resetButton.textContent = 'پاک‌کردن فیلترها';
    resetButton.addEventListener('click', () => {
      ['consumption-report-start-date', 'consumption-report-end-date'].forEach(id => {
        const input = document.getElementById(id);
        input.value = '';
        delete input.dataset.isoDate;
        input.removeAttribute('aria-invalid');
        input.title = '';
      });
      ['consumption-report-voucher', 'consumption-report-exit-number', 'consumption-report-item-code'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('consumption-report-location').value = 'all';
      document.getElementById('consumption-report-category').value = 'all';
      renderConsumptionReport();
    });
    actions.append(exportButton, excelButton, jsonButton, resetButton);
    const tableWrap = document.createElement('div');
    tableWrap.className = 'entry-history-table-wrap report-table-wrap';
    const tableParts = core.tables.createDataTable(['تاریخ و ساعت', 'شماره حواله', 'شماره خروج', 'محل ارسال', 'گروه کالا', 'کد کالا', 'شرح کالا', 'تعداد'], 'consumption-report-table');
    tableParts.table.id = 'consumption-report-table';
    tableParts.table.setAttribute('aria-label', 'گزارش مصرف بر اساس تاریخ، شماره حواله و خروج، کد، محل و گروه');
    tableParts.tbody.id = 'consumption-report-body';
    tableWrap.append(tableParts.table);
    const feedback = document.createElement('p');
    feedback.id = 'consumption-report-feedback';
    feedback.className = 'feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    panel.append(heading, description, viewField, filters, summary, actions, tableWrap, feedback);
    overview.insertAdjacentElement('afterend', panel);
    core.dates.initializeInputs();
    [
      document.getElementById('consumption-report-start-date'),
      document.getElementById('consumption-report-end-date'),
      document.getElementById('consumption-report-location'),
      document.getElementById('consumption-report-category')
    ].forEach(control => control.addEventListener('change', renderConsumptionReport));
    [
      document.getElementById('consumption-report-voucher'),
      document.getElementById('consumption-report-exit-number'),
      document.getElementById('consumption-report-item-code')
    ].forEach(control => control.addEventListener('input', renderConsumptionReport));
    return panel;
  }

  /** هدف: تبدیل اسناد ارسال به ردیف‌های گزارش؛ داده ساختگی یا گروه حدسی به گزارش اضافه نمی‌شود. */
  function getConsumptionReportData() {
    const rows = [];
    let invalidLines = 0;
    let missingTimestamps = 0;
    core.shipments.load().forEach(shipment => {
      if (!shipment || typeof shipment !== 'object' || !Array.isArray(shipment.items)) return;
      shipment.items.forEach(line => {
        if (!line || typeof line !== 'object') { invalidLines += 1; return; }
        const quantity = core.text.normalizeStock(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || typeof line.code !== 'string' || !line.code.trim()) {
          invalidLines += 1;
          return;
        }
        const timestamp = typeof shipment.timestamp === 'string' && Number.isFinite(Date.parse(shipment.timestamp))
          ? shipment.timestamp : '';
        if (!timestamp) missingTimestamps += 1;
        const parsed = timestamp ? new Date(timestamp) : null;
        const localDate = parsed
          ? parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0')
          : '';
        rows.push({
          timestamp,
          localDate,
          dateLabel: String(shipment.date || '—') + (shipment.time ? ' ' + String(shipment.time) : ''),
          documentId: String(shipment.id || (shipment.voucherNumber || '') + '|' + (shipment.exitNumber || '') + '|' + timestamp),
          voucherNumber: String(shipment.voucherNumber || '—'),
          exitNumber: String(shipment.exitNumber || '—'),
          locationName: String(shipment.location || ''),
          location: String(shipment.location || '—') + (shipment.sublocation ? ' / ' + String(shipment.sublocation) : ''),
          category: typeof line.category === 'string' ? line.category.trim() : '',
          code: line.code,
          description: typeof line.description === 'string' ? line.description : '',
          quantity
        });
      });
    });
    rows.sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
    return { rows, invalidLines, missingTimestamps };
  }

  /** هدف: به‌روزرسانی جمع‌ها و جدول گزارش بر اساس فیلترهای انتخاب‌شده. */
  function renderConsumptionReport() {
    if (!ensureConsumptionReportPanel()) return;
    const data = getConsumptionReportData();
    const locationSelect = document.getElementById('consumption-report-location');
    const categorySelect = document.getElementById('consumption-report-category');
    const setOptions = (select, values, allText) => {
      const previous = select.value;
      select.replaceChildren();
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = allText;
      select.append(all);
      values.forEach(value => {
        const option = document.createElement('option');
        option.value = value.value;
        option.textContent = value.label;
        select.append(option);
      });
      select.value = [...select.options].some(option => option.value === previous) ? previous : 'all';
    };
    const locations = [...new Set(data.rows.map(row => row.locationName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa'));
    setOptions(locationSelect, locations.map(value => ({ value, label: value })), 'همه محل‌ها');
    const categories = [...new Set(data.rows.map(row => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa'));
    setOptions(categorySelect, [
      ...categories.map(value => ({ value, label: value })),
      { value: '__uncategorized__', label: 'بدون گروه ثبت‌شده' }
    ], 'همه گروه‌ها');
    const startInput = document.getElementById('consumption-report-start-date');
    const endInput = document.getElementById('consumption-report-end-date');
    const start = startInput.dataset.isoDate || '';
    const end = endInput.dataset.isoDate || '';
    const voucherFilter = core.text.normalizeArabicLetters(document.getElementById('consumption-report-voucher').value).trim().toLocaleLowerCase('fa');
    const exitNumberFilter = core.text.normalizeArabicLetters(document.getElementById('consumption-report-exit-number').value).trim().toLocaleLowerCase('fa');
    const itemCodeFilter = core.text.toEnglishDigits(document.getElementById('consumption-report-item-code').value).trim().toLocaleLowerCase('fa');
    const locationFilter = locationSelect.value;
    const categoryFilter = categorySelect.value;
    const invalidRange = startInput.getAttribute('aria-invalid') === 'true' || endInput.getAttribute('aria-invalid') === 'true' || Boolean(start && end && start > end);
    const rows = invalidRange ? [] : data.rows.filter(row => {
      if (start && (!row.localDate || row.localDate < start)) return false;
      if (end && (!row.localDate || row.localDate > end)) return false;
      if (voucherFilter && !core.text.toEnglishDigits(core.text.normalizeArabicLetters(row.voucherNumber)).toLocaleLowerCase('fa').includes(core.text.toEnglishDigits(voucherFilter))) return false;
      if (exitNumberFilter && !core.text.toEnglishDigits(core.text.normalizeArabicLetters(row.exitNumber)).toLocaleLowerCase('fa').includes(core.text.toEnglishDigits(exitNumberFilter))) return false;
      if (itemCodeFilter && !core.text.toEnglishDigits(row.code).toLocaleLowerCase('fa').includes(itemCodeFilter)) return false;
      if (locationFilter !== 'all' && row.locationName !== locationFilter) return false;
      if (categoryFilter === '__uncategorized__' && row.category) return false;
      if (categoryFilter !== 'all' && categoryFilter !== '__uncategorized__' && row.category !== categoryFilter) return false;
      return true;
    });
    currentConsumptionReportRows = rows;
    const itemSummaries = new Map();
    rows.forEach(row => {
      const key = JSON.stringify([row.code, row.category]);
      let summary = itemSummaries.get(key);
      if (!summary) {
        summary = {
          code: row.code,
          description: row.description,
          category: row.category,
          quantity: 0,
          documentIds: new Set(),
          lastDate: row.dateLabel
        };
        itemSummaries.set(key, summary);
      }
      summary.quantity += row.quantity;
      summary.documentIds.add(row.documentId);
    });
    const summarizedRows = [...itemSummaries.values()]
      .map(row => ({ ...row, documentCount: row.documentIds.size }))
      .sort((a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code, 'fa', { numeric: true }));
    currentConsumptionReportViewRows = currentConsumptionReportMode === 'item-summary' ? summarizedRows : rows;
    document.getElementById('consumption-report-line-count').textContent = core.text.toEnglishDigits(rows.length);
    document.getElementById('consumption-report-total-quantity').textContent = core.text.toEnglishDigits(rows.reduce((sum, row) => sum + row.quantity, 0));
    document.getElementById('consumption-report-document-count').textContent = core.text.toEnglishDigits(new Set(rows.map(row => row.documentId)).size);
    const body = document.getElementById('consumption-report-body');
    body.replaceChildren();
    const headers = currentConsumptionReportMode === 'item-summary'
      ? ['کد کالا', 'شرح کالا', 'گروه ثبت‌شده', 'تعداد اسناد', 'مجموع مصرف', 'آخرین گردش']
      : ['تاریخ و ساعت', 'شماره حواله', 'شماره خروج', 'محل ارسال', 'گروه کالا', 'کد کالا', 'شرح کالا', 'تعداد'];
    const table = document.getElementById('consumption-report-table');
    const headerRow = table.tHead && table.tHead.rows[0];
    if (headerRow) {
      headerRow.replaceChildren();
      headers.forEach(text => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = text;
        headerRow.append(th);
      });
    }
    if (!currentConsumptionReportViewRows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = headers.length;
      td.className = 'preview-empty';
      td.textContent = startInput.getAttribute('aria-invalid') === 'true' || endInput.getAttribute('aria-invalid') === 'true'
        ? 'قالب تاریخ خورشیدی معتبر نیست؛ تاریخ را به شکل ۱۴۰۵/۰۱/۰۱ وارد کنید.'
        : invalidRange ? 'تاریخ شروع باید قبل از تاریخ پایان باشد.' : 'برای فیلترهای انتخاب‌شده سابقه مصرفی پیدا نشد.';
      tr.append(td);
      body.append(tr);
    } else {
      currentConsumptionReportViewRows.forEach(reportRow => {
        const tr = document.createElement('tr');
        const values = currentConsumptionReportMode === 'item-summary'
          ? [reportRow.code, reportRow.description, reportRow.category || 'بدون گروه ثبت‌شده',
            core.text.toEnglishDigits(reportRow.documentCount), core.text.toEnglishDigits(reportRow.quantity), reportRow.lastDate]
          : [reportRow.dateLabel, reportRow.voucherNumber, reportRow.exitNumber, reportRow.location,
            reportRow.category || 'بدون گروه ثبت‌شده', reportRow.code, reportRow.description, core.text.toEnglishDigits(reportRow.quantity)];
        values
          .forEach(value => { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); });
        body.append(tr);
      });
    }
    const feedback = document.getElementById('consumption-report-feedback');
    feedback.textContent = 'بر اساس ' + core.text.toEnglishDigits(rows.length) + ' ردیف واقعی تاریخچه ارسال محاسبه شد.';
    if (invalidRange) feedback.textContent = 'بازه زمانی نامعتبر است؛ تاریخ شروع را اصلاح کنید.';
    if (data.invalidLines) feedback.textContent += ' ' + core.text.toEnglishDigits(data.invalidLines) + ' ردیف نامعتبر از جمع کنار گذاشته شد؛ گزارش کیفیت داده را بررسی کنید.';
    if ((start || end) && data.missingTimestamps) feedback.textContent += ' ' + core.text.toEnglishDigits(data.missingTimestamps) + ' ردیف فاقد زمان ماشینی است و در فیلتر تاریخ منظور نمی‌شود.';
    const exportButton = document.getElementById('export-consumption-report');
    const excelButton = document.getElementById('export-consumption-report-xlsx');
    const jsonButton = document.getElementById('export-consumption-report-json');
    [exportButton, excelButton, jsonButton].filter(Boolean).forEach(button => {
      button.disabled = currentConsumptionReportViewRows.length === 0;
    });
  }

  /**
   * هدف: نقل‌قول‌گذاری سلول CSV و جلوگیری از تفسیر متن واردشده به‌عنوان فرمول صفحه‌گسترده.
   * ورودی: مقدار یک سلول CSV.
   * خروجی: سلول نقل‌قول‌گذاری‌شده؛ پیشوندهای خطرناک با آپاستروف خنثی می‌شوند.
   */
  function escapeCsvCell(value) {
    let text = String(value ?? '');
    // Excel ممکن است متن آغازشده با =، +، - یا @ را فرمول بداند؛ trimStart فاصله و نویسه‌های سفید ابتدایی را هم پوشش می‌دهد.
    const firstSignificant = text.trimStart().charAt(0);
    if (['=', '+', '-', '@'].includes(firstSignificant)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function getConsumptionReportExportData() {
    const headers = currentConsumptionReportMode === 'item-summary'
      ? ['کد کالا', 'شرح کالا', 'گروه ثبت‌شده', 'تعداد اسناد', 'مجموع مصرف', 'آخرین گردش']
      : ['تاریخ', 'ساعت', 'شماره حواله', 'شماره خروج', 'محل ارسال', 'گروه کالا', 'کد کالا', 'شرح کالا', 'تعداد'];
    const exportRows = currentConsumptionReportMode === 'item-summary'
      ? currentConsumptionReportViewRows.map(row => [row.code, row.description, row.category || 'بدون گروه ثبت‌شده',
        row.documentCount, row.quantity, row.lastDate])
      : currentConsumptionReportViewRows.map(row => {
        // تاریخ و ساعت از برچسب ذخیره‌شده گزارش جدا می‌شوند؛ زمان تازه‌ای هنگام خروجی‌گیری ساخته نمی‌شود.
        const dateLabel = String(row.dateLabel || '').trim();
        const separator = dateLabel.indexOf(' ');
        const date = separator >= 0 ? dateLabel.slice(0, separator) : dateLabel;
        const time = separator >= 0 ? dateLabel.slice(separator + 1).trim() : '';
        return [date, time, row.voucherNumber, row.exitNumber, row.location,
          row.category || 'بدون گروه ثبت‌شده', row.code, row.description, row.quantity];
      });
    return { headers, exportRows };
  }

  function downloadReportBlob(blob, extension, reportName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportName + '-' + new Date().toISOString().slice(0, 10) + '.' + extension;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** خروجی گزارش فیلترشده با فرمت CSV، فایل Excel یا JSON. */
  function exportConsumptionReport(format) {
    if (!currentConsumptionReportViewRows.length) return;
    const { headers, exportRows } = getConsumptionReportExportData();
    const reportName = currentConsumptionReportMode === 'item-summary' ? 'خلاصه-مصرف-کالاها' : 'گزارش-مصرف';
    if (format === 'csv') {
      const csv = '\uFEFF' + [headers, ...exportRows]
        .map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
      downloadReportBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'csv', reportName);
        document.getElementById('consumption-report-feedback').textContent = 'گزارش فیلترشده با فرمت CSV دانلود شد.';
        return;
    }
    if (format === 'xlsx') {
      if (!window.XLSX || !window.XLSX.utils || typeof window.XLSX.writeFile !== 'function') {
        document.getElementById('consumption-report-feedback').textContent =
          'کتابخانهٔ محلی Excel بارگذاری نشده است؛ فایل vendor/xlsx.full.min.js را بررسی کنید.';
        return;
      }
      const worksheet = window.XLSX.utils.aoa_to_sheet([headers, ...exportRows]);
      worksheet['!cols'] = headers.map((header, index) => ({
        wch: Math.min(36, Math.max(14, String(header).length + 6,
          ...exportRows.slice(0, 100).map(row => String(row[index] ?? '').length + 2)))
      }));
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        currentConsumptionReportMode === 'item-summary' ? 'خلاصه کالا' : 'ریز مصرف'
      );
      window.XLSX.writeFile(workbook, reportName + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
      document.getElementById('consumption-report-feedback').textContent = 'گزارش فیلترشده با فرمت Excel دانلود شد.';
      return;
    }
    if (format === 'json') {
      const report = {
        schemaVersion: 1,
        reportType: currentConsumptionReportMode,
        exportedAt: new Date().toISOString(),
        filters: {
          startDate: document.getElementById('consumption-report-start-date').value,
          endDate: document.getElementById('consumption-report-end-date').value,
          voucherNumber: document.getElementById('consumption-report-voucher').value.trim(),
          exitNumber: document.getElementById('consumption-report-exit-number').value.trim(),
          itemCode: document.getElementById('consumption-report-item-code').value.trim(),
          location: document.getElementById('consumption-report-location').value,
          category: document.getElementById('consumption-report-category').value
        },
        summary: {
          lineCount: currentConsumptionReportRows.length,
          documentCount: new Set(currentConsumptionReportRows.map(row => row.documentId)).size,
          totalQuantity: currentConsumptionReportRows.reduce((total, row) => total + row.quantity, 0)
        },
        rows: exportRows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]])))
      };
      downloadReportBlob(
        new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8;' }),
        'json',
        reportName
      );
      document.getElementById('consumption-report-feedback').textContent = 'گزارش فیلترشده با فرمت JSON دانلود شد.';
    }
  }

  window.AnbarReports = Object.freeze({ updateOverview, renderConsumptionReport, renderEntryHistory, initializeEntryHistory, renderShipmentHistory, initializeShipmentHistory });
})();
