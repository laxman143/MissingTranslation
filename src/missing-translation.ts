#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';

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

function findMissingTranslations(
  rootDir: string,
  translationFiles: string[],
  enFile: string,
  keyPrefix?: string
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

  function walk(dir: string, callback: (filePath: string) => void) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  }

  // Helper to strip quotes from a key
  // Removes leading and trailing single or double quotes from a string
  function stripQuotes(key: string): string {
    return key.replace(/^['"]|['"]$/g, '');
  }

  walk(rootDir, (filepath) => {
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

      // --- Static text extraction ---
      // For each line, extract visible static text between > and <
      // Ignore if it contains Angular expressions ({{ ... }}) or is numeric/expression
      lines.forEach((line, idx) => {
        // For each match of static text between > and <
        Array.from(line.matchAll(/>([^<>{{\[]*?)</g)).forEach(m => {
          let key = m[1].trim();
          key = stripQuotes(key);
          // Ignore if the static text contains Angular expressions
          if (key.includes('{{') || key.includes('}}')) return;
          // Ignore if the static text is a number, logic, or JS-like expression
          if (key && !isNumericOnly(key) && !isIgnorableHtmlEntity(key)) {
            staticTextOccurrences.push({ key, line: idx + 1 });
          }
        });
        // --- Transloco key extraction ---
        // For each match of a transloco key in the form {{ 'key' | transloco }} or {{ "key" | transloco }}
        Array.from(line.matchAll(/{{\s*['"]([^'\"]+)['"]\s*\|\s*transloco\s*}}/g)).forEach(m => {
          let key = m[1].trim();
          key = stripQuotes(key);
          // Ignore if the key is a number, logic, or JS-like expression
          if (key && !isNumericOnly(key)) {
            translocoKeyOccurrences.push({ key, line: idx + 1 });
          }
        });
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
  });

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
  .argument('<srcDir>', 'Source directory to scan for translation keys')
  .argument('<enFile>', 'Source translation file (e.g., en.json)')
  .argument('[otherFiles...]', 'Other translation files to compare')
  .option('--key-prefix <prefix>', 'Optional prefix to strip from translation keys')
  .parse(process.argv);

const [srcDir, enFile, ...otherFiles] = program.args;
const options = program.opts();
const keyPrefix = options.keyPrefix || undefined;

// CLI
function main() {
  const files = [enFile, ...otherFiles];
  try {
    const result = findMissingTranslations(srcDir, files, enFile, keyPrefix);
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

    // Generate detailed report
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    const reportFileName = `missing-translations-report-${timestamp}.txt`;
    
    let reportContent = 'MISSING TRANSLATIONS REPORT\n';
    reportContent += '==========================\n\n';
    
    // Combine missing top-level objects and missing keys into a single summary section
    if (Object.keys(missingTopLevelObjects).length > 0 || Object.keys(missingKeysEn).length > 0) {
      reportContent += '\n\nMISSING TRANSLATION STRUCTURE (compared to source json file like en.json):\n';
      reportContent += '====================================================\n';
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
    
    // Report missing static translations
    if (Object.keys(missingTranslationsHtml).length > 0) {
      reportContent += '\n\nMISSING STATIC TRANSLATIONS IN HTML FILES:\n';
      reportContent += '===========================================\n';
      for (const key in missingTranslationsHtml) {
        reportContent += `\nKey: ${key}\n`;
        for (const file of missingTranslationsHtml[key]) {
          reportContent += `  - ${file}\n`;
        }
      }
    } else {
      reportContent += '\nNo missing static translations found in HTML files.\n';
    }
    
    // Report missing transloco keys
    if (Object.keys(missingTranslocoKeys).length > 0) {
      reportContent += '\n\nMISSING TRANLOCO PIPE KEYS:\n';
      reportContent += '===========================\n';
      for (const key in missingTranslocoKeys) {
        reportContent += `\nKey: ${key}\n`;
        for (const file of missingTranslocoKeys[key]) {
          reportContent += `  - ${file}\n`;
        }
      }
    } else {
      reportContent += '\nNo missing transloco pipe keys found in HTML files.\n';
    }
    
    // Add summary to report
    reportContent += '\n\nSUMMARY:\n';
    reportContent += '========\n';
    reportContent += `Total missing static translations: ${totalMissingStatic}\n`;
    reportContent += `Total missing transloco pipe keys in translation json file: ${totalMissingTransloco}\n`;
    reportContent += `Total missing keys in other translation files compared to en.json: ${totalMissingKeysEn}\n`;
    reportContent += `\nReport generated on: ${new Date().toLocaleString()}\n`;
    
    // Save report to file
    const currentDir = process.cwd();
    const fullPath = path.join(currentDir, reportFileName);
    
    try {
      fs.writeFileSync(fullPath, reportContent, 'utf-8');
      console.log(`\nReport saved successfully to: ${fullPath}`);
    } catch (error) {
      console.error(`Error saving report: ${error}`);
      // Fallback: try to save in current directory with a simpler name
      const fallbackFileName = `missing-translations-report.txt`;
      try {
        fs.writeFileSync(fallbackFileName, reportContent, 'utf-8');
        console.log(`\nReport saved to fallback location: ${fallbackFileName}`);
      } catch (fallbackError) {
        console.error(`Failed to save report: ${fallbackError}`);
      }
    }
    
    // Only show summary in terminal
    console.log('\nSummary 13:');
    console.log(`  Total missing static translations: ${totalMissingStatic}`);
    console.log(`  Missing Transloco Pipe Keys in translation json file: ${totalMissingTransloco}`);
    console.log(`  Total missing keys in other translation files compared to en.json: ${totalMissingKeysEn}`);
    console.log(`\nDetailed report saved to: ${reportFileName}`);

    // Print the same grouped summary for missing top-level objects and missing keys as in the report
    if (Object.keys(missingTopLevelObjects).length > 0 || Object.keys(missingKeysEn).length > 0) {
      console.log('\nMISSING TRANSLATION STRUCTURE (compared to en.json):');
      console.log('====================================================');
      const allFiles = new Set([
        ...Object.keys(missingTopLevelObjects),
        ...Object.keys(missingKeysEn)
      ]);
      for (const file of allFiles) {
        console.log(`\n${file}:`);
        if (missingTopLevelObjects[file] && missingTopLevelObjects[file].length > 0) {
          console.log('  Missing top-level objects:');
          for (const key of missingTopLevelObjects[file]) {
            console.log(`    - ${key}`);
          }
        }
        if (missingKeysEn[file] && missingKeysEn[file].length > 0) {
          console.log('  Missing keys:');
          for (const key of missingKeysEn[file]) {
            console.log(`    - ${key}`);
          }
        }
      }
    } else {
      console.log('\nNo missing top-level objects or keys found compared to en.json.');
    }

    // Print clickable links for missing static translations
    if (Object.keys(missingTranslationsHtml).length > 0) {
      console.log('\nMissing Static Translations (clickable links):');
      for (const key in missingTranslationsHtml) {
        for (const fileLine of missingTranslationsHtml[key]) {
          console.log(`  ${fileLine}  [Key: ${key}]`);
        }
      }
    }
    // Print clickable links for missing transloco keys
    if (Object.keys(missingTranslocoKeys).length > 0) {
      console.log('\nMissing Transloco Pipe Keys in translation json file  (clickable links):');
      for (const key in missingTranslocoKeys) {
        for (const fileLine of missingTranslocoKeys[key]) {
          console.log(`  ${fileLine}  [Key: ${key}]`);
        }
      }
    }
    
    // List all report files in current directory
    try {
      const files = fs.readdirSync(currentDir);
      const reportFiles = files.filter(file => file.startsWith('missing-translations-report'));
      if (reportFiles.length > 0) {
        console.log('\nAvailable report files in current directory:');
        reportFiles.forEach(file => {
          const filePath = path.join(currentDir, file);
          const stats = fs.statSync(filePath);
          console.log(`  - ${file} (${stats.size} bytes, created: ${stats.mtime.toLocaleString()})`);
        });
      }
    } catch (listError) {
      console.log('\nCould not list report files in directory');
    }
    
    console.log('Script completed successfully. Exit code: 0');
  } catch (e: any) {
    console.error(`An error occurred: ${e.message}`);
    console.log('Script failed. Exit code: 1');
    process.exit(1);
  }
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
  main();
}