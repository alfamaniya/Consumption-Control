/* ماژول پیش‌نمایش، تحلیل و اجرای بازیابی فایل‌های JSON بکاپ. */
(function(window){'use strict';function create(deps){
const {document,localStorage,STORAGE_KEY,ENTRY_HISTORY_KEY,SHIPMENT_KEY,LOCATION_KEY,ACTIVITY_KEY,CATEGORY_GROUPS_KEY,readStoredArrayState,normLocation,ensureBackupSetupForFirstChange,originalLocalStorageSetItem,setInventoryStorageSnapshot,recordActivity,restoreLocalStorageValue}=deps;
    const restoreFileInput = document.getElementById('restore-json-file');
    const restoreBackupButton = document.getElementById('restore-json-backup');
    const restoreFeedback = document.getElementById('restore-feedback');
    const restorePreview = document.getElementById('restore-preview');
    const restoreStrategySelect = document.getElementById('restore-strategy');
    const restoreModeWarning = document.getElementById('restore-mode-warning');
    const restoreSectionCheckboxes = [...document.querySelectorAll('input[name="restore-section"]')];
    let pendingRestorePayload = null;

    function getRestoreOptions() {
      return {
        strategy: restoreStrategySelect.value,
        sections: Object.fromEntries(restoreSectionCheckboxes.map(input => [input.value, input.checked]))
      };
    }

    function updateRestorePreview() {
      if (!pendingRestorePayload) return;
      const options = getRestoreOptions();
      const selectedSections = Object.values(options.sections).filter(Boolean).length;
      if (!selectedSections) {
        pendingRestorePayload.analysis = null;
        restoreBackupButton.disabled = true;
        restorePreview.textContent = 'حداقل یک بخش برای بازیابی انتخاب کنید.';
        return;
      }
      try {
        const analysis = analyzeRestorePayload(pendingRestorePayload.payload, options);
        pendingRestorePayload.analysis = analysis;
        restoreBackupButton.disabled = false;
        const sectionNames = {
          inventory: 'موجودی',
          entryHistory: 'تاریخچه ورود',
          shipments: 'تاریخچه ارسال',
          shipmentLocations: 'محل‌ها',
          categoryGroups: 'گروه‌های کالا',
          activityLog: 'تاریخچه رخدادهای قدیمی'
        };
        const lines = [
          'اعتبارسنجی ' + (pendingRestorePayload.fileCount || 1) + ' فایل بکاپ موفق بود.',
          'روش: ' + (options.strategy === 'replace' ? 'جایگزینی موجودی/محل‌ها؛ ادغام تاریخچه' : 'ادغام؛ داده فعلی حفظ می‌شود'),
          'بخش‌های انتخاب‌شده: ' + analysis.counts.sections.map(section => sectionNames[section]).join('، '),
          'کالا: ' + analysis.counts.inventory + '؛ ورود: ' + analysis.counts.entries +
            '؛ ارسال: ' + analysis.counts.shipments + '؛ رخداد: ' + analysis.counts.activity + '؛ محل نهایی: ' + analysis.counts.locations + '؛ گروه کالا: ' + (analysis.categoryGroups ? analysis.categoryGroups.length : 'بدون تغییر'),
          'مغایرت/موارد تکراری: ' + analysis.conflicts.length,
          'تاریخچه ورود و ارسال در همه حالت‌ها فقط ادغام می‌شود و حذف یا جایگزین نمی‌شود.',
          'گروه‌های کالا در حالت ادغام یکتا افزوده و در حالت جایگزینی فقط با انتخاب این بخش جایگزین می‌شوند.'
        ];
        if (analysis.conflicts.length) {
          lines.push('', ...analysis.conflicts.slice(0, 8).map((item, index) => (index + 1) + '. ' + item));
          if (analysis.conflicts.length > 8) lines.push('... و ' + (analysis.conflicts.length - 8) + ' مورد دیگر');
        }
        restorePreview.textContent = lines.join('\n');
      } catch (error) {
        pendingRestorePayload.analysis = null;
        restoreBackupButton.disabled = true;
        restorePreview.textContent = error && error.message.startsWith('CURRENT_SECTION_INVALID:')
          ? error.message.replace('CURRENT_SECTION_INVALID:', 'بازیابی متوقف شد؛ بخش فعلی قابل خواندن نیست: ')
          : 'تحلیل فایل با تنظیمات انتخاب‌شده انجام نشد؛ داده‌های موجود دست‌نخورده باقی ماندند.';
      }
    }

    restoreStrategySelect.addEventListener('change', () => {
      const replacing = restoreStrategySelect.value === 'replace';
      restoreModeWarning.textContent = replacing
        ? 'هشدار: فقط موجودی و محل‌های انتخاب‌شده جایگزین می‌شوند؛ تاریخچه ورود و ارسال در هر دو حالت افزایشی ادغام می‌شود و حذف نخواهد شد.'
        : 'ادغام، رکوردهای فعلی را نگه می‌دارد و فقط رکوردهای جدید و غیرتکراری را اضافه می‌کند.';
      updateRestorePreview();
    });
    restoreSectionCheckboxes.forEach(input => input.addEventListener('change', updateRestorePreview));

    /** نرمال‌سازی کلید متنی برای تشخیص تکرار با یکسان‌سازی فاصله و رقم‌ها. */
    // توابع کمکی ادغام بکاپ برای تشخیص رکوردهای تکراری.
    const normalizedKey = value => String(value ?? '').trim().replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLocaleLowerCase('fa');
    /** استخراج مجموعه مقادیر یکتای یک فیلد؛ مقدارهای خالی حذف می‌شوند. */
    const uniqueValues = (records, field) => new Set(records.map(record => normalizedKey(record && record[field])).filter(Boolean));
    /** ادغام بدون تکرار؛ رکورد دارای هر کلید تکراری رد می‌شود و دلیل آن به conflicts افزوده می‌شود. */
    const mergeUniqueRecords = (existing, incoming, fields, conflicts, label) => {
      const seen = new Set();
      existing.forEach(record => fields.forEach(field => {
        const value = normalizedKey(record && record[field]);
        if (value) seen.add(field + ':' + value);
      }));
      const accepted = [];
      incoming.forEach((record, index) => {
        const duplicateFields = fields.filter(field => {
          const value = normalizedKey(record && record[field]);
          return value && seen.has(field + ':' + value);
        });
        if (duplicateFields.length) {
          conflicts.push(label + ' ردیف ' + (index + 1) + ': ' + duplicateFields.map(field => {
            const names = { id: 'شناسه سند', code: 'کد کالا', entryNumber: 'شماره ورود', exitNumber: 'شماره خروج', voucherNumber: 'شماره حواله', username: 'نام کاربری' };
            return names[field] + ' «' + record[field] + '»';
          }).join(' و '));
          return;
        }
        accepted.push(record);
        fields.forEach(field => {
          const value = normalizedKey(record && record[field]);
          if (value) seen.add(field + ':' + value);
        });
      });
      return accepted;
    };

    // اعتبارسنجی بکاپ مستقل از هسته و از طریق ماژول تنظیمات ارائه می‌شود.
    const validateBackupPayload = window.AnbarBackupValidation.validatePayload;

    /**
     * هدف: تشخیص رکوردهای تکراری و ساخت داده ادغام‌شده بدون حذف داده‌های فعلی.
     * ورودی: payload: بکاپ پس از کنترل ساختار.
     * خروجی: شیء شامل آرایه‌های ادغام‌شده، شمارش‌ها و مغایرت‌ها.
     */
    function analyzeRestorePayload(payload, options = getRestoreOptions()) {
      const conflicts = [];
      const selected = options.sections;
      const replace = options.strategy === 'replace';
      const getCurrentSection = (section, key, label) => {
        if (!selected[section] || (replace && section !== 'entryHistory' && section !== 'shipments')) return [];
        const state = readStoredArrayState(key, label);
        if (state.error) throw new Error('CURRENT_SECTION_INVALID:' + label);
        return state.records;
      };
      const currentInventory = getCurrentSection('inventory', STORAGE_KEY, 'موجودی');
      const currentCategoryGroups = selected.categoryGroups && !replace ? readStoredArrayState(CATEGORY_GROUPS_KEY, 'گروه‌های کالا') : { error: '', records: [] };
      if (currentCategoryGroups.error) throw new Error('CURRENT_SECTION_INVALID:گروه‌های کالا');
      const currentEntries = getCurrentSection('entryHistory', ENTRY_HISTORY_KEY, 'تاریخچه ورود');
      const currentShipments = getCurrentSection('shipments', SHIPMENT_KEY, 'تاریخچه ارسال');
      const incomingInventory = selected.inventory && !replace
        ? mergeUniqueRecords(currentInventory, payload.inventory, ['code'], conflicts, 'کالای تکراری')
        : (selected.inventory ? payload.inventory : []);
      let incomingEntries = [];
      if (selected.entryHistory) {
        if (!Array.isArray(payload.entryHistory)) {
          conflicts.push('این فایل تاریخچه ورود ندارد؛ این بخش بدون تغییر حفظ می‌شود.');
        } else {
          incomingEntries = mergeUniqueRecords(currentEntries, payload.entryHistory, ['id', 'entryNumber'], conflicts, 'ورود تکراری');
        }
      }
      // اگر شماره خروج یا شماره حواله تکراری باشد، کل رکورد ارسال وارد نمی‌شود.
      const incomingShipments = selected.shipments
        ? mergeUniqueRecords(currentShipments, payload.shipments, ['id', 'exitNumber', 'voucherNumber'], conflicts, 'ارسال دارای شماره تکراری')
        : [];
      let mergedLocations = [];
      if (selected.shipmentLocations) {
        if (!Array.isArray(payload.shipmentLocations)) {
          conflicts.push('این فایل فهرست محل‌ها را ندارد؛ این بخش بدون تغییر حفظ می‌شود.');
        } else if (replace) {
          mergedLocations = payload.shipmentLocations;
        } else {
          const currentLocationState = readStoredArrayState(LOCATION_KEY, 'محل‌های ارسال');
          if (currentLocationState.error) throw new Error('CURRENT_SECTION_INVALID:محل‌های ارسال');
          if (currentLocationState.records.some(location =>
            !location || typeof location !== 'object' || Array.isArray(location) ||
            typeof location.name !== 'string' || !Array.isArray(location.sublocations || [])
          )) {
            throw new Error('CURRENT_SECTION_INVALID:محل‌های ارسال');
          }
          mergedLocations = currentLocationState.records.map(location => ({
            ...location,
            sublocations: [...(location.sublocations || [])]
          }));
        }
      }
      const incomingLocations = Array.isArray(payload.shipmentLocations) ? payload.shipmentLocations : [];
      if (selected.shipmentLocations && !replace) incomingLocations.forEach(incoming => {
        if (!incoming || typeof incoming.name !== 'string' || !incoming.name.trim()) return;
        let existing = mergedLocations.find(location => normLocation(location.name) === normLocation(incoming.name));
        if (!existing) {
          existing = { name: incoming.name.trim(), sublocations: [] };
          mergedLocations.push(existing);
        }
        (Array.isArray(incoming.sublocations) ? incoming.sublocations : []).forEach(value => {
          const sublocation = String(value || '').trim();
          if (sublocation && !existing.sublocations.some(item => normLocation(item) === normLocation(sublocation))) {
            existing.sublocations.push(sublocation);
          }
        });
      });

      let mergedCategoryGroups = null;
      if (selected.categoryGroups) {
        if (!Array.isArray(payload.categoryGroups)) conflicts.push('این فایل بکاپ قدیمی است و فهرست گروه‌های کالا را ندارد؛ گروه‌های فعلی بدون تغییر حفظ می‌شوند.');
        else if (replace) mergedCategoryGroups = [...new Set(payload.categoryGroups.map(value => String(value).trim()).filter(Boolean))];
        else {
          const groups = new Map();
          [...currentCategoryGroups.records, ...payload.categoryGroups].forEach(value => { const name=String(value||'').trim(); const key=normalizedKey(name); if(key&&!groups.has(key)) groups.set(key,name); });
          mergedCategoryGroups = [...groups.values()];
        }
      }
      const currentActivityState = selected.activityLog && payload.activityLog
        ? readStoredArrayState(ACTIVITY_KEY, 'لاگ قدیمی')
        : { error: '', records: [] };
      const canMergeActivity = !currentActivityState.error &&
        currentActivityState.records.every(record =>
          record && typeof record === 'object' && !Array.isArray(record)
        );
      const currentActivity = canMergeActivity ? currentActivityState.records : [];
      const activitySignatures = new Set(currentActivity.map(record => JSON.stringify(record)));
      const incomingActivity = selected.activityLog && canMergeActivity ? (payload.activityLog || []).filter(record => {
        const signature = JSON.stringify(record);
        if (activitySignatures.has(signature)) return false;
        activitySignatures.add(signature);
        return true;
      }) : [];
      if (!canMergeActivity && (payload.activityLog || []).length) {
        conflicts.push('لاگ قدیمی محلی ساختار قابل ادغام ندارد؛ برای جلوگیری از حذف، بدون تغییر حفظ می‌شود.');
      }
      return {
        conflicts,
        inventory: selected.inventory
          ? (replace ? incomingInventory : currentInventory.concat(incomingInventory))
          : null,
        entryHistory: selected.entryHistory && incomingEntries.length >= 0 && Array.isArray(payload.entryHistory)
          ? currentEntries.concat(incomingEntries)
          : null,
        shipments: selected.shipments
          ? currentShipments.concat(incomingShipments)
          : null,
        activityLog: selected.activityLog && incomingActivity.length ? currentActivity.concat(incomingActivity) : null,
        shipmentLocations: selected.shipmentLocations && Array.isArray(payload.shipmentLocations) ? mergedLocations : null,
        categoryGroups: mergedCategoryGroups,
        counts: {
          inventory: incomingInventory.length,
          entries: incomingEntries.length,
          shipments: incomingShipments.length,
          activity: incomingActivity.length,
          locations: selected.shipmentLocations && Array.isArray(payload.shipmentLocations)
            ? mergedLocations.length
            : 0,
          strategy: options.strategy,
          sections: Object.keys(selected).filter(section => selected[section])
        }
      };
    }

    function combineRestorePayloads(payloads) {
      // موجودی و محل‌ها snapshot هستند؛ از آخرین فایل معتبر استفاده می‌کنیم، نه الحاق snapshotهای روزهای مختلف.
      // تاریخ exportedAt مستقل از ترتیب انتخاب فایل‌هاست؛ در زمان‌های برابر، آخرین فایل انتخاب‌شده ملاک است.
      const latestSnapshotFor = section => payloads.reduce((latest, candidate) => {
        if (!Array.isArray(candidate[section])) return latest;
        if (!latest) return candidate;
        const candidateTime = Date.parse(candidate.exportedAt || '');
        const latestTime = Date.parse(latest.exportedAt || '');
        if (Number.isFinite(candidateTime) && (!Number.isFinite(latestTime) || candidateTime >= latestTime)) {
          return candidate;
        }
        if (!Number.isFinite(candidateTime) && !Number.isFinite(latestTime)) return candidate;
        return latest;
      }, null);
      const latestInventory = latestSnapshotFor('inventory');
      const latestLocations = latestSnapshotFor('shipmentLocations');
      const latestCategoryGroups = latestSnapshotFor('categoryGroups');
      const exportedAt = payloads.map(payload => payload.exportedAt)
        .filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))
        .sort((a, b) => Date.parse(a) - Date.parse(b)).slice(-1)[0] || new Date().toISOString();
      const combined = {
        schemaVersion: 1,
        exportedAt,
        inventory: latestInventory ? latestInventory.inventory : [],
        shipmentLocations: latestLocations ? latestLocations.shipmentLocations : [],
        categoryGroups: latestCategoryGroups ? latestCategoryGroups.categoryGroups : undefined,
        entryHistory: [], shipments: [], activityLog: []
      };
      // تاریخچه‌ها رخدادمحورند و باید از همه فایل‌ها تجمیع شوند؛ تکرارها در مرحله تحلیل بازیابی کنترل می‌شوند.
      ['entryHistory', 'shipments', 'activityLog'].forEach(section => {
        payloads.forEach(payload => {
          if (Array.isArray(payload[section])) combined[section].push(...payload[section]);
        });
      });
      return combined;
    }

    // رویداد «تغییر» برای فیلد انتخاب فایل بکاپ؛ به‌روزرسانی داده‌ها و رابط پس از تغییر انتخاب.
    restoreFileInput.addEventListener('change', async () => {
      pendingRestorePayload = null;
      restoreBackupButton.disabled = true;
      restoreFeedback.textContent = '';
      restorePreview.textContent = 'پس از انتخاب فایل، خلاصهٔ اعتبارسنجی و مغایرت‌ها اینجا نمایش داده می‌شود.';
      const files = Array.from(restoreFileInput.files || []);
      if (!files.length) return;
      try {
        const payloads = [];
        for (const file of files) {
          const payload = JSON.parse(await file.text());
          const validationErrors = validateBackupPayload(payload);
          if (validationErrors.length) {
            throw new Error('فایل «' + file.name + '» پذیرفته نشد: ' + validationErrors.slice(0, 5).join('؛ '));
          }
          payloads.push(payload);
        }
        const combinedPayload = combineRestorePayloads(payloads);
        pendingRestorePayload = { payload: combinedPayload, analysis: null, fileCount: files.length };
        updateRestorePreview();
        restoreFeedback.textContent = '';
      } catch (error) {
        restoreBackupButton.disabled = true;
        pendingRestorePayload = null;
        restorePreview.textContent = 'فایل انتخاب‌شده معتبر نیست یا با ساختار بکاپ این برنامه سازگار نیست.';
        restoreFeedback.textContent = error && error.message ? error.message : 'خواندن فایل ناموفق بود.';
      }
    });

    // رویداد «کلیک» برای دکمه تأیید بازگردانی بکاپ؛ اجرای رفتار متناسب با این کنترل و رویداد.
    restoreBackupButton.addEventListener('click', () => {
      if (!pendingRestorePayload) return;
      if (!ensureBackupSetupForFirstChange(restoreFeedback)) return;
      // فایل را دوباره اعتبارسنجی و تحلیل می‌کنیم تا وضعیت ذخیره‌سازی تا لحظه تأیید لحاظ شود.
      const validationErrors = validateBackupPayload(pendingRestorePayload.payload);
      if (validationErrors.length) {
        restoreBackupButton.disabled = true;
        pendingRestorePayload = null;
        restoreFeedback.textContent = 'بازگردانی متوقف شد: ' + validationErrors.slice(0, 5).join('؛ ');
        return;
      }
      let analysis;
      const options = getRestoreOptions();
      try {
        analysis = analyzeRestorePayload(pendingRestorePayload.payload, options);
      } catch (error) {
        restoreFeedback.textContent = error && error.message.startsWith('CURRENT_SECTION_INVALID:')
          ? 'بازیابی متوقف شد؛ ' + error.message.replace('CURRENT_SECTION_INVALID:', '') + ' قابل خواندن نیست و هیچ داده‌ای تغییر نکرد.'
          : 'تحلیل بکاپ ناموفق بود؛ بازگردانی انجام نشد و هیچ داده‌ای تغییر نکرد.';
        return;
      }
      const selectedSectionLabels = {
        inventory: 'موجودی',
        entryHistory: 'تاریخچه ورود',
        shipments: 'تاریخچه ارسال',
        shipmentLocations: 'محل‌ها',
        activityLog: 'تاریخچه رخدادهای قدیمی'
      };
      const selectedNames = analysis.counts.sections.map(section => selectedSectionLabels[section]).join('، ');
      const confirmed = window.confirm(
        'نتیجه بررسی:\n' +
        'روش: ' + (options.strategy === 'replace' ? 'جایگزینی' : 'ادغام') + '\n' +
        'بخش‌ها: ' + selectedNames + '\n' +
        'مغایرت‌ها/موارد تکراری: ' + analysis.conflicts.length + '\n\n' +
        (options.strategy === 'replace'
          ? 'هشدار: فقط موجودی و محل‌های انتخاب‌شده جایگزین می‌شوند؛ تاریخچه ورود و ارسال حذف یا جایگزین نمی‌شوند. ادامه می‌دهید؟'
          : 'داده فعلی حفظ می‌شود و فقط موارد جدید اضافه می‌شوند. ادامه می‌دهید؟')
      );
      if (!confirmed) return;
      const restoreRecords = [];
      if (analysis.inventory) restoreRecords.push([STORAGE_KEY, analysis.inventory]);
      if (analysis.entryHistory) restoreRecords.push([ENTRY_HISTORY_KEY, analysis.entryHistory]);
      if (analysis.shipments) restoreRecords.push([SHIPMENT_KEY, analysis.shipments]);
      if (analysis.shipmentLocations) restoreRecords.push([LOCATION_KEY, analysis.shipmentLocations]);
      if (analysis.activityLog) restoreRecords.push([ACTIVITY_KEY, analysis.activityLog]);
      if (analysis.categoryGroups) restoreRecords.push([CATEGORY_GROUPS_KEY, analysis.categoryGroups]);
      const previousValues = restoreRecords.map(([key]) => [key, localStorage.getItem(key)]);

      try {
        restoreRecords.forEach(([key, value]) => {
          // ذخیره خام کلید اصلی را دور می‌زنیم تا هنگام بازگردانی نیمه‌کاره بکاپ خودکار زمان‌بندی نشود.
          originalLocalStorageSetItem.call(localStorage, key, JSON.stringify(value));
          if (key === STORAGE_KEY) setInventoryStorageSnapshot(localStorage.getItem(STORAGE_KEY));
        });
        recordActivity(
          'بازگردانی بکاپ',
          'کالاها، گروه‌ها، تاریخچه‌ها، محل‌های ارسال و رخدادها از فایل بکاپ بازیابی شدند.'
        );
        restoreFeedback.textContent = options.strategy === 'replace'
          ? 'موجودی/محل‌های انتخاب‌شده جایگزین شدند؛ تاریخچه فقط ادغام شد.'
          : 'ادغام تکمیل شد؛ داده‌های موجود حفظ شدند.';
        window.location.reload();
      } catch (error) {
        // localStorage تراکنش چندکلیدی ندارد؛ در صورت شکست، مقادیر قبلی را تا حد امکان برمی‌گردانیم.
        const rollbackSucceeded = previousValues
          .map(([key, value]) => restoreLocalStorageValue(key, value))
          .every(Boolean);
        restoreFeedback.textContent = rollbackSucceeded
          ? 'بازگردانی ناموفق بود؛ تغییرات لغو و مقادیر قبلی بازیابی شدند. فضای ذخیره‌سازی مرورگر را بررسی کنید.'
          : 'بازگردانی ناموفق بود و بازیابی همه مقادیر قبلی کامل نشد؛ موجودی، تاریخچه‌ها و فایل بکاپ را فوراً بررسی کنید.';
      }
    });


return Object.freeze({});
}window.AnbarBackupRestore=Object.freeze({create});})(window);