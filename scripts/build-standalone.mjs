#!/usr/bin/env node
/**
 * Builds the fully self-contained browser version of Anbar.
 * Usage: node scripts/build-standalone.mjs
 * Uses only Node.js built-ins, so no package installation is required.
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_HTML = resolve(ROOT, 'index.html');
const INPUT_CSS = resolve(ROOT, 'index.css');
const INPUT_DASHBOARD_CSS = resolve(ROOT, 'dashboard/dashboard.css');
const INPUT_ENTRY_CSS = resolve(ROOT, 'entry/entry.css');
const INPUT_ENTRY_JS = resolve(ROOT, 'entry/entry.js');
const INPUT_INVENTORY_CSS = resolve(ROOT, 'inventory/inventory.css');
const INPUT_INVENTORY_JS = resolve(ROOT, 'inventory/inventory.js');
const INPUT_ADMIN_CSS = resolve(ROOT, 'admin/admin.css');
const INPUT_ADMIN_JS = resolve(ROOT, 'admin/admin.js');
const INPUT_KARDEX_CSS = resolve(ROOT, 'kardex/kardex.css');
const INPUT_KARDEX_JS = resolve(ROOT, 'kardex/kardex.js');
const INPUT_REPORTS_CSS = resolve(ROOT, 'reports/reports.css');
const INPUT_REPORTS_JS = resolve(ROOT, 'reports/reports.js');
const INPUT_SETTINGS_CSS = resolve(ROOT, 'settings/settings.css');
const INPUT_SETTINGS_JS = resolve(ROOT, 'settings/settings.js');
const INPUT_BACKUP_VALIDATION_JS = resolve(ROOT, 'settings/backup-validation.js');
const INPUT_BACKUP_ENGINE_JS = resolve(ROOT, 'settings/backup-engine.js');
const INPUT_BACKUP_FOLDER_JS = resolve(ROOT, 'settings/backup-folder.js');
const INPUT_BACKUP_RESTORE_JS = resolve(ROOT, 'settings/backup-restore.js');
const INPUT_JS = resolve(ROOT, 'index.js');
const INPUT_XLSX = resolve(ROOT, 'vendor/xlsx.full.min.js');
const SECTION_FILES = [['section-1','entry','entry.html'],['section-2','inventory','inventory.html'],['section-4','reports','reports.html'],['section-5','kardex','kardex.html'],['section-admin','admin','admin.html'],['section-3','settings','settings.html']];
const OUTPUT_HTML = resolve(ROOT, 'anbar-standalone.html');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readRequiredFile(path, label) {
  try {
    const fileStat = await stat(path);
    assert(fileStat.isFile(), label + ' is not a file: ' + path);
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new Error('Cannot read required ' + label + ' at ' + path + ': ' + error.message);
  }
}

function replaceExactlyOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern) || [];
  assert(matches.length === 1, 'Expected exactly one ' + label + ' reference, found ' + matches.length + '.');
  return source.replace(pattern, replacement);
}

/**
 * Store JavaScript as Base64 in a non-executable script element.
 * The HTML parser therefore never treats text within minified dependencies
 * as HTML markup or an accidental closing script tag.
 */
function encodeScriptPayload(source, id) {
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  return '<script type="application/x-anbar-base64" id="' + id + '">' +
    encoded +
    '</script>\n';
}

/**
 * Decode each payload and insert it as a real script through the DOM.
 * Using textContent avoids reparsing script source as HTML. Each inline
 * classic script executes synchronously when inserted, preserving order.
 */
function createScriptLoader() {
  return [
    '<script>',
    '(function () {',
    "  'use strict';",
    '',
    '  function runEmbeddedScript(payloadId) {',
    '    var payload = document.getElementById(payloadId);',
    '    if (!payload) {',
    "      throw new Error('Embedded script payload not found: ' + payloadId);",
    '    }',
    '',
    '    var binary = atob(payload.textContent.trim());',
    '    var bytes = new Uint8Array(binary.length);',
    '    for (var index = 0; index < binary.length; index += 1) {',
    '      bytes[index] = binary.charCodeAt(index);',
    '    }',
    '',
    "    var source = new TextDecoder('utf-8').decode(bytes);",
    "    var executable = document.createElement('script');",
    '    executable.textContent = source;',
    '    payload.replaceWith(executable);',
    '  }',
    '',
    "  runEmbeddedScript('anbar-xlsx-script');",
    "  runEmbeddedScript('anbar-backup-validation-script');",
    "  runEmbeddedScript('anbar-backup-engine-script');",
    "  runEmbeddedScript('anbar-backup-folder-script');",
    "  runEmbeddedScript('anbar-backup-restore-script');",
    "  runEmbeddedScript('anbar-app-script');",
    "  runEmbeddedScript('anbar-inventory-script');",
    "  runEmbeddedScript('anbar-entry-script');",
    "  runEmbeddedScript('anbar-admin-script');",
    "  runEmbeddedScript('anbar-kardex-script');",
    "  runEmbeddedScript('anbar-reports-script');",
    "  runEmbeddedScript('anbar-settings-script');",
    "  if (typeof setupInventorySection === 'function') setupInventorySection();",
    "  if (typeof setupEntrySection === 'function') setupEntrySection();",
    "  if (typeof setupAdminSection === 'function') setupAdminSection();",
    "  if (window.AnbarReports && typeof window.AnbarReports.initializeEntryHistory === 'function') window.AnbarReports.initializeEntryHistory();",
    "  if (window.AnbarReports && typeof window.AnbarReports.initializeShipmentHistory === 'function') window.AnbarReports.initializeShipmentHistory();",
    "  if (typeof setupKardexSection === 'function') setupKardexSection();",
    "  if (typeof window.initializeSettingsSection === 'function') window.initializeSettingsSection();",
    '})();',
    '</script>',
    ''
  ].join('\n');
}

function assertNoRequiredLocalReferencesRemain(html) {
  // Scan HTML markup only; JavaScript payloads are Base64 data, not dependencies.
  const markupOnly = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const refs = [];
  for (const match of markupOnly.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (value.startsWith('#') || /^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(value)) continue;
    refs.push(value);
  }
  assert(refs.length === 0, 'Standalone output still contains local file references: ' + refs.join(', '));
}

function assertPayloadMatches(html, id, expectedSource) {
  const markerIndex = html.indexOf('id="' + id + '"');
  assert(markerIndex >= 0, 'Embedded script payload is missing: ' + id);

  const openingTagEnd = html.indexOf('>', markerIndex);
  assert(openingTagEnd >= 0, 'Opening tag is malformed for payload: ' + id);

  const closingTagStart = html.indexOf('</script>', openingTagEnd + 1);
  assert(closingTagStart >= 0, 'Closing tag is missing for payload: ' + id);

  const encoded = html.slice(openingTagEnd + 1, closingTagStart).trim();
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  assert(decoded === expectedSource, 'Embedded script payload differs from source: ' + id);
}

async function main() {
  const [htmlFile, cssFile, dashboardCssFile, entryCssFile, entryJsFile, inventoryCssFile, inventoryJsFile, adminCssFile, adminJsFile, kardexCssFile, kardexJsFile, reportsCssFile, reportsJsFile, settingsCssFile, settingsJsFile, backupValidationJs, backupEngineJs, backupFolderJs, backupRestoreJs, jsFile, xlsxFile, ...sectionContents] = await Promise.all([
    readRequiredFile(INPUT_HTML, 'source HTML'),
    readRequiredFile(INPUT_CSS, 'stylesheet'),
    readRequiredFile(INPUT_DASHBOARD_CSS, 'dashboard stylesheet'),
    readRequiredFile(INPUT_ENTRY_CSS, 'entry stylesheet'),
    readRequiredFile(INPUT_ENTRY_JS, 'entry JavaScript'),
    readRequiredFile(INPUT_INVENTORY_CSS, 'inventory stylesheet'),
    readRequiredFile(INPUT_INVENTORY_JS, 'inventory JavaScript'),
    readRequiredFile(INPUT_ADMIN_CSS, 'admin stylesheet'),
    readRequiredFile(INPUT_ADMIN_JS, 'admin JavaScript'),
    readRequiredFile(INPUT_KARDEX_CSS, 'kardex stylesheet'),
    readRequiredFile(INPUT_KARDEX_JS, 'kardex JavaScript'),
    readRequiredFile(INPUT_REPORTS_CSS, 'reports stylesheet'),
    readRequiredFile(INPUT_REPORTS_JS, 'reports JavaScript'),
    readRequiredFile(INPUT_SETTINGS_CSS, 'settings stylesheet'),
    readRequiredFile(INPUT_SETTINGS_JS, 'settings JavaScript'),
    readRequiredFile(INPUT_BACKUP_VALIDATION_JS, 'backup validation JavaScript'),
    readRequiredFile(INPUT_BACKUP_ENGINE_JS, 'backup engine JavaScript'),
    readRequiredFile(INPUT_BACKUP_FOLDER_JS, 'backup folder JavaScript'),
    readRequiredFile(INPUT_BACKUP_RESTORE_JS, 'backup restore JavaScript'),
    readRequiredFile(INPUT_JS, 'application JavaScript'),
    readRequiredFile(INPUT_XLSX, 'local SheetJS library'),
    ...SECTION_FILES.map(([, folder, file]) => readRequiredFile(resolve(ROOT, folder, file), 'section HTML ' + folder + '/' + file))
  ]);

  let html = htmlFile;
  for (let index = 0; index < SECTION_FILES.length; index += 1) {
    const [sectionId, , fileName] = SECTION_FILES[index];
    const sectionHtml = sectionContents[index].trim();
    assert(sectionHtml.startsWith('<section') && sectionHtml.includes('id=\"' + sectionId + '\"'), 'Invalid section: ' + fileName);
    const mount = '<div class=\"section-mount\" data-section-mount=\"' + sectionId + '\" aria-live=\"off\"></div>';
    assert(html.split(mount).length === 2, 'Expected exactly one section mount: ' + sectionId);
    html = html.replace(mount, sectionHtml);
  }
  const css = cssFile;
  const entryJs = entryJsFile;
  const inventoryJs = inventoryJsFile;
  const adminJs = adminJsFile;
  const kardexJs = kardexJsFile;
  const reportsJs = reportsJsFile;
  const appJs = jsFile;
  const xlsxJs = xlsxFile;

  assert(html.includes('<!DOCTYPE html>'), 'index.html does not appear to be a complete HTML document.');
  assert(html.includes('id="app-layout"'), 'Expected main application layout was not found in index.html.');
  assert(appJs.trim().length > 0, 'index.js is empty.');
  assert(css.trim().length > 0, 'index.css is empty.');
  assert(xlsxJs.trim().length > 0, 'The local SheetJS library is empty.');

  html = replaceExactlyOnce(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']index\.css["'])[^>]*>\s*/i,
    '<style>\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>\n',
    'index.css stylesheet'
  );

  html = replaceExactlyOnce(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']dashboard\/dashboard\.css["'])[^>]*>\s*/i,
    '<style>\n' + dashboardCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n',
    'dashboard stylesheet'
  );

  html = replaceExactlyOnce(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']entry\/entry\.css["'])[^>]*>\s*/i,
    '<style>\n' + entryCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n',
    'entry stylesheet'
  );

  html = replaceExactlyOnce(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']inventory\/inventory\.css["'])[^>]*>\s*/i,
    '<style>\n' + inventoryCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n',
    'inventory stylesheet'
  );

  html = replaceExactlyOnce(
    html,
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']admin\/admin\.css["'])[^>]*>\s*/i,
    '<style>\n' + adminCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n',
    'admin stylesheet'
  );

  html = replaceExactlyOnce(
    html,
    /<\/head>/i,
    '<style>\n' + kardexCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n<style>\n' + reportsCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n<style>\n' + settingsCssFile.replace(/<\/style/gi, '<\\/style') + '\n</style>\n</head>',
    'document head closing tag for kardex, reports and settings stylesheets'
  );

  html = replaceExactlyOnce(
    html,
    /<script\b(?=[^>]*\bsrc=["']vendor\/xlsx\.full\.min\.js["'])[^>]*>\s*<\/script>\s*/i,
    encodeScriptPayload(xlsxJs, 'anbar-xlsx-script'),
    'local SheetJS script'
  );

  html = replaceExactlyOnce(
    html,
    /<script\b(?=[^>]*\bsrc=["']sections-loader\.js["'])[^>]*>\s*<\/script>\s*/i,
    encodeScriptPayload(backupValidationJs, 'anbar-backup-validation-script') + encodeScriptPayload(backupEngineJs, 'anbar-backup-engine-script') + encodeScriptPayload(backupFolderJs, 'anbar-backup-folder-script') + encodeScriptPayload(backupRestoreJs, 'anbar-backup-restore-script') + encodeScriptPayload(appJs, 'anbar-app-script') + encodeScriptPayload(inventoryJs, 'anbar-inventory-script') + encodeScriptPayload(entryJs, 'anbar-entry-script') + encodeScriptPayload(adminJs, 'anbar-admin-script') + encodeScriptPayload(kardexJs, 'anbar-kardex-script') + encodeScriptPayload(reportsJs, 'anbar-reports-script') + encodeScriptPayload(settingsJsFile, 'anbar-settings-script') + createScriptLoader(),
    'sections-loader.js bootstrap script'
  );

  assertNoRequiredLocalReferencesRemain(html);

  const banner = [
    '<!--',
    '  نسخه مستقل تولیدشده به‌صورت خودکار؛ این فایل را دستی ویرایش نکنید.',
    '  منبع اصلی: index.html + index.css + sections-loader.js + همه فایل‌های HTML/CSS/JS سکشن‌ها + settings/backup-validation.js + settings/backup-engine.js + settings/backup-folder.js + settings/backup-restore.js + settings/settings.js + index.js + vendor/xlsx.full.min.js',
    '  برای ساخت مجدد اجرا کنید: node scripts/build-standalone.mjs',
    '-->',
    ''
  ].join('\n');

  html = banner + html.replace(/^\uFEFF/, '');

  assert(html.includes('<style>'), 'Embedded CSS was not found in generated output.');
  assert(html.includes('id="anbar-xlsx-script"'), 'Embedded SheetJS payload was not found.');
  assert(html.includes('id="anbar-app-script"'), 'Embedded application payload was not found.');
  assert(html.includes('id="anbar-entry-script"'), 'Embedded entry payload was not found.');
  assert(html.includes('id="anbar-inventory-script"'), 'Embedded inventory payload was not found.');
  assert(html.includes('id="anbar-admin-script"'), 'Embedded admin payload was not found.');
  assert(html.includes('id="anbar-kardex-script"'), 'Embedded kardex payload was not found.');
  assert(html.includes('id="anbar-reports-script"'), 'Embedded reports payload was not found.');
  assert(html.includes('id="anbar-backup-validation-script"'), 'Embedded backup validation payload was not found.');
  assert(html.includes('id="anbar-backup-engine-script"'), 'Embedded backup engine payload was not found.');
  assert(html.includes('id="anbar-backup-folder-script"'), 'Embedded backup folder payload was not found.');
  assert(html.includes('id="anbar-backup-restore-script"'), 'Embedded backup restore payload was not found.');
  assert(html.includes('id="anbar-settings-script"'), 'Embedded settings payload was not found.');
  assert((html.match(/<script(?:\s[^>]*)?>/gi) || []).length >= 1, 'Expected script loader was not found.');

  // Confirm the embedded payloads decode to the exact source files.
  assertPayloadMatches(html, 'anbar-xlsx-script', xlsxJs);
  assertPayloadMatches(html, 'anbar-app-script', appJs);
  assertPayloadMatches(html, 'anbar-entry-script', entryJs);
  assertPayloadMatches(html, 'anbar-inventory-script', inventoryJs);
  assertPayloadMatches(html, 'anbar-admin-script', adminJs);
  assertPayloadMatches(html, 'anbar-kardex-script', kardexJs);
  assertPayloadMatches(html, 'anbar-reports-script', reportsJs);
  assertPayloadMatches(html, 'anbar-backup-validation-script', backupValidationJs);
  assertPayloadMatches(html, 'anbar-backup-engine-script', backupEngineJs);
  assertPayloadMatches(html, 'anbar-backup-folder-script', backupFolderJs);
  assertPayloadMatches(html, 'anbar-backup-restore-script', backupRestoreJs);
  assertPayloadMatches(html, 'anbar-settings-script', settingsJsFile);

  await writeFile(OUTPUT_HTML, html, 'utf8');
  console.log('Standalone build successful: anbar-standalone.html');
  console.log('Embedded application, backup and settings JavaScript payloads match their source files exactly.');
  console.log('Output size: ' + Buffer.byteLength(html, 'utf8') + ' bytes');
}

main().catch(error => {
  console.error('Standalone build failed: ' + error.message);
  process.exitCode = 1;
});
