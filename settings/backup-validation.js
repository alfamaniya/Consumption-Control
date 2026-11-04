/* اعتبارسنج مستقل ساختار بکاپ؛ بدون وابستگی به DOM یا وضعیت هسته. */
(function (window) {
  'use strict';

  function toEnglishDigits(value) {
    return String(value ?? '')
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  }

  function validateBackupPayload(payload) {
      const errors = [];
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return ['ریشه فایل باید یک شیء JSON باشد.'];
      }
      if (payload.schemaVersion !== undefined && payload.schemaVersion !== 1) {
        errors.push('نسخه ساختار بکاپ پشتیبانی نمی‌شود.');
      }
      if (payload.exportedAt !== undefined &&
          (typeof payload.exportedAt !== 'string' || !Number.isFinite(Date.parse(payload.exportedAt)))) {
        errors.push('زمان ساخت بکاپ معتبر نیست.');
      }

      const requiredArraysValid = Array.isArray(payload.inventory) && Array.isArray(payload.shipments);
      if (!Array.isArray(payload.inventory)) errors.push('فهرست موجودی وجود ندارد یا آرایه نیست.');
      if (!Array.isArray(payload.shipments)) errors.push('تاریخچه ارسال وجود ندارد یا آرایه نیست.');
      if (payload.entryHistory !== undefined && !Array.isArray(payload.entryHistory)) errors.push('تاریخچه ورود باید آرایه باشد.');
      if (payload.shipmentLocations !== undefined && !Array.isArray(payload.shipmentLocations)) errors.push('فهرست محل‌ها باید آرایه باشد.');
      if (payload.activityLog !== undefined && !Array.isArray(payload.activityLog)) errors.push('ساختار لاگ قدیمی باید آرایه باشد.');
      // نبود این فیلد در بکاپ‌های قدیمی مجاز است.
      if (payload.categoryGroups !== undefined && (!Array.isArray(payload.categoryGroups) || !payload.categoryGroups.every(value => typeof value === 'string' && value.trim()))) errors.push('فهرست گروه‌های کالا باید آرایه‌ای از نام‌های معتبر باشد.');
      if (!requiredArraysValid) return errors;

      const validNumber = (value, allowZero) => {
        // داده ذخیره‌شده با قالب خام JSON کنترل می‌شود؛ جداکننده هزارگان نباید هنگام بازیابی تفسیر متفاوتی پیدا کند.
        if (typeof value === 'number') {
          return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
        }
        if (typeof value !== 'string') return false;
        const text = toEnglishDigits(value).trim();
        const number = Number(text);
        return /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) &&
          Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
      };
      const records = (value, label, validator) => {
        value.forEach((record, index) => {
          const message = validator(record);
          if (message) errors.push(label + '، ردیف ' + (index + 1) + ': ' + message);
        });
      };

      records(payload.inventory, 'موجودی', item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return 'رکورد باید شیء باشد.';
        if (typeof item.code !== 'string' || !item.code.trim()) return 'کد کالا خالی یا نامعتبر است.';
        if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) return 'شناسه کالا نامعتبر است.';
        if (item.category !== undefined && typeof item.category !== 'string') return 'گروه کالا نامعتبر است.';
        if (typeof item.description !== 'string' || !item.description.trim()) return 'شرح کالا خالی یا نامعتبر است.';
        if (!validNumber(item.stock, true)) return 'موجودی باید عددی متناهی و صفر یا مثبت باشد.';
        if (item.sendQuantity !== undefined && item.sendQuantity !== '' && item.sendQuantity !== null) {
          const pendingQuantity = typeof item.sendQuantity === 'number'
            ? item.sendQuantity : Number(toEnglishDigits(String(item.sendQuantity)).trim());
          if (!validNumber(item.sendQuantity, true) || pendingQuantity > Number(item.stock)) {
            return 'مقدار آماده‌ارسال نامعتبر است.';
          }
        }
        if (item.entryTimestamp && (typeof item.entryTimestamp !== 'string' || !Number.isFinite(Date.parse(item.entryTimestamp)))) {
          return 'زمان ورود کالا نامعتبر است.';
        }
        if (item.minimumStock !== undefined && !validNumber(item.minimumStock, true)) {
          return 'حداقل موجودی باید صفر یا مثبت باشد.';
        }
        if (item.minimumStockManual !== undefined && typeof item.minimumStockManual !== 'boolean') {
          return 'وضعیت تنظیم دستی حداقل موجودی نامعتبر است.';
        }
        if (item.minimumStockBaseQuantity !== undefined && !validNumber(item.minimumStockBaseQuantity, true)) {
          return 'مقدار مبنای محاسبه حداقل موجودی نامعتبر است.';
        }
        return '';
      });

      records(payload.entryHistory || [], 'تاریخچه ورود', item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return 'رکورد باید شیء باشد.';
        if (typeof item.entryNumber !== 'string' || !item.entryNumber.trim()) return 'شماره ورود خالی یا نامعتبر است.';
        if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) return 'شناسه سند ورود نامعتبر است.';
        if (item.items !== undefined && !Array.isArray(item.items)) return 'فهرست اقلام ورود نامعتبر است.';
        if (Array.isArray(item.items) && item.items.some(line => !line || typeof line !== 'object' || Array.isArray(line) ||
          typeof line.code !== 'string' || !line.code.trim() || (line.id !== undefined && (typeof line.id !== 'string' || !line.id.trim())) ||
          (line.itemId !== undefined && (typeof line.itemId !== 'string' || !line.itemId.trim())) ||
          (line.quantity !== undefined && (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity < 0)))) {
          return 'جزئیات یکی از اقلام ورود نامعتبر است.';
        }
        if (item.timestamp && (typeof item.timestamp !== 'string' || !Number.isFinite(Date.parse(item.timestamp)))) {
          return 'زمان ثبت ورود نامعتبر است.';
        }
        for (const field of ['itemCount', 'pieceCount']) {
          if (item[field] !== undefined &&
              (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || item[field] < 0)) {
            return 'شمار ' + field + ' نامعتبر است.';
          }
        }
        return '';
      });

      records(payload.shipments, 'تاریخچه ارسال', item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return 'رکورد باید شیء باشد.';
        if (!Array.isArray(item.items) || item.items.length === 0) return 'ارسال باید دست‌کم یک ردیف کالا داشته باشد.';
        if (item.id !== undefined && (typeof item.id !== 'string' || !item.id.trim())) return 'شناسه سند ارسال نامعتبر است.';
        for (const field of ['voucherNumber', 'exitNumber', 'location', 'sublocation', 'date', 'time']) {
          if (item[field] !== undefined &&
              (typeof item[field] !== 'string' || (['voucherNumber', 'exitNumber', 'location'].includes(field) && !item[field].trim()))) {
            return 'فیلد ' + field + ' نامعتبر است.';
          }
        }
        if (item.timestamp && (typeof item.timestamp !== 'string' || !Number.isFinite(Date.parse(item.timestamp)))) {
          return 'زمان ثبت ارسال نامعتبر است.';
        }
        for (let index = 0; index < item.items.length; index += 1) {
          const line = item.items[index];
          if (!line || typeof line !== 'object' || Array.isArray(line) ||
              typeof line.code !== 'string' || !line.code.trim() ||
              !validNumber(line.quantity, false)) {
            return 'ردیف کالای شماره ' + (index + 1) + ' دارای کد یا تعداد نامعتبر است.';
          }
          if (line.description !== undefined && typeof line.description !== 'string') {
            return 'شرح ردیف کالای شماره ' + (index + 1) + ' نامعتبر است.';
          }
          if (line.id !== undefined && (typeof line.id !== 'string' || !line.id.trim())) return 'شناسه ردیف کالای شماره ' + (index + 1) + ' نامعتبر است.';
          if (line.itemId !== undefined && (typeof line.itemId !== 'string' || !line.itemId.trim())) return 'شناسه قلم ردیف ' + (index + 1) + ' نامعتبر است.';
        }
        return '';
      });

      records(payload.shipmentLocations || [], 'محل ارسال', location => {
        if (!location || typeof location !== 'object' || Array.isArray(location) ||
            typeof location.name !== 'string' || !location.name.trim()) {
          return 'نام محل خالی یا نامعتبر است.';
        }
        if (location.sublocations !== undefined &&
            (!Array.isArray(location.sublocations) ||
             !location.sublocations.every(value => typeof value === 'string' && value.trim()))) {
          return 'فهرست زیرمجموعه‌ها نامعتبر است.';
        }
        return '';
      });

      records(payload.activityLog || [], 'لاگ قدیمی', item =>
        !item || typeof item !== 'object' || Array.isArray(item) ? 'رکورد باید شیء باشد.' : ''
      );

      return errors;
    }

  window.AnbarBackupValidation = Object.freeze({
    validatePayload: validateBackupPayload
  });
})(window);
