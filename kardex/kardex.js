
/* ماژول کاردکس: ممیزی گردش، مانده نسبی، جست‌وجو و پیشنهادهای زنده. */
'use strict';
const kardexCore = window.AnbarCore;
if (!kardexCore) throw new Error('هسته Anbar باید پیش از ماژول کاردکس بارگذاری شود.');
const inventoryItems = kardexCore.inventory.getItems();
let selectedKardexCode = '';
let activeKardexSearchField = 'code';

function getKardexAudit() {
      const rows = [];
      const issues = { missingItems: 0, invalidLines: 0, missingCode: 0, invalidQuantity: 0,
        missingTimestamp: 0, duplicateLines: 0, legacyLines: 0 };
      const seen = new Set();

      const addLines = (records, type) => {
        (Array.isArray(records) ? records : []).forEach(record => {
          if (!record || typeof record !== 'object') return;
          if (!Array.isArray(record.items)) {
            issues.missingItems += 1;
            return;
          }
          const incoming = type === 'entry';
          const rawTimestamp = record.timestamp;
          const parsedTimestamp = typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)
            ? rawTimestamp
            : (typeof rawTimestamp === 'string' && rawTimestamp.trim() && Number.isFinite(Date.parse(rawTimestamp))
              ? Date.parse(rawTimestamp) : NaN);
          const timestampValid = Number.isFinite(parsedTimestamp) && parsedTimestamp > 0;
          if (!timestampValid) issues.missingTimestamp += 1;
          record.items.forEach(line => {
            if (!line || typeof line !== 'object') {
              issues.invalidLines += 1;
              return;
            }
            if (!line.id || !record.id) issues.legacyLines += 1;
            if (line.id && record.id) {
              const identity = type + ':' + String(record.id) + ':' + String(line.id);
              if (seen.has(identity)) {
                issues.duplicateLines += 1;
                return;
              }
              seen.add(identity);
            }
            const code = typeof line.code === 'string' ? line.code.trim() : '';
            const quantity = Number(line.quantity);
            let valid = true;
            if (!code) { issues.missingCode += 1; valid = false; }
            if (!Number.isFinite(quantity) || quantity <= 0) { issues.invalidQuantity += 1; valid = false; }
            if (!valid) {
              issues.invalidLines += 1;
              return;
            }
            rows.push({
              timestamp: timestampValid ? parsedTimestamp : null,
              date: String(record.date || '—') + (record.time ? ' ' + String(record.time) : ''),
              dateKey: timestampValid ? parsedTimestamp : null,
              type,
              document: String(incoming ? record.entryNumber || '—' : record.voucherNumber || record.exitNumber || '—'),
              documentId: String(record.id || ''),
              lineId: String(line.id || ''),
              code,
              description: typeof line.description === 'string' ? line.description : '',
              location: incoming ? '—' : String(record.location || '—') + (record.sublocation ? ' / ' + String(record.sublocation) : ''),
              incoming: incoming ? quantity : 0,
              outgoing: incoming ? 0 : quantity
            });
          });
        });
      };

      addLines(kardexCore.movements.loadEntries(), 'entry');
      addLines(kardexCore.movements.loadShipments(), 'shipment');

      // محاسبه مانده نسبی هر کد کالا از قدیمی به جدید؛ زمان نامعتبر در انتهای توالی قرار می‌گیرد.
      const chronological = [...rows].sort((a, b) => {
        if (a.timestamp === null && b.timestamp !== null) return 1;
        if (a.timestamp !== null && b.timestamp === null) return -1;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });
      const balances = new Map();
      chronological.forEach(row => {
        const balance = (balances.get(row.code) || 0) + row.incoming - row.outgoing;
        balances.set(row.code, balance);
        row.balance = balance;
      });
      rows.sort((a, b) => {
        if (a.timestamp === null && b.timestamp !== null) return 1;
        if (a.timestamp !== null && b.timestamp === null) return -1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
      return { rows, issues };
    }

    function getKardexRows() {
      return getKardexAudit().rows;
    }

function renderKardex() {
      const body = document.getElementById('kardex-body');
      const codeSearch = document.getElementById('kardex-code-search');
      const descriptionSearch = document.getElementById('kardex-description-search');
      const summary = document.getElementById('kardex-item-summary');
      const codeSuggestions = document.getElementById('kardex-code-suggestions');
      const descriptionSuggestions = document.getElementById('kardex-description-suggestions');
      if (!body || !codeSearch || !descriptionSearch || !summary || !codeSuggestions || !descriptionSuggestions) return;

      const normalizeSearch = value =>
        kardexCore.text.normalizeArabicLetters(kardexCore.text.toEnglishDigits(String(value || '')).trim()).toLocaleLowerCase('fa');
      const codeTerm = normalizeSearch(codeSearch.value);
      const descriptionTerm = normalizeSearch(descriptionSearch.value);
      const audit = getKardexAudit();
      const itemMap = new Map();

      // فهرست پیشنهادها از موجودی جاری و سوابق گردش ساخته می‌شود؛ کالاهای دارای سابقه قدیمی نیز قابل جست‌وجو هستند.
      inventoryItems.forEach(item => {
        const code = String(item.code || '').trim();
        if (!code) return;
        itemMap.set(code, {
          code,
          description: String(item.description || ''),
          stock: Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0
        });
      });
      audit.rows.forEach(row => {
        const code = String(row.code || '').trim();
        if (!code) return;
        if (!itemMap.has(code)) itemMap.set(code, { code, description: String(row.description || ''), stock: 0 });
        else if (!itemMap.get(code).description && row.description) itemMap.get(code).description = String(row.description);
      });

      const allItems = [...itemMap.values()];
      const matches = allItems.filter(item =>
        (!codeTerm || normalizeSearch(item.code).includes(codeTerm)) &&
        (!descriptionTerm || normalizeSearch(item.description).includes(descriptionTerm))
      );

      const closeSuggestions = () => {
        codeSuggestions.hidden = true;
        descriptionSuggestions.hidden = true;
        codeSearch.setAttribute('aria-expanded', 'false');
        descriptionSearch.setAttribute('aria-expanded', 'false');
      };
      const renderSuggestions = (target, items, input) => {
        target.replaceChildren();
        if (!items.length) {
          const empty = document.createElement('div');
          empty.className = 'kardex-suggestion-empty';
          empty.textContent = 'موردی پیدا نشد.';
          target.append(empty);
        } else {
          items.slice(0, 10).forEach(item => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'kardex-suggestion-option';
            option.role = 'option';
            option.dataset.kardexCode = item.code;
            const name = document.createElement('strong');
            name.textContent = item.description || 'بدون شرح';
            const code = document.createElement('span');
            code.textContent = 'کد تدارکاتی: ' + item.code;
            option.append(name, code);
            target.append(option);
          });
          if (items.length > 10) {
            const more = document.createElement('div');
            more.className = 'kardex-suggestion-empty';
            more.textContent = '۱۰ مورد نخست نمایش داده شده است؛ جست‌وجو را دقیق‌تر کنید.';
            target.append(more);
          }
        }
        target.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      };

      // تا پیش از انتخاب پیشنهاد، فقط فهرست نتایج جست‌وجو دیده می‌شود و کاردکس باز نمی‌شود.
      summary.hidden = true;
      body.replaceChildren();
      const addMessage = message => {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.className = 'preview-empty';
        cell.textContent = message;
        row.append(cell);
        body.append(row);
      };

      if (!selectedKardexCode) {
        if (activeKardexSearchField === 'code' && codeTerm) {
          renderSuggestions(codeSuggestions, matches, codeSearch);
          descriptionSuggestions.hidden = true;
          descriptionSearch.setAttribute('aria-expanded', 'false');
        } else if (activeKardexSearchField === 'description' && descriptionTerm) {
          renderSuggestions(descriptionSuggestions, matches, descriptionSearch);
          codeSuggestions.hidden = true;
          codeSearch.setAttribute('aria-expanded', 'false');
        } else {
          closeSuggestions();
        }
        addMessage(codeTerm || descriptionTerm
          ? (matches.length ? 'از فهرست پیشنهادها یک کالا را انتخاب کنید.' : 'کالایی با این عبارت پیدا نشد.')
          : 'برای مشاهده کاردکس، کد تدارکاتی یا شرح یک کالا را جست‌وجو کنید.');
        return;
      }

      closeSuggestions();
      const selectedItem = itemMap.get(selectedKardexCode);
      if (!selectedItem) {
        selectedKardexCode = '';
        addMessage('کالای انتخاب‌شده در فهرست موجودی یا سوابق پیدا نشد؛ دوباره جست‌وجو کنید.');
        return;
      }

      document.getElementById('kardex-item-code').textContent = selectedItem.code;
      document.getElementById('kardex-item-description').textContent = selectedItem.description || 'بدون شرح';
      document.getElementById('kardex-item-stock').textContent = kardexCore.text.toEnglishDigits(selectedItem.stock);
      summary.hidden = false;

      const rows = audit.rows
        .filter(row => String(row.code || '').trim() === selectedItem.code)
        .sort((a, b) => {
          // ترتیب نمایش از قدیمی‌ترین عملیات به جدیدترین؛ تاریخ نامعتبر در انتهای فهرست قرار می‌گیرد.
          if (a.timestamp === null && b.timestamp !== null) return 1;
          if (a.timestamp !== null && b.timestamp === null) return -1;
          return (a.timestamp || 0) - (b.timestamp || 0);
        });

      if (!rows.length) {
        addMessage('برای این کالا هنوز سابقه ورود یا خروج ثبت نشده است.');
        return;
      }
      rows.forEach(item => {
        const row = document.createElement('tr');
        if (item.timestamp === null) row.classList.add('kardex-row-undated');
        const values = [item.date, item.type === 'entry' ? 'ورود' : 'خروج', item.document, item.code,
          item.description || selectedItem.description || '—', item.location,
          item.incoming ? kardexCore.text.toEnglishDigits(item.incoming) : '—',
          item.outgoing ? kardexCore.text.toEnglishDigits(item.outgoing) : '—',
          kardexCore.text.toEnglishDigits(item.balance)];
        values.forEach((value, index) => {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          if (index === 3) cell.className = 'kardex-code-cell';
          if (index >= 6) cell.className = 'kardex-number-cell';
          if (index === 2 && (item.documentId || item.lineId)) {
            cell.title = 'شناسه سند: ' + (item.documentId || 'ثبت‌نشده') + '\\nشناسه ردیف: ' + (item.lineId || 'ثبت‌نشده');
          }
          row.append(cell);
        });
        body.append(row);
      });
    }

/* راه‌اندازی idempotent سکشن کاردکس؛ شنونده‌ها فقط یک مرتبه ثبت می‌شوند. */
function setupKardexSection() {
  const root = document.getElementById('section-5');
  if (!root || root.dataset.kardexInitialized === 'true') return false;
  root.dataset.kardexInitialized = 'true';

  const kardexCodeSearch = document.getElementById('kardex-code-search');
      const kardexDescriptionSearch = document.getElementById('kardex-description-search');
      const selectKardexSuggestion = (event) => {
        const option = event.target.closest('[data-kardex-code]');
        if (!option) return;
        const code = option.dataset.kardexCode;
        const audit = getKardexAudit();
        const item = inventoryItems.find(entry => String(entry.code || '').trim() === code) ||
          audit.rows.find(entry => String(entry.code || '').trim() === code);
        if (!item) return;
        selectedKardexCode = code;
        kardexCodeSearch.value = code;
        kardexDescriptionSearch.value = String(item.description || '');
        renderKardex();
      };
      document.getElementById('kardex-code-suggestions')?.addEventListener('click', selectKardexSuggestion);
      document.getElementById('kardex-description-suggestions')?.addEventListener('click', selectKardexSuggestion);
      kardexCodeSearch?.addEventListener('focus', () => {
        activeKardexSearchField = 'code';
        if (!selectedKardexCode && kardexCodeSearch.value.trim()) renderKardex();
      });
      kardexDescriptionSearch?.addEventListener('focus', () => {
        activeKardexSearchField = 'description';
        if (!selectedKardexCode && kardexDescriptionSearch.value.trim()) renderKardex();
      });
      kardexCodeSearch?.addEventListener('input', () => {
        activeKardexSearchField = 'code';
        selectedKardexCode = '';
        kardexDescriptionSearch.value = '';
        renderKardex();
      });
      kardexDescriptionSearch?.addEventListener('input', () => {
        activeKardexSearchField = 'description';
        selectedKardexCode = '';
        kardexCodeSearch.value = '';
        renderKardex();
      });
      document.addEventListener('click', event => {
        if (event.target.closest('.kardex-autocomplete-group')) return;
        document.getElementById('kardex-code-suggestions')?.setAttribute('hidden', '');
        document.getElementById('kardex-description-suggestions')?.setAttribute('hidden', '');
        kardexCodeSearch?.setAttribute('aria-expanded', 'false');
        kardexDescriptionSearch?.setAttribute('aria-expanded', 'false');
      });

  renderKardex();
  return true;
}
window.AnbarKardex = Object.freeze({
  render: renderKardex,
  getRows: getKardexRows,
  audit: getKardexAudit
});
