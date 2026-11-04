
/* ماژول مدیریت: ورود مدیر، حذف گروهی کالا، مدیریت گروه‌ها و محل‌های ارسال. */
'use strict';
const adminCore = window.AnbarCore;
if (!adminCore) throw new Error('هسته Anbar باید پیش از ماژول مدیریت بارگذاری شود.');
const inventoryItems = adminCore.inventory.getItems();

// قفل ورود مدیریت؛ رمز پیش‌فرض ۰۰۰۰ است و فقط در همین مرورگر اعتبارسنجی می‌شود.
    const ADMIN_DEFAULT_PASSWORD = '0000';
    const CATEGORY_GROUPS_KEY = 'anbar.category-groups.v1';
    function loadCategoryGroups() {
      try { const saved = JSON.parse(localStorage.getItem(CATEGORY_GROUPS_KEY) || '[]'); return Array.isArray(saved) ? saved.filter(value => typeof value === 'string' && value.trim()) : []; }
      catch (error) { return []; }
    }
    function saveCategoryGroups(groups) {
      try { localStorage.setItem(CATEGORY_GROUPS_KEY, JSON.stringify([...new Set(groups.map(value => String(value).trim()).filter(Boolean))])); return true; }
      catch (error) { return false; }
    }
    const adminLoginPanel = document.getElementById('admin-login-panel');
    const adminContent = document.getElementById('admin-content');
    const adminLoginForm = document.getElementById('admin-login-form');
    let adminUnlocked = false;
    function lockAdminSection() {
      adminUnlocked = false;
      if (adminLoginPanel) adminLoginPanel.hidden = false;
      if (adminContent) adminContent.hidden = true;
      adminLoginForm?.reset();
      const feedback = document.getElementById('admin-login-feedback');
      if (feedback) feedback.textContent = '';
    }
    // با خروج از سکشن مدیریت، قفل دوباره فعال می‌شود.
    // گروه‌ها از مقادیر واقعی ثبت‌شده در کالاها استخراج می‌شوند؛ تغییر نام/حذف روی همان کالاها اعمال می‌شود.
    function renderCategoryManager() {
      const root = document.getElementById('category-manager-list');
      if (!root) return;
      root.replaceChildren();
      const categories = [...new Set([...loadCategoryGroups(), ...adminCore.inventory.getItems().map(item => String(item.category || '').trim()).filter(Boolean)])]
        .sort((a, b) => a.localeCompare(b, 'fa'));
      if (!categories.length) {
        const empty = document.createElement('p');
        empty.className = 'location-list-empty';
        empty.textContent = 'هنوز گروهی برای کالاها ثبت نشده است.';
        root.append(empty);
        return;
      }
      categories.forEach(category => {
        const row = document.createElement('div');
        row.className = 'location-record location-record-parent';
        const title = document.createElement('strong');
        title.textContent = category;
        const count = document.createElement('span');
        count.textContent = adminCore.inventory.getItems().filter(item => String(item.category || '').trim() === category).length + ' کالا';
        const edit = document.createElement('button');
        edit.type = 'button'; edit.className = 'action-button secondary'; edit.textContent = 'تغییر نام';
        edit.addEventListener('click', () => {
          const next = window.prompt('نام جدید گروه کالا:', category);
          if (next === null) return;
          const clean = adminCore.text.normalizeArabicLetters(next).trim().slice(0, 80);
          if (!clean) { window.alert('نام گروه نمی‌تواند خالی باشد.'); return; }
          const items = adminCore.inventory.getItems();
          items.forEach(item => { if (String(item.category || '').trim() === category) item.category = clean; });
          const groups = loadCategoryGroups().map(value => value === category ? clean : value);
          if (!saveCategoryGroups(groups) || !adminCore.inventory.save()) { document.getElementById('category-manager-feedback').textContent = 'ذخیره تغییر نام گروه ناموفق بود.'; return; }
          document.getElementById('category-manager-feedback').textContent = 'نام گروه و کالاهای مرتبط به‌روزرسانی شد.';
          renderCategoryManager(); adminCore.inventory.render();
        });
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'action-button danger'; remove.textContent = 'حذف گروه';
        remove.addEventListener('click', () => {
          if (!window.confirm('گروه «' + category + '» از کالاهای مرتبط حذف شود؟')) return;
          const items = adminCore.inventory.getItems();
          items.forEach(item => { if (String(item.category || '').trim() === category) item.category = ''; });
          const groups = loadCategoryGroups().filter(value => value !== category);
          if (!saveCategoryGroups(groups) || !adminCore.inventory.save()) { document.getElementById('category-manager-feedback').textContent = 'حذف گروه ناموفق بود.'; return; }
          document.getElementById('category-manager-feedback').textContent = 'گروه حذف شد؛ اطلاعات دیگر کالاها تغییر نکرد.';
          renderCategoryManager(); adminCore.inventory.render();
        });
        row.append(title, count, edit, remove);
        root.append(row);
      });
    }
    // حذف کالا فقط در بخش مدیریت و پس از ورود مدیر در دسترس است.
    const adminSelectedItemCodes = new Set();
    function renderAdminInventoryDeletion() {
      const root = document.getElementById('admin-inventory-delete-list');
      const search = document.getElementById('admin-inventory-search');
      const selectAll = document.getElementById('admin-select-all-items');
      const deleteButton = document.getElementById('admin-delete-selected-items');
      if (!root || !search || !selectAll || !deleteButton) return;
      const term = adminCore.text.toEnglishDigits(adminCore.text.normalizeArabicLetters(search.value).trim()).toLocaleLowerCase('fa');
      const visibleItems = inventoryItems.filter(item =>
        !term || adminCore.text.toEnglishDigits(adminCore.text.normalizeArabicLetters([item.code, item.description].join(' ')))
          .toLocaleLowerCase('fa').includes(term)
      );
      root.replaceChildren();
      if (!visibleItems.length) {
        const empty = document.createElement('p');
        empty.className = 'location-list-empty';
        empty.textContent = inventoryItems.length ? 'کالایی با این جست‌وجو پیدا نشد.' : 'موجودی کالا خالی است.';
        root.append(empty);
      }
      visibleItems.forEach(item => {
        const row = document.createElement('label');
        row.className = 'location-record admin-inventory-delete-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = adminSelectedItemCodes.has(item.code);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) adminSelectedItemCodes.add(item.code);
          else adminSelectedItemCodes.delete(item.code);
          updateAdminInventoryDeleteControls();
        });
        const details = document.createElement('span');
        details.className = 'location-record-details';
        const title = document.createElement('strong');
        title.textContent = item.description || 'بدون شرح';
        const meta = document.createElement('small');
        meta.textContent = 'کد: ' + item.code + '؛ موجودی: ' + adminCore.text.toEnglishDigits(item.stock);
        details.append(title, meta);
        row.append(checkbox, details);
        root.append(row);
      });
      updateAdminInventoryDeleteControls();
    }

    function updateAdminInventoryDeleteControls() {
      const selectAll = document.getElementById('admin-select-all-items');
      const deleteButton = document.getElementById('admin-delete-selected-items');
      if (!selectAll || !deleteButton) return;
      const selectedExisting = [...adminSelectedItemCodes].filter(code =>
        inventoryItems.some(item => item.code === code)
      );
      deleteButton.disabled = selectedExisting.length === 0;
      deleteButton.textContent = 'حذف کالاهای انتخاب‌شده (' + adminCore.text.toEnglishDigits(selectedExisting.length) + ')';
      const search = document.getElementById('admin-inventory-search');
      const term = search ? adminCore.text.toEnglishDigits(adminCore.text.normalizeArabicLetters(search.value).trim()).toLocaleLowerCase('fa') : '';
      const visible = inventoryItems.filter(item =>
        !term || adminCore.text.toEnglishDigits(adminCore.text.normalizeArabicLetters([item.code, item.description].join(' ')))
          .toLocaleLowerCase('fa').includes(term)
      );
      const selectedVisible = visible.filter(item => adminSelectedItemCodes.has(item.code)).length;
      selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
      selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
      selectAll.disabled = visible.length === 0;
    }

function renderAdminLocationManager() {
      const root = document.getElementById('location-manager-list');
      if (!root) return;
      root.replaceChildren();

      const locations = adminCore.locations.load();
      if (!locations.length) {
        const empty = document.createElement('p');
        empty.className = 'location-list-empty';
        empty.textContent = 'هنوز محل ارسالی ذخیره نشده است.';
        root.append(empty);
        return;
      }

      locations.forEach(location => {
        // هر محل به‌صورت یک گروه و هر زیرمجموعه در یک ردیف مستقل نمایش داده می‌شود.
        const group = document.createElement('section');
        group.className = 'location-record-group';

        const heading = document.createElement('div');
        heading.className = 'location-record location-record-parent';

        const details = document.createElement('div');
        details.className = 'location-record-details';
        const title = document.createElement('h6');
        title.textContent = location.name;
        const count = document.createElement('p');
        count.textContent = location.sublocations.length
          ? location.sublocations.length + ' زیرمجموعه'
          : 'بدون زیرمجموعه';
        details.append(title, count);

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'action-button secondary location-edit-button';
        editButton.textContent = 'ویرایش';
        editButton.setAttribute('aria-label', 'ویرایش محل ' + location.name);
        editButton.addEventListener('click', () => {
          const nextName = window.prompt('نام محل ارسال:', location.name);
          if (nextName === null) return;
          const cleanName = nextName.trim();
          if (!cleanName) { window.alert('نام محل نمی‌تواند خالی باشد.'); return; }
          const nextSubsText = window.prompt('زیرمجموعه‌ها را با ویرگول جدا کنید:', location.sublocations.join('، '));
          if (nextSubsText === null) return;
          const nextSubs = [...new Set(nextSubsText.split(/[,،]/).map(value => value.trim()).filter(Boolean))];
          const currentLocations = adminCore.locations.load();
          if (currentLocations.some(item => adminCore.locations.normalize(item.name) !== adminCore.locations.normalize(location.name) && adminCore.locations.normalize(item.name) === adminCore.locations.normalize(cleanName))) {
            window.alert('محل دیگری با این نام وجود دارد.'); return;
          }
          const updated = currentLocations.map(item =>
            adminCore.locations.normalize(item.name) === adminCore.locations.normalize(location.name)
              ? { name: cleanName, sublocations: nextSubs }
              : item
          );
          if (!adminCore.locations.save(updated)) {
            document.getElementById('location-manager-feedback').textContent = 'ویرایش ذخیره نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
            return;
          }
          adminCore.activity.record('ویرایش محل ارسال', {
            'نام قبلی': location.name, 'نام جدید': cleanName,
            'زیرمجموعه‌ها': nextSubs.join('، ') || 'ندارد'
          });
          document.getElementById('location-manager-feedback').textContent = 'اطلاعات محل ارسال به‌روزرسانی شد.';
          renderAdminLocationManager();
          adminCore.locations.renderOptions();
        });

        const removeLocationButton = document.createElement('button');
        removeLocationButton.type = 'button';
        removeLocationButton.className = 'action-button secondary location-delete-button';
        removeLocationButton.textContent = 'حذف کل محل';
        removeLocationButton.setAttribute('aria-label', 'حذف کل محل ' + location.name);
        removeLocationButton.addEventListener('click', () => {
          if (!window.confirm('کل محل «' + location.name + '» و تمام زیرمجموعه‌های آن حذف شوند؟ سوابق ارسال قبلی حفظ می‌شوند.')) return;
          const remainingLocations = adminCore.locations.load().filter(item =>
            adminCore.locations.normalize(item.name) !== adminCore.locations.normalize(location.name)
          );
          if (!adminCore.locations.save(remainingLocations)) {
            document.getElementById('location-manager-feedback').textContent = 'حذف محل انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
            return;
          }
          adminCore.activity.record('حذف کل محل ارسال', {
            'محل حذف‌شده': location.name,
            'زیرمجموعه‌ها': location.sublocations.join('، ') || 'ندارد',
            'سوابق ارسال قبلی': 'حفظ شدند'
          });
          document.getElementById('location-manager-feedback').textContent = 'کل محل انتخاب‌شده حذف شد.';
          renderAdminLocationManager();
          adminCore.locations.renderOptions();
        });

        heading.append(details, editButton, removeLocationButton);
        group.append(heading);

        if (!location.sublocations.length) {
          const emptySub = document.createElement('p');
          emptySub.className = 'location-sublocation-empty';
          emptySub.textContent = 'برای این محل زیرمجموعه‌ای ثبت نشده است.';
          group.append(emptySub);
        } else {
          location.sublocations.forEach(sublocation => {
            const subRow = document.createElement('div');
            subRow.className = 'location-record location-record-sublocation';

            const subDetails = document.createElement('div');
            subDetails.className = 'location-record-details';
            const subTitle = document.createElement('span');
            subTitle.className = 'location-sublocation-name';
            subTitle.textContent = sublocation;
            subDetails.append(subTitle);

            const removeSubButton = document.createElement('button');
            removeSubButton.type = 'button';
            removeSubButton.className = 'action-button secondary location-delete-button location-sublocation-delete';
            removeSubButton.textContent = 'حذف زیرمجموعه';
            removeSubButton.setAttribute('aria-label', 'حذف زیرمجموعه ' + sublocation + ' از محل ' + location.name);
            removeSubButton.addEventListener('click', () => {
              if (!window.confirm('فقط زیرمجموعه «' + sublocation + '» از محل «' + location.name + '» حذف شود؟ سایر زیرمجموعه‌ها و خود محل حفظ می‌شوند.')) return;

              const currentLocations = adminCore.locations.load();
              const target = currentLocations.find(item =>
                adminCore.locations.normalize(item.name) === adminCore.locations.normalize(location.name)
              );
              if (!target) return;
              target.sublocations = target.sublocations.filter(value =>
                adminCore.locations.normalize(value) !== adminCore.locations.normalize(sublocation)
              );

              if (!adminCore.locations.save(currentLocations)) {
                document.getElementById('location-manager-feedback').textContent = 'حذف زیرمجموعه انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
                return;
              }

              adminCore.activity.record('حذف زیرمجموعه محل ارسال', {
                'محل ارسال': location.name,
                'زیرمجموعه حذف‌شده': sublocation,
                'زیرمجموعه‌های باقی‌مانده': target.sublocations.join('، ') || 'ندارد',
                'سوابق ارسال قبلی': 'حفظ شدند'
              });
              document.getElementById('location-manager-feedback').textContent = 'زیرمجموعه انتخاب‌شده حذف شد؛ سایر موارد حفظ شدند.';
              renderAdminLocationManager();
              adminCore.locations.renderOptions();
            });

            subRow.append(subDetails, removeSubButton);
            group.append(subRow);
          });
        }

        root.append(group);
      });
    }

// رویداد «ارسال فرم» برای فرم ثبت محل ارسال؛ اعتبارسنجی و مدیریت ارسال فرم در برنامه.
    document.getElementById('location-create-form').addEventListener('submit', event => {
      event.preventDefault();

      const name = document.getElementById('new-location-name').value.trim();
      // جداکننده فارسی و انگلیسی پذیرفته می‌شود و زیرمجموعه‌های تکراری حذف می‌شوند.
      const sublocations = [...new Set(
        document.getElementById('new-location-subs').value
          .split(/[,،]/)
          .map(value => value.trim())
          .filter(Boolean)
      )];
      const locations = adminCore.locations.load();
      const feedback = document.getElementById('location-manager-feedback');

      if (!name) {
        feedback.textContent = 'نام محل الزامی است.';
        return;
      }

      // یک محل می‌تواند چند بار با زیرمجموعه‌های متفاوت ثبت شود؛
      // در این حالت زیرمجموعه‌های جدید به همان محل افزوده می‌شوند.
      const existingLocation = locations.find(item =>
        adminCore.locations.normalize(item.name) === adminCore.locations.normalize(name)
      );

      if (existingLocation) {
        const newSublocations = sublocations.filter(sub =>
          !existingLocation.sublocations.some(savedSub =>
            adminCore.locations.normalize(savedSub) === adminCore.locations.normalize(sub)
          )
        );

        if (!newSublocations.length) {
          feedback.textContent = sublocations.length
            ? 'این زیرمجموعه‌ها قبلاً برای این محل ثبت شده‌اند.'
            : 'این محل قبلاً ثبت شده است؛ برای افزودن زیرمجموعه، نام آن را وارد کنید.';
          return;
        }

        existingLocation.sublocations.push(...newSublocations);
        if (!adminCore.locations.save(locations)) {
          feedback.textContent = 'افزودن زیرمجموعه انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
          return;
        }

        adminCore.activity.record('افزودن زیرمجموعه محل ارسال', {
          'نام محل': existingLocation.name,
          'زیرمجموعه‌های افزوده‌شده': newSublocations.join('، '),
          'تمام زیرمجموعه‌ها': existingLocation.sublocations.join('، ')
        });
        event.target.reset();
        feedback.textContent = 'زیرمجموعه جدید به محل ارسال اضافه شد.';
      } else {
        locations.push({ name, sublocations });
        if (!adminCore.locations.save(locations)) {
          feedback.textContent = 'ذخیره محل انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
          return;
        }

        adminCore.activity.record('ثبت محل ارسال', {
          'نام محل': name,
          'زیرمجموعه‌ها': sublocations.join('، ') || 'ندارد',
          'منبع ثبت': 'مدیریت محل‌ها'
        });
        event.target.reset();
        feedback.textContent = 'محل ارسال ذخیره شد و در ارسال‌های بعدی قابل انتخاب است.';
      }

      renderAdminLocationManager();
      adminCore.locations.renderOptions();

    });

/* راه‌اندازی idempotent سکشن مدیریت؛ شنونده‌ها فقط یک مرتبه ثبت می‌شوند. */
function setupAdminSection() {
  const root = document.getElementById('section-admin');
  if (!root || root.dataset.adminInitialized === 'true') return false;
  root.dataset.adminInitialized = 'true';

  adminLoginForm?.addEventListener('submit', event => {
        event.preventDefault();
        const password = document.getElementById('admin-password').value;
        const feedback = document.getElementById('admin-login-feedback');
        if (password !== ADMIN_DEFAULT_PASSWORD) {
          feedback.textContent = 'رمز عبور صحیح نیست.';
          document.getElementById('admin-password').select();
          return;
        }
        adminUnlocked = true;
        adminLoginPanel.hidden = true;
        adminContent.hidden = false;
        feedback.textContent = '';
        renderAdminLocationManager();
        renderCategoryManager();
        adminSelectedItemCodes.clear();
        const adminInventorySearch = document.getElementById('admin-inventory-search');
        if (adminInventorySearch) adminInventorySearch.value = '';
        renderAdminInventoryDeletion();
      });

  window.addEventListener('hashchange', () => {
        if (window.location.hash !== '#section-admin') lockAdminSection();
      });

  // رویداد «ارسال فرم» برای فرم ثبت محل ارسال؛ اعتبارسنجی و مدیریت ارسال فرم در برنامه.
      document.getElementById('location-create-form').addEventListener('submit', event => {
        event.preventDefault();
  
        const name = document.getElementById('new-location-name').value.trim();
        // جداکننده فارسی و انگلیسی پذیرفته می‌شود و زیرمجموعه‌های تکراری حذف می‌شوند.
        const sublocations = [...new Set(
          document.getElementById('new-location-subs').value
            .split(/[,،]/)
            .map(value => value.trim())
            .filter(Boolean)
        )];
        const locations = loadShipmentLocations();
        const feedback = document.getElementById('location-manager-feedback');
  
        if (!name) {
          feedback.textContent = 'نام محل الزامی است.';
          return;
        }
  
        // یک محل می‌تواند چند بار با زیرمجموعه‌های متفاوت ثبت شود؛
        // در این حالت زیرمجموعه‌های جدید به همان محل افزوده می‌شوند.
        const existingLocation = locations.find(item =>
          normLocation(item.name) === normLocation(name)
        );
  
        if (existingLocation) {
          const newSublocations = sublocations.filter(sub =>
            !existingLocation.sublocations.some(savedSub =>
              normLocation(savedSub) === normLocation(sub)
            )
          );
  
          if (!newSublocations.length) {
            feedback.textContent = sublocations.length
              ? 'این زیرمجموعه‌ها قبلاً برای این محل ثبت شده‌اند.'
              : 'این محل قبلاً ثبت شده است؛ برای افزودن زیرمجموعه، نام آن را وارد کنید.';
            return;
          }
  
          existingLocation.sublocations.push(...newSublocations);
          if (!saveShipmentLocations(locations)) {
            feedback.textContent = 'افزودن زیرمجموعه انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
            return;
          }
  
          recordActivity('افزودن زیرمجموعه محل ارسال', {
            'نام محل': existingLocation.name,
            'زیرمجموعه‌های افزوده‌شده': newSublocations.join('، '),
            'تمام زیرمجموعه‌ها': existingLocation.sublocations.join('، ')
          });
          event.target.reset();
          feedback.textContent = 'زیرمجموعه جدید به محل ارسال اضافه شد.';
        } else {
          locations.push({ name, sublocations });
          if (!saveShipmentLocations(locations)) {
            feedback.textContent = 'ذخیره محل انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.';
            return;
          }
  
          recordActivity('ثبت محل ارسال', {
            'نام محل': name,
            'زیرمجموعه‌ها': sublocations.join('، ') || 'ندارد',
            'منبع ثبت': 'مدیریت محل‌ها'
          });
          event.target.reset();
          feedback.textContent = 'محل ارسال ذخیره شد و در ارسال‌های بعدی قابل انتخاب است.';
        }
  
        renderAdminLocationManager();
        renderShipmentLocationOptions();
  
      });

  document.getElementById('admin-inventory-search')?.addEventListener('input', renderAdminInventoryDeletion);
      document.getElementById('admin-select-all-items')?.addEventListener('change', event => {
        const search = document.getElementById('admin-inventory-search');
        const term = toEnglishDigits(normalizeArabicLetters(search ? search.value : '').trim()).toLocaleLowerCase('fa');
        const visible = inventoryItems.filter(item =>
          !term || toEnglishDigits(normalizeArabicLetters([item.code, item.description].join(' ')))
            .toLocaleLowerCase('fa').includes(term)
        );
        if (event.target.checked) visible.forEach(item => adminSelectedItemCodes.add(item.code));
        else visible.forEach(item => adminSelectedItemCodes.delete(item.code));
        renderAdminInventoryDeletion();
      });
      document.getElementById('admin-delete-selected-items')?.addEventListener('click', () => {
        const codesToDelete = new Set([...adminSelectedItemCodes].filter(code =>
          inventoryItems.some(item => item.code === code)
        ));
        if (!codesToDelete.size) return;
        const removedItems = inventoryItems.filter(item => codesToDelete.has(item.code));
        const confirmed = window.confirm(
          'حذف ' + toEnglishDigits(removedItems.length) +
          ' کالا از موجودی؟ سوابق ورود و ارسال این کالاها حذف نمی‌شوند و قابل بازیابی باقی می‌مانند.'
        );
        if (!confirmed) return;
        const previousItems = inventoryItems.map(item => ({ ...item }));
        for (let index = inventoryItems.length - 1; index >= 0; index -= 1) {
          if (codesToDelete.has(inventoryItems[index].code)) inventoryItems.splice(index, 1);
        }
        if (!saveInventory()) {
          inventoryItems.splice(0, inventoryItems.length, ...previousItems);
          document.getElementById('admin-inventory-delete-feedback').textContent =
            'ذخیره‌سازی ناموفق بود؛ هیچ کالایی حذف نشد.';
          renderAdminInventoryDeletion();
          return;
        }
        adminSelectedItemCodes.clear();
        recordActivity('حذف کالاهای انتخاب‌شده از مدیریت', {
          'تعداد حذف‌شده': removedItems.length,
          'اقلام': removedItems.map(item => item.code + ' (' + item.description + ')').join('؛ '),
          'سوابق تاریخی': 'حفظ شدند'
        });
        document.getElementById('admin-inventory-delete-feedback').textContent =
          toEnglishDigits(removedItems.length) + ' کالا از موجودی حذف شد؛ تاریخچه عملیات حفظ شد.';
        renderInventory();
        renderCategoryManager();
        renderAdminInventoryDeletion();
      });
  
      document.getElementById('category-manager-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = document.getElementById('new-category-name');
        const category = normalizeArabicLetters(input.value).trim().slice(0, 80);
        const feedback = document.getElementById('category-manager-feedback');
        if (!category) { feedback.textContent = 'نام گروه کالا الزامی است.'; return; }
        const groups = loadCategoryGroups();
        const exists = [...groups, ...loadInventory().map(item => String(item.category || '').trim())].some(value => value === category);
        if (exists) { feedback.textContent = 'این گروه از قبل ثبت شده است.'; return; }
        if (!saveCategoryGroups([...groups, category])) { feedback.textContent = 'ذخیره گروه جدید ناموفق بود.'; return; }
        feedback.textContent = 'گروه جدید ذخیره شد.';
        input.value = '';
        renderCategoryManager();
      });

  return true;
}
window.AnbarAdmin = Object.freeze({
  lock: lockAdminSection,
  renderLocationManager: renderAdminLocationManager,
  renderCategoryManager,
  renderInventoryDeletion: renderAdminInventoryDeletion
});
