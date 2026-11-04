/* اکسپلورر خودکار DOM؛ هیچ فهرست دستی از سکشن‌ها یا قابلیت‌ها نگهداری نمی‌شود. */
(function () {
  'use strict';

  let observer = null;
  let refreshTimer = null;
  let currentNodes = [];
  let selectedNodeId = null;
  let searchQuery = '';

  const SECTION_SELECTOR = 'main .sections > .section-card, main .section-card';
  const SKIP_SELECTOR = '#section-tag-explorer, script, style, template, noscript, svg, path';
  const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'SUMMARY', 'DETAILS']);
  const MEANINGFUL_CLASS = /(card|panel|widget|stat|table|form|field|group|toolbar|actions|list|history|chart|summary|dialog|alert|filter|tabs|section|item|row|column|preview|calendar|quick|stock|report|entry|inventory|kardex|setting)/i;

  function setupTagExplorer() {
    const root = document.getElementById('section-tag-explorer');
    if (!root || root.dataset.tagExplorerReady === 'true') return;
    root.dataset.tagExplorerReady = 'true';

    const tree = root.querySelector('#tag-explorer-tree');
    const detail = root.querySelector('#tag-explorer-detail');
    const summary = root.querySelector('#tag-explorer-summary');
    const search = root.querySelector('#tag-explorer-search');
    const refresh = root.querySelector('#tag-explorer-refresh');
    if (!tree || !detail || !summary || !search || !refresh) return;

    search.addEventListener('input', function () {
      searchQuery = search.value.trim().toLocaleLowerCase();
      renderTree(tree, detail);
    });
    refresh.addEventListener('click', function () {
      scanAndRender(tree, detail, summary);
    });

    scanAndRender(tree, detail, summary);
    const observedRoot = document.querySelector('main .sections') || document.querySelector('main');
    if (observedRoot && typeof MutationObserver === 'function') {
      observer = new MutationObserver(function (records) {
        if (records.every(function (record) {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          return target && target.closest && target.closest('#section-tag-explorer');
        })) return;
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(function () {
          scanAndRender(tree, detail, summary);
        }, 180);
      });
      observer.observe(observedRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['id', 'class', 'role', 'aria-label', 'title', 'data-action', 'data-feature'],
        characterData: true
      });
    }
  }

  function scanAndRender(tree, detail, summary) {
    const sections = Array.from(document.querySelectorAll(SECTION_SELECTOR))
      .filter(function (section) { return !section.matches(SKIP_SELECTOR); });
    currentNodes = sections.map(function (section, index) {
      const title = getSectionTitle(section);
      return {
        id: 'section-' + index,
        label: title,
        kind: 'سکشن',
        element: section,
        children: collectMeaningfulChildren(section, 'section-' + index)
      };
    });
    renderTree(tree, detail);
    const componentCount = countNodes(currentNodes) - currentNodes.length;
    summary.textContent = sections.length + ' سکشن شناسایی شد · ' + componentCount + ' جزء و قابلیت قابل بررسی · بروزرسانی زنده فعال است';
    if (!selectedNodeId || !findNode(selectedNodeId)) {
      selectedNodeId = currentNodes[0] ? currentNodes[0].id : null;
    }
    if (selectedNodeId) {
      showDetails(findNode(selectedNodeId), detail);
      tree.querySelectorAll('.tag-explorer-select').forEach(function (button) {
        button.setAttribute('aria-current', button.closest('[role="treeitem"]') && button.closest('[role="treeitem"]').querySelector('.tag-explorer-node-label')?.textContent === (findNode(selectedNodeId)?.label || '') ? 'true' : 'false');
      });
    }
    else detail.replaceChildren(makeText('p', 'در صفحه سکشن قابل شناسایی وجود ندارد.', 'tag-explorer-empty'));
  }

  function collectMeaningfulChildren(parent, parentId) {
    const result = [];
    let sequence = 0;
    Array.from(parent.children).forEach(function (element) {
      if (element.matches(SKIP_SELECTOR) || element.closest('#section-tag-explorer')) return;
      if (isMeaningful(element)) {
        const id = parentId + '-' + sequence++;
        result.push({
          id: id,
          label: getElementLabel(element),
          kind: getElementKind(element),
          element: element,
          children: collectMeaningfulChildren(element, id)
        });
      } else {
        result.push.apply(result, collectMeaningfulChildren(element, parentId));
      }
    });
    return result;
  }

  function isMeaningful(element) {
    if (!element || element.nodeType !== 1) return false;
    if (INTERACTIVE_TAGS.has(element.tagName)) return true;
    if (element.id || element.hasAttribute('data-action') || element.hasAttribute('data-feature')) return true;
    if (element.hasAttribute('aria-label') || element.hasAttribute('role')) return true;
    return Array.from(element.classList || []).some(function (name) { return MEANINGFUL_CLASS.test(name); });
  }

  function getSectionTitle(section) {
    const heading = section.querySelector('h1,h2,h3,[aria-label]');
    return (heading && (heading.textContent || heading.getAttribute('aria-label')) || section.getAttribute('aria-label') || section.id || 'سکشن بدون عنوان').trim().replace(/\s+/g, ' ').slice(0, 100);
  }

  function getElementLabel(element) {
    const explicit = element.getAttribute('aria-label') || element.getAttribute('title') ||
      element.getAttribute('data-feature') || element.getAttribute('data-action');
    if (explicit) return explicit.trim().slice(0, 100);
    if (element.id) {
      const label = element.id.replace(/[-_]+/g, ' ');
      const heading = element.querySelector('h2,h3,h4,strong,label');
      return heading ? heading.textContent.trim().replace(/\s+/g, ' ').slice(0, 100) + ' · #' + label : '#' + label;
    }
    const text = (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) return text.slice(0, 88);
    return element.tagName.toLowerCase() + (element.classList.length ? '.' + Array.from(element.classList).slice(0, 2).join('.') : '');
  }

  function getElementKind(element) {
    if (element.tagName === 'FORM') return 'فرم';
    if (element.tagName === 'TABLE') return 'جدول';
    if (element.tagName === 'BUTTON') return 'دکمه';
    if (element.tagName === 'A') return 'پیوند';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return 'ورودی';
    if (element.tagName === 'SECTION' || element.tagName === 'ARTICLE') return 'باکس / پنل';
    if (element.hasAttribute('data-action') || element.hasAttribute('data-feature')) return 'قابلیت';
    return 'جزء رابط';
  }

  function renderTree(tree, detail) {
    tree.replaceChildren();
    const list = document.createElement('ul');
    list.className = 'tag-explorer-tree-list';
    list.setAttribute('role', 'group');
    let visibleCount = 0;
    currentNodes.forEach(function (node) {
      const rendered = renderNode(node, detail);
      if (rendered) { list.appendChild(rendered); visibleCount += 1; }
    });
    if (!visibleCount) {
      tree.appendChild(makeText('p', 'موردی با عبارت جست‌وجو پیدا نشد.', 'tag-explorer-empty'));
      return;
    }
    tree.appendChild(list);
  }

  function renderNode(node, detail) {
    const matching = matchesNode(node);
    const childItems = node.children.map(function (child) { return renderNode(child, detail); }).filter(Boolean);
    if (searchQuery && !matching && !childItems.length) return null;

    const item = document.createElement('li');
    item.className = 'tag-explorer-tree-item';
    item.setAttribute('role', 'treeitem');
    const row = makeText('div', '', 'tag-explorer-tree-row');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tag-explorer-toggle';
    toggle.textContent = childItems.length ? '▾' : '·';
    toggle.disabled = !childItems.length;
    toggle.setAttribute('aria-label', childItems.length ? 'باز یا بسته کردن زیرمجموعه' : 'بدون زیرمجموعه');

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'tag-explorer-select';
    select.setAttribute('aria-current', selectedNodeId === node.id ? 'true' : 'false');
    const icon = makeText('span', node.element.tagName.toLowerCase(), 'tag-explorer-node-icon');
    const label = makeText('span', node.label, 'tag-explorer-node-label');
    const meta = makeText('span', node.kind, 'tag-explorer-node-meta');
    select.append(icon, label, meta);
    select.addEventListener('click', function () {
      selectedNodeId = node.id;
      tree.querySelectorAll('.tag-explorer-select').forEach(function (button) { button.setAttribute('aria-current', 'false'); });
      select.setAttribute('aria-current', 'true');
      showDetails(node, detail);
    });
    toggle.addEventListener('click', function () {
      const nested = item.querySelector(':scope > .tag-explorer-tree-list');
      if (!nested) return;
      nested.hidden = !nested.hidden;
      toggle.textContent = nested.hidden ? '▸' : '▾';
      toggle.setAttribute('aria-expanded', String(!nested.hidden));
    });
    row.append(toggle, select);
    item.appendChild(row);
    if (childItems.length) {
      const nested = document.createElement('ul');
      nested.className = 'tag-explorer-tree-list';
      nested.setAttribute('role', 'group');
      childItems.forEach(function (child) { nested.appendChild(child); });
      nested.hidden = false;
      if (searchQuery) {
        toggle.textContent = '▾';
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        toggle.setAttribute('aria-expanded', 'true');
      }
      item.appendChild(nested);
    }
    return item;
  }

  function matchesNode(node) {
    if (!searchQuery) return true;
    const element = node.element;
    const haystack = [
      node.label, node.kind, element.tagName, element.id,
      element.className && typeof element.className === 'string' ? element.className : '',
      element.getAttribute('data-action') || '',
      element.getAttribute('data-feature') || ''
    ].join(' ').toLocaleLowerCase();
    return haystack.includes(searchQuery);
  }

  function showDetails(node, container) {
    if (!node || !node.element) return;
    const element = node.element;
    container.replaceChildren();
    const kindLabel = container.parentElement && container.parentElement.querySelector('#tag-explorer-detail-kind');
    if (kindLabel) kindLabel.textContent = node.kind;
    container.appendChild(makeText('h4', node.label, 'tag-explorer-detail-title'));
    const properties = document.createElement('dl');
    properties.className = 'tag-explorer-properties';
    const values = [
      ['نوع عنصر', node.kind],
      ['تگ HTML', '<' + element.tagName.toLowerCase() + '>'],
      ['شناسه ID', element.id ? '#' + element.id : 'ندارد'],
      ['کلاس‌های CSS', typeof element.className === 'string' && element.className.trim() ? element.className.trim() : 'ندارد'],
      ['نقش ARIA', element.getAttribute('role') || 'تعریف نشده'],
      ['نوع ورودی', element.getAttribute('type') || '—'],
      ['نام فیلد', element.getAttribute('name') || '—'],
      ['پیوند مقصد', element.getAttribute('href') || '—'],
      ['تعامل قابل تشخیص', describeInteraction(element)],
      ['زیرمجموعه مستقیم', String(node.children.length)]
    ];
    values.forEach(function (pair) {
      const wrapper = document.createElement('div');
      wrapper.className = 'tag-explorer-property';
      wrapper.append(makeText('dt', pair[0]), makeText('dd', pair[1]));
      properties.appendChild(wrapper);
    });
    container.appendChild(properties);
    const badges = document.createElement('div');
    badges.className = 'tag-explorer-badges';
    ['aria-label', 'title', 'data-action', 'data-feature'].forEach(function (attribute) {
      if (element.hasAttribute(attribute)) badges.appendChild(makeText('span', attribute + ': ' + element.getAttribute(attribute), 'tag-explorer-badge'));
    });
    if (badges.childNodes.length) container.appendChild(badges);
  }

  function describeInteraction(element) {
    if (element.tagName === 'A') return 'ناوبری / بازکردن پیوند';
    if (element.tagName === 'BUTTON') return 'عملیات دکمه‌ای';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return 'دریافت یا انتخاب داده';
    if (element.tagName === 'FORM') return 'ارسال فرم';
    if (element.hasAttribute('data-action') || element.hasAttribute('data-feature')) return 'دارای نشانه قابلیت سفارشی';
    return 'عنصر ساختاری / نمایشی';
  }

  function findNode(id, nodes) {
    const source = nodes || currentNodes;
    for (const node of source) {
      if (node.id === id) return node;
      const found = findNode(id, node.children);
      if (found) return found;
    }
    return null;
  }

  function countNodes(nodes) {
    return nodes.reduce(function (total, node) { return total + 1 + countNodes(node.children); }, 0);
  }

  function makeText(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  }

  window.setupTagExplorer = setupTagExplorer;
  window.TagExplorer = Object.freeze({
    refresh: function () {
      const root = document.getElementById('section-tag-explorer');
      if (!root) return;
      const tree = root.querySelector('#tag-explorer-tree');
      const detail = root.querySelector('#tag-explorer-detail');
      const summary = root.querySelector('#tag-explorer-summary');
      if (tree && detail && summary) scanAndRender(tree, detail, summary);
    }
  });
})();
