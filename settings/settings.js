/* کنترل‌گر رابط تنظیمات؛ منطق داده و بکاپ فقط از API عمومی هسته فراخوانی می‌شود. */
(function () {
  'use strict';

  let initialized = false;

  /**
   * اتصال رویدادهای رابط تنظیمات پس از بارگذاری HTML سکشن و API هسته.
   * این تابع در صورت فراخوانی مجدد، رویداد تکراری ثبت نمی‌کند.
   */
  window.initializeSettingsSection = function initializeSettingsSection() {
    if (initialized) return;
    const core = window.AnbarCore;
    if (!core || !core.settings) {
      console.error('Settings: رابط سرویس تنظیمات هسته در دسترس نیست.');
      return;
    }

    const frequency = document.getElementById('backup-frequency');
    const chooseFolder = document.getElementById('choose-backup-folder');
    const changeFolder = document.getElementById('change-backup-folder');
    const downloadBackup = document.getElementById('download-backup-json');
    const runBackup = document.getElementById('run-backup-now');
    const gateChooseFolder = document.getElementById('backup-gate-choose-folder');
    const continueWithoutBackup = document.getElementById('backup-gate-continue-without-backup');

    if (frequency) {
      frequency.addEventListener('change', () => core.settings.setBackupFrequency(frequency.value));
    }
    if (chooseFolder) chooseFolder.addEventListener('click', () => core.settings.chooseBackupFolder(false));
    if (changeFolder) changeFolder.addEventListener('click', () => core.settings.chooseBackupFolder(true));
    if (downloadBackup) downloadBackup.addEventListener('click', () => core.settings.downloadBackup());
    if (runBackup) runBackup.addEventListener('click', () => core.settings.runBackupNow());
    if (gateChooseFolder) gateChooseFolder.addEventListener('click', () => core.settings.chooseBackupFolder(false));

    if (continueWithoutBackup) {
      continueWithoutBackup.addEventListener('click', () => {
        const confirmed = window.confirm(
          'بدون بکاپ خودکار ادامه می‌دهید؟\n\nاطلاعات در حافظه محلی مرورگر ذخیره می‌شود، اما فایل پشتیبان خودکار ساخته نخواهد شد. پاک‌شدن داده‌های مرورگر ممکن است اطلاعات را از بین ببرد.\n\nبرای ادامه تأیید کنید.'
        );
        if (confirmed) core.settings.startWithoutAutomaticBackup();
      });
    }

    initialized = true;
  };
})();
