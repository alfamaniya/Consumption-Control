
/* ماژول موجودی: رندر جدول، جست‌وجو، مرتب‌سازی، هشدارها و ویرایش آستانه موجودی. */
'use strict';

const inventoryCore = window.AnbarCore;
if (!inventoryCore) throw new Error('هسته Anbar باید پیش از ماژول موجودی بارگذاری شود.');

const inventoryItems = inventoryCore.inventory.getItems();
const inventoryGrid = document.getElementById('inventory-grid');
const inventorySearchInput = document.getElementById('inventory-search');
const inventoryEmpty = document.getElementById('inventory-empty');
const inventoryCount = document.getElementById('inventory-count');
const inventoryFeedback = inventoryCore.ui.inventoryFeedback;
let inventorySort = { key: 'code', direction: 'asc' };

function getInventoryStockStatus(item) {
      const stock = Number(item && item.stock);
      const minimum = Number(item && item.minimumStock);
      if (!Number.isFinite(stock) || stock <= 0) return 'out';
      if (Number.isFinite(minimum) && minimum > 0 && stock <= minimum) return 'low';
      return 'normal';
    }

    function isLowStockItem(item) { return getInventoryStockStatus(item) === 'low'; }
    function isOutOfStockItem(item) { return getInventoryStockStatus(item) === 'out'; }

    /**
     * هدف: نمایش خلاصه و فهرست هشدارهای کمبود و اتمام موجودی.
     * ورودی: موجودی جاری از inventoryItems.
     * خروجی: شمارنده‌ها و فهرست هشدار در سکشن موجودی به‌روزرسانی می‌شوند.
     */
    function renderInventoryAlerts() {
      const summary = document.getElementById('inventory-alert-summary');
      const list = document.getElementById('inventory-alert-list');
      if (!summary || !list) return;
      const outOfStock = inventoryItems.filter(isOutOfStockItem);
      const lowStock = inventoryItems.filter(isLowStockItem);
      const normalCount = inventoryItems.length - outOfStock.length - lowStock.length;
      summary.replaceChildren();
      [
        { label: 'اتمام موجودی', value: outOfStock.length, className: 'is-out' },
        { label: 'در آستانه کمبود', value: lowStock.length, className: 'is-low' },
        { label: 'وضعیت عادی', value: normalCount, className: 'is-normal' }
      ].forEach(counter => {
        const card = document.createElement('div');
        card.className = 'inventory-alert-stat ' + counter.className;
        const label = document.createElement('span'); label.textContent = counter.label;
        const value = document.createElement('strong'); value.textContent = inventoryCore.text.toEnglishDigits(counter.value);
        card.append(label, value); summary.append(card);
      });
      list.replaceChildren();
      const alerts = [
        ...outOfStock.map(item => ({ item, status: 'out' })),
        ...lowStock.map(item => ({ item, status: 'low' }))
      ];
      if (!alerts.length) {
        const empty = document.createElement('p');
        empty.className = 'inventory-alert-empty';
        empty.textContent = inventoryItems.length
          ? 'در حال حاضر هیچ کالایی در وضعیت کمبود یا اتمام موجودی نیست.'
          : 'پس از ثبت کالاها، وضعیت موجودی و هشدارها در این قسمت نمایش داده می‌شود.';
        list.append(empty);
        return;
      }
      alerts.forEach(({ item, status }) => {
        const row = document.createElement('div');
        row.className = 'inventory-alert-row ' + (status === 'out' ? 'is-out' : 'is-low');
        const details = document.createElement('div'); details.className = 'inventory-alert-details';
        const name = document.createElement('strong'); name.textContent = item.description || 'بدون شرح';
        const code = document.createElement('span'); code.textContent = 'کد تدارکاتی: ' + item.code;
        details.append(name, code);
        const state = document.createElement('span'); state.className = 'inventory-alert-status';
        state.textContent = status === 'out' ? 'اتمام موجودی' : 'کمبود موجودی';
        const quantity = document.createElement('span'); quantity.className = 'inventory-alert-quantity';
        quantity.textContent = 'موجودی: ' + inventoryCore.text.toEnglishDigits(item.stock) + '؛ حداقل: ' + inventoryCore.text.toEnglishDigits(item.minimumStock);
        row.append(details, state, quantity); list.append(row);
      });
    }

    /**
     * هدف: ایجاد کنترل‌های فیلتر و ستون حداقل موجودی در همان جدول موجود، بدون وابستگی به HTML جداگانه.
     * ورودی: پارامتر ندارد.
     * خروجی: کنترل‌های فیلتر و حداقل موجودی در صورت نیاز به DOM افزوده می‌شوند.
     */
    function ensureInventoryManagementControls() {
      const headerRow = inventoryGrid.closest('table')?.querySelector('thead tr');
      if (headerRow && !headerRow.querySelector('[data-inventory-sort="category"]')) {
        const heading = document.createElement('th');
        heading.scope = 'col';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inventory-sort-button';
        button.dataset.inventorySort = 'category';
        button.innerHTML = 'گروه کالا <span class="inventory-sort-marker" aria-hidden="true">↕</span>';
        button.addEventListener('click', () => {
          inventorySort = inventorySort.key === 'category'
            ? { key: 'category', direction: inventorySort.direction === 'asc' ? 'desc' : 'asc' }
            : { key: 'category', direction: 'asc' };
          renderInventory();
        });
        heading.append(button);
        const descriptionHeading = headerRow.querySelector('[data-inventory-sort="description"]')?.closest('th');
        if (descriptionHeading && descriptionHeading.nextSibling) headerRow.insertBefore(heading, descriptionHeading.nextSibling);
        else headerRow.append(heading);
      }

      if (headerRow && !headerRow.querySelector('[data-inventory-sort="minimumStock"]')) {
        const heading = document.createElement('th');
        heading.scope = 'col';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inventory-sort-button';
        button.dataset.inventorySort = 'minimumStock';
        button.innerHTML = 'حداقل موجودی <span class="inventory-sort-marker" aria-hidden="true">↕</span>';
        button.addEventListener('click', () => {
          inventorySort = inventorySort.key === 'minimumStock'
            ? { key: 'minimumStock', direction: inventorySort.direction === 'asc' ? 'desc' : 'asc' }
            : { key: 'minimumStock', direction: 'asc' };
          renderInventory();
        });
        heading.append(button);
        const stockHeading = headerRow.querySelector('[data-inventory-sort="stock"]')?.closest('th');
        if (stockHeading && stockHeading.nextSibling) headerRow.insertBefore(heading, stockHeading.nextSibling);
        else headerRow.append(heading);
      }
    }

    function renderInventory() {
      ensureInventoryManagementControls();
      const { key, direction } = inventorySort;
      const multiplier = direction === 'desc' ? -1 : 1;
      const searchTerm = inventoryCore.text.toEnglishDigits(inventorySearchInput.value).trim().toLocaleLowerCase('fa');

      const sortedItems = [...inventoryItems].sort((first, second) => {
        if (key === 'entryDate') {
          const firstDate = first.entryTimestamp ? Date.parse(first.entryTimestamp) : NaN;
          const secondDate = second.entryTimestamp ? Date.parse(second.entryTimestamp) : NaN;
          const firstMissing = !Number.isFinite(firstDate);
          const secondMissing = !Number.isFinite(secondDate);
          if (firstMissing !== secondMissing) return firstMissing ? 1 : -1;
          if (firstMissing && secondMissing) return String(first.code).localeCompare(String(second.code), 'fa', { numeric: true });
          return (firstDate - secondDate) * multiplier;
        }

        const a = first[key] ?? '';
        const b = second[key] ?? '';
        let comparison;
        if (key === 'stock' || key === 'minimumStock' || key === 'sendQuantity') {
          comparison = (Number(a) || 0) - (Number(b) || 0);
        } else {
          comparison = String(a).localeCompare(String(b), 'fa', {
            numeric: true,
            sensitivity: 'base'
          });
        }
        return comparison * multiplier;
      });

      const filteredItems = sortedItems.filter(item => {
        if (!searchTerm) return true;
        const searchable = inventoryCore.text.toEnglishDigits([
          item.code, item.description, item.category, item.stock, item.minimumStock, item.sendQuantity,
          item.entryTimestamp ? inventoryCore.dates.solarDateTime(new Date(item.entryTimestamp)).date : ''
        ].join(' ')).toLocaleLowerCase('fa');
        return searchable.includes(searchTerm);
      });

      inventoryGrid.replaceChildren();
      const lowStockCount = inventoryItems.filter(isLowStockItem).length;
      const outOfStockCount = inventoryItems.filter(isOutOfStockItem).length;
      inventoryCount.textContent = 'تعداد کالاها: ' + inventoryCore.text.toEnglishDigits(inventoryItems.length) +
        '؛ کمبود: ' + inventoryCore.text.toEnglishDigits(lowStockCount) + '؛ اتمام: ' + inventoryCore.text.toEnglishDigits(outOfStockCount) +
        (searchTerm ? '؛ نتیجه جست‌وجو: ' + inventoryCore.text.toEnglishDigits(filteredItems.length) : '');
      renderInventoryAlerts();
      inventoryEmpty.hidden = filteredItems.length > 0;
      if (inventoryItems.length && !filteredItems.length) {
        inventoryEmpty.textContent = 'کالایی با عبارت جست‌وجوشده پیدا نشد؛ عبارت را تغییر دهید یا پاک کنید.';
      } else {
        inventoryEmpty.textContent = 'هنوز کالایی وارد نشده است. ابتدا از سکشن «ورودی کالاها» کالا اضافه کنید.';
      }

      filteredItems.forEach(item => {
        const row = document.createElement('tr');

        const codeCell = document.createElement('td');
        codeCell.className = 'inventory-code-cell';
        codeCell.textContent = item.code;

        const descriptionCell = document.createElement('td');
        descriptionCell.className = 'inventory-description-cell';
        descriptionCell.textContent = item.description;
        descriptionCell.title = item.description;

        const categoryCell = document.createElement('td');
        categoryCell.className = 'inventory-category-cell';
        const categoryInput = document.createElement('input');
        categoryInput.type = 'text';
        categoryInput.maxLength = 80;
        categoryInput.className = 'inventory-category-input';
        categoryInput.value = typeof item.category === 'string' ? item.category : '';
        categoryInput.setAttribute('aria-label', 'گروه کالا برای کد ' + item.code);
        categoryInput.addEventListener('change', () => {
          const previousCategory = typeof item.category === 'string' ? item.category : '';
          item.category = inventoryCore.text.normalizeArabicLetters(categoryInput.value).trim().slice(0, 80);
          if (!inventoryCore.inventory.save()) {
            item.category = previousCategory;
            categoryInput.value = previousCategory;
            return;
          }
          inventoryFeedback.textContent = item.category
            ? 'گروه کالای ' + item.code + ' ذخیره شد؛ در گزارش ارسال‌های بعدی ثبت می‌شود.'
            : 'گروه کالای ' + item.code + ' پاک شد.';
          renderInventory();
        });
        categoryCell.append(categoryInput);

        const stockCell = document.createElement('td');
        stockCell.className = 'inventory-quantity-cell';
        stockCell.textContent = inventoryCore.text.toEnglishDigits(item.stock);

        const minimumStockCell = document.createElement('td');
        minimumStockCell.className = 'inventory-minimum-stock-cell';
        const minimumStockInput = document.createElement('input');
        minimumStockInput.type = 'number';
        minimumStockInput.min = '0';
        minimumStockInput.step = 'any';
        minimumStockInput.inputMode = 'decimal';
        minimumStockInput.className = 'inventory-minimum-stock-input';
        minimumStockInput.value = String(Number(item.minimumStock) || 0);
        minimumStockInput.setAttribute('aria-label', 'حداقل موجودی کالا با کد ' + item.code);
        minimumStockInput.title = 'موجودی برابر یا کمتر از این مقدار، هشدار کمبود ایجاد می‌کند؛ صفر یعنی آستانه اختصاصی تنظیم نشده است.';
        minimumStockInput.addEventListener('change', () => {
          const rawValue = minimumStockInput.value.trim();
          const nextMinimum = rawValue === '' ? 0 : inventoryCore.text.normalizeStock(rawValue);
          if (!Number.isFinite(nextMinimum) || nextMinimum < 0) {
            minimumStockInput.value = String(Number(item.minimumStock) || 0);
            inventoryFeedback.textContent = 'حداقل موجودی باید عددی معتبر و بزرگ‌تر یا مساوی صفر باشد.';
            minimumStockInput.focus();
            return;
          }
          const previousMinimum = Number(item.minimumStock) || 0;
          const previousManualSetting = item.minimumStockManual === true;
          item.minimumStock = nextMinimum;
          item.minimumStockManual = true;
          if (!inventoryCore.inventory.save()) {
            item.minimumStock = previousMinimum;
            item.minimumStockManual = previousManualSetting;
            minimumStockInput.value = String(previousMinimum);
            return;
          }
          inventoryFeedback.textContent = 'حداقل موجودی ذخیره شد؛ هشدار کمبود برای کد ' + item.code + ' به‌روز شد.';
          renderInventory();
        });
        minimumStockCell.append(minimumStockInput);
        const resetMinimumButton = document.createElement('button');
        resetMinimumButton.type = 'button';
        resetMinimumButton.className = 'inventory-minimum-reset-button';
        resetMinimumButton.textContent = '۲۰٪ پیش‌فرض';
        resetMinimumButton.title = 'بازگشت حداقل موجودی به ۲۰٪ مقدار ثبت‌شده هنگام ورود';
        resetMinimumButton.setAttribute('aria-label', 'بازگشت حداقل موجودی کد ' + item.code + ' به مقدار پیش‌فرض');
        resetMinimumButton.addEventListener('click', () => {
          const previousMinimum = item.minimumStock;
          const previousManualSetting = item.minimumStockManual === true;
          item.minimumStockManual = false;
          item.minimumStock = inventoryCore.inventory.calculateDefaultMinimumStock(item.minimumStockBaseQuantity);
          if (!inventoryCore.inventory.save()) {
            item.minimumStock = previousMinimum;
            item.minimumStockManual = previousManualSetting;
            return;
          }
          inventoryFeedback.textContent = 'حداقل موجودی کد ' + item.code + ' به مقدار پیش‌فرض ۲۰٪ بازگشت.';
          renderInventory();
        });
        minimumStockCell.append(resetMinimumButton);
        const stockStatus = getInventoryStockStatus(item);
        if (stockStatus !== 'normal') {
          stockCell.classList.add(stockStatus === 'out' ? 'inventory-out-of-stock-cell' : 'inventory-low-stock-cell');
          const badge = document.createElement('span');
          badge.className = 'inventory-low-stock-badge';
          badge.textContent = stockStatus === 'out' ? 'اتمام موجودی' : 'هشدار کمبود';
          badge.setAttribute('role', 'status');
          stockCell.append(document.createTextNode(' '), badge);
        }

        const sendCell = document.createElement('td');
        const sendInput = document.createElement('input');
        sendInput.className = 'send-quantity-input';
        sendInput.type = 'number';
        sendInput.min = '0';
        sendInput.step = 'any';
        sendInput.inputMode = 'decimal';
        sendInput.placeholder = '۰';
        sendInput.value = item.sendQuantity;
        sendInput.setAttribute('aria-label', 'تعداد برای ارسال کالا ' + item.code);
        // رویداد «تغییر» برای فیلد مقدار آماده‌ارسال؛ به‌روزرسانی داده‌ها و رابط پس از تغییر انتخاب.
        sendInput.addEventListener('change', () => {
          const value = sendInput.value.trim();
          const numericValue = value === '' ? '' : inventoryCore.text.normalizeStock(value);
          if (numericValue !== '' && (!Number.isFinite(numericValue) || numericValue < 0)) {
            sendInput.value = item.sendQuantity;
            inventoryFeedback.textContent = 'تعداد برای ارسال باید عددی بزرگ‌تر یا مساوی صفر باشد.';
            return;
          }
          const previousQuantity = item.sendQuantity;
          // صفر معادل «مقدار آماده‌ارسال خالی» است؛ ذخیره آن را یکسان‌سازی کن تا با بارگذاری بعدی تعارض نداشته باشد.
          item.sendQuantity = numericValue === 0 ? '' : numericValue;
          if (!inventoryCore.inventory.save()) {
            item.sendQuantity = previousQuantity;
            sendInput.value = previousQuantity === '' ? '' : String(previousQuantity);
            return;
          }
          inventoryFeedback.textContent = '';
          inventoryCore.ui.refreshDataQualityReport();
          if (inventorySort.key === 'sendQuantity') renderInventory();
        });
        sendCell.append(sendInput);

        const entryDateCell = document.createElement('td');
        entryDateCell.className = 'inventory-date-cell date-time-cell';
        if (item.entryTimestamp && Number.isFinite(Date.parse(item.entryTimestamp))) {
          const dateTime = inventoryCore.dates.solarDateTime(new Date(item.entryTimestamp));
          const dateText = document.createElement('span');
          dateText.className = 'date-part';
          dateText.textContent = dateTime.date;
          const timeText = document.createElement('span');
          timeText.className = 'time-part';
          timeText.textContent = dateTime.time;
          entryDateCell.append(dateText, timeText);
          entryDateCell.dataset.sortValue = item.entryTimestamp;
        } else {
          entryDateCell.textContent = 'نامشخص';
          entryDateCell.dataset.sortValue = '';
        }

        row.append(codeCell, descriptionCell, categoryCell, stockCell, minimumStockCell, sendCell, entryDateCell);
        inventoryGrid.append(row);
      });

      // به‌روزرسانی نشانگرهای مرتب‌سازی و ویژگی aria-sort پس از هر بار رندر جدول.
      document.querySelectorAll('[data-inventory-sort]').forEach(button => {
        const active = button.dataset.inventorySort === key;
        const marker = button.querySelector('.inventory-sort-marker');
        if (marker) marker.textContent = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
        const heading = button.closest('th');
        if (heading) heading.setAttribute('aria-sort', active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
        button.setAttribute('aria-label', 'مرتب‌سازی بر اساس ' + button.textContent.replace(/[↑↓↕]/g, '').trim() +
          (active ? (direction === 'asc' ? '، صعودی' : '، نزولی') : ''));
      });
    }

function setupInventorySection() {
  const root = document.getElementById('section-2');
  if (!root || root.dataset.inventoryInitialized === 'true') return false;
  root.dataset.inventoryInitialized = 'true';

  document.querySelectorAll('[data-inventory-sort]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.inventorySort;
      if (inventorySort.key === key) {
        inventorySort.direction = inventorySort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        inventorySort = { key, direction: key === 'entryDate' ? 'desc' : 'asc' };
      }
      renderInventory();
    });
  });

  inventorySearchInput?.addEventListener('input', renderInventory);
  renderInventory();
  return true;
}

window.AnbarInventory = Object.freeze({
  render: renderInventory,
  getStockStatus: getInventoryStockStatus,
  isLowStockItem,
  isOutOfStockItem,
  renderAlerts: renderInventoryAlerts
});
