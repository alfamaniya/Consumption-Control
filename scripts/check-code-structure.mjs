#!/usr/bin/env node
/**
 * بررسی ساختاری فایل‌های منبع پروژه:
 * - جفت بودن پرانتزها، آکولادها و کوتیشن‌ها از طریق parser زبان
 * - صحت نحوی JavaScript با node --check
 * - صحت ساختار CSS با PostCSS
 *
 * فایل‌های تولیدی و وابستگی‌های vendor عمداً بررسی نمی‌شوند.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const postcss = require("postcss");
const root = process.cwd();
const sourceDirs = ["admin", "dashboard", "entry", "inventory", "kardex", "reports", "settings", "tag-explorer"];
const sourceFiles = ["index.js", "sections-loader.js"];
const failures = [];

function collect(dir) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collect(relative));
    else if (/\.(?:js|css)$/.test(entry.name)) result.push(relative);
  }
  return result;
}

const files = [
  ...sourceFiles,
  ...sourceDirs.flatMap(collect),
  ...collect("scripts").filter(file => file.endsWith(".mjs"))
];

for (const file of files) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, "utf8");

  if (/\.(?:js|mjs)$/.test(file)) {
    const check = spawnSync(process.execPath, ["--check", fullPath], { encoding: "utf8" });
    if (check.status !== 0) {
      failures.push({ file, message: (check.stderr || check.stdout).trim() });
      continue;
    }
    console.log(`✓ JavaScript: ${file}`);
  } else if (file.endsWith(".css")) {
    try {
      postcss.parse(source, { from: file });
      console.log(`✓ CSS: ${file}`);
    } catch (error) {
      failures.push({
        file,
        message: `خط ${error.line ?? "؟"}، ستون ${error.column ?? "؟"}: ${error.reason}`
      });
    }
  }
}

if (failures.length) {
  console.error("\nخطاهای ساختاری پیدا شد:");
  for (const failure of failures) {
    console.error(`\n✗ ${failure.file}\n  ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nبررسی نحوی ${files.length} فایل JavaScript و CSS موفق بود.`);
}
