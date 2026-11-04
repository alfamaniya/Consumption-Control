/* موتور مستقل تولید، ادغام تاریخچه و زمان‌بندی بکاپ خودکار.
 * این ماژول از طریق create به هسته متصل می‌شود و مستقیماً به متغیرهای خصوصی آن دسترسی ندارد.
 */
(function (window) {
  'use strict';

  function create(deps) {
    const {
      localStorage, STORAGE_KEY, ENTRY_HISTORY_KEY, SHIPMENT_KEY, LOCATION_KEY, ACTIVITY_KEY, CATEGORY_GROUPS_KEY,
      BACKUP_SETTINGS_KEY, BACKUP_INTERVALS, getInventoryItems, validateBackupPayload,
      getState, setState, backupFolderStatus, backupFeedback, backupGateStatus,
      backupGateFeedback, backupFolderPathInput
    } = deps;

        function getSolarBackupFileName(date = new Date()) {
      const parts = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const year = parts.find(part => part.type === 'year')?.value;
      const month = parts.find(part => part.type === 'month')?.value;
      const day = parts.find(part => part.type === 'day')?.value;
      return 'anbar-backup-' + year + '-' + month + '-' + day + '.json';
    }
    /**
     * هدف: گردآوری موجودی، تاریخچه‌ها، محل‌ها و لاگ در یک شیء پشتیبان.
     * ورودی: پارامتر ندارد.
     * خروجی: شیء دارای exportedAt و آرایه‌های داده.
     */
    function readStoredSectionForBackup(key, fallback) {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    }

    function buildBackupPayload() {
      // داده خام برای بکاپ خوانده می‌شود تا رکوردی که loader پالایش می‌کند بی‌صدا از نسخه پشتیبان حذف نشود.
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        inventory: readStoredSectionForBackup(STORAGE_KEY, getInventoryItems().map(item => ({ ...item }))),
        entryHistory: readStoredSectionForBackup(ENTRY_HISTORY_KEY, []),
        shipments: readStoredSectionForBackup(SHIPMENT_KEY, []),
        shipmentLocations: readStoredSectionForBackup(LOCATION_KEY, []),
        activityLog: readStoredSectionForBackup(ACTIVITY_KEY, []),
        categoryGroups: readStoredSectionForBackup(CATEGORY_GROUPS_KEY, [])
      };
    }
    /**
     * هدف: نوشتن بکاپ JSON همراه کنترل مجوز، جلوگیری از نوشتن هم‌زمان و مدیریت شکست.
     * ورودی: directoryHandle: مرجع پوشه؛ allowPermissionPrompt: اجازه درخواست مجوز.
     * خروجی: Promise بولی؛ true فقط پس از ذخیره موفق فایل.
     */
    function backupRecordIdentity(record, section) {
      if (!record || typeof record !== 'object') return section + ':' + JSON.stringify(record);
      if (record.id) return section + ':id:' + String(record.id);
      if (section === 'entryHistory' && record.entryNumber) return section + ':number:' + String(record.entryNumber);
      if (section === 'shipments') {
        const documentKey = [record.exitNumber, record.voucherNumber, record.timestamp].filter(Boolean).join('|');
        if (documentKey) return section + ':document:' + documentKey;
      }
      return section + ':json:' + JSON.stringify(record);
    }

    function appendOnlyBackupHistory(previousRecords, currentRecords, section) {
      const result = [];
      const byIdentity = new Map();
      [...(Array.isArray(previousRecords) ? previousRecords : []),
        ...(Array.isArray(currentRecords) ? currentRecords : [])].forEach(record => {
        const identity = backupRecordIdentity(record, section);
        const serialized = JSON.stringify(record);
        if (byIdentity.has(identity)) {
          if (byIdentity.get(identity) !== serialized) {
            throw new Error('تعارض در تاریخچه ' + section + ' برای شناسه «' + identity.slice(0, 100) + '»؛ فایل قبلی بازنویسی نشد.');
          }
          return;
        }
        byIdentity.set(identity, serialized);
        result.push(record);
      });
      return result;
    }

    async function readExistingDatedBackup(directoryHandle, fileName) {
      try {
        const existingHandle = await directoryHandle.getFileHandle(fileName);
        const file = await existingHandle.getFile();
        const payload = JSON.parse(await file.text());
        const errors = validateBackupPayload(payload);
        if (errors.length) {
          throw new Error('فایل بکاپ قبلی معتبر نیست و برای جلوگیری از ازدست‌رفتن تاریخچه بازنویسی نشد: ' + errors.slice(0, 4).join('؛ '));
        }
        return payload;
      } catch (error) {
        if (error && error.name === 'NotFoundError') return null;
        throw error;
      }
    }

    function buildAppendOnlyBackupPayload(currentPayload, previousPayload) {
      if (!previousPayload) return currentPayload;
      return {
        ...currentPayload,
        inventory: currentPayload.inventory.length ? currentPayload.inventory : (previousPayload.inventory || []),
        shipmentLocations: currentPayload.shipmentLocations.length
          ? currentPayload.shipmentLocations : (previousPayload.shipmentLocations || []),
        categoryGroups: Array.isArray(currentPayload.categoryGroups) ? currentPayload.categoryGroups : (Array.isArray(previousPayload.categoryGroups) ? previousPayload.categoryGroups : []),
        entryHistory: appendOnlyBackupHistory(previousPayload.entryHistory, currentPayload.entryHistory, 'entryHistory'),
        shipments: appendOnlyBackupHistory(previousPayload.shipments, currentPayload.shipments, 'shipments'),
        activityLog: appendOnlyBackupHistory(previousPayload.activityLog, currentPayload.activityLog, 'activityLog')
      };
    }

    async function writeAutomaticBackup(directoryHandle = getState().backupDirectoryHandle, allowPermissionPrompt = false) {
      if (!directoryHandle) return false;
      if (getState().backupWriteInProgress) {
        setState({ backupWriteQueued: true });
        return false;
      }
      setState({ backupWriteInProgress: true });
      let succeeded = false;
      let writable = null;
      try {
        let permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted' && allowPermissionPrompt) {
          permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
        }
        if (permission !== 'granted') {
          backupFolderStatus.textContent = 'مجوز نوشتن در پوشه تأیید نشده است.';
          backupFeedback.textContent = 'برای فعال‌سازی بکاپ، پوشه را دوباره انتخاب کنید و دسترسی نوشتن را تأیید کنید.';
          backupGateStatus.textContent = 'دسترسی نوشتن در پوشه برقرار نیست؛ پوشه را دوباره انتخاب کنید.';
          return false;
        }
        const currentPayload = buildBackupPayload();
        const currentValidationErrors = validateBackupPayload(currentPayload);
        if (currentValidationErrors.length) {
          throw new Error('اطلاعات فعلی معتبر نیست؛ برای جلوگیری از ثبت بکاپ ناقص، فایل قبلی دست‌نخورده باقی ماند: ' + currentValidationErrors.slice(0, 4).join('؛ '));
        }
        const backupFileName = getSolarBackupFileName();
        const previousPayload = await readExistingDatedBackup(directoryHandle, backupFileName);
        const payload = buildAppendOnlyBackupPayload(currentPayload, previousPayload);
        const validationErrors = validateBackupPayload(payload);
        if (validationErrors.length) {
          throw new Error('ساختار داده فعلی برای تولید بکاپ معتبر نیست: ' + validationErrors.slice(0, 4).join('؛ '));
        }
        const serializedBackup = JSON.stringify(payload, null, 2);
        const fileHandle = await directoryHandle.getFileHandle(backupFileName, { create: true });
        writable = await fileHandle.createWritable();
        await writable.write(new Blob([serializedBackup], { type: 'application/json;charset=utf-8' }));
        await writable.close();
        writable = null;
        succeeded = true;
        setState({ backupSetupCompleted: true });
        getState().backupSettings.lastBackupAt = Date.now();
        let backupTimePersisted = true;
        try {
          localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(getState().backupSettings));
        } catch (error) {
          backupTimePersisted = false;
          backupFeedback.textContent = 'فایل بکاپ ذخیره شد، اما زمان آخرین بکاپ در تنظیمات مرورگر ثبت نشد.';
        }
        if (backupFolderPathInput) backupFolderPathInput.value = String(directoryHandle.name || 'پوشه انتخاب‌شده');
        backupFolderStatus.textContent = 'پوشه ذخیره‌سازی: ' + String(directoryHandle.name || 'پوشه انتخاب‌شده') +
          '؛ فایل ' + backupFileName + ' با حفظ تاریخچه قبلی به‌روزرسانی شد. آخرین ذخیره: ' +
          new Date(getState().backupSettings.lastBackupAt).toLocaleString('fa-IR');
        if (backupTimePersisted) {
          backupFeedback.textContent = 'آخرین بکاپ با موفقیت ذخیره شد.';
        }
        backupGateStatus.textContent = 'فایل بکاپ با موفقیت ذخیره شد.';
        if (getState().applicationReady && getState().backupSettings.frequency !== 'change') scheduleAutomaticBackup();
        return true;
      } catch (error) {
        if (writable && typeof writable.abort === 'function') {
          try { await writable.abort(); } catch (abortError) { /* شکست abort نباید خطای اصلی را بپوشاند. */ }
        }
        const detail = error && error.message ? ' ' + error.message : '';
        backupFeedback.textContent = 'ذخیره خودکار انجام نشد. دسترسی پوشه و اعتبار داده‌ها را بررسی کنید.' + detail;
        backupGateFeedback.textContent = 'فایل بکاپ ساخته یا به‌روزرسانی نشد؛ وضعیت پوشه و مجوز نوشتن را بررسی کنید.';
        return false;
      } finally {
        setState({ backupWriteInProgress: false });
        if (getState().backupWriteQueued) {
          setState({ backupWriteQueued: false });
          scheduleAutomaticBackup();
        }
      }
    }
    /**
     * هدف: زمان‌بندی ذخیره بکاپ پس از تغییر داده و تجمیع تغییرهای سریع.
     * ورودی: پارامتر ندارد.
     * خروجی: زمان‌سنج بکاپ تنظیم می‌شود.
     */
    function scheduleAutomaticBackup() {
      if (!getState().backupDirectoryHandle || !getState().applicationReady || getState().automaticBackupDisabledForSession) return;
      clearTimeout(getState().backupWriteTimer);
      const interval = BACKUP_INTERVALS[getState().backupSettings.frequency] || 0;
      const delay = interval
        ? Math.max(350, interval - (Date.now() - getState().backupSettings.lastBackupAt))
        : 350;
      setState({ backupWriteTimer: setTimeout(() => {
        writeAutomaticBackup().then(saved => {
          if (!saved && getState().applicationReady) {
            backupGateStatus.textContent = 'به‌روزرسانی بکاپ انجام نشد؛ پوشه و مجوز نوشتن را بررسی کنید.';
          } else if (saved && getState().backupSettings.frequency === 'change') {
            setState({ backupWriteTimer: null });
          }
        });
      }, delay) });
    }

    return Object.freeze({
      getSolarBackupFileName,
      buildBackupPayload,
      writeAutomaticBackup,
      scheduleAutomaticBackup
    });
  }

  window.AnbarBackupEngine = Object.freeze({ create });
})(window);
