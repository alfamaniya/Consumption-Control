
    // اتصال‌های ثابت DOM؛ شناسه‌ها باید با index.html هماهنگ بمانند.
    const sectionLinks = document.querySelectorAll('.nav-link');
    const sectionCards = document.querySelectorAll('.section-card');
    const inventoryFeedback = document.getElementById('inventory-feedback');
    const openShipmentDialogButton = document.getElementById('open-shipment-dialog');
    const shipmentDialog = document.getElementById('shipment-dialog');
    const shipmentForm = document.getElementById('shipment-form');
    const shipmentItemsContainer = document.getElementById('shipment-items');
    const shipmentLocationInput = document.getElementById('shipment-location');
    const shipmentSublocationInput = document.getElementById('shipment-sublocation');
    const shipmentSublocationGroup = document.getElementById('shipment-sublocation-group');
    // کلیدهای پایدار localStorage؛ تغییر نام آن‌ها بدون مهاجرت می‌تواند داده‌های قبلی را از دسترس خارج کند.
    const LOCATION_KEY = 'anbar.shipment-locations.v1';
    const CATEGORY_GROUPS_KEY = 'anbar.category-groups.v1';
    const shipmentVoucherInput = document.getElementById('shipment-voucher');
    const shipmentExitInput = document.getElementById('shipment-exit-number');
    const shipmentFeedback = document.getElementById('shipment-feedback');
    const SHIPMENT_KEY = 'anbar.shipments.v1';
    // کلیدهای اصلی داده و وضعیت صفحه‌بندی گزارش‌ها.
    const STORAGE_KEY = 'anbar.inventory.v1';
    const ACTIVITY_KEY = 'anbar.activity-log.v1'; // برای سازگاری با فایل‌های بکاپ قدیمی نگه داشته شده است.
    const ENTRY_HISTORY_KEY = 'anbar.entry-history.v1';
    const ENTRY_PAGE_SIZE = 10;

    /**
     * هدف: خواندن لاگ فعالیت از localStorage و کنارگذاشتن رکوردهای نامعتبر.
     * ورودی: پارامتر ندارد.
     * خروجی: آرایه رخدادهای معتبر؛ هنگام خطا آرایه خالی.
     */
    function loadActivityLog() {
      try {
        const records = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
        return Array.isArray(records)
          ? records.filter(record => record && typeof record === 'object' && !Array.isArray(record))
          : [];
      } catch (error) {
        return [];
      }
    }

    /**
     * هدف: خواندن تاریخچه ارسال و کنترل آرایه بودن داده اصلی.
     * ورودی: پارامتر ندارد.
     * خروجی: آرایه ارسال‌ها؛ هنگام خطا آرایه خالی.
     */
    function loadShipments() {
      try { const records = JSON.parse(localStorage.getItem(SHIPMENT_KEY) || '[]'); return Array.isArray(records) ? records : []; }
      catch (error) { return []; }
    }
    /**
     * هدف: ذخیره آرایه سوابق ارسال و نمایش پیام خطا در صورت شکست.
     * ورودی: records: فهرست نهایی ارسال‌ها.
     * خروجی: true یا false بر اساس نتیجه ذخیره.
     */
    function saveShipments(records) {
      if (!canSafelyRewriteStoredArray(SHIPMENT_KEY, 'تاریخچه ارسال', shipmentFeedback)) return false;
      try { localStorage.setItem(SHIPMENT_KEY, JSON.stringify(records)); refreshDataQualityReportSafely(); return true; }
      catch (error) { shipmentFeedback.textContent = 'ذخیره تاریخچه ارسال انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.'; return false; }
    }

    // نام ماه‌های تقویم خورشیدی برای انتخاب‌گر داخلی؛ بدون وابستگی به اینترنت.
    const SOLAR_MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
    const SOLAR_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    const SOLAR_DATE_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
    });

    /** تبدیل تاریخ میلادی UTC به اجزای عددی تاریخ خورشیدی. */
    function getSolarDateParts(date) {
      const parts = SOLAR_DATE_FORMATTER.formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = Number(part.value);
        return result;
      }, {});
      return { year: parts.year, month: parts.month, day: parts.day };
    }

    /** تاریخ امروز بر اساس تقویم محلی دستگاه؛ تبدیل به UTC فقط برای جلوگیری از اثر timezone در Intl است. */
    function getTodaySolarDateParts() {
      const now = new Date();
      const localCalendarDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
      return getSolarDateParts(localCalendarDate);
    }

    /**
     * تبدیل تاریخ خورشیدی به روز میلادی با جست‌وجوی محدود در حوالی سال متناظر.
     * استفاده از UTC مانع جابه‌جایی روز در مناطق زمانی مختلف می‌شود.
     */
    function findGregorianDateForSolar(year, month, day) {
      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
          year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31) return null;
      const start = Date.UTC(year + 621, 2, 15, 12);
      const end = Date.UTC(year + 622, 3, 10, 12);
      for (let time = start; time <= end; time += 86400000) {
        const date = new Date(time);
        const parts = getSolarDateParts(date);
        if (parts.year === year && parts.month === month && parts.day === day) return date;
      }
      return null;
    }

    /** تولید تاریخ میلادی ISO برای مقایسه فیلترها، بدون تغییر تاریخ ذخیره‌شده سوابق. */
    function solarDateToIso(year, month, day) {
      const date = findGregorianDateForSolar(year, month, day);
      if (!date) return '';
      const gregorian = new Date(date.getTime());
      return String(gregorian.getUTCFullYear()).padStart(4, '0') + '-' +
        String(gregorian.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(gregorian.getUTCDate()).padStart(2, '0');
    }

    /** نمایش تاریخ خورشیدی با ارقام فارسی. */
    function formatSolarDate(date) {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
      }).format(date);
    }

    /** ساخت تقویم خورشیدی برای یک ماه؛ ورودی و خروجی فیلتر به ISO میلادی متصل می‌ماند. */
    function renderSolarCalendar(input, panel, year, month) {
      if (month < 1) { year -= 1; month = 12; }
      if (month > 12) { year += 1; month = 1; }
      const firstDay = findGregorianDateForSolar(year, month, 1);
      if (!firstDay) {
        panel.hidden = true;
        return;
      }
      const weekdayOffset = (firstDay.getUTCDay() + 1) % 7; // شروع هفته: شنبه
      let daysInMonth = 0;
      for (let day = 1; day <= 31; day += 1) {
        const candidate = new Date(firstDay.getTime() + (day - 1) * 86400000);
        const parts = getSolarDateParts(candidate);
        if (parts.year !== year || parts.month !== month || parts.day !== day) break;
        daysInMonth = day;
      }
      const selectedIso = input.dataset.isoDate || '';
      const today = getTodaySolarDateParts();
      let dayButtons = '';
      for (let blank = 0; blank < weekdayOffset; blank += 1) dayButtons += '<span class="solar-calendar-empty" aria-hidden="true"></span>';
      for (let day = 1; day <= daysInMonth; day += 1) {
        const gregorian = new Date(firstDay.getTime() + (day - 1) * 86400000);
        const iso = String(gregorian.getUTCFullYear()).padStart(4, '0') + '-' +
          String(gregorian.getUTCMonth() + 1).padStart(2, '0') + '-' +
          String(gregorian.getUTCDate()).padStart(2, '0');
        const selected = iso === selectedIso ? ' is-selected' : '';
        const current = today.year === year && today.month === month && today.day === day ? ' is-today' : '';
        dayButtons += '<button type="button" class="solar-calendar-day' + selected + current +
          '" data-solar-day="' + day + '" aria-label="' + day + ' ' + SOLAR_MONTH_NAMES[month - 1] + ' ' + year + '">' +
          toEnglishDigits(day).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) + '</button>';
      }
      panel.innerHTML = '<div class="solar-calendar-heading">' +
        '<button type="button" class="solar-calendar-nav" data-solar-year="-1" aria-label="سال قبل">«</button>' +
        '<button type="button" class="solar-calendar-nav" data-solar-nav="-1" aria-label="ماه قبل">‹</button>' +
        '<strong>' + SOLAR_MONTH_NAMES[month - 1] + ' ' + toEnglishDigits(year).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]) + '</strong>' +
        '<button type="button" class="solar-calendar-nav" data-solar-nav="1" aria-label="ماه بعد">›</button>' +
        '<button type="button" class="solar-calendar-nav" data-solar-year="1" aria-label="سال بعد">»</button></div>' +
        '<div class="solar-calendar-grid solar-calendar-weekdays">' +
        SOLAR_WEEKDAYS.map(day => '<span>' + day + '</span>').join('') + '</div>' +
        '<div class="solar-calendar-grid solar-calendar-days">' + dayButtons + '</div>';
      panel.dataset.viewYear = String(year);
      panel.dataset.viewMonth = String(month);
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    /** اتصال ورودی‌های تاریخ به انتخاب‌گر خورشیدی، با پشتیبانی از تایپ دستی و صفحه‌کلید. */
    function initializeSolarDateInputs() {
      const inputs = Array.from(document.querySelectorAll('.solar-date-input'));
      inputs.forEach(input => {
        if (input.closest('.solar-date-control')) return;
        const control = document.createElement('div');
        control.className = 'solar-date-control';
        input.parentNode.insertBefore(control, input);
        control.append(input);
        const panel = document.createElement('div');
        panel.className = 'solar-date-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'انتخاب تاریخ خورشیدی');
        control.append(panel);

        const openCalendar = () => {
          const entered = toEnglishDigits((input.value || '').trim());
          const match = entered.match(/^(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})$/);
          const today = getTodaySolarDateParts();
          const year = match ? Number(toEnglishDigits(match[1])) : today.year;
          const month = match ? Number(toEnglishDigits(match[2])) : today.month;
          renderSolarCalendar(input, panel, year, month);
          input.setAttribute('aria-expanded', String(!panel.hidden));
        };
        input.addEventListener('focus', openCalendar);
        input.addEventListener('click', openCalendar);
        input.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            panel.hidden = true;
            input.setAttribute('aria-expanded', 'false');
          } else if (event.key === 'ArrowDown' && panel.hidden) {
            event.preventDefault();
            openCalendar();
          }
        });
        input.addEventListener('input', () => {
          delete input.dataset.isoDate;
          input.removeAttribute('aria-invalid');
        });
        input.addEventListener('change', () => {
          const normalizedValue = toEnglishDigits(input.value.trim());
          const match = normalizedValue.match(/^(\d{4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,2})$/);
          const iso = match
            ? solarDateToIso(Number(toEnglishDigits(match[1])), Number(toEnglishDigits(match[2])), Number(toEnglishDigits(match[3])))
            : '';
          if (input.value.trim() && !iso) {
            input.setAttribute('aria-invalid', 'true');
            input.title = 'تاریخ خورشیدی معتبر نیست؛ قالب نمونه: ۱۴۰۵/۰۱/۰۱';
          } else {
            input.removeAttribute('aria-invalid');
            input.title = '';
            if (iso) input.dataset.isoDate = iso;
            else delete input.dataset.isoDate;
          }
        });
        panel.addEventListener('click', event => {
          // هدف کلیک ممکن است خود متن/گلیف داخل دکمه باشد؛ در این حالت والد عنصر را بررسی می‌کنیم.
          const target = event.target instanceof Element
            ? event.target
            : (event.target && event.target.parentElement);
          if (!target) return;
          const yearNavigation = target.closest('[data-solar-year]');
          if (yearNavigation) {
            renderSolarCalendar(input, panel, Number(panel.dataset.viewYear) + Number(yearNavigation.dataset.solarYear), Number(panel.dataset.viewMonth));
            input.setAttribute('aria-expanded', String(!panel.hidden));
            return;
          }
          const navigation = target.closest('[data-solar-nav]');
          if (navigation) {
            renderSolarCalendar(input, panel, Number(panel.dataset.viewYear), Number(panel.dataset.viewMonth) + Number(navigation.dataset.solarNav));
            input.setAttribute('aria-expanded', String(!panel.hidden));
            return;
          }
          const dayButton = target.closest('[data-solar-day]');
          if (!dayButton) return;
          const year = Number(panel.dataset.viewYear);
          const month = Number(panel.dataset.viewMonth);
          const day = Number(dayButton.dataset.solarDay);
          const iso = solarDateToIso(year, month, day);
          if (!iso) return;
          input.dataset.isoDate = iso;
          input.value = formatSolarDate(findGregorianDateForSolar(year, month, day));
          input.removeAttribute('aria-invalid');
          input.title = '';
          panel.hidden = true;
          input.setAttribute('aria-expanded', 'false');
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      // این شنونده سراسری فقط یک‌بار ثبت می‌شود؛ تابع مقداردهی ممکن است چندبار اجرا شود.
      // ثبت تکراری شنونده باعث می‌شد یک کلیک، ماه یا سال را چندبار جابه‌جا کند.
      if (!document.documentElement.hasAttribute('data-solar-navigation-bound')) {
        document.documentElement.setAttribute('data-solar-navigation-bound', 'true');
        document.addEventListener('click', event => {
          const target = event.target instanceof Element
            ? event.target
            : (event.target && event.target.parentElement);
          const navigation = target
            ? target.closest('.solar-date-panel [data-solar-year], .solar-date-panel [data-solar-nav]')
            : null;
          if (!navigation) return;
          const panel = navigation.closest('.solar-date-panel');
          const control = panel && panel.closest('.solar-date-control');
          const input = control && control.querySelector('.solar-date-input');
          if (!panel || !input) return;
          event.preventDefault();
          event.stopPropagation();
          const year = Number(panel.dataset.viewYear);
          const month = Number(panel.dataset.viewMonth);
          if (navigation.hasAttribute('data-solar-year')) {
            renderSolarCalendar(input, panel, year + Number(navigation.dataset.solarYear), month);
          } else {
            renderSolarCalendar(input, panel, year, month + Number(navigation.dataset.solarNav));
          }
          input.setAttribute('aria-expanded', String(!panel.hidden));
        }, true);
      }

      // مقداردهی مجدد ورودی‌های گزارش نباید شنونده بستن تقویم را چندبار ثبت کند.
      if (!document.documentElement.hasAttribute('data-solar-dismiss-bound')) {
        document.documentElement.setAttribute('data-solar-dismiss-bound', 'true');
        document.addEventListener('click', event => {
          document.querySelectorAll('.solar-date-input').forEach(input => {
            const control = input.closest('.solar-date-control');
            if (control && !control.contains(event.target)) {
              const panel = control.querySelector('.solar-date-panel');
              if (panel) panel.hidden = true;
              input.setAttribute('aria-expanded', 'false');
            }
          });
        });
      }
    }

    initializeSolarDateInputs();
    /**
     * هدف: تبدیل زمان به تاریخ و ساعت شمسی برای نمایش فارسی.
     * ورودی: date: شیء Date معتبر.
     * خروجی: شیء اجزای تاریخ و ساعت مورد استفاده رابط.
     */
    function solarDateTime(date = new Date()) {
      const datePart = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      const timePart = new Intl.DateTimeFormat('fa-IR', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
      return {date:datePart,time:timePart,label:datePart+' '+timePart};
    }
    /**
     * هدف: ساخت شماره پیش‌فرض حواله یا خروج با پیشوند و زمان.
     * ورودی: prefix: نوع شماره؛ date: زمان مبنا؛ epoch: مقدار زمانی برای یکتاسازی.
     * خروجی: رشته شماره تولیدشده.
     */
    function makeShipmentNumber(prefix, date, epoch) {
      // قالب خودکار: AUTO-YYYYMMDD-HHmmss؛ تاریخ شمسی و ساعت ۲۴ساعته، با پسوند زمانی برای جلوگیری از تکرار.
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
      const datePart = String(parts.year).padStart(4, '0') +
        String(parts.month).padStart(2, '0') + String(parts.day).padStart(2, '0');
      const clockPart = String(parts.hour).padStart(2, '0') +
        String(parts.minute).padStart(2, '0') + String(parts.second).padStart(2, '0');
      return (prefix ? prefix + '-' : '') + 'AUTO-' + datePart + '-' + clockPart + '-' + String(epoch).slice(-4);
    }
    /**
     * هدف: ساخت ورودی جدول ارسال با برچسب، مقدار و نوع مشخص.
     * ورودی: labelText: عنوان؛ value: مقدار اولیه؛ type: نوع کنترل.
     * خروجی: عنصر DOM ورودی.
     */
    function createShipmentField(labelText, value, type='text') {
      const group=document.createElement('div'); group.className='field-group';
      const label=document.createElement('label'); label.textContent=labelText;
      const input=document.createElement('input'); input.type=type; input.value=value; input.required=true; input.className='shipment-quantity-input';
      if(type==='number'){input.min='0.0000001';input.step='any';input.inputMode='decimal';}
      else input.readOnly=true;
      input.id='shipment-field-'+Math.random().toString(36).slice(2); label.htmlFor=input.id;
      group.append(label,input); return {group,input};
    }
    /**
     * هدف: آماده‌سازی پنجره ارسال برای کالاهای انتخاب‌شده و نمایش مقدارهای قابل ویرایش.
     * ورودی: پارامتر ندارد؛ از موجودی و انتخاب‌های جاری استفاده می‌کند.
     * خروجی: پنجره ارسال نمایش داده می‌شود یا پیام مناسبی نشان داده می‌شود.
     */
    function openShipmentDialog() {
      const candidates = inventoryItems.filter(item => {
        const quantity = item.sendQuantity === '' ? 0 : Number(item.sendQuantity);
        return Number.isFinite(quantity) && quantity > 0;
      });
      if (!candidates.length) {
        inventoryFeedback.textContent = 'ابتدا در فیلد «تعداد برای ارسال» برای حداقل یک کالا عددی بزرگ‌تر از صفر وارد کنید.';
        return;
      }
      shipmentItemsContainer.replaceChildren();
      shipmentFeedback.textContent = '';
      const wrapper = document.createElement('div'); wrapper.className = 'preview-table-wrap';
      const { table, tbody } = createDataTable(['کد تدارکاتی', 'شرح کالا', 'موجودی فعلی', 'تعداد ارسالی'], 'shipment-items-table');
      candidates.forEach(item => {
        const row = document.createElement('tr'); row.dataset.code = item.code;
        const codeCell = document.createElement('td'); codeCell.textContent = item.code;
        const descriptionCell = document.createElement('td'); descriptionCell.textContent = item.description;
        const stockCell = document.createElement('td'); stockCell.textContent = toEnglishDigits(item.stock);
        const quantityCell = document.createElement('td');
        const input = document.createElement('input'); input.type = 'number'; input.min = '0.0000001'; input.step = 'any';
        input.inputMode = 'decimal'; input.required = true; input.className = 'shipment-quantity';
        input.value = String(item.sendQuantity); input.dataset.code = item.code; input.max = String(item.stock);
        input.setAttribute('aria-label', 'تعداد ارسالی برای ' + item.code);
        quantityCell.append(input); row.append(codeCell, descriptionCell, stockCell, quantityCell); tbody.append(row);
      });
      wrapper.append(table); shipmentItemsContainer.append(wrapper);
      enableTableSorting(table, { defaultColumn: 0, defaultDirection: 'asc' });
      shipmentLocationInput.value = ''; shipmentSublocationInput.value = ''; shipmentSublocationGroup.hidden = false; shipmentVoucherInput.value = ''; shipmentExitInput.value = ''; renderShipmentLocationOptions();
      if (typeof shipmentDialog.showModal === 'function') shipmentDialog.showModal();
      else shipmentDialog.setAttribute('open', '');
    }
    /**
     * هدف: بستن پنجره ارسال با مسیر جایگزین برای مرورگرهای فاقد close.
     * ورودی: پارامتر ندارد.
     * خروجی: بدون مقدار بازگشتی.
     */
    function closeShipmentDialog() {
      if(typeof shipmentDialog.close==='function'&&shipmentDialog.open)shipmentDialog.close();else shipmentDialog.removeAttribute('open');
    }
    /**
     * هدف: اعتبارسنجی و ثبت ارسال؛ کنترل شماره‌های تکراری، به‌روزرسانی موجودی و بازگردانی تغییرات در شکست ذخیره.
     * ورودی: event: رویداد submit فرم.
     * خروجی: بدون مقدار بازگشتی؛ نتیجه با پیام رابط و داده ذخیره‌شده مشخص می‌شود.
     */
    /**
     * هدف: اجرای امن عملیات ارسال و نمایش خطای واقعی، بدون پنهان‌کردن آن به‌عنوان خطای قفل.
     * ورودی: error: خطای رخ‌داده هنگام پردازش ارسال.
     * خروجی: پیام قابل‌فهم در رابط و جزئیات فنی در کنسول مرورگر.
     */
    let shipmentCommitStage = 'آماده‌سازی';

    function reportShipmentCommitError(error) {
      console.error('خطا در پردازش ثبت ارسال؛ مرحله:', shipmentCommitStage, error);
      const detail = error && error.message ? String(error.message) : 'خطای ناشناخته';
      shipmentFeedback.textContent = 'خطای داخلی هنگام ثبت ارسال در مرحله «' + shipmentCommitStage + '»: ' + detail +
        '؛ پیش از تلاش مجدد، موجودی و تاریخچه ارسال را بررسی کنید.';
    }

    function runShipmentCommitSafely() {
      try {
        processShipmentCommit();
      } catch (error) {
        reportShipmentCommitError(error);
      }
    }

    async function commitShipment(event) {
      event.preventDefault();
      if (navigator.locks && typeof navigator.locks.request === 'function') {
        let commitStarted = false;
        try {
          await navigator.locks.request('anbar-inventory-shipment', () => {
            commitStarted = true;
            runShipmentCommitSafely();
          });
        } catch (error) {
          if (commitStarted) {
            // عملیات آغاز شده است؛ برای جلوگیری از ثبت تکراری، آن را دوباره اجرا نمی‌کنیم.
            console.error('پس از شروع عملیات، قفل مرورگر با خطا آزاد شد:', error);
            return;
          }
          // اگر API قفل پیش از شروع عملیات قابل استفاده نبود، مسیر عادی اجرا می‌شود.
          console.warn('قفل بین زبانه‌ها در دسترس نبود؛ ثبت ارسال با کنترل تداخل موجودی ادامه می‌یابد.', error);
          runShipmentCommitSafely();
        }
        return;
      }
      runShipmentCommitSafely();
    }

    function processShipmentCommit() {
      shipmentCommitStage = 'خواندن و همگام‌سازی موجودی';
      shipmentFeedback.textContent = '';

      if (!refreshInventoryFromStorage(false)) {
        shipmentFeedback.textContent = 'موجودی ذخیره‌شده قابل خواندن نیست؛ ارسال ثبت نشد. داده‌ها را بررسی و صفحه را دوباره بارگذاری کنید.';
        return;
      }

      const location = shipmentLocationInput.value.trim();
      const sublocation = shipmentSublocationInput.value.trim();
      if (!location) {
        shipmentFeedback.textContent = 'لطفاً محل ارسال را وارد کنید.';
        shipmentLocationInput.focus();
        return;
      }

      const quantities = [];
      const quantitiesByCode = new Map();
      for (const input of shipmentItemsContainer.querySelectorAll('.shipment-quantity')) {
        const matchingItems = inventoryItems.filter(candidate => candidate.code === input.dataset.code);
        if (matchingItems.length !== 1) {
          shipmentFeedback.textContent = 'کد کالای این ردیف در موجودی تکراری یا نامعتبر است؛ ارسال ثبت نشد. ابتدا رکوردهای دارای کد تکراری را بررسی و اصلاح کنید.';
          input.focus();
          return;
        }
        const item = matchingItems[0];
        const quantity = normalizeStock(input.value);
        const totalForCode = (quantitiesByCode.get(item.code) || 0) + quantity;
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > item.stock || totalForCode > item.stock) {
          shipmentFeedback.textContent = 'مجموع تعداد ارسالی هر کالا باید بیشتر از صفر و حداکثر برابر موجودی فعلی همان کالا باشد. مقدار ردیف مشخص‌شده را اصلاح کنید.';
          input.focus();
          return;
        }
        quantitiesByCode.set(item.code, totalForCode);
        quantities.push({ item, quantity });
      }
      if (!quantities.length) {
        shipmentFeedback.textContent = 'هیچ کالایی برای ارسال وجود ندارد.';
        return;
      }

      const now = new Date();
      const generatedAt = solarDateTime(now);
      const epoch = now.getTime();
      const existingShipments = loadShipments();
      const voucher = shipmentVoucherInput.value.trim() || makeShipmentNumber('V', now, epoch);
      const exitNumber = shipmentExitInput.value.trim() || makeShipmentNumber('X', now, epoch + 1);

      if (existingShipments.some(record => record && typeof record === 'object' &&
          !Array.isArray(record) && record.voucherNumber === voucher)) {
        shipmentFeedback.textContent = 'این شماره حواله قبلاً ثبت شده است. شماره دیگری وارد کنید.';
        shipmentVoucherInput.focus();
        return;
      }
      if (existingShipments.some(record => record && typeof record === 'object' &&
          !Array.isArray(record) && record.exitNumber === exitNumber)) {
        shipmentFeedback.textContent = 'این شماره خروج قبلاً ثبت شده است. شماره دیگری وارد کنید.';
        shipmentExitInput.focus();
        return;
      }

      const previousLocations = loadShipmentLocations();
      const previousStoredValues = {
        [LOCATION_KEY]: localStorage.getItem(LOCATION_KEY),
        [SHIPMENT_KEY]: localStorage.getItem(SHIPMENT_KEY)
      };
      const previousInventoryItems = inventoryItems.map(item => ({ ...item }));
      const nextLocations = previousLocations.map(item => ({
        name: item.name,
        sublocations: [...item.sublocations]
      }));
      let locationRecord = nextLocations.find(item => normLocation(item.name) === normLocation(location));
      const isNewLocation = !locationRecord;
      if (!locationRecord) {
        locationRecord = { name: location, sublocations: [] };
        nextLocations.push(locationRecord);
      }

      if (locationRecord.sublocations.length && !sublocation) {
        shipmentFeedback.textContent = 'برای این محل، زیرمجموعه را انتخاب یا وارد کنید.';
        shipmentSublocationInput.focus();
        return;
      }
      const isNewSublocation = Boolean(sublocation) &&
        !locationRecord.sublocations.some(item => normLocation(item) === normLocation(sublocation));
      if (isNewSublocation) locationRecord.sublocations.push(sublocation);
      shipmentCommitStage = 'ذخیره محل ارسال';
      if (!saveShipmentLocations(nextLocations)) {
        shipmentFeedback.textContent = 'ذخیره محل ارسال ممکن نشد؛ ارسال ثبت نشد. فضای ذخیره‌سازی مرورگر را بررسی کنید.';
        return;
      }

      const shipmentId = makeUniqueRecordId('shipment', epoch);
      const shipment = {
        id: shipmentId,
        date: generatedAt.date,
        time: generatedAt.time,
        timestamp: now.toISOString(),
        location,
        sublocation,
        voucherNumber: voucher,
        exitNumber,
        items: quantities.map(({ item, quantity }, index) => ({
          id: makeUniqueRecordId('shipment-line', epoch + index),
          shipmentId,
          itemId: item.id || ('item-' + dataQualityKey(item.code)),
          code: item.code,
          description: item.description,
          category: typeof item.category === 'string' ? item.category : '',
          quantity
        }))
      };

      shipmentCommitStage = 'ذخیره تاریخچه ارسال';
      if (!saveShipments([shipment, ...existingShipments])) {
        const rollbackSucceeded = restoreLocalStorageValue(LOCATION_KEY, previousStoredValues[LOCATION_KEY]);
        shipmentFeedback.textContent = rollbackSucceeded
          ? 'ذخیره تاریخچه ارسال انجام نشد؛ ارسال ثبت نشد و اطلاعات قبلی حفظ شد.'
          : 'ذخیره تاریخچه ارسال انجام نشد و بازگردانی همه مقادیر قبلی کامل نشد؛ داده‌ها را بررسی کنید.';
        return;
      }

      quantities.forEach(({ item, quantity }) => {
        item.stock = Number((item.stock - quantity).toFixed(8));
        item.sendQuantity = '';
      });

      shipmentCommitStage = 'به‌روزرسانی و ذخیره موجودی';
      if (!saveInventory()) {
        inventoryItems.splice(0, inventoryItems.length, ...previousInventoryItems);
        const rollbackSucceeded = [
          restoreLocalStorageValue(SHIPMENT_KEY, previousStoredValues[SHIPMENT_KEY]),
          restoreLocalStorageValue(LOCATION_KEY, previousStoredValues[LOCATION_KEY])
        ].every(Boolean);
        renderShipmentLocationOptions();
        window.AnbarAdmin?.renderLocationManager();
        renderInventory();
        shipmentFeedback.textContent = rollbackSucceeded
          ? 'ذخیره موجودی انجام نشد؛ ارسال ثبت نشد و داده‌های قبلی بازیابی شدند. دوباره تلاش کنید.'
          : 'ذخیره موجودی ناموفق بود و بازگردانی همه داده‌های قبلی کامل نشد؛ موجودی، تاریخچه ارسال و فایل بکاپ را بررسی کنید.';
        return;
      }

      // از این نقطه هر دو داده اصلی (تاریخچه ارسال و موجودی) ذخیره شده‌اند.
      // خطای بازسازی اجزای نمایشی نباید به‌عنوان شکست ثبت گزارش شود یا کاربر را به ارسال دوباره ترغیب کند.
      shipmentCommitStage = 'به‌روزرسانی رابط کاربری پس از ثبت موفق';
      try {
        const itemDetails = quantities.map(({ item, quantity }) =>
          item.code + ' (' + item.description + '): ' + toEnglishDigits(quantity)
        ).join('؛ ');
        if (isNewLocation || isNewSublocation) {
          recordActivity(isNewLocation ? 'ثبت خودکار محل ارسال' : 'افزودن زیرمجموعه محل ارسال',
            'محل: «' + location + '»؛ زیرمجموعه: «' + (sublocation || 'ندارد') + '»؛ محل در جریان ارسال ذخیره شد.');
        }
        recordActivity('ثبت ارسال کالا', {
          'شماره حواله': voucher, 'شماره خروج': exitNumber,
          'تاریخ و ساعت': generatedAt.date + ' ' + generatedAt.time,
          'محل ارسال': location, 'زیرمجموعه': sublocation || 'ندارد',
          'تعداد ردیف کالا': quantities.length, 'اقلام (کد، شرح، تعداد)': itemDetails
        });

        renderShipmentLocationOptions();
        window.AnbarAdmin?.renderLocationManager();
        selectedItemCodes.clear();
        renderInventory();
        window.AnbarReports?.renderShipmentHistory();
        closeShipmentDialog();
        inventoryFeedback.textContent = 'ارسال با موفقیت ثبت شد. شماره حواله: ' + voucher + '؛ شماره خروج: ' + exitNumber;
        showOperationSuccess('shipment', shipment);
      } catch (uiError) {
        console.error('ارسال ذخیره شد اما به‌روزرسانی رابط کاربری با خطا مواجه شد:', uiError);
        shipmentFeedback.textContent = 'ارسال با موفقیت در موجودی و تاریخچه ثبت شد؛ فقط به‌روزرسانی نمایش با خطا روبه‌رو شد. صفحه را یک‌بار بارگذاری مجدد کنید. شماره حواله: ' + voucher;
        inventoryFeedback.textContent = shipmentFeedback.textContent;
      }

    }

    /**
     * هدف: افزودن رخداد به ابتدای لاگ همراه زمان و محدودکردن اندازه جزئیات.
     * ورودی: action: عنوان عملیات؛ details: شرح رخداد.
     * خروجی: بدون مقدار بازگشتی؛ خطای ثبت لاگ مانع عملیات اصلی نمی‌شود.
     */
    function recordActivity() {
      // لاگ سایت بنا به درخواست حذف شده؛ این تابع موقتاً برای سازگاری فراخوانی‌های موجود بی‌اثر است.
    }

    /**
     * هدف: ساخت جدول رخدادها با textContent برای جلوگیری از اجرای متن به‌عنوان HTML.
     * ورودی: target: ظرف نمایشی؛ logs: رخدادها؛ emptyText: پیام حالت خالی.
     * خروجی: DOM گزارش فعالیت به‌روزرسانی می‌شود.
     */


    function readStoredArrayState(key, label) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return { exists: false, raw: null, records: [], error: '' };
        let records;
        try { records = JSON.parse(raw); }
        catch (error) {
          return { exists: true, raw, records: null, error: label + ': متن ذخیره‌شده JSON معتبر نیست.' };
        }
        if (!Array.isArray(records)) {
          return { exists: true, raw, records: null, error: label + ': مقدار ذخیره‌شده آرایه نیست.' };
        }
        return { exists: true, raw, records, error: '' };
      } catch (error) {
        return { exists: true, raw: null, records: null, error: label + ': خواندن حافظه محلی ممکن نشد.' };
      }
    }

    /**
     * هدف: جلوگیری از بازنویسی کلیدهایی که خواندن عادی آن‌ها بخشی از داده را حذف یا تغییر می‌دهد.
     */
    function canSafelyRewriteStoredArray(key, label, feedbackTarget, preservesRecord = () => true) {
      const state = readStoredArrayState(key, label);
      let reason = state.error;
      if (!reason && state.exists) {
        const unsafeIndex = state.records.findIndex(record => !preservesRecord(record));
        if (unsafeIndex >= 0) {
          reason = label + '، رکورد ' + (unsafeIndex + 1) +
            ' هنگام بازخوانی معمول از دست می‌رود یا تغییر می‌کند.';
        }
      }
      if (reason) {
        if (feedbackTarget) {
          feedbackTarget.textContent = reason +
            ' برای جلوگیری از حذف ناخواسته، ذخیره متوقف شد. ابتدا از داده خام نسخه جداگانه تهیه و رکورد ناسازگار را بررسی کنید؛ هیچ رکوردی خودکار حذف نشده است.';
        }
        return false;
      }
      return ensureBackupSetupForFirstChange(feedbackTarget);
    }

    /** نرمال‌سازی کلید متنی برای کشف تکرار بدون تغییر مقدار ذخیره‌شده. */
    function dataQualityKey(value) {
      return normalizeArabicLetters(toEnglishDigits(String(value ?? '')))
        .trim().replace(/\s+/g, ' ').toLocaleLowerCase('fa');
    }

    /**
     * هدف: ممیزی غیرمخرب داده‌های واقعاً ذخیره‌شده و اعلام رکوردهای مشکوک در داشبورد.
     * این گزارش فقط می‌خواند؛ هیچ رکوردی را حذف، اصلاح یا ذخیره نمی‌کند.
     */
    function inspectStoredDataQuality() {
      const findings = [];
      const read = (key, label) => {
        const state = readStoredArrayState(key, label);
        if (state.error) findings.push(state.error);
        return state.error ? [] : state.records;
      };
      const inventory = read(STORAGE_KEY, 'موجودی');
      const entries = read(ENTRY_HISTORY_KEY, 'تاریخچه ورود');
      const shipments = read(SHIPMENT_KEY, 'تاریخچه ارسال');
      const locations = read(LOCATION_KEY, 'محل‌های ارسال');

      const inventoryCodes = new Set();
      const inventoryIds = new Set();
      inventory.forEach((item, index) => {
        const row = index + 1;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          findings.push('موجودی، رکورد ' + row + ' شیء معتبر نیست.');
          return;
        }
        const id = typeof item.id === 'string' ? dataQualityKey(item.id) : '';
        if (item.id !== undefined && !id) findings.push('موجودی، رکورد ' + row + ' شناسه کالا نامعتبر دارد.');
        else if (id && inventoryIds.has(id)) findings.push('شناسه کالای تکراری در موجودی: «' + String(item.id).slice(0, 60) + '».');
        if (id) inventoryIds.add(id);
        const code = typeof item.code === 'string' ? dataQualityKey(item.code) : '';
        if (!code) findings.push('موجودی، رکورد ' + row + ' کد خالی یا نامعتبر دارد.');
        else {
          if (!/^(?:\d{8}|\d{10})$/.test(toEnglishDigits(code))) {
            findings.push('موجودی، کد «' + String(item.code).slice(0, 40) + '» الگوی ۸ یا ۱۰ رقمی ندارد.');
          }
          if (inventoryCodes.has(code)) findings.push('کد کالای تکراری در موجودی: «' + String(item.code).slice(0, 40) + '».');
          inventoryCodes.add(code);
        }
        if (typeof item.description !== 'string' || !item.description.trim()) {
          findings.push('موجودی، رکورد ' + row + ' شرح کالا خالی دارد.');
        }
        if (item.category !== undefined && typeof item.category !== 'string') findings.push('موجودی، رکورد ' + row + ' گروه کالا نامعتبر دارد.');
        const stock = Number(item.stock);
        if ((typeof item.stock !== 'number' && typeof item.stock !== 'string') ||
            (typeof item.stock === 'string' && !item.stock.trim()) ||
            !Number.isFinite(stock) || stock < 0) {
          findings.push('موجودی، رکورد ' + row + ' مقدار موجودی نامعتبر دارد.');
        }
        if (item.entryTimestamp !== undefined && item.entryTimestamp !== '' &&
            !(typeof item.entryTimestamp === 'string' && Number.isFinite(Date.parse(item.entryTimestamp)))) {
          findings.push('موجودی، رکورد ' + row + ' زمان ورود نامعتبر دارد.');
        }
        const minimumStock = item.minimumStock === undefined || item.minimumStock === '' || item.minimumStock === null
          ? 0 : Number(item.minimumStock);
        if (item.minimumStock !== undefined && item.minimumStock !== '' && item.minimumStock !== null &&
            (!Number.isFinite(minimumStock) || minimumStock < 0)) {
          findings.push('موجودی، رکورد ' + row + ' حداقل موجودی نامعتبر دارد.');
        }
        if (item.minimumStockBaseQuantity !== undefined &&
            (!Number.isFinite(Number(item.minimumStockBaseQuantity)) || Number(item.minimumStockBaseQuantity) < 0)) {
          findings.push('موجودی، رکورد ' + row + ' مقدار مبنای حداقل موجودی نامعتبر دارد.');
        }
        if (Object.keys(item).some(key => !['id', 'code', 'description', 'category', 'stock', 'minimumStock', 'minimumStockManual', 'minimumStockBaseQuantity', 'sendQuantity', 'entryTimestamp'].includes(key))) {
          findings.push('موجودی، رکورد ' + row + ' فیلد اضافی دارد که نسخه جاری هنگام ذخیره حفظ نمی‌کند.');
        }
        if (item.sendQuantity !== undefined && item.sendQuantity !== '' && item.sendQuantity !== null) {
          const quantity = Number(item.sendQuantity);
          if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(stock) || quantity > stock) {
            findings.push('موجودی، رکورد ' + row + ' مقدار آماده‌ارسال خارج از محدوده دارد.');
          }
        }
      });

      const entryNumbers = new Set();
      const entryIds = new Set();
      const entryLineIds = new Set();
      entries.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          findings.push('تاریخچه ورود، رکورد ' + (index + 1) + ' شیء معتبر نیست.');
          return;
        }
        const entryId = typeof entry.id === 'string' ? dataQualityKey(entry.id) : '';
        if (entry.id !== undefined && !entryId) findings.push('تاریخچه ورود، رکورد ' + (index + 1) + ' شناسه سند نامعتبر دارد.');
        else if (entryId && entryIds.has(entryId)) findings.push('شناسه سند ورود تکراری است: «' + String(entry.id).slice(0, 60) + '».');
        if (entryId) entryIds.add(entryId);
        if (entry.items !== undefined && !Array.isArray(entry.items)) findings.push('تاریخچه ورود، رکورد ' + (index + 1) + ' فهرست اقلام معتبر ندارد.');
        if (Array.isArray(entry.items)) entry.items.forEach((line, lineIndex) => {
          if (!line || typeof line !== 'object' || Array.isArray(line) || typeof line.code !== 'string' || !line.code.trim()) {
            findings.push('ورود ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' کد کالا ندارد.');
            return;
          }
          const lineId = typeof line.id === 'string' ? dataQualityKey(line.id) : '';
          if (line.id !== undefined && !lineId) findings.push('ورود ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' شناسه ردیف نامعتبر دارد.');
          else if (lineId && entryLineIds.has(lineId)) findings.push('شناسه ردیف ورود تکراری است: «' + String(line.id).slice(0, 60) + '».');
          if (lineId) entryLineIds.add(lineId);
          if (line.itemId !== undefined && (typeof line.itemId !== 'string' || !line.itemId.trim())) findings.push('ورود ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' شناسه قلم نامعتبر دارد.');
          const quantity = Number(line.quantity);
          if (line.quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0)) findings.push('ورود ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' تعداد نامعتبر دارد.');
        });
        const number = typeof entry.entryNumber === 'string' ? dataQualityKey(entry.entryNumber) : '';
        if (!number) findings.push('تاریخچه ورود، رکورد ' + (index + 1) + ' شماره ورود ندارد.');
        else if (entryNumbers.has(number)) findings.push('شماره ورود تکراری: «' + String(entry.entryNumber).slice(0, 60) + '».');
        if (number) entryNumbers.add(number);
        if (entry.timestamp !== undefined && entry.timestamp !== '' &&
            !(typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp)))) {
          findings.push('تاریخچه ورود، رکورد ' + (index + 1) + ' زمان نامعتبر دارد.');
        }
        ['itemCount', 'pieceCount'].forEach(field => {
          if (entry[field] !== undefined &&
              (typeof entry[field] !== 'number' || !Number.isFinite(entry[field]) || entry[field] < 0)) {
            findings.push('تاریخچه ورود، رکورد ' + (index + 1) + ' مقدار «' + field + '» نامعتبر دارد.');
          }
        });
      });

      const voucherNumbers = new Set();
      const exitNumbers = new Set();
      const shipmentIds = new Set();
      const shipmentLineIds = new Set();
      shipments.forEach((shipment, index) => {
        if (!shipment || typeof shipment !== 'object' || Array.isArray(shipment)) {
          findings.push('تاریخچه ارسال، رکورد ' + (index + 1) + ' شیء معتبر نیست.');
          return;
        }
        const shipmentId = typeof shipment.id === 'string' ? dataQualityKey(shipment.id) : '';
        if (shipment.id !== undefined && !shipmentId) findings.push('تاریخچه ارسال، رکورد ' + (index + 1) + ' شناسه سند نامعتبر دارد.');
        else if (shipmentId && shipmentIds.has(shipmentId)) findings.push('شناسه سند ارسال تکراری است: «' + String(shipment.id).slice(0, 60) + '».');
        if (shipmentId) shipmentIds.add(shipmentId);
        [['voucherNumber', voucherNumbers, 'شماره حواله'], ['exitNumber', exitNumbers, 'شماره خروج']].forEach(([field, set, label]) => {
          const value = typeof shipment[field] === 'string' ? dataQualityKey(shipment[field]) : '';
          if (value && set.has(value)) findings.push(label + ' تکراری: «' + String(shipment[field]).slice(0, 60) + '».');
          if (value) set.add(value);
        });
        if (!Array.isArray(shipment.items)) {
          findings.push('تاریخچه ارسال، رکورد ' + (index + 1) + ' فهرست اقلام معتبر ندارد.');
          return;
        }
        shipment.items.forEach((line, lineIndex) => {
          if (!line || typeof line !== 'object' || Array.isArray(line) ||
              typeof line.code !== 'string' || !line.code.trim()) {
            findings.push('ارسال ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' کد کالای معتبر ندارد.');
            return;
          }
          const lineId = typeof line.id === 'string' ? dataQualityKey(line.id) : '';
          if (line.id !== undefined && !lineId) findings.push('ارسال ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' شناسه ردیف نامعتبر دارد.');
          else if (lineId && shipmentLineIds.has(lineId)) findings.push('شناسه ردیف ارسال تکراری است: «' + String(line.id).slice(0, 60) + '».');
          if (lineId) shipmentLineIds.add(lineId);
          if (line.itemId !== undefined && (typeof line.itemId !== 'string' || !line.itemId.trim())) findings.push('ارسال ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' شناسه قلم نامعتبر دارد.');
          const quantity = typeof line.quantity === 'number' ? line.quantity : normalizeStock(line.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            findings.push('ارسال ' + (index + 1) + '، ردیف ' + (lineIndex + 1) + ' تعداد نامعتبر دارد.');
          }
        });
      });

      const locationNames = new Set();
      locations.forEach((location, index) => {
        if (!location || typeof location !== 'object' || Array.isArray(location) ||
            typeof location.name !== 'string' || !location.name.trim()) {
          findings.push('محل ارسال، رکورد ' + (index + 1) + ' نام معتبر ندارد.');
          return;
        }
        const name = dataQualityKey(location.name);
        if (locationNames.has(name)) findings.push('نام محل ارسال تکراری: «' + location.name.slice(0, 60) + '».');
        locationNames.add(name);
        if (Object.keys(location).some(key => key !== 'name' && key !== 'sublocations')) {
          findings.push('محل «' + location.name.slice(0, 40) + '» فیلد اضافی دارد که نسخه جاری حفظ نمی‌کند.');
        }
        if (location.sublocations !== undefined &&
            (!Array.isArray(location.sublocations) ||
             !location.sublocations.every(value => typeof value === 'string' && value.trim()))) {
          findings.push('محل «' + location.name.slice(0, 40) + '» زیرمجموعه نامعتبر دارد.');
        } else if (Array.isArray(location.sublocations)) {
          const subs = new Set();
          location.sublocations.forEach(sub => {
            const key = dataQualityKey(sub);
            if (subs.has(key)) findings.push('زیرمجموعه تکراری برای محل «' + location.name.slice(0, 40) + '».');
            subs.add(key);
          });
        }
      });
      return findings;
    }

    /** هدف: نمایش نتیجه ممیزی غیرمخرب داده‌های ذخیره‌شده در بخش داشبورد. */
        /**
     * هدف: خواندن موجودی و پالایش کد، شرح، موجودی، مقدار آماده‌ارسال و زمان ورود.
     * ورودی: پارامتر ندارد.
     * خروجی: آرایه کالاهای نرمال‌شده؛ در خطا آرایه خالی.
     */
    /** خطای بازسازی گزارش کیفیت نباید نتیجه ذخیره موفق داده را به شکست کاذب تبدیل کند. */
        // درصد پیش‌فرض حداقل موجودی نسبت به تعداد ثبت‌شده هنگام ورود کالا.
    const DEFAULT_MINIMUM_STOCK_PERCENT = 20;
    function calculateDefaultMinimumStock(stock) {
      const quantity = Number(stock);
      return Number.isFinite(quantity) && quantity > 0 ? quantity * DEFAULT_MINIMUM_STOCK_PERCENT / 100 : 0;
    }

    function loadInventory() {
      try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) return [];
        const parsedData = JSON.parse(savedData);
        if (!Array.isArray(parsedData)) return [];

        return parsedData
          .filter(item =>
            item &&
            typeof item.code === 'string' &&
            typeof item.description === 'string' &&
            Number.isFinite(Number(item.stock)) &&
            Number(item.stock) >= 0
          )
          .map(item => {
            const stock = Number(item.stock);
            const requestedQuantity = item.sendQuantity === '' || item.sendQuantity === null || item.sendQuantity === undefined
              ? NaN
              : Number(item.sendQuantity);
            // مقدار مثبت قدیمی تنظیم دستی محسوب می‌شود؛ صفر قدیمی هنوز مقدار پیش‌فرض است.
            const hasManualMinimum = item.minimumStockManual === true ||
              (item.minimumStockManual === undefined && Number(item.minimumStock) > 0);
            const savedMinimum = Number(item.minimumStock);
            const hasSavedMinimum = item.minimumStock !== undefined && item.minimumStock !== '' &&
              item.minimumStock !== null && Number.isFinite(savedMinimum) && savedMinimum >= 0;
            const savedBaseQuantity = Number(item.minimumStockBaseQuantity);
            const hasSavedBaseQuantity = item.minimumStockBaseQuantity !== undefined &&
              item.minimumStockBaseQuantity !== '' && item.minimumStockBaseQuantity !== null &&
              Number.isFinite(savedBaseQuantity) && savedBaseQuantity >= 0;
            const minimumStockBaseQuantity = hasSavedBaseQuantity
              ? savedBaseQuantity
              : (item.minimumStockManual === false && hasSavedMinimum && savedMinimum > 0
                ? savedMinimum * 100 / DEFAULT_MINIMUM_STOCK_PERCENT
                : stock);
            const shouldPreserveSavedMinimum = hasSavedMinimum && (
              hasManualMinimum ||
              (item.minimumStockManual === false && (savedMinimum > 0 || minimumStockBaseQuantity === 0))
            );
            return {
              // برای داده‌های قدیمی، شناسه قابل تکرار از کد کالا ساخته می‌شود تا بارگذاری به ذخیره فوری وابسته نباشد.
              id: typeof item.id === 'string' && item.id.trim() ? item.id : 'item-' + dataQualityKey(item.code),
              code: item.code,
              description: item.description,
              category: typeof item.category === 'string' ? item.category : '',
              stock,
              // آستانه خودکار بر اساس مقدار آخرین ورود محاسبه و بین ارسال‌ها ثابت نگه داشته می‌شود.
              minimumStock: shouldPreserveSavedMinimum ? savedMinimum : calculateDefaultMinimumStock(minimumStockBaseQuantity),
              minimumStockManual: hasManualMinimum,
              minimumStockBaseQuantity,
              // مقدار موقت ارسال فقط در صورتی معتبر است که عددی مثبت و در محدوده موجودی باشد.
              sendQuantity: Number.isFinite(requestedQuantity) && requestedQuantity > 0 && requestedQuantity <= stock
                ? requestedQuantity
                : '',
              entryTimestamp: typeof item.entryTimestamp === 'string' && Number.isFinite(Date.parse(item.entryTimestamp))
                ? item.entryTimestamp
                : ''
            };
          });
      } catch (error) {
        return [];
      }
    }

    const inventoryItems = loadInventory();
    let inventoryStorageSnapshot = null;
    try {
      inventoryStorageSnapshot = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      inventoryFeedback.textContent = 'خواندن نسخه ذخیره‌شده موجودی ممکن نشد؛ ذخیره تغییرات تا دسترسی دوباره به حافظه متوقف می‌شود.';
    }
    let inventoryConflictRefreshPending = false;

    function refreshInventoryFromStorage(render = true) {
      const state = readStoredArrayState(STORAGE_KEY, 'موجودی');
      if (state.error) {
        inventoryFeedback.textContent = state.error + ' موجودی همگام نشد و هیچ تغییری ذخیره نشد.';
        return false;
      }
      inventoryItems.splice(0, inventoryItems.length, ...loadInventory());
      inventoryStorageSnapshot = state.raw;
      for (const code of selectedItemCodes) {
        if (!inventoryItems.some(item => item.code === code)) selectedItemCodes.delete(code);
      }
      if (render) renderInventory();
      return true;
    }

    function scheduleInventoryConflictRefresh() {
      inventoryFeedback.textContent = 'موجودی در زبانه دیگری تغییر کرده است؛ ذخیره این تغییر متوقف شد تا داده جدید بازخوانی شود.';
      if (inventoryConflictRefreshPending) return;
      inventoryConflictRefreshPending = true;
      Promise.resolve().then(() => {
        inventoryConflictRefreshPending = false;
        if (refreshInventoryFromStorage()) {
          inventoryFeedback.textContent = 'تغییر زبانه دیگر دریافت شد؛ موجودی تازه بارگذاری شد. تغییر قبلی را دوباره اعمال کنید.';
        }
      });
    }

    /**
     * هدف: ذخیره موجودی جاری و ثبت خلاصه تغییر در لاگ فعالیت.
     * ورودی: پارامتر ندارد؛ از inventoryItems استفاده می‌شود.
     * خروجی: true در ذخیره موفق و false در شکست.
     */
    function saveInventory() {
      const inventoryFields = new Set(['id', 'code', 'description', 'category', 'stock', 'minimumStock', 'minimumStockManual', 'minimumStockBaseQuantity', 'sendQuantity', 'entryTimestamp']);
      const preservesInventoryRecord = item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const stockTypeValid = typeof item.stock === 'number' ||
          (typeof item.stock === 'string' && item.stock.trim() !== '');
        if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) return false;
        if (typeof item.code !== 'string' || typeof item.description !== 'string' ||
            (item.category !== undefined && typeof item.category !== 'string') ||
            !stockTypeValid || !Number.isFinite(Number(item.stock)) || Number(item.stock) < 0 ||
            Object.keys(item).some(key => !inventoryFields.has(key))) return false;
        if (item.minimumStock !== undefined && item.minimumStock !== '' && item.minimumStock !== null &&
            ((typeof item.minimumStock !== 'number' && typeof item.minimumStock !== 'string') ||
              !Number.isFinite(Number(item.minimumStock)) || Number(item.minimumStock) < 0)) return false;
        if (item.minimumStockManual !== undefined && typeof item.minimumStockManual !== 'boolean') return false;
        if (item.minimumStockBaseQuantity !== undefined &&
            (!Number.isFinite(Number(item.minimumStockBaseQuantity)) || Number(item.minimumStockBaseQuantity) < 0)) return false;
        const quantity = item.sendQuantity === '' || item.sendQuantity === null || item.sendQuantity === undefined
          ? NaN : Number(item.sendQuantity);
        if (item.sendQuantity !== '' && item.sendQuantity !== null && item.sendQuantity !== undefined &&
            (!Number.isFinite(quantity) || quantity < 0 || quantity > Number(item.stock))) return false;
        return item.entryTimestamp === undefined || item.entryTimestamp === '' ||
          (typeof item.entryTimestamp === 'string' && Number.isFinite(Date.parse(item.entryTimestamp)));
      };
      if (!canSafelyRewriteStoredArray(STORAGE_KEY, 'موجودی', inventoryFeedback, preservesInventoryRecord)) {
        return false;
      }
      try {
        const currentSnapshot = localStorage.getItem(STORAGE_KEY);
        if (currentSnapshot !== inventoryStorageSnapshot) {
          scheduleInventoryConflictRefresh();
          return false;
        }
        const nextSnapshot = JSON.stringify(inventoryItems);
        localStorage.setItem(STORAGE_KEY, nextSnapshot);
        inventoryStorageSnapshot = nextSnapshot;
        recordActivity('ذخیره / تغییر موجودی', 'تعداد اقلام فعلی: ' + toEnglishDigits(inventoryItems.length));
        refreshDataQualityReportSafely();
        return true;
      } catch (error) {
        inventoryFeedback.textContent = 'ذخیره‌سازی در مرورگر انجام نشد؛ ممکن است حافظه مرورگر محدود یا غیرفعال باشد.';
        return false;
      }
    }

    /**
     * هدف: نمایش سکشن منتخب و تنظیم aria-current پیوند ناوبری متناظر.
     * ورودی: sectionId: شناسه سکشن مقصد.
     * خروجی: نمایش رابط به‌روزرسانی می‌شود.
     */
    function openSection(sectionId) {
      sectionCards.forEach((section) => {
        const isSelected = section.id === sectionId;
        section.classList.toggle('is-active', isSelected);
        section.hidden = !isSelected;
      });

      sectionLinks.forEach((link) => {
        const isSelected = link.getAttribute('href') === '#' + sectionId;
        if (isSelected) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    sectionLinks.forEach((link) => {
      // رویداد «کلیک» برای پیوند ناوبری؛ بازکردن بخش مقصد بدون بارگذاری دوباره صفحه.
      link.addEventListener('click', (event) => {
        event.preventDefault();
        openSection(link.getAttribute('href').slice(1));
      });
    });

    /**
     * هدف: قالب‌بندی شاخص داشبورد با رقم‌های فارسی و محافظت از مقدار عددی نامعتبر.
     * ورودی: value: مقداری که باید به عدد تبدیل شود.
     * خروجی: رشته عدد قالب‌بندی‌شده.
     */
        /**
     * هدف: محاسبه شاخص‌های داشبورد از داده واقعی ذخیره‌شده، بدون افزودن آمار نمونه.
     * ورودی: پارامتر ندارد.
     * خروجی: مقادیر عناصر داشبورد به‌روزرسانی می‌شوند.
     */
        /**
     * هدف: نمایش فهرست اقلامی که موجودی آن‌ها صفر یا منفی است، در باکس نگاه سریع داشبورد.
     * ورودی: inventory: آرایه اقلام ذخیره‌شده در مرورگر.
     * خروجی: فهرست امن و به‌روز اقلام در پنل بازشونده داشبورد.
     */
        /**
     * هدف: نمایش اقلامی که موجودی آن‌ها به حداقل موجودی تعریف‌شده رسیده یا از آن کمتر است.
     * ورودی: lowStockItems: آرایه اقلام دارای هشدار کمبود.
     * خروجی: فهرست قابل باز و بسته شدن اقلام کم‌موجودی در نمای کلی.
     */
        /**
     * هدف: اتصال میان‌برهای داشبورد و همگام‌سازی شاخص‌ها پس از تغییر داده یا DOM.
     * ورودی: پارامتر ندارد.
     * خروجی: رویدادها و مشاهده‌گرهای داشبورد فعال می‌شوند.
     */
        /**
     * هدف: یکسان‌سازی شکل‌های عربی و فارسی برخی حروف در متن ورودی.
     * ورودی: value: متن یا مقدار ورودی.
     * خروجی: رشته نرمال‌شده.
     */
    function normalizeArabicLetters(value) {
      return String(value ?? '')
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک');
    }

    /**
     * هدف: تبدیل رقم‌های فارسی و عربی به رقم‌های لاتین جهت مقایسه و اعتبارسنجی.
     * ورودی: value: متن یا مقدار ورودی.
     * خروجی: رشته با رقم‌های لاتین.
     */
    function toEnglishDigits(value) {
      return String(value ?? '')
        .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    }

    /**
     * هدف: تبدیل متن موجودی به عدد و پشتیبانی از جداکننده‌های عددی رایج.
     * ورودی: value: مقدار متنی.
     * خروجی: عدد یا NaN برای مقدار خالی/نامعتبر.
     */
    function normalizeStock(value) {
      const normalized = toEnglishDigits(value)
        .replace(/[٬,]/g, '')
        .replace(/٫/g, '.')
        .trim();
      if (normalized === '') return NaN;
      return Number(normalized);
    }

    /**
     * هدف: تجزیه CSV یا متن جدولی با رعایت جداکننده و کوتیشن سلول‌ها.
     * ورودی: text: متن خام فایل یا کلیپ‌بورد.
     * خروجی: آرایه دوبعدی ردیف‌ها و سلول‌ها.
     */
    function enableTableSorting(table, options = {}) {
      if (!table || table.dataset.sortingReady === 'true') return;
      const head = table.tHead;
      const body = table.tBodies[0];
      if (!head || !body || !head.rows.length) return;
      table.dataset.sortingReady = 'true';
      table.classList.add('sortable-data-table');
      const headers = [...head.rows[0].cells];
      let sortState = { column: Number.isInteger(options.defaultColumn) ? options.defaultColumn : 0, direction: options.defaultDirection || 'asc' };

      headers.forEach((cell, column) => {
        const label = cell.textContent.trim();
        cell.setAttribute('scope', 'col');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'table-sort-button';
        button.dataset.sortColumn = String(column);
        const title = document.createElement('span');
        title.textContent = label;
        const marker = document.createElement('span');
        marker.className = 'table-sort-marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = column === sortState.column ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
        button.append(title, marker);
        button.setAttribute('aria-label', 'مرتب‌سازی بر اساس ' + label);
        cell.replaceChildren(button);
      });

      /**
       * هدف: به‌روزرسانی فلش‌ها و نام دسترس‌پذیر کنترل‌های مرتب‌سازی.
       * ورودی: پارامتر ندارد؛ وضعیت تابع پیرامونی استفاده می‌شود.
       * خروجی: نشانگرهای جدول به‌روزرسانی می‌شوند.
       */
      function updateMarkers() {
        headers.forEach((cell, column) => {
          const button = cell.querySelector('button[data-sort-column]');
          if (!button) return;
          const marker = button.querySelector('.table-sort-marker');
          const active = column === sortState.column;
          if (marker) marker.textContent = active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
          cell.setAttribute('aria-sort', active ? (sortState.direction === 'asc' ? 'ascending' : 'descending') : 'none');
          const label = button.querySelector('span')?.textContent || '';
          button.setAttribute('aria-label', 'مرتب‌سازی بر اساس ' + label + (active ? (sortState.direction === 'asc' ? '، صعودی' : '، نزولی') : ''));
        });
      }

      headers.forEach((cell, column) => {
        // رویداد «کلیک» برای دکمه مرتب‌سازی ستون جدول؛ تغییر ترتیب ردیف‌ها و نشانگر مرتب‌سازی.
        cell.querySelector('button[data-sort-column]').addEventListener('click', () => {
          if (sortState.column === column) sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
          else sortState = { column, direction: 'asc' };
          const rows = [...body.rows].filter(row => !row.dataset.emptyRow);
          const sign = sortState.direction === 'asc' ? 1 : -1;
          rows.sort((first, second) => {
            const aCell = first.cells[column], bCell = second.cells[column];
            const a = aCell?.dataset.sortValue ?? aCell?.textContent.trim() ?? '';
            const b = bCell?.dataset.sortValue ?? bCell?.textContent.trim() ?? '';
            const aNum = Number(String(a).replace(/[٬,]/g, '').replace(/٫/g, '.'));
            const bNum = Number(String(b).replace(/[٬,]/g, '').replace(/٫/g, '.'));
            const numeric = a !== '' && b !== '' && Number.isFinite(aNum) && Number.isFinite(bNum);
            const comparison = numeric ? aNum - bNum : String(a).localeCompare(String(b), 'fa', { numeric: true, sensitivity: 'base' });
            return comparison * sign;
          });
          rows.forEach(row => body.append(row));
          updateMarkers();
        });
      });
      updateMarkers();
    }

    /**
     * هدف: ساخت جدول عمومی با سرستون‌ها و کلاس CSS تعیین‌شده.
     * ورودی: headers: عنوان ستون‌ها؛ className: کلاس اختیاری.
     * خروجی: شیء شامل table و tbody.
     */
    function createDataTable(headers, className = '') {
      const table = document.createElement('table');
      table.className = 'preview-table sortable-data-table ' + className;
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      headers.forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        headerRow.append(th);
      });
      thead.append(headerRow);
      const tbody = document.createElement('tbody');
      table.append(thead, tbody);
      return { table, tbody };
    }

    /**
     * هدف: ترکیب ردیف‌های موقت ورود دستی، Excel و کلیپ‌بورد برای پردازش یکپارچه.
     * ورودی: پارامتر ندارد.
     * خروجی: آرایه ورودی‌ها همراه اطلاعات منبع.
     */
    function showOperationSuccess(type, record, importResult = null) {
      const dialog = document.getElementById('operation-success-dialog');
      const title = document.getElementById('operation-success-title');
      const content = document.getElementById('operation-success-content');
      if (!dialog || !title || !content || !record) return;

      const isEntry = type === 'entry';
      title.textContent = isEntry ? 'ورود کالا با موفقیت ثبت شد' : 'ارسال کالا با موفقیت ثبت شد';
      content.replaceChildren();

      const summary = document.createElement('div');
      summary.className = 'operation-success-summary';
      const addSummary = (label, value) => {
        const row = document.createElement('div');
        row.className = 'operation-success-summary-row';
        const name = document.createElement('strong');
        name.textContent = label;
        const text = document.createElement('span');
        text.textContent = String(value ?? '—');
        row.append(name, text);
        summary.append(row);
      };

      if (isEntry) {
        addSummary('شماره ورود', record.entryNumber);
        addSummary('تاریخ', record.date);
        addSummary('ساعت', record.time);
        addSummary('تعداد اقلام ثبت‌شده', toEnglishDigits(record.itemCount));
        addSummary('مجموع تعداد کالا', toEnglishDigits(record.pieceCount));
        if (importResult) {
          addSummary('کالاهای جدید', toEnglishDigits(importResult.added));
          addSummary('کالاهای به‌روزرسانی‌شده', toEnglishDigits(importResult.updated));
          if (importResult.skipped) addSummary('ردیف‌های نامعتبر', toEnglishDigits(importResult.skipped));
        }
      } else {
        addSummary('شماره حواله', record.voucherNumber);
        addSummary('شماره خروج', record.exitNumber);
        addSummary('تاریخ', record.date);
        addSummary('ساعت', record.time);
        addSummary('محل ارسال', record.location);
        addSummary('زیرمجموعه', record.sublocation || 'ندارد');
        addSummary('تعداد ردیف کالا', toEnglishDigits(record.items.length));
        addSummary('مجموع تعداد ارسالی', toEnglishDigits(record.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)));
      }
      content.append(summary);

      const heading = document.createElement('h4');
      heading.className = 'operation-success-items-heading';
      heading.textContent = 'جزئیات اقلام ثبت‌شده';
      content.append(heading);

      const wrapper = document.createElement('div');
      wrapper.className = 'operation-success-table-wrap';
      const table = document.createElement('table');
      table.className = 'preview-table operation-success-table';
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['ردیف', 'کد تدارکاتی', 'شرح کالا', 'تعداد ثبت‌شده'].forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        headerRow.append(th);
      });
      thead.append(headerRow);
      const tbody = document.createElement('tbody');
      record.items.forEach((item, index) => {
        const row = document.createElement('tr');
        [toEnglishDigits(index + 1), item.code, item.description, toEnglishDigits(item.quantity)].forEach(value => {
          const cell = document.createElement('td');
          cell.textContent = String(value ?? '—');
          row.append(cell);
        });
        tbody.append(row);
      });
      table.append(thead, tbody);
      wrapper.append(table);
      content.append(wrapper);

      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    function closeOperationSuccessDialog() {
      const dialog = document.getElementById('operation-success-dialog');
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      else dialog?.removeAttribute('open');
    }

    document.getElementById('operation-success-close')?.addEventListener('click', closeOperationSuccessDialog);
    document.getElementById('operation-success-ok')?.addEventListener('click', closeOperationSuccessDialog);

    /**
     * هدف: نرمال‌سازی نام محل برای مقایسه با درنظرگرفتن فاصله و رقم‌ها.
     * ورودی: value: نام محل.
     * خروجی: کلید متنی نرمال‌شده.
     */
    function normLocation(value) {
      return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fa');
    }

    /**
     * هدف: خواندن فهرست محل‌ها و زیرمجموعه‌های ذخیره‌شده.
     * ورودی: پارامتر ندارد.
     * خروجی: آرایه محل‌های قابل استفاده.
     */
    function loadShipmentLocations() {
      try {
        const stored = JSON.parse(localStorage.getItem(LOCATION_KEY) || '[]');
        return Array.isArray(stored)
          ? stored.filter(item => item && item.name).map(item => ({
              name: String(item.name),
              sublocations: Array.isArray(item.sublocations) ? item.sublocations.map(String) : []
            }))
          : [];
      } catch (error) {
        return [];
      }
    }

    /**
     * هدف: ذخیره محل‌ها و زیرمجموعه‌های ارسال.
     * ورودی: locations: فهرست جدید محل‌ها.
     * خروجی: true در موفقیت یا false در شکست.
     */
    function saveShipmentLocations(locations) {
      const preservesLocationRecord = location =>
        Boolean(location && typeof location === 'object' && !Array.isArray(location) &&
          typeof location.name === 'string' && location.name.trim()) &&
        (location.sublocations === undefined ||
          (Array.isArray(location.sublocations) &&
           location.sublocations.every(value => typeof value === 'string'))) &&
        Object.keys(location).every(key => key === 'name' || key === 'sublocations');
      if (!canSafelyRewriteStoredArray(LOCATION_KEY, 'محل‌های ارسال', shipmentFeedback, preservesLocationRecord)) {
        return false;
      }
      try {
        localStorage.setItem(LOCATION_KEY, JSON.stringify(locations));
        refreshDataQualityReportSafely();
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * هدف: ساخت پیشنهادهای محل ارسال در datalist.
     * ورودی: پارامتر ندارد.
     * خروجی: پیشنهادهای فیلد محل به‌روزرسانی می‌شوند.
     */
    function renderShipmentLocationOptions() {
      const list = document.getElementById('shipment-location-options');
      list.replaceChildren();
      loadShipmentLocations().forEach(location => {
        const option = document.createElement('option');
        option.value = location.name;
        list.append(option);
      });
      updateShipmentSublocations();
    }

    /**
     * هدف: فیلتر پیشنهادهای زیرمجموعه براساس محل انتخاب‌شده.
     * ورودی: پارامتر ندارد؛ مقدار فیلد محل خوانده می‌شود.
     * خروجی: پیشنهادهای زیرمجموعه به‌روزرسانی می‌شوند.
     */
    function updateShipmentSublocations() {
      const selectedLocation = loadShipmentLocations().find(item =>
        normLocation(item.name) === normLocation(shipmentLocationInput.value)
      );
      const list = document.getElementById('shipment-sublocation-options');
      list.replaceChildren();
      (selectedLocation ? selectedLocation.sublocations : []).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        list.append(option);
      });
      // ورودی زیرمجموعه همیشه قابل استفاده است؛ فهرست ذخیره‌شده فقط پیشنهادها را فراهم می‌کند.
      shipmentSublocationGroup.hidden = false;
    }

    /**
     * هدف: نمایش فهرست محل‌ها و ساخت کنترل حذف برای هر محل.
     * ورودی: پارامتر ندارد.
     * خروجی: بخش مدیریت محل‌ها بازسازی می‌شود.
     */
    shipmentLocationInput.addEventListener('input',updateShipmentSublocations);shipmentLocationInput.addEventListener('change',updateShipmentSublocations);renderShipmentLocationOptions();
    // رویداد «کلیک» برای عنصر رابط کاربری؛ اجرای رفتار متناسب با این کنترل و رویداد.
    openShipmentDialogButton.addEventListener('click', openShipmentDialog);
    // رویداد «ارسال فرم» برای عنصر رابط کاربری؛ اعتبارسنجی و مدیریت ارسال فرم در برنامه.
    shipmentForm.addEventListener('submit', commitShipment);
    // رویداد «کلیک» برای دکمه بستن پنجره ارسال؛ اجرای رفتار متناسب با این کنترل و رویداد.
    document.getElementById('shipment-dialog-x').addEventListener('click', closeShipmentDialog);
    // رویداد «کلیک» برای دکمه انصراف از ارسال؛ اجرای رفتار متناسب با این کنترل و رویداد.
    document.getElementById('shipment-cancel').addEventListener('click', closeShipmentDialog);

    openSection('section-dashboard');

    // انتخاب بکاپ پیش از نخستین تغییر؛ رابط اصلی هنگام ورود آزاد است.
    const appLayout = document.getElementById('app-layout');
    const backupSetupGate = document.getElementById('backup-setup-gate');
    const backupGateChooseFolder = document.getElementById('backup-gate-choose-folder');
    const backupGateStatus = document.getElementById('backup-gate-status');
    const backupGateFeedback = document.getElementById('backup-gate-feedback');
    const backupFolderButton = document.getElementById('choose-backup-folder');
    const changeBackupFolderButton = document.getElementById('change-backup-folder');
    const backupFolderStatus = document.getElementById('backup-folder-status');
    const backupFolderPathInput = document.getElementById('backup-folder-path');
    const backupFeedback = document.getElementById('backup-feedback');
    const backupFrequencySelect = document.getElementById('backup-frequency');
    const runBackupNowButton = document.getElementById('run-backup-now');
    const downloadBackupButton = document.getElementById('download-backup-json');
    const BACKUP_SETTINGS_KEY = 'anbar.backup-settings.v1';
    const BACKUP_INTERVALS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
    let backupSettings = { frequency: 'change', lastBackupAt: 0 };
    try {
      const savedSettings = JSON.parse(localStorage.getItem(BACKUP_SETTINGS_KEY) || '{}');
      if (savedSettings && ['change', 'daily', 'weekly'].includes(savedSettings.frequency)) {
        backupSettings.frequency = savedSettings.frequency;
      }
      if (savedSettings && Number.isFinite(savedSettings.lastBackupAt) && savedSettings.lastBackupAt > 0) {
        backupSettings.lastBackupAt = savedSettings.lastBackupAt;
      }
    } catch (error) {
      backupFeedback.textContent = 'تنظیمات زمان‌بندی بکاپ قابل خواندن نبود؛ حالت «پس از هر تغییر» موقتاً فعال است.';
    }
    backupFrequencySelect.value = backupSettings.frequency;
    let backupDirectoryHandle = null;
    let backupWriteTimer = null;
    let backupWriteInProgress = false;
    let backupWriteQueued = false;
    let applicationReady = false;
    // این گزینه فقط بکاپ خودکار را در همین نشست غیرفعال می‌کند؛ ذخیره عادی localStorage فعال می‌ماند.
    let automaticBackupDisabledForSession = false;
    let backupSetupCompleted = false;

    /**
     * هدف: قفل/آزادکردن رابط هنگام درخواست روش بکاپ پیش از نخستین ذخیره‌سازی.
     * ورودی: ready: اگر true باشد رابط آزاد و اگر false باشد تا انتخاب روش ذخیره‌سازی قفل می‌شود.
     * خروجی: وضعیت inert و نمایش پیام بکاپ تغییر می‌کند.
     */
    function setApplicationReady(ready) {
      applicationReady = Boolean(ready);
      appLayout.inert = !applicationReady;
      backupSetupGate.hidden = applicationReady;
      if (applicationReady) {
        backupGateFeedback.textContent = '';
        backupGateStatus.textContent = 'سامانه آماده استفاده است.';
        if (backupSettings.frequency !== 'change') scheduleAutomaticBackup();
      } else {
        backupGateChooseFolder.focus({ preventScroll: true });
      }
    }

    function ensureBackupSetupForFirstChange(feedbackTarget) {
      if (backupSetupCompleted || automaticBackupDisabledForSession) return true;
      if (feedbackTarget) {
        feedbackTarget.textContent = 'این تغییر ثبت نشد. ابتدا روش پشتیبان‌گیری را انتخاب کنید؛ سپس عملیات را دوباره انجام دهید.';
      }
      backupGateFeedback.textContent = '';
      backupGateStatus.textContent = 'برای ثبت نخستین تغییر، پوشه بکاپ را انتخاب کنید یا با تأیید هشدار بدون بکاپ ادامه دهید.';
      setApplicationReady(false);
      return false;
    }

    /**
     * هدف: بازکردن IndexedDB برای نگهداری مرجع پوشه بکاپ.
     * ورودی: پارامتر ندارد.
     * خروجی: Promise پایگاه داده یا خطای بازکردن.
     */
    const validateBackupPayload = window.AnbarBackupValidation.validatePayload;
    // موتور بکاپ در ماژول مستقل اجرا می‌شود؛ state از طریق getter/setter تزریق شده است.
    const backupEngine = window.AnbarBackupEngine.create({
      localStorage,
      STORAGE_KEY, ENTRY_HISTORY_KEY, SHIPMENT_KEY, LOCATION_KEY, ACTIVITY_KEY, CATEGORY_GROUPS_KEY,
      BACKUP_SETTINGS_KEY, BACKUP_INTERVALS,
      getInventoryItems: () => inventoryItems,
      validateBackupPayload,
      getState: () => ({
        backupSettings, backupDirectoryHandle, backupWriteInProgress, backupWriteQueued,
        backupSetupCompleted, applicationReady, automaticBackupDisabledForSession, backupWriteTimer
      }),
      setState: patch => {
        if ('backupWriteInProgress' in patch) backupWriteInProgress = patch.backupWriteInProgress;
        if ('backupWriteQueued' in patch) backupWriteQueued = patch.backupWriteQueued;
        if ('backupSetupCompleted' in patch) backupSetupCompleted = patch.backupSetupCompleted;
        if ('backupWriteTimer' in patch) backupWriteTimer = patch.backupWriteTimer;
      },
      backupFolderStatus, backupFeedback, backupGateStatus, backupGateFeedback, backupFolderPathInput
    });
    const { getSolarBackupFileName, buildBackupPayload, writeAutomaticBackup, scheduleAutomaticBackup } = backupEngine;

    const backupFolderManager = window.AnbarBackupFolder.create({
      window, indexedDB, getState: () => ({backupDirectoryHandle,backupWriteInProgress,backupSetupCompleted,applicationReady,automaticBackupDisabledForSession,backupWriteTimer}),
      setState: patch => {
        if ('backupDirectoryHandle' in patch) backupDirectoryHandle=patch.backupDirectoryHandle;
        if ('backupSetupCompleted' in patch) backupSetupCompleted=patch.backupSetupCompleted;
        if ('automaticBackupDisabledForSession' in patch) automaticBackupDisabledForSession=patch.automaticBackupDisabledForSession;
        if ('backupWriteTimer' in patch) backupWriteTimer=patch.backupWriteTimer;
      },
      backupGateChooseFolder,backupGateStatus,backupGateFeedback,backupFeedback,backupFolderButton,changeBackupFolderButton,
      writeAutomaticBackup,setApplicationReady,recordActivity
    });
    setApplicationReady(true);
    backupGateStatus.textContent='برای نخستین تغییر، در صورت تمایل پوشه بکاپ را از تنظیمات انتخاب کنید.';
    backupFolderManager.initializeSavedDirectory();

    // فقط تغییرات ذخیره‌شده در کلیدهای داده‌ای برنامه، بکاپ خودکار را زمان‌بندی می‌کنند.
    // رهگیری ذخیره‌سازی کلیدهای برنامه برای زمان‌بندی بکاپ پس از تغییر واقعی داده.
    const originalLocalStorageSetItem = Storage.prototype.setItem;

    /**
     * هدف: بازگرداندن مقدار خام ذخیره‌سازی پس از شکست یک عملیات چندمرحله‌ای.
     * ورودی: key: کلید localStorage؛ previousValue: مقدار قبلی یا null اگر وجود نداشته است.
     * خروجی: true در موفقیت و false در شکست؛ مقدار خام پیشین بدون نرمال‌سازی حفظ می‌شود.
     */
    function restoreLocalStorageValue(key, previousValue) {
      try {
        if (key === STORAGE_KEY && localStorage.getItem(key) !== inventoryStorageSnapshot) {
          scheduleInventoryConflictRefresh();
          return false;
        }
        if (previousValue === null) localStorage.removeItem(key);
        else originalLocalStorageSetItem.call(localStorage, key, previousValue);
        if (key === STORAGE_KEY) inventoryStorageSnapshot = previousValue;
        return true;
      } catch (error) {
        return false;
      }
    }

    Storage.prototype.setItem = function(key, value) {
      originalLocalStorageSetItem.call(this, key, value);
      if ([STORAGE_KEY, ACTIVITY_KEY, ENTRY_HISTORY_KEY, SHIPMENT_KEY, LOCATION_KEY, CATEGORY_GROUPS_KEY].includes(String(key))) {
        scheduleAutomaticBackup();
      }
    };
    window.AnbarBackupRestore.create({
      document, localStorage, STORAGE_KEY, ENTRY_HISTORY_KEY, SHIPMENT_KEY, LOCATION_KEY, ACTIVITY_KEY, CATEGORY_GROUPS_KEY,
      readStoredArrayState, normLocation, ensureBackupSetupForFirstChange, originalLocalStorageSetItem,
      setInventoryStorageSnapshot: value => { inventoryStorageSnapshot = value; },
      recordActivity, restoreLocalStorageValue
    });

    // رویداد «کلیک» برای دکمه به‌روزرسانی گزارش فعالیت؛ اجرای رفتار متناسب با این کنترل و رویداد.


/* شناسه‌ساز مشترک اسناد ورود، ارسال و ردیف‌های گردش کالا. */
function makeUniqueRecordId(prefix, timestamp = Date.now()) {
      const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 8);
      return String(prefix) + '-' + String(timestamp) + '-' + randomPart;
    }

    /**
     * هدف: ثبت سابقه تجمیعی برای ورود موفق کالاها و درج جزئیات آن در لاگ فعالیت.
     * ورودی: items: کالاهای ثبت‌شده در این نوبت.
     * خروجی: بدون مقدار بازگشتی؛ برای فهرست خالی عملیات نمی‌کند.
     */

/** رابط رسمی سرویس‌های مشترک برای ماژول‌های سکشن. */
window.AnbarCore = Object.freeze({
  storage: Object.freeze({
    keys: Object.freeze({
      inventory: STORAGE_KEY,
      entryHistory: ENTRY_HISTORY_KEY,
      shipments: SHIPMENT_KEY,
      locations: LOCATION_KEY
    }),
    canSafelyRewriteArray: canSafelyRewriteStoredArray,
    restoreValue: restoreLocalStorageValue
  }),
  shipments: Object.freeze({ load: loadShipments }),
  inventory: Object.freeze({
    getItems: () => inventoryItems,
    save: saveInventory,
    render: () => window.AnbarInventory?.render(),
    refreshFromStorage: refreshInventoryFromStorage,
    isLowStockItem: item => window.AnbarInventory?.isLowStockItem(item) || false,
    isOutOfStockItem: item => window.AnbarInventory?.isOutOfStockItem(item) || false,
    calculateDefaultMinimumStock,
    dataQualityKey
  }),
  text: Object.freeze({ normalizeArabicLetters, toEnglishDigits, normalizeStock }),
  dates: Object.freeze({ solarDateTime, initializeInputs: initializeSolarDateInputs }),
  identity: Object.freeze({ makeUniqueRecordId }),
  activity: Object.freeze({ record: recordActivity }),

  locations: Object.freeze({
    normalize: normLocation,
    load: loadShipmentLocations,
    save: saveShipmentLocations,
    renderOptions: renderShipmentLocationOptions,
    updateSublocations: updateShipmentSublocations,
    renderManager: () => window.AnbarAdmin?.renderLocationManager()
  }),
  reports: Object.freeze({
    updateOverview: () => window.AnbarReports?.updateOverview(),
    renderConsumptionReport: () => window.AnbarReports?.renderConsumptionReport(),
    renderEntryHistory: () => window.AnbarReports?.renderEntryHistory(),
    renderShipmentHistory: () => window.AnbarReports?.renderShipmentHistory()
  }),
  tables: Object.freeze({ createDataTable, enableTableSorting }),
  // API محدود تنظیمات؛ ماژول تنظیمات به متغیرهای خصوصی هسته دسترسی مستقیم ندارد.
  settings: Object.freeze({
    setBackupFrequency: value => {
      if (!['change', 'daily', 'weekly'].includes(value)) return false;
      backupSettings.frequency = value;
      try {
        localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(backupSettings));
        backupFeedback.textContent = value === 'change'
          ? 'ذخیرهٔ خودکار پس از هر تغییر فعال شد.'
          : 'برنامهٔ بکاپ ' + (value === 'daily' ? 'روزانه' : 'هفتگی') +
            ' ذخیره شد؛ اجرای آن به بازبودن برنامه در مرورگر وابسته است.';
        scheduleAutomaticBackup();
        return true;
      } catch (error) {
        backupSettings.frequency = 'change';
        backupFrequencySelect.value = 'change';
        backupFeedback.textContent = 'تنظیم زمان‌بندی ذخیره نشد؛ حافظهٔ مرورگر را بررسی کنید.';
        return false;
      }
    },
    downloadBackup: () => {
      try {
        const payload = buildBackupPayload();
        const errors = validateBackupPayload(payload);
        if (errors.length) {
          backupFeedback.textContent = 'دریافت بکاپ متوقف شد: ' + errors.slice(0, 4).join('؛ ');
          return false;
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getSolarBackupFileName();
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        backupFeedback.textContent = 'فایل بکاپ JSON دانلود شد.';
        return true;
      } catch (error) {
        backupFeedback.textContent = 'ساخت فایل بکاپ انجام نشد؛ داده‌های ذخیره‌شده را بررسی کنید.' +
          (error && error.message ? ' ' + error.message : '');
        return false;
      }
    },
    runBackupNow: async () => {
      if (!backupDirectoryHandle) {
        backupFeedback.textContent = 'پوشهٔ بکاپ فعال نیست؛ برای ذخیرهٔ فایل از «دریافت فایل JSON» استفاده کنید یا پوشه را فعال کنید.';
        return false;
      }
      const saved = await writeAutomaticBackup(backupDirectoryHandle, true);
      if (!saved && applicationReady) {
        backupFeedback.textContent = 'ذخیرهٔ فوری انجام نشد؛ وضعیت پوشه و مجوز نوشتن را بررسی کنید.';
      }
      return saved;
    },
    chooseBackupFolder: backupFolderManager.chooseBackupFolder,
    startWithoutAutomaticBackup: backupFolderManager.startWithoutAutomaticBackup
  }),
  ui: Object.freeze({
    inventoryFeedback,
    showOperationSuccess,
    refreshDataQualityReport: () => {
      if (typeof refreshDataQualityReportSafely === 'function') refreshDataQualityReportSafely();
    }
  })
});
