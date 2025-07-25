#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { exec, execSync } from 'child_process';

interface Result {
  missingKeysEn: Record<string, string[]>;
  missingTranslationsHtml: Record<string, string[]>;
  missingTranslocoKeys: Record<string, string[]>;
  totalMissingStatic: number;
  totalMissingTransloco: number;
  totalMissingKeysEn: number;
  objectKeyMismatches: Record<string, string[]>;
  missingTopLevelObjects: Record<string, string[]>;
}

// Helper function to flatten nested objects into dot-separated keys and track object keys
function flattenObject(obj: any, prefix = '', objectKeys = new Set<string>()): { flat: Record<string, any>, objectKeys: Set<string> } {
  let result: Record<string, any> = {};
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      objectKeys.add(newKey);
      const { flat, objectKeys: childObjectKeys } = flattenObject(value, newKey, objectKeys);
      Object.assign(result, flat);
      childObjectKeys.forEach(k => objectKeys.add(k));
    } else {
      result[newKey] = value;
    }
  }
  return { flat: result, objectKeys };
}

// Move walk function to top-level so it can be used in findMissingTranslations
function walk(dir: string, callback: (filePath: string) => void, excludeDirs: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    // If this directory is in the exclude list, skip it
    if (entry.isDirectory() && excludeDirs.includes(path.resolve(fullPath))) {
      continue;
    }
    if (entry.isDirectory()) {
      walk(fullPath, callback, excludeDirs);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function findMissingTranslations(
  rootDir: string,
  translationFiles: string[],
  enFile: string,
  keyPrefix?: string,
  excludeDirs: string[] = []
): Result {
  // Part 1: Find missing keys compared to en.json (excluding object-like keys)
  let enTranslations: Record<string, any> = {};
  let enKeys: Set<string> = new Set();
  let enTopLevelObjects: Set<string> = new Set();
  let enObjectKeys: Set<string> = new Set();
  try {
    const enRaw = JSON.parse(fs.readFileSync(enFile, 'utf-8'));
    for (const key in enRaw) {
      if (typeof enRaw[key] === 'object' && enRaw[key] !== null && !Array.isArray(enRaw[key])) {
        enTopLevelObjects.add(key);
      }
    }
    const enResult = flattenObject(enRaw);
    enTranslations = enResult.flat;
    enKeys = new Set(Object.keys(enTranslations));
    enObjectKeys = enResult.objectKeys;
  } catch (e) {
    console.error(`Error: English translation file not found or invalid: ${enFile}`);
    process.exit(1);
  }

  const missingKeysEn: Record<string, string[]> = {};
  const objectKeyMismatches: Record<string, string[]> = {};
  const missingTopLevelObjects: Record<string, string[]> = {};
  let totalMissingKeysEn = 0;

  for (const file of translationFiles) {
    if (file !== enFile) {
      let translations: Record<string, any> = {};
      let keys: Set<string> = new Set();
      let objectKeys: Set<string> = new Set();
      let topLevelObjects: Set<string> = new Set();
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        for (const key in raw) {
          if (typeof raw[key] === 'object' && raw[key] !== null && !Array.isArray(raw[key])) {
            topLevelObjects.add(key);
          }
        }
        const result = flattenObject(raw);
        translations = result.flat;
        keys = new Set(Object.keys(translations));
        objectKeys = result.objectKeys;
      } catch (e) {
        console.error(`Error: Translation file not found or invalid: ${file}`);
        continue;
      }
      // Check for missing keys (only check leaf keys, not object keys)
      const missing = Array.from(enKeys)
        .filter((key) => !enObjectKeys.has(key)) // Only leaf keys
        .filter((key) => !keys.has(key));
      if (missing.length > 0) {
        missingKeysEn[file] = missing;
        totalMissingKeysEn += missing.length;
      }
      // Check for object key mismatches
      const objectMismatches: string[] = [];
      for (const objKey of enObjectKeys) {
        if (keys.has(objKey) && !objectKeys.has(objKey)) {
          objectMismatches.push(objKey + ' (should be object)');
        }
      }
      for (const objKey of objectKeys) {
        if (enKeys.has(objKey) && !enObjectKeys.has(objKey)) {
          objectMismatches.push(objKey + ' (should NOT be object)');
        }
      }
      if (objectMismatches.length > 0) {
        objectKeyMismatches[file] = objectMismatches;
      }
      // Check for missing top-level objects
      const missingObjects: string[] = [];
      for (const obj of enTopLevelObjects) {
        if (!topLevelObjects.has(obj)) {
          missingObjects.push(obj);
        }
      }
      if (missingObjects.length > 0) {
        missingTopLevelObjects[file] = missingObjects;
      }
    }
  }

  // Part 2: Find missing static translations in HTML files
  const missingTranslationsHtml: Record<string, string[]> = {};
  const missingTranslocoKeys: Record<string, string[]> = {};
  const allTranslations: Record<string, Set<string>> = { [enFile]: enKeys };
  for (const file of translationFiles) {
    if (file !== enFile) {
      try {
        const translations = JSON.parse(fs.readFileSync(file, 'utf-8'));
        allTranslations[file] = new Set(Object.keys(translations));
      } catch (e) {
        continue;
      }
    }
  }

  let totalMissingStatic = 0;
  let totalMissingTransloco = 0;

  // Helper to strip quotes from a key
  // Removes leading and trailing single or double quotes from a string
  function stripQuotes(key: string): string {
    return key.replace(/^['"]|['"]$/g, '');
  }

  // Generalized function to ignore Angular control flow and template syntax
  function isTemplateControlFlow(text: string): boolean {
    const trimmed = text.trim();
    // Ignore lines that start with @ and end with {
    if (/^@.*\{$/.test(trimmed)) return true;
    // Ignore lines that are just }
    if (trimmed === '}') return true;
    // Ignore lines that start with } and then @...{
    if (/^}\s*@.*\{$/.test(trimmed)) return true;
    // Ignore lines that are just symbols, whitespace, or braces
    if (/^[\s{}()=><!&|?:;.,'"\[\]-]*$/.test(trimmed)) return true;
    return false;
  }

  walk(rootDir, (filepath: string) => {
    if (filepath.endsWith('.html') && !filepath.endsWith('index.html')) {
      let content: string;
      try {
        content = fs.readFileSync(filepath, 'utf-8');
      } catch (e) {
        console.error(`Skipping file due to encoding error: ${filepath}`);
        return;
      }
      // Remove HTML comments but preserve line count by replacing with newlines
      // This ensures line numbers in the report match the original file
      content = content.replace(/<!--[\s\S]*?-->/g, (match) => {
        return match.replace(/[^\n]/g, '');
      });
      // Split file into lines for line-by-line processing
      const lines = content.split(/\r?\n/);
      // Arrays to store found static text and transloco keys with their line numbers
      const staticTextOccurrences: { key: string, line: number }[] = [];
      const translocoKeyOccurrences: { key: string, line: number }[] = [];

      // --- Robust static text and translation key extraction between tags ---
      let insideTag = false;
      let buffer = '';
      let bufferStartLine = 0;
      lines.forEach((line, idx) => {
        let i = 0;
        while (i < line.length) {
          if (!insideTag && line[i] === '>') {
            insideTag = true;
            buffer = '';
            bufferStartLine = idx;
            i++;
            continue;
          }
          if (insideTag && line[i] === '<') {
            // Process buffer
            const content = buffer.trim();
            // Only process if content contains at least one alphanumeric character and does not look like an attribute fragment
            if (
              content &&
              /[a-zA-Z0-9]/.test(content) && // must contain at least one letter or number
              !/^=/.test(content) && // does not start with '='
              !/>$/.test(content) && // does not end with '>'
              !/^([=><!{}\[\]"'\s:.()-]|d-none)+$/.test(content) // not just symbols/attribute syntax
            ) {
              // Check for transloco pipe (even across lines)
              const translocoMatch = content.match(/{{\s*['"]([^'\"]+)['"]\s*\|\s*transloco\s*}}/s);
              if (translocoMatch) {
                // Extract key and record as transloco key
                const key = translocoMatch[1].trim();
                translocoKeyOccurrences.push({ key, line: bufferStartLine + 1 });
              } else if (/{{.*}}/.test(content)) {
                // Ignore variable-only interpolation
              } else {
                // Treat as static text
                let key = content;
                key = stripQuotes(key);
                if (
                  key &&
                  !isNumericOnly(key) &&
                  !isIgnorableHtmlEntity(key) &&
                  !isTemplateControlFlow(key) // <-- Use the new function
                ) {
                  staticTextOccurrences.push({ key, line: bufferStartLine + 1 });
                }
              }
            }
            buffer = '';
            insideTag = false;
            i++;
            continue;
          }
          if (insideTag) {
            buffer += line[i];
          }
          i++;
        }
      });

      // Check missing static text
      for (const { key, line } of staticTextOccurrences) {
        let isTranslated = false;
        for (const keys of Object.values(allTranslations)) {
          if (keyExists(key, keys, keyPrefix)) {
            isTranslated = true;
            break;
          }
        }
        if (!isTranslated) {
          if (!missingTranslationsHtml[key]) missingTranslationsHtml[key] = [];
          missingTranslationsHtml[key].push(`${filepath}:${line}`);
          totalMissingStatic++;
        }
      }
      // Check missing transloco keys
      for (const { key, line } of translocoKeyOccurrences) {
        let isTranslated = false;
        let checkedKey = key;
        // If a prefix is provided, ensure it ends with a dot for matching
        let effectivePrefix = keyPrefix ? (keyPrefix.endsWith('.') ? keyPrefix : keyPrefix + '.') : undefined;
        // If the key starts with the (dot-appended) prefix, remove it ONCE from the start
        if (effectivePrefix && key.startsWith(effectivePrefix)) {
          checkedKey = key.slice(effectivePrefix.length);
        }
        for (const keys of Object.values(allTranslations)) {
          if (keys.has(checkedKey)) {
            isTranslated = true;
            break;
          }
        }
        if (!isTranslated) {
          if (!missingTranslocoKeys[key]) missingTranslocoKeys[key] = [];
          missingTranslocoKeys[key].push(`${filepath}:${line}`);
          totalMissingTransloco++;
        }
      }
    }
  }, excludeDirs);

  return {
    missingKeysEn,
    missingTranslationsHtml,
    missingTranslocoKeys,
    totalMissingStatic,
    totalMissingTransloco,
    totalMissingKeysEn,
    objectKeyMismatches,
    missingTopLevelObjects,
  };
}

// CLI setup
const program = new Command();
program
  .argument('<args...>', 'Groups of <srcDir> <enFile> [otherFiles...] for each feature')
  .option('--key-prefix <prefix>', 'Optional prefix to strip from translation keys')
  .parse(process.argv);

// Updated argument parsing for multiple groups with optional --key-prefix
const args = process.argv.slice(2);
interface Group {
  srcDir: string;
  i18nFile: string;
  keyPrefix?: string;
}
const groups: Group[] = [];
let i = 0;
while (i < args.length) {
  const srcDir = args[i];
  const i18nFile = args[i + 1];
  let keyPrefix: string | undefined = undefined;
  let next = i + 2;
  if (args[next] === '--key-prefix') {
    keyPrefix = args[next + 1];
    next += 2;
  }
  if (!srcDir || !i18nFile) {
    console.error('Error: Each group must have at least <srcDir> and <i18nFile>');
    process.exit(1);
  }
  groups.push({ srcDir, i18nFile, keyPrefix });
  i = next;
}

// Collect all group paths (absolute)
const allGroupPaths = groups.map(g => path.resolve(g.srcDir));

// Auto-detect editor (no env, no CLI param, always fallback to notepad)
function detectEditor(): string {
  const editors = [
    'cursor',
    'code',
    'subl',
    'nvim',
    'vim',
    'nano',
    'vi',
  ];
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  for (const editor of editors) {
    try {
      execSync(`${whichCmd} ${editor}`, { stdio: 'ignore' });
      return editor;
    } catch (e) {
      // Not found, try next
    }
  }
  // Always fallback to notepad
  return 'notepad';
}
const editorCli = detectEditor();

// Main logic: process each group
function main(): number {
  let overallExitCode = 0;
  let globalReportContent = '';
  let groupSummaries: string[] = [];
  let globalTotalMissingStatic = 0;
  let globalTotalMissingTransloco = 0;
  let globalTotalMissingKeysEn = 0;

  for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
    const { srcDir, i18nFile, keyPrefix } = groups[groupIdx];
    // Exclude all other group paths that are subdirectories of this srcDir
    const excludeDirs = allGroupPaths
      .filter(p => p !== path.resolve(srcDir) && p.startsWith(path.resolve(srcDir) + path.sep));
    // Determine files to compare (all JSONs in the i18nFile's directory)
    const enDir = path.dirname(i18nFile);
    const allJsonFiles = fs.readdirSync(enDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(enDir, f));
    const files = [i18nFile, ...allJsonFiles.filter(f => path.resolve(f) !== path.resolve(i18nFile))];
    const groupNumber = groupIdx + 1;
    let reportContent = '';
    reportContent += `\n==== GROUP ${groupNumber}: ${srcDir} ====`;
    reportContent += `\ni18nFile: ${i18nFile}`;
    reportContent += `\nkeyPrefix: ${keyPrefix ?? '(none)'}`;
    reportContent += `\nCompared files:\n`;
    for (const f of files) {
      reportContent += `  - ${f}\n`;
    }
    try {
      const result = findMissingTranslations(srcDir, files, i18nFile, keyPrefix, excludeDirs);
      const {
        missingKeysEn,
        missingTranslationsHtml,
        missingTranslocoKeys,
        totalMissingStatic,
        totalMissingTransloco,
        totalMissingKeysEn,
        objectKeyMismatches,
        missingTopLevelObjects,
      } = result;

      // Section: Missing top-level objects and keys
      if (Object.keys(missingTopLevelObjects).length > 0 || Object.keys(missingKeysEn).length > 0) {
        reportContent += '\n\n---- MISSING TRANSLATION STRUCTURE ----\n';
        const allFiles = new Set([
          ...Object.keys(missingTopLevelObjects),
          ...Object.keys(missingKeysEn)
        ]);
        for (const file of allFiles) {
          reportContent += `\n${file}:\n`;
          if (missingTopLevelObjects[file] && missingTopLevelObjects[file].length > 0) {
            reportContent += '  Missing top-level objects:\n';
            for (const key of missingTopLevelObjects[file]) {
              reportContent += `    - ${key}\n`;
            }
          }
          if (missingKeysEn[file] && missingKeysEn[file].length > 0) {
            reportContent += '  Missing keys:\n';
            for (const key of missingKeysEn[file]) {
              reportContent += `    - ${key}\n`;
            }
          }
        }
      } else {
        reportContent += '\nNo missing top-level objects or keys found compared to en.json.\n';
      }

      // Section: Static translations
      reportContent += '\n---- STATIC TRANSLATIONS ----\n';
      if (Object.keys(missingTranslationsHtml).length > 0) {
        for (const key in missingTranslationsHtml) {
          reportContent += `\nKey: ${key}\n`;
          for (const file of missingTranslationsHtml[key]) {
            reportContent += `  - ${file}\n`;
          }
        }
      } else {
        reportContent += '\nNo missing static translations found in HTML files.\n';
      }

      // Section: Transloco pipe keys
      reportContent += '\n**** TRANLOCO PIPE KEYS ****\n';
      if (Object.keys(missingTranslocoKeys).length > 0) {
        for (const key in missingTranslocoKeys) {
          reportContent += `\nKey: ${key}\n`;
          for (const file of missingTranslocoKeys[key]) {
            reportContent += `  - ${file}\n`;
          }
        }
      } else {
        reportContent += '\nNo missing transloco pipe keys found in HTML files.\n';
      }

      // Section: Summary
      reportContent += '\n>>>> SUMMARY <<<<\n';
      reportContent += `Total missing static translations: ${totalMissingStatic}\n`;
      reportContent += `Total missing transloco pipe keys in translation json file: ${totalMissingTransloco}\n`;
      reportContent += `Total missing keys in other translation files compared to en.json: ${totalMissingKeysEn}\n`;
      reportContent += `\nGroup report generated on: ${new Date().toLocaleString()}\n`;

      // Add to global report
      globalReportContent += reportContent;
      groupSummaries.push(`Group ${groupNumber}: ${srcDir}\n  Static: ${totalMissingStatic}, Pipe: ${totalMissingTransloco}, Keys: ${totalMissingKeysEn}`);
      globalTotalMissingStatic += totalMissingStatic;
      globalTotalMissingTransloco += totalMissingTransloco;
      globalTotalMissingKeysEn += totalMissingKeysEn;

      if (
        totalMissingStatic > 0 ||
        totalMissingTransloco > 0 ||
        totalMissingKeysEn > 0
      ) {
        overallExitCode = 1;
      }
    } catch (e: any) {
      reportContent += `\n\nERROR: ${e.message}\n`;
      overallExitCode = 1;
      globalReportContent += reportContent;
    }
  }

  // Add global summary only if more than one group
  let finalReport = '';
  if (groups.length > 1) {
    finalReport = 'MISSING TRANSLATIONS REPORT (ALL GROUPS)\n';
    finalReport += '========================================\n';
    finalReport += globalReportContent;
    finalReport += '\n\nGLOBAL SUMMARY:\n===============\n';
    for (const summary of groupSummaries) {
      finalReport += summary + '\n';
    }
    finalReport += '\nTOTALS ACROSS ALL GROUPS:\n';
    finalReport += `  Total missing static translations: ${globalTotalMissingStatic}\n`;
    finalReport += `  Total missing transloco pipe keys in translation json file: ${globalTotalMissingTransloco}\n`;
    finalReport += `  Total missing keys in other translation files compared to en.json: ${globalTotalMissingKeysEn}\n`;
    finalReport += `\nReport generated on: ${new Date().toLocaleString()}\n`;
  } else {
    finalReport = globalReportContent;
  }

  // Save report to file (same as before)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  const reportFileName = `missing-translations-report-${timestamp}.txt`;
  const currentDir = process.cwd();
  const fullPath = path.join(currentDir, reportFileName);
  try {
    fs.writeFileSync(fullPath, finalReport, 'utf-8');
    console.log(`\nReport saved successfully to: ${fullPath}`);
    if (!process.env.CI && process.stdout.isTTY) {
      exec(`${editorCli} "${fullPath}"`);
    }
  } catch (error) {
    console.error(`Error saving report: ${error}`);
    // Fallback: try to save in current directory with a simpler name
    const fallbackFileName = `missing-translations-report.txt`;
    try {
      fs.writeFileSync(fallbackFileName, finalReport, 'utf-8');
      console.log(`\nReport saved to fallback location: ${fallbackFileName}`);
      if (!process.env.CI && process.stdout.isTTY) {
        exec(`${editorCli} "${fallbackFileName}"`);
      }
    } catch (fallbackError) {
      console.error(`Failed to save report: ${fallbackError}`);
    }
  }

  // Print the same detailed report in the terminal
  console.log('\n===== FULL REPORT =====\n');
  console.log(finalReport);

  return overallExitCode;
}

// Improved isNumericOnly
// Returns true if the text is a number, math/logic expression, or JS-like expression
// Used to filter out numbers and expressions from translation key checks
function isNumericOnly(text: string): boolean {
  const trimmed = text.replace(/\s+/g, '');
  // Pure number (e.g., '123')
  if (/^\d+$/.test(trimmed)) return true;
  // Pure expression (e.g., '1+2', '3*4', '5>2')
  if (/^[\d+\-*/().><=!&|?:]+$/.test(trimmed)) return true;
  // Ternary or logical expressions (e.g., '1>0?4:5')
  if (/^\d+[\s><=!&|?:+\-*/().]*\d+$/.test(trimmed)) return true;
  // JS expression: contains only numbers, operators, spaces, and curly braces
  if (/^[\d\s+\-*/().><=!&|?:{}]+$/.test(text)) return true;
  return false;
}

// Helper function to check if text is an ignorable HTML entity
function isIgnorableHtmlEntity(text: string): boolean {
  // Ignore &nbsp;, &nbsp, and any other HTML entity if needed
  return /^&nbsp;?$/i.test(text.trim());
}

// Helper function to check if a key exists in translations, with optional prefix logic
function keyExists(key: string, keySet: Set<string>, prefix?: string): boolean {
  // Always check the key as written
  if (keySet.has(key)) return true;
  // If a prefix is provided and the key starts with it, also check without the prefix
  if (prefix && key.startsWith(prefix)) {
    const strippedKey = key.slice(prefix.length);
    if (keySet.has(strippedKey)) return true;
  }
  return false;
}

if (require.main === module) {
  const exitCode = main();
  process.exit(exitCode);
}