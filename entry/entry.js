
/* ماژول ورود کالا: فرم‌ها، اعتبارسنجی، پیش‌نمایش و تاریخچه ورود. */
'use strict';
const entryCore = window.AnbarCore;
if (!entryCore) throw new Error('هسته Anbar باید پیش از ماژول ورود کالا بارگذاری شود.');
const inputFeedback = document.getElementById('input-feedback');
const itemFormInputs = {
      code: document.getElementById('supply-code'),
      description: document.getElementById('item-description'),
      stock: document.getElementById('item-stock')
    };
// گروه کالا اختیاری است؛ رکوردهای قدیمی بدون گروه باقی می‌مانند و گروه حدسی تولید نمی‌شود.
    const manualCategoryGroup = document.createElement('div');
    manualCategoryGroup.className = 'field-group inventory-category-form-group';
    const manualCategoryLabel = document.createElement('label');
    manualCategoryLabel.htmlFor = 'item-category';
    manualCategoryLabel.textContent = 'گروه کالا (اختیاری)';
    const manualCategoryInput = document.createElement('input');
    manualCategoryInput.id = 'item-category';
    manualCategoryInput.name = 'item-category';
    manualCategoryInput.type = 'text';
    manualCategoryInput.maxLength = 80;
    manualCategoryInput.autocomplete = 'off';
    manualCategoryInput.placeholder = 'مثلاً اداری، بهداشتی یا فنی';
    manualCategoryInput.setAttribute('aria-describedby', 'item-category-hint');
    const manualCategoryHint = document.createElement('span');
    manualCategoryHint.id = 'item-category-hint';
    manualCategoryHint.className = 'field-hint';
    manualCategoryHint.textContent = 'گروه فقط در صورت ثبت واقعی در اطلاعات کالا وارد گزارش مصرف می‌شود.';
    manualCategoryGroup.append(manualCategoryLabel, manualCategoryInput, manualCategoryHint);
    const manualDescriptionGroup = itemFormInputs.description?.closest('.field-group');
    if (manualDescriptionGroup) manualDescriptionGroup.insertAdjacentElement('afterend', manualCategoryGroup);
const bulkPreview = document.getElementById('bulk-preview');
const excelPreview = document.getElementById('excel-preview');
const singlePreview = document.getElementById('single-preview');
const importPreviewButton = document.getElementById('confirm-all-imports');
const confirmExcelImportButton = document.getElementById('confirm-all-imports');
const pastedDataInput = document.getElementById('pasted-data');
const excelFeedback = document.getElementById('excel-feedback');
const singleFeedback = document.getElementById('single-feedback');
const duplicateDialog = document.getElementById('duplicate-dialog');
const duplicateDialogDetails = document.getElementById('duplicate-dialog-details');
let pendingClipboardRows = [];
let pendingExcelRows = [];

function loadEntryHistory() {
      try {
        const records = JSON.parse(localStorage.getItem(entryCore.storage.keys.entryHistory) || '[]');
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
     * هدف: ذخیره حداکثر ۱۰۰۰ سابقه ورود و گزارش شکست ذخیره‌سازی.
     * ورودی: records: آرایه سوابق ورود.
     * خروجی: true در موفقیت یا false در شکست.
     */
    function saveEntryHistory(records) {
      const preservesEntryRecord = record =>
        Boolean(record && typeof record === 'object' && !Array.isArray(record)) &&
        (record.timestamp === undefined || record.timestamp === '' ||
          (typeof record.timestamp === 'string' && Number.isFinite(Date.parse(record.timestamp))));
      if (!entryCore.storage.canSafelyRewriteArray(entryCore.storage.keys.entryHistory, 'تاریخچه ورود', entryCore.ui.inventoryFeedback, preservesEntryRecord)) {
        return false;
      }
      try {
        localStorage.setItem(entryCore.storage.keys.entryHistory, JSON.stringify(records.slice(0, 1000)));
        entryCore.ui.refreshDataQualityReport();
        return true;
      } catch (error) {
        entryCore.ui.inventoryFeedback.textContent = 'ذخیره تاریخچه ورود ممکن نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
        return false;
      }
    }

    /**
     * هدف: ساخت شناسه ورود با تاریخ شمسی و بخش میلی‌ثانیه.
     * ورودی: date: زمان مبنا از نوع Date؛ به‌صورت پیش‌فرض زمان جاری.
     * خروجی: رشته شناسه ورود.
     */
    function makeEntryNumber(date = new Date()) {
      const parts = entryCore.dates.solarDateTime(date).label
        .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[^0-9]/g, '-');
      return 'ورود-' + parts + '-' + String(date.getMilliseconds()).padStart(3, '0');
    }

    /**
     * هدف: ساخت شناسه پایدار و کم‌احتمال‌تکرار برای سندها و ردیف‌های گردش کالا.
     * ورودی: prefix نوع شناسه و timestamp زمان مبنا.
     * خروجی: رشته شناسه؛ در مرورگرهای پشتیبان از UUID و در غیر این صورت مقدار تصادفی محلی استفاده می‌شود.
     */
    function recordIncomingEntry(items) {
      if (!items.length) return true;
      const now = new Date();
      const dateTime = entryCore.dates.solarDateTime(now);
      const record = {
        id: entryCore.identity.makeUniqueRecordId('entry', now.getTime()),
        entryNumber: makeEntryNumber(now),
        timestamp: now.toISOString(),
        date: dateTime.date,
        time: dateTime.time,
        itemCount: items.length,
        pieceCount: items.reduce((total, item) => total + item.stock, 0),
        // تصویر جزئیات قلم‌ها نگهداری می‌شود تا تاریخچه ورود فقط به شمار کلی محدود نباشد.
        items: items.map((item, index) => ({
          id: entryCore.identity.makeUniqueRecordId('entry-line', now.getTime() + index),
          itemId: item.id || ('item-' + entryCore.inventory.dataQualityKey(item.code)),
          code: item.code,
          description: item.description,
          category: typeof item.category === 'string' ? item.category : '',
          quantity: Number(item.stock)
        }))
      };
      const records = loadEntryHistory();
      records.unshift(record);
      if (!saveEntryHistory(records)) return false;
      entryCore.reports.renderEntryHistory();
      const itemDetails = items.map(item =>
        String(item.code || 'بدون کد') + ' (' + String(item.description || 'بدون شرح') + '): ' + entryCore.text.toEnglishDigits(item.stock)
      ).join('؛ ');
      entryCore.activity.record('ثبت ورود کالا', {
        'شماره ورود': record.entryNumber, 'تاریخ و ساعت': record.date + ' ' + record.time,
        'تعداد اقلام': items.length, 'تعداد کل قطعه': record.pieceCount, 'اقلام (کد، شرح، تعداد)': itemDetails
      });
      return record;
    }

function parseDelimitedText(text) {
      const trimmed = String(text || '').trim();
      if (!trimmed) return [];

      const firstLine = trimmed.split(/\r?\n/, 1)[0];
      const delimiter = firstLine.includes('\t')
        ? '\t'
        : (firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',');

      const rows = [];
      let row = [];
      let cell = '';
      let inQuotes = false;

      for (let index = 0; index < trimmed.length; index += 1) {
        const character = trimmed[index];

        if (character === '"') {
          if (inQuotes && trimmed[index + 1] === '"') {
            cell += '"';
            index += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (character === delimiter && !inQuotes) {
          row.push(cell.trim());
          cell = '';
        } else if ((character === '\n' || character === '\r') && !inQuotes) {
          if (character === '\r' && trimmed[index + 1] === '\n') index += 1;
          row.push(cell.trim());
          if (row.some(value => value !== '')) rows.push(row);
          row = [];
          cell = '';
        } else {
          cell += character;
        }
      }

      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      return rows;
    }

    /**
     * هدف: استانداردسازی عنوان ستون برای تشخیص نام ستون‌ها.
     * ورودی: value: عنوان خام.
     * خروجی: رشته عنوان نرمال‌شده.
     */
    function normalizeHeader(value) {
      return String(value ?? '').toLowerCase().replace(/[\s_\-()\[\]]+/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک');
    }
    /**
     * هدف: شناسایی موقعیت ستون‌های کد، شرح و موجودی از روی سرستون.
     * ورودی: row: ردیف سرستون.
     * خروجی: نگاشت فیلدها به شماره ستون یا نتیجه عدم تشخیص.
     */
    function getHeaderMap(row) {
      const aliases = {
        code: ['کدتدارکاتی','کدکالا','کد','کدمحصول','itemcode','productcode','code'],
        description: ['شرحکالا','نامکالا','شرح','عنوانکالا','ناممحصول','itemname','description','productname','نام'],
        stock: ['موجودی','تعدادموجودی','تعداد','مقدار','quantity','stock','inventory'],
        category: ['گروهکالا','دستهکالا','گروه','دسته','category','group','productcategory']
      };
      const values = row.map(normalizeHeader);
      const map = {};
      Object.keys(aliases).forEach(field => { map[field] = values.findIndex(value => aliases[field].includes(value)); });
      return Object.values(map).filter(index => index >= 0).length >= 2 ? map : null;
    }
    /**
     * هدف: بررسی اینکه یک ردیف به‌احتمال زیاد سرستون است یا داده کالا.
     * ورودی: row: سلول‌های ردیف.
     * خروجی: مقدار بولی.
     */
    function isHeaderRow(row) { return Boolean(getHeaderMap(row)); }
    /**
     * هدف: پالایش ردیف‌های فایل/کلیپ‌بورد و هماهنگ‌سازی ستون‌ها در صورت وجود سرستون.
     * ورودی: rows: آرایه دوبعدی داده خام.
     * خروجی: آرایه ردیف‌های آماده پیش‌نمایش و اعتبارسنجی.
     */
    function prepareImportRows(rows) {
      const source = Array.isArray(rows) ? rows : [];
      let headerIndex = -1, headerMap = null;
      for (let i = 0; i < Math.min(source.length, 30); i++) {
        if (!Array.isArray(source[i])) continue;
        const map = getHeaderMap(source[i]);
        if (map) { headerIndex = i; headerMap = map; break; }
      }
      return source.map((row, index) => {
        if (!Array.isArray(row) || index === headerIndex || row.every(value => String(value ?? '').trim() === '')) return null;
        const mapped = headerMap ? [
          headerMap.code >= 0 ? row[headerMap.code] : row[0],
          headerMap.description >= 0 ? row[headerMap.description] : row[1],
          headerMap.stock >= 0 ? row[headerMap.stock] : row[2],
          headerMap.category >= 0 ? row[headerMap.category] : ''
        ] : row.slice(0,4);
        mapped._sourceRow = index + 1;
        return mapped;
      }).filter(Boolean);
    }
    /**
     * هدف: اعتبارسنجی کد، شرح و موجودی و تولید پیام خطا برای یک ردیف.
     * ورودی: row: سلول‌های ورودی کالا.
     * خروجی: رشته خطاها؛ رشته خالی یعنی داده معتبر است.
     */
    function getRowError(row) {
      const code = entryCore.text.toEnglishDigits(String(row?.[0] ?? '').trim());
      const description = entryCore.text.normalizeArabicLetters(String(row?.[1] ?? '')).trim();
      const stockText = entryCore.text.toEnglishDigits(String(row?.[2] ?? '').trim()).replace(/[٬,]/g, '').replace(/٫/g, '.');
      const errors = [];
      if (!/^(?:\d{8}|\d{10})$/.test(code)) errors.push('کد تدارکاتی باید ۸ یا ۱۰ رقم باشد');
      if (!description) errors.push('شرح کالا خالی است');
      const stock = entryCore.text.normalizeStock(stockText);
      if (!/^\d+(?:\.\d+)?$/.test(stockText) || !Number.isFinite(stock) || stock < 0) errors.push('موجودی باید عدد صفر یا مثبت باشد');
      return errors.join('؛ ');
    }

        /**
         * هدف: تبدیل ردیف معتبر به شیء کالا با کد، شرح و موجودی استاندارد.
         * ورودی: row: سلول‌های کالا.
         * خروجی: شیء کالا یا null در صورت نامعتبر بودن.
         */
        function normalizeRow(row) {
      const code = entryCore.text.toEnglishDigits(String(row[0] ?? '').trim());
      const description = entryCore.text.normalizeArabicLetters(String(row[1] ?? '')).trim();
      // همان نرمال‌سازی getRowError: جداکننده هزارگان و ممیز فارسی را پیش از اعتبارسنجی یکسان کن.
      const stockText = entryCore.text.toEnglishDigits(String(row[2] ?? '').trim())
        .replace(/[٬,]/g, '')
        .replace(/٫/g, '.');
      const stock = entryCore.text.normalizeStock(stockText);
      if (!/^(?:\d{8}|\d{10})$/.test(code) || !description || !/^\d+(?:\.\d+)?$/.test(stockText) ||
          !Number.isFinite(stock) || stock < 0) return null;
      const category = entryCore.text.normalizeArabicLetters(String(row[3] ?? '')).trim().slice(0, 80);
      return { code, description, stock, category };
    }

    /**
     * هدف: افزودن کنترل‌های مرتب‌سازی دسترس‌پذیر به سرستون‌های جدول.
     * ورودی: table: جدول DOM؛ options: تنظیم ستون و جهت اولیه.
     * خروجی: رویدادها و نشانگرهای مرتب‌سازی روی جدول فعال می‌شوند.
     */

function getCombinedPendingRows() {
      const combined = [];
      pendingExcelRows.forEach(row => combined.push({ row, source: 'Excel/CSV' }));
      pendingClipboardRows.forEach(row => combined.push({ row, source: 'کلیپ‌بورد' }));
      const manualRow = [itemFormInputs.code.value.trim(), itemFormInputs.description.value.trim(), itemFormInputs.stock.value.trim(), manualCategoryInput.value.trim()];
      if (manualRow.some(value => value !== '')) combined.push({ row: manualRow, source: 'ورود دستی' });
      return combined;
    }

    /**
     * هدف: به‌روزرسانی پیش‌نمایش مشترک بر اساس ردیف‌های موقت همه روش‌های ورود.
     * ورودی: پارامتر ندارد.
     * خروجی: بخش پیش‌نمایش بازسازی می‌شود.
     */
    function renderSharedInputPreview() {
      const shared = document.getElementById('shared-input-preview');
      const confirmButton = document.getElementById('confirm-all-imports');
      if (!shared) return;
      const combined = getCombinedPendingRows();
      shared.replaceChildren();
      const heading = document.createElement('h5');
      heading.textContent = 'پیش‌نمایش مشترک اطلاعات ورودی';
      const message = document.createElement('p');
      message.className = 'preview-message';
      message.textContent = 'کل ردیف‌ها: ' + entryCore.text.toEnglishDigits(combined.length) + '؛ معتبر: ' +
        entryCore.text.toEnglishDigits(combined.filter(item => normalizeRow(item.row)).length) + '؛ دارای خطا: ' +
        entryCore.text.toEnglishDigits(combined.filter(item => !normalizeRow(item.row)).length);
      shared.append(heading, message);
      if (!combined.length) {
        const empty = document.createElement('p');
        empty.className = 'preview-empty';
        empty.textContent = 'هنوز اطلاعاتی برای پیش‌نمایش وجود ندارد.';
        shared.append(empty);
        if (confirmButton) confirmButton.disabled = true;
        return;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-table-wrap bulk-preview-scroll';
      const { table, tbody } = entryCore.tables.createDataTable(['منبع ورودی', 'کد تدارکاتی', 'شرح کالا', 'موجودی', 'گروه کالا', 'وضعیت']);
      combined.forEach(({row, source}) => {
        const error = getRowError(row);
        const tr = document.createElement('tr');
        if (error) tr.className = 'import-invalid-row';
        [source, entryCore.text.toEnglishDigits(row[0] ?? ''), entryCore.text.normalizeArabicLetters(row[1] ?? ''), entryCore.text.toEnglishDigits(row[2] ?? ''), entryCore.text.normalizeArabicLetters(row[3] ?? '') || '—', error || 'معتبر'].forEach(value => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        tbody.append(tr);
      });
      wrapper.append(table); shared.append(wrapper);
      entryCore.tables.enableTableSorting(table, { defaultColumn: 1, defaultDirection: 'asc' });
      if (confirmButton) confirmButton.disabled = !combined.some(item => normalizeRow(item.row));
    }

    /**
     * هدف: نمایش پیش‌نمایش چندردیفی و وضعیت اعتبار هر ردیف.
     * ورودی: rows: داده‌ها؛ sourceLabel: نام منبع؛ previewTarget: ظرف مقصد.
     * خروجی: DOM پیش‌نمایش ساخته یا به‌روزرسانی می‌شود.
     */
    function renderBulkPreview(rows, sourceLabel, previewTarget) {
      const previewRows = (Array.isArray(rows) ? rows : []).filter(row => Array.isArray(row) && row.some(value => String(value ?? '').trim() !== ''));
      previewTarget.replaceChildren();
      const heading = document.createElement('h5');
      heading.textContent = 'پیش‌نمایش ورودی: ' + sourceLabel;
      const validCount = previewRows.filter(row => normalizeRow(row)).length;
      const message = document.createElement('p');
      message.className = 'preview-message';
      message.textContent = 'تعداد ردیف‌ها: ' + entryCore.text.toEnglishDigits(previewRows.length) + '؛ معتبر: ' + entryCore.text.toEnglishDigits(validCount) + '؛ دارای خطا: ' + entryCore.text.toEnglishDigits(previewRows.length - validCount) + '. برای مرتب‌سازی روی عنوان ستون بزنید.';
      previewTarget.append(heading, message);
      if (!previewRows.length) {
        const empty = document.createElement('p'); empty.className = 'preview-empty'; empty.textContent = 'ردیفی برای نمایش پیدا نشد.';
        previewTarget.append(empty);
        renderSharedInputPreview();
        return;
      }
      const wrapper = document.createElement('div'); wrapper.className = 'preview-table-wrap bulk-preview-scroll';
      const { table, tbody } = entryCore.tables.createDataTable(['کد تدارکاتی', 'شرح کالا', 'موجودی', 'گروه کالا', 'وضعیت']);
      previewRows.forEach(row => {
        const error = getRowError(row);
        const tr = document.createElement('tr');
        if (error) tr.className = 'import-invalid-row';
        [entryCore.text.toEnglishDigits(row[0] ?? ''), entryCore.text.normalizeArabicLetters(row[1] ?? ''), entryCore.text.toEnglishDigits(row[2] ?? ''), entryCore.text.normalizeArabicLetters(row[3] ?? '') || '—', error || 'معتبر'].forEach(value => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        tbody.append(tr);
      });
      wrapper.append(table); previewTarget.append(wrapper);
      entryCore.tables.enableTableSorting(table, { defaultColumn: 0, defaultDirection: 'asc' });
      renderSharedInputPreview();
    }

    /**
     * هدف: ساخت پیش‌نمایش ورود دستی بر اساس مقدارهای فرم جاری.
     * ورودی: پارامتر ندارد.
     * خروجی: DOM پیش‌نمایش ورود دستی به‌روزرسانی می‌شود.
     */
    function renderSinglePreview() {
      const row = [itemFormInputs.code.value.trim(), itemFormInputs.description.value.trim(), itemFormInputs.stock.value.trim(), manualCategoryInput.value.trim()];
      const item = normalizeRow(row);
      singlePreview.replaceChildren();
      const heading = document.createElement('h5'); heading.textContent = 'پیش‌نمایش کالای تکی'; singlePreview.append(heading);
      if (!row.some(value => value !== '')) {
        const empty = document.createElement('p'); empty.className = 'preview-empty';
        empty.textContent = 'با وارد کردن کد، شرح و موجودی، پیش‌نمایش اینجا نمایش داده می‌شود.';
        singlePreview.append(empty);
        renderSharedInputPreview();
        return;
      }
      const wrapper = document.createElement('div'); wrapper.className = 'preview-table-wrap';
      const { table, tbody } = entryCore.tables.createDataTable(['کد تدارکاتی', 'شرح کالا', 'موجودی', 'گروه کالا']);
      const tr = document.createElement('tr');
      [row[0], row[1], item ? item.stock : row[2], row[3] || '—'].forEach(value => {
        const td = document.createElement('td'); td.textContent = value === '' ? '—' : String(value); tr.append(td);
      });
      tbody.append(tr); wrapper.append(table); singlePreview.append(wrapper);
      entryCore.tables.enableTableSorting(table);
      const status = document.createElement('p'); status.className = item ? 'preview-message' : 'feedback';
      status.textContent = item
        ? 'اطلاعات معتبر است: کد تدارکاتی ۸ یا ۱۰ رقم و موجودی عددی است.'
        : 'کد تدارکاتی باید ۸ یا ۱۰ رقم باشد؛ شرح کالا نباید خالی باشد و موجودی فقط عدد صفر یا مثبت باشد.';
      singlePreview.append(status);
      renderSharedInputPreview();
    }

    /**
     * هدف: تشخیص کدهای تکراری در مجموعه ورودی پیش از ذخیره.
     * ورودی: rows: ردیف‌های ورودی.
     * خروجی: گروه‌های کد تکراری.
     */
    function findIncomingDuplicates(rows) {
      const rowsByCode = new Map();
      let firstDataRowChecked = false;

      rows.forEach((row, index) => {
        if (!Array.isArray(row) || row.every(value => String(value ?? '').trim() === '')) return;

        if (!firstDataRowChecked) {
          firstDataRowChecked = true;
          if (isHeaderRow(row)) return;
        }

        const item = normalizeRow(row);
        if (!item) return;

        const key = item.code.trim().toLocaleLowerCase('fa');
        if (!rowsByCode.has(key)) rowsByCode.set(key, []);
        rowsByCode.get(key).push({
          rowNumber: index + 1,
          code: item.code,
          description: item.description,
          stock: item.stock
        });
      });

      return [...rowsByCode.values()].filter(group => group.length > 1);
    }

    const importErrorDialog = document.getElementById('import-error-dialog');
    const importErrorDetails = document.getElementById('import-error-details');
    /**
     * هدف: نمایش ردیف‌های نامعتبر همراه علت خطا.
     * ورودی: rows: داده‌های بررسی‌شده.
     * خروجی: پنجره خطای ورود نمایش داده می‌شود.
     */
    function showImportErrors(rows) {
      const invalid = rows.filter(row => Array.isArray(row) && row.some(value => String(value ?? '').trim() !== '') && !normalizeRow(row));
      if (!invalid.length) return;
      importErrorDetails.replaceChildren();
      const note = document.createElement('p');
      note.textContent = 'ردیف‌های زیر وارد نشدند؛ سایر ردیف‌های معتبر پردازش شده‌اند. برای مرتب‌سازی روی عنوان ستون بزنید.';
      importErrorDetails.append(note);
      const wrapper = document.createElement('div'); wrapper.className = 'preview-table-wrap bulk-preview-scroll';
      const { table, tbody } = entryCore.tables.createDataTable(['ردیف فایل', 'کد تدارکاتی', 'شرح کالا', 'موجودی', 'خطا']);
      invalid.forEach((row, index) => {
        const tr = document.createElement('tr'); tr.className = 'import-invalid-row';
        [(row._sourceRow || index + 1), entryCore.text.toEnglishDigits(row[0] ?? ''), entryCore.text.normalizeArabicLetters(row[1] ?? ''), entryCore.text.toEnglishDigits(row[2] ?? ''), getRowError(row)].forEach(value => {
          const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
        });
        tbody.append(tr);
      });
      wrapper.append(table); importErrorDetails.append(wrapper);
      entryCore.tables.enableTableSorting(table, { defaultColumn: 0, defaultDirection: 'asc' });
      if (typeof importErrorDialog.showModal === 'function') importErrorDialog.showModal();
      else window.alert(invalid.map(row => 'ردیف ' + (row._sourceRow || '?') + ': ' + getRowError(row)).join('\n'));
    }
    /**
     * هدف: بستن پنجره خطاهای ورود.
     * ورودی: پارامتر ندارد.
     * خروجی: پنجره بسته می‌شود.
     */
    function closeImportErrorDialog() {
      if (importErrorDialog.open) importErrorDialog.close();
    }
    // رویداد «کلیک» برای دکمه بستن پنجره خطاهای ورود؛ اجرای رفتار متناسب با این کنترل و رویداد.
// رویداد «کلیک» برای دکمه تأیید پنجره خطاهای ورود؛ اجرای رفتار متناسب با این کنترل و رویداد.
/**
     * هدف: نمایش کدهای تکراری در ورودی/موجودی جاری و آماده‌سازی تصمیم کاربر.
     * ورودی: duplicateGroups: تکرار در ورودی؛ existingDuplicates: کدهای موجود.
     * خروجی: پنجره تکراری‌ها ساخته می‌شود.
     */
    function showDuplicateError(duplicateGroups, existingDuplicates = []) {
      if (!duplicateGroups.length && !existingDuplicates.length) return;
      duplicateDialogDetails.replaceChildren();

      // خلاصه همه مغایرت‌ها در ابتدای پنجره؛ این جدول مرجع اصلی بررسی پیش از ثبت است.
      const summarySection = document.createElement('section');
      summarySection.className = 'duplicate-group duplicate-summary';
      const summaryHeading = document.createElement('h4');
      summaryHeading.textContent = 'خلاصه مغایرت‌های شناسایی‌شده';
      const summaryWrapper = document.createElement('div');
      summaryWrapper.className = 'preview-table-wrap duplicate-table-wrap';
      const { table: summaryTable, tbody: summaryBody } = entryCore.tables.createDataTable(
        ['نوع مغایرت', 'کد تدارکاتی', 'شرح کالا', 'موجودی فعلی', 'موجودی ورودی', 'ردیف‌های ورودی'],
        'duplicate-summary-table'
      );

      duplicateGroups.forEach(group => {
        const first = group[0];
        const tr = document.createElement('tr');
        ['تکرار در اطلاعات ورودی', first.code, first.description, '—',
          entryCore.text.toEnglishDigits(first.stock), group.map(entry => entryCore.text.toEnglishDigits(entry.rowNumber)).join('، ')]
          .forEach(value => {
            const td = document.createElement('td');
            td.textContent = String(value ?? '');
            tr.append(td);
          });
        summaryBody.append(tr);
      });

      existingDuplicates.forEach(entry => {
        const tr = document.createElement('tr');
        ['کد موجود در انبار',
          entry.code || entry.incoming.code || entry.existing.code || '—',
          entry.incoming.description || entry.existing.description || '—',
          entryCore.text.toEnglishDigits(entry.existing.stock), entryCore.text.toEnglishDigits(entry.incoming.stock), '—']
          .forEach(value => {
            const td = document.createElement('td');
            td.textContent = String(value ?? '');
            tr.append(td);
          });
        summaryBody.append(tr);
      });

      summaryWrapper.append(summaryTable);
      summarySection.append(summaryHeading, summaryWrapper);
      duplicateDialogDetails.append(summarySection);
      entryCore.tables.enableTableSorting(summaryTable, { defaultColumn: 1, defaultDirection: 'asc' });

      // جزئیات ردیف‌های تکراری ورودی برای امکان مقایسه دقیق‌تر حفظ می‌شوند.
      duplicateGroups.forEach(group => {
        const section = document.createElement('section');
        section.className = 'duplicate-group';
        const heading = document.createElement('h4');
        heading.textContent = 'جزئیات کد تدارکاتی: ' + group[0].code;
        section.append(heading);
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-table-wrap duplicate-table-wrap';
        const { table, tbody } = entryCore.tables.createDataTable(
          ['ردیف فایل', 'کد تدارکاتی', 'شرح کالا', 'موجودی'],
          'duplicate-group-table'
        );
        group.forEach(entry => {
          const tr = document.createElement('tr');
          [entryCore.text.toEnglishDigits(entry.rowNumber), entry.code, entry.description, entryCore.text.toEnglishDigits(entry.stock)]
            .forEach(value => {
              const td = document.createElement('td');
              td.textContent = String(value ?? '');
              tr.append(td);
            });
          tbody.append(tr);
        });
        wrapper.append(table);
        section.append(wrapper);
        duplicateDialogDetails.append(section);
        entryCore.tables.enableTableSorting(table, { defaultColumn: 0, defaultDirection: 'asc' });
      });

      if (typeof duplicateDialog.showModal === 'function') duplicateDialog.showModal();
      else window.alert('مغایرت‌های ورودی شناسایی شد. برای مشاهده جزئیات، مرورگر سازگار با پنجره‌های محاوره‌ای لازم است.');
    }

    function closeDuplicateDialog() {
      if (duplicateDialog.open) duplicateDialog.close();
    }

    // رویداد «کلیک» برای دکمه بستن پنجره تکراری‌ها؛ اجرای رفتار متناسب با این کنترل و رویداد.
let pendingImportConfirmation = null;
    // رویداد «کلیک» برای دکمه انصراف از ورود تکراری‌ها؛ اجرای رفتار متناسب با این کنترل و رویداد.
// رویداد «کلیک» برای دکمه ادامه ورود پس از بررسی تکراری‌ها؛ اجرای رفتار متناسب با این کنترل و رویداد.
// رویداد «کلیک» برای عنصر رابط کاربری؛ اجرای رفتار متناسب با این کنترل و رویداد.
/**
     * هدف: ثبت داده معتبر و به‌روزرسانی کالاهای موجود؛ تاریخچه فقط پس از ذخیره موفق ثبت می‌شود.
     * ورودی: rows: ردیف‌های ورودی.
     * خروجی: نتیجه شامل شمار افزوده/به‌روزرسانی/ردشده و saved.
     */
    function addOrUpdateItems(rows) {
      const inventoryItems = entryCore.inventory.getItems();
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const incomingItems = new Map();
      const previousItems = inventoryItems.map(item => ({ ...item }));
      const previousInventoryStorage = localStorage.getItem(entryCore.storage.keys.inventory);
      const entryTimestamp = new Date().toISOString();

      rows.forEach(row => {
        if (!Array.isArray(row) || row.every(value => String(value ?? '').trim() === '')) return;

        const item = normalizeRow(row);
        if (!item) {
          skipped += 1;
          return;
        }

        incomingItems.set(item.code, item);
        const existing = inventoryItems.find(current => current.code === item.code);
        if (existing) {
          existing.description = item.description;
          existing.stock = item.stock;
          if (item.category) existing.category = item.category;
          // به‌روزرسانی مقدار انبار، آستانه‌ای را که کاربر قبلاً برای این کد تعیین کرده پاک نمی‌کند.
          existing.minimumStockBaseQuantity = item.stock;
          if (!existing.minimumStockManual) existing.minimumStock = entryCore.inventory.calculateDefaultMinimumStock(item.stock);
          const pendingQuantity = existing.sendQuantity === '' || existing.sendQuantity === null || existing.sendQuantity === undefined
            ? NaN
            : entryCore.text.normalizeStock(existing.sendQuantity);
          if (!Number.isFinite(pendingQuantity) || pendingQuantity <= 0 || pendingQuantity > item.stock) {
            existing.sendQuantity = '';
          }
          existing.entryTimestamp = entryTimestamp;
          updated += 1;
        } else {
          inventoryItems.push({ ...item, id: 'item-' + entryCore.inventory.dataQualityKey(item.code), category: item.category || '', minimumStock: entryCore.inventory.calculateDefaultMinimumStock(item.stock), minimumStockManual: false, minimumStockBaseQuantity: item.stock, sendQuantity: '', entryTimestamp });
          added += 1;
        }
      });

      if (!incomingItems.size) {
        entryCore.inventory.render();
        return { added, updated, skipped, saved: true };
      }

      if (!entryCore.inventory.save()) {
        inventoryItems.splice(0, inventoryItems.length, ...previousItems);
        entryCore.inventory.render();
        return { added: 0, updated: 0, skipped, saved: false };
      }

      entryCore.inventory.render();
      const entryRecord = recordIncomingEntry([...incomingItems.values()]);
      if (!entryRecord) {
        inventoryItems.splice(0, inventoryItems.length, ...previousItems);
        const rollbackSucceeded = entryCore.storage.restoreValue(entryCore.storage.keys.inventory, previousInventoryStorage);
        entryCore.inventory.render();
        return { added: 0, updated: 0, skipped, saved: false, rollbackFailed: !rollbackSucceeded };
      }
      return { added, updated, skipped, saved: true, entryRecord };
    }

    /**
     * هدف: نمایش نتیجه ورود و تفکیک خطای ذخیره از ثبت موفق.
     * ورودی: result: نتیجه پردازش؛ target: عنصر پیام.
     * خروجی: متن نتیجه در رابط نمایش داده می‌شود.
     */
    function showImportResult(result, target) {
      if (result.saved === false) {
        target.textContent = result.rollbackFailed
          ? 'ثبت تاریخچه ورود ناموفق بود و بازگردانی موجودی نیز کامل نشد؛ پیش از ادامه، موجودی و فایل بکاپ را بررسی کنید.'
          : 'ذخیره‌سازی ناموفق بود؛ هیچ تغییری ثبت نشد. فضای ذخیره‌سازی مرورگر را بررسی کنید و دوباره تلاش کنید.';
        target.classList.remove('feedback-success');
        return;
      }

      const messages = [];
      if (result.added) messages.push(result.added + ' کالا اضافه شد');
      if (result.updated) messages.push(result.updated + ' کالای دارای کد تکراری به‌روزرسانی شد');
      if (result.skipped) messages.push(result.skipped + ' ردیف نامعتبر نادیده گرفته شد');

      target.textContent = messages.length
        ? 'ورود اطلاعات با موفقیت انجام شد: ' + messages.join('؛ ') + '.'
        : 'فرآیند تأیید انجام شد؛ داده معتبر جدیدی برای افزودن پیدا نشد.';
      target.classList.add('feedback-success');
      target.setAttribute('role', 'status');
      target.setAttribute('aria-live', 'polite');
      if (result.entryRecord && Array.isArray(result.entryRecord.items) && result.entryRecord.items.length) {
        entryCore.ui.showOperationSuccess('entry', result.entryRecord, result);
      }
    }

    /**
     * هدف: نمایش پنجره مشترک نتیجه عملیات با جزئیات واقعی سند ذخیره‌شده.
     * ورودی: نوع عملیات، رکورد ذخیره‌شده و خلاصه اختیاری نتیجه ورود.
     * خروجی: پنجره تأیید موفقیت همراه خلاصه و جدول اقلام نمایش داده می‌شود.
     */

/* راه‌اندازی idempotent: در صورت فراخوانی مجدد، شنونده‌ها تکراری نمی‌شوند. */
function setupEntrySection() {
  const root = document.getElementById('section-1');
  if (!root || root.dataset.entryInitialized === 'true') return false;
  root.dataset.entryInitialized = 'true';
  document.getElementById('reset-shared-preview').addEventListener('click', () => {
        if (!window.confirm('پیش‌نمایش و ورودی‌های موقت تخلیه شوند؟ اطلاعات ثبت‌شده قبلی حذف نمی‌شوند.')) return;
        pendingExcelRows = []; pendingClipboardRows = [];
        itemFormInputs.code.value = ''; itemFormInputs.description.value = ''; itemFormInputs.stock.value = ''; manualCategoryInput.value = '';
        if (typeof pastedDataInput !== 'undefined' && pastedDataInput) pastedDataInput.value = '';
        const fileInput = document.querySelector('input[type="file"][accept*=".csv"], input[type="file"][accept*=".xlsx"]');
        if (fileInput) fileInput.value = '';
        renderSharedInputPreview();
        document.getElementById('input-feedback').textContent = 'پیش‌نمایش و ورودی‌های موقت تخلیه شدند؛ داده‌های ثبت‌شده حفظ شدند.';
      });
      /**
       * هدف: به‌روزرسانی کارت‌های خلاصه افزوده‌شده در بخش گزارش‌ها.
       * ورودی: ندارد؛ داده‌ها از تاریخچه‌های موجود خوانده می‌شوند.
       * خروجی: تعداد ورود/ارسال و زمان آخرین ارسال نمایش داده می‌شود؛ داده اصلی تغییر نمی‌کند.
       */

    document.getElementById('import-error-close')?.addEventListener('click', closeImportErrorDialog);
    document.getElementById('import-error-ok')?.addEventListener('click', closeImportErrorDialog);
    document.getElementById('duplicate-dialog-x')?.addEventListener('click', closeDuplicateDialog);
    document.getElementById('duplicate-import-cancel')?.addEventListener('click', () => {
      pendingImportConfirmation = null;
      closeDuplicateDialog();
      inputFeedback.textContent = 'ورود لغو شد؛ اطلاعات انبار تغییری نکرد.';
    });
    document.getElementById('duplicate-import-confirm')?.addEventListener('click', () => {
      const confirm = pendingImportConfirmation;
      pendingImportConfirmation = null;
      closeDuplicateDialog();
      if (confirm) confirm();
    });
    duplicateDialog?.addEventListener('click', event => {
      if (event.target === duplicateDialog) closeDuplicateDialog();
    });

  itemFormInputs.code.addEventListener('input', () => {
        const normalized = entryCore.text.toEnglishDigits(itemFormInputs.code.value).replace(/[^0-9]/g, '').slice(0, 10);
        if (itemFormInputs.code.value !== normalized) itemFormInputs.code.value = normalized;
      });
  
      Object.values(itemFormInputs).forEach(input => {
        // رویداد «تغییر مقدار ورودی» برای عنصر رابط کاربری؛ همگام‌سازی پیش‌نمایش یا وضعیت رابط با مقدار جاری.
        input.addEventListener('input', () => {
          renderSinglePreview();
          singleFeedback.textContent = '';
        });
      });
      // تغییر گروه دستی هم باید پیش‌نمایش مشترک و پیش‌نمایش تکی را بدون انتظار برای تغییر فیلد دیگری تازه کند.
      manualCategoryInput.addEventListener('input', () => {
        renderSinglePreview();
        singleFeedback.textContent = '';
      });
  
      // رویداد «کلیک» برای دکمه بررسی/ثبت پیش‌نمایش؛ اجرای رفتار متناسب با این کنترل و رویداد.
      importPreviewButton.addEventListener('click', () => {
        const combinedRows = getCombinedPendingRows().map(item => item.row);
        if (!combinedRows.length) {
          inputFeedback.textContent = 'ابتدا اطلاعات را از یکی از روش‌ها وارد و پیش‌نمایش کنید.';
          return;
        }
        const invalidRows = combinedRows.filter(row =>
          Array.isArray(row) && row.some(value => String(value ?? '').trim() !== '') && !normalizeRow(row)
        );
        const duplicateGroups = findIncomingDuplicates(combinedRows);
        const validRows = combinedRows.filter(row => normalizeRow(row));
        if (!validRows.length) {
          inputFeedback.textContent = 'هیچ ردیف معتبری برای ثبت وجود ندارد؛ اطلاعات را اصلاح کنید.';
          return;
        }
  
        const uniqueRows = new Map();
        validRows.forEach(row => {
          const item = normalizeRow(row);
          uniqueRows.set(item.code, item);
        });
        const existingDuplicates = [...uniqueRows.values()]
          .map(incoming => ({ code: incoming.code, incoming, existing: entryCore.inventory.getItems().find(current => current.code === incoming.code) }))
          .filter(entry => entry.existing);
  
        const commitImport = () => {
          const result = addOrUpdateItems(validRows);
          showImportResult(result, inputFeedback);
          if (result.saved === false) return;
  
          if (invalidRows.length) showImportErrors(combinedRows);
          pendingExcelRows = [];
          pendingClipboardRows = [];
          itemFormInputs.code.value = '';
          itemFormInputs.description.value = '';
          itemFormInputs.stock.value = '';
          pastedDataInput.value = '';
          renderBulkPreview([], 'داده‌های کپی‌شده', bulkPreview);
          renderBulkPreview([], 'فایل اکسل', excelPreview);
          renderSinglePreview();
          renderSharedInputPreview();
          importPreviewButton.disabled = true;
        };
  
        if (duplicateGroups.length || existingDuplicates.length) {
          pendingImportConfirmation = commitImport;
          showDuplicateError(duplicateGroups, existingDuplicates);
          return;
        }
        commitImport();
      });
  
      // رویداد «تغییر مقدار ورودی» برای فیلد داده‌های کپی‌شده؛ همگام‌سازی پیش‌نمایش یا وضعیت رابط با مقدار جاری.
      pastedDataInput.addEventListener('input', () => {
        pendingClipboardRows = prepareImportRows(parseDelimitedText(pastedDataInput.value));
        inputFeedback.textContent = '';
        renderSharedInputPreview();
        importPreviewButton.disabled = !getCombinedPendingRows().some(item => normalizeRow(item.row));
      });
  
      // رویداد «تغییر» برای فیلد انتخاب فایل Excel یا CSV؛ به‌روزرسانی داده‌ها و رابط پس از تغییر انتخاب.
      document.getElementById('excel-file').addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
  
        try {
          let rows;
          if (/\.csv$/i.test(file.name)) {
            rows = parseDelimitedText(await file.text());
          } else if (window.XLSX) {
            const buffer = await file.arrayBuffer();
            const workbook = window.XLSX.read(buffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = window.XLSX.utils.sheet_to_json(firstSheet, {
              header: 1,
              raw: false,
              defval: ''
            });
          } else {
            excelFeedback.textContent = 'کتابخانه خواندن Excel بارگذاری نشد؛ اتصال اینترنت را بررسی کنید یا فایل CSV را انتخاب کنید.';
            return;
          }
  
          if (!rows || !rows.length) {
            pendingExcelRows = [];
            renderBulkPreview([], file.name, excelPreview);
            renderSharedInputPreview();
            confirmExcelImportButton.disabled = true;
            excelFeedback.textContent = 'در فایل انتخاب‌شده ردیفی برای نمایش پیدا نشد.';
            return;
          }
          pendingExcelRows = prepareImportRows(rows);
          renderBulkPreview(pendingExcelRows, file.name, excelPreview);
          renderSharedInputPreview();
          confirmExcelImportButton.disabled = !pendingExcelRows.some(row =>
            Array.isArray(row) && row.some(value => String(value ?? '').trim() !== '') && normalizeRow(row)
          );
          excelFeedback.textContent = 'فایل خوانده شد؛ اطلاعات را در همین باکس بررسی و سپس تأیید کنید.';
        } catch (error) {
          excelFeedback.textContent = 'خواندن فایل ممکن نشد. فایل اکسل باید معتبر باشد؛ در صورت خطا می‌توانید CSV یا کپی‌کردن داده‌ها را امتحان کنید.';
        } finally {
          event.target.value = '';
        }
      });
  entryCore.reports.renderEntryHistory();
  renderSinglePreview();
  return true;
}
