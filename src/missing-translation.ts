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
}

function findMissingTranslations(
  rootDir: string,
  translationFiles: string[],
  enFile: string
): Result {
  // Part 1: Find missing keys compared to en.json (excluding object-like keys)
  let enTranslations: Record<string, any> = {};
  let enKeys: Set<string> = new Set();
  try {
    enTranslations = JSON.parse(fs.readFileSync(enFile, 'utf-8'));
    enKeys = new Set(Object.keys(enTranslations));
  } catch (e) {
    console.error(`Error: English translation file not found or invalid: ${enFile}`);
    process.exit(1);
  }

  const missingKeysEn: Record<string, string[]> = {};
  let totalMissingKeysEn = 0;

  for (const file of translationFiles) {
    if (file !== enFile) {
      let translations: Record<string, any> = {};
      let keys: Set<string> = new Set();
      try {
        translations = JSON.parse(fs.readFileSync(file, 'utf-8'));
        keys = new Set(Object.keys(translations));
      } catch (e) {
        console.error(`Error: Translation file not found or invalid: ${file}`);
        continue;
      }
      const enKeysFiltered = new Set(Array.from(enKeys).filter((key) => !key.includes('.')));
      const keysFiltered = new Set(Array.from(keys).filter((key) => !key.includes('.')));
      const missing = Array.from(enKeysFiltered).filter((key) => !keysFiltered.has(key));
      if (missing.length > 0) {
        missingKeysEn[file] = missing;
        totalMissingKeysEn += missing.length;
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

  walk(rootDir, (filepath) => {
    if (filepath.endsWith('.html') && !filepath.endsWith('index.html')) {
      let content: string;
      try {
        content = fs.readFileSync(filepath, 'utf-8');
      } catch (e) {
        console.error(`Skipping file due to encoding error: ${filepath}`);
        return;
      }
      // Find static text - improved to better handle HTML content
      // First, remove all Angular template expressions to avoid processing them
      const contentWithoutExpressions = content.replace(/\{\{[^}]*\}\}/g, '');
      
      // Remove HTML comments to avoid processing them as static text
      const contentWithoutComments = contentWithoutExpressions.replace(/<!--[\s\S]*?-->/g, '');
      
      // Also remove HTML attributes to avoid processing them as static text
      // This handles both regular attributes and Angular template attributes
      const contentWithoutAttributes = contentWithoutComments
        .replace(/\s+[a-zA-Z\-\[\]]+="[^"]*"/g, '') // Regular attributes
        .replace(/\s+\[[^\]]+\]="[^"]*"/g, '') // Angular template attributes like [routerLink]
        .replace(/\s+\([^)]+\)="[^"]*"/g, '') // Angular event attributes like (click)
        .replace(/\s+[a-zA-Z\-\[\]]+='[^']*'/g, '') // Attributes with single quotes
        .replace(/\s+\[[^\]]+\]='[^']*'/g, '') // Angular template attributes with single quotes
        .replace(/\s+\([^)]+\)='[^']*'/g, ''); // Angular event attributes with single quotes
      
      const staticTextMatches = Array.from(contentWithoutAttributes.matchAll(/>([^<>{{\[]*?)</g));
      const staticText = new Set(
        staticTextMatches
          .map((m) => m[1].trim())
          .filter((t) => t && !isNumericOnly(t))
      );
      
      // Also find text content within HTML tags more accurately (but exclude expressions and attributes)
      const htmlTextMatches = Array.from(contentWithoutAttributes.matchAll(/<[^>]*>([^<]*?)<\/[^>]*>/g));
      const htmlText = new Set(
        htmlTextMatches
          .map((m) => m[1].trim())
          .filter((t) => t && !isNumericOnly(t))
      );
      
      // Combine both sets
      const allStaticText = new Set([...staticText, ...htmlText]);
      // Find transloco pipe keys
      const translocoMatches = Array.from(content.matchAll(/{{\s*'([^']+)'\s*\|\s*transloco\s*}}/g));
      const translocoKeys = new Set(translocoMatches.map((m) => m[1]));
  
      // Check missing static text
      for (const key of allStaticText) {
        let isTranslated = false;
        for (const keys of Object.values(allTranslations)) {
          if (keys.has(key)) {
            isTranslated = true;
            break;
          }
        }
        if (!isTranslated) {
          if (!missingTranslationsHtml[key]) missingTranslationsHtml[key] = [];
          missingTranslationsHtml[key].push(filepath);
          totalMissingStatic++;
        }
      }
      // Check missing transloco keys
      for (const key of translocoKeys) {
        if (key.includes('.')) continue;
        let isTranslated = false;
        for (const keys of Object.values(allTranslations)) {
          if (keys.has(key)) {
            isTranslated = true;
            break;
          }
        }
        if (!isTranslated) {
          if (!missingTranslocoKeys[key]) missingTranslocoKeys[key] = [];
          missingTranslocoKeys[key].push(filepath);
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
    } = result;
    if (Object.keys(missingKeysEn).length > 0) {
      console.log('Missing Keys Compared to en.json (excluding object-like keys):');
      for (const file in missingKeysEn) {
        console.log(`  ${file}:`);
        for (const key of missingKeysEn[file]) {
          console.log(`    - ${key}`);
        }
      }
    } else {
      console.log('No missing keys found compared to en.json (excluding object-like keys).');
    }
    if (Object.keys(missingTranslationsHtml).length > 0) {
      console.log('\nMissing Static Translations in HTML Files:');
      for (const key in missingTranslationsHtml) {
        console.log(`  Key: ${key}`);
        for (const file of missingTranslationsHtml[key]) {
          console.log(`    - ${file}`);
        }
      }
    } else {
      console.log('\nNo missing static translations found in HTML files.');
    }
    if (Object.keys(missingTranslocoKeys).length > 0) {
      console.log('\nMissing Word which is not in translation file and showing in HTML:');
      for (const key in missingTranslocoKeys) {
        console.log(`  Key: ${key}`);
        for (const file of missingTranslocoKeys[key]) {
          console.log(`    - ${file}`);
        }
      }
    } else {
      console.log('\nNo missing transloco pipe keys found in HTML files.');
    }
    console.log('\nSummary:');
    console.log(`  Total missing static translations: ${totalMissingStatic}`);
    console.log(`  Total missing Word which is not in translation file: ${totalMissingTransloco}`);
    console.log(`  Total missing keys in other translation files compared to en.json: ${totalMissingKeysEn}`);
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

if (require.main === module) {
  main();
}