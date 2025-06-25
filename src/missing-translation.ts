#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';

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
  enFile: string
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
    console.log('Flattened en.json keys:', Object.keys(enTranslations));
    console.log('en.json object keys:', Array.from(enObjectKeys));
    console.log('en.json top-level objects:', Array.from(enTopLevelObjects));
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
        console.log(`Flattened keys for ${file}:`, Object.keys(translations));
        console.log(`${file} object keys:`, Array.from(objectKeys));
        console.log(`${file} top-level objects:`, Array.from(topLevelObjects));
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
      // Remove HTML comments before processing lines
      content = content.replace(/<!--[\s\S]*?-->/g, '');
      const lines = content.split(/\r?\n/);
      // Find static text and transloco keys with line numbers
      const staticTextOccurrences: { key: string, line: number }[] = [];
      const translocoKeyOccurrences: { key: string, line: number }[] = [];
      lines.forEach((line, idx) => {
        // Static text between > and <
        Array.from(line.matchAll(/>([^<>{{\[]*?)</g)).forEach(m => {
          const key = m[1].trim();
          if (key && !isNumericOnly(key) && !isIgnorableHtmlEntity(key)) {
            staticTextOccurrences.push({ key: stripQuotes(key), line: idx + 1 });
          }
        });
        // Transloco pipe keys (support both single and double quotes)
        Array.from(line.matchAll(/{{\s*['"]([^'"]+)['"]\s*\|\s*transloco\s*}}/g)).forEach(m => {
          translocoKeyOccurrences.push({ key: stripQuotes(m[1]), line: idx + 1 });
        });
      });
      // Debug: Show each key being checked from HTML
      translocoKeyOccurrences.forEach(({ key, line }) => {
        console.log(`Checking transloco key from HTML (${filepath}:${line}):`, key);
      });
      // Check missing static text
      for (const { key, line } of staticTextOccurrences) {
        let isTranslated = false;
        for (const keys of Object.values(allTranslations)) {
          if (keys.has(key)) {
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
        if (key.includes('.')) {
          // Debug: Show all flattened en.json keys
          if (filepath && line === 1) {
            console.log('Flattened en.json keys:', Object.keys(allTranslations[enFile] || {}));
          }
          let isTranslated = false;
          for (const keys of Object.values(allTranslations)) {
            if (keys.has(key)) {
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

// CLI
function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 3) {
    console.log('Usage: missing-translation <rootDir> <enFile> <translationFile1> [translationFile2 ...]');
    process.exit(1);
  }
  const [rootDir, enFile, ...translationFiles] = argv;
  const files = [enFile, ...translationFiles];
  try {
    const result = findMissingTranslations(rootDir, files, enFile);
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
      reportContent += '\n\nMISSING TRANSLATION STRUCTURE (compared to en.json):\n';
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
    reportContent += `Total missing transloco pipe keys: ${totalMissingTransloco}\n`;
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
    console.log('\nSummary:');
    console.log(`  Total missing static translations: ${totalMissingStatic}`);
    console.log(`  Total missing transloco pipe keys: ${totalMissingTransloco}`);
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
      console.log('\nMissing Transloco Pipe Keys (clickable links):');
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

// Helper function to check if text is numeric-only or contains only digits, operators, and spaces
function isNumericOnly(text: string): boolean {
  // Remove all whitespace
  const trimmed = text.replace(/\s+/g, '');
  // Check if the text contains only digits, operators, and common mathematical symbols
  const numericPattern = /^[\d+\-*/().><=!&\|]+$/;
  // Also check if it's just multiple digits (like "123", "456", etc.)
  const onlyDigitsPattern = /^\d+$/;
  // Check for special characters and symbols that are typically not translated
  const specialCharPattern = /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+$/;
  // Check for patterns like "---", "___", "***" etc. (improved to catch more variations)
  const repeatedCharPattern = /^[-_*#=+~`]{2,}$|^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]{2,}$/;
  // Check for common non-translatable patterns (emails, URLs, etc.)
  const nonTranslatablePattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$|^https?:\/\/|^www\.|^[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;
  
  return numericPattern.test(trimmed) || 
         onlyDigitsPattern.test(trimmed) || 
         specialCharPattern.test(trimmed) || 
         repeatedCharPattern.test(trimmed) ||
         nonTranslatablePattern.test(trimmed);
}

// Helper function to check if text is an ignorable HTML entity
function isIgnorableHtmlEntity(text: string): boolean {
  // Ignore &nbsp;, &nbsp, and any other HTML entity if needed
  return /^&nbsp;?$/i.test(text.trim());
}

if (require.main === module) {
  main();
}