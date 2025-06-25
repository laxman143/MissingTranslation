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
      // Handle both single-line and multi-line expressions
      const contentWithoutExpressions = content
        .replace(/\{\{[^}]*\}\}/g, '') // Single-line expressions
        .replace(/\{\{[\s\S]*?\}\}/g, ''); // Multi-line expressions
      
      // Remove HTML comments to avoid processing them as static text
      const contentWithoutComments = contentWithoutExpressions.replace(/<!--[\s\S]*?-->/g, '');
      
      // Remove complex Angular template attributes that span multiple lines
      // This handles *ngIf, *ngFor, and other structural directives with complex conditions
      const contentWithoutComplexAttributes = contentWithoutComments
        .replace(/\s+\*ngIf\s*=\s*"[^"]*"/g, '') // Single-line *ngIf
        .replace(/\s+\*ngIf\s*=\s*'[^']*'/g, '') // Single-line *ngIf with single quotes
        .replace(/\s+\*ngFor\s*=\s*"[^"]*"/g, '') // Single-line *ngFor
        .replace(/\s+\*ngFor\s*=\s*'[^']*'/g, '') // Single-line *ngFor with single quotes
        // Handle multi-line structural directives by removing the entire attribute block
        .replace(/\s+\*ngIf\s*=\s*"[^"]*[\s\S]*?"/g, '') // Multi-line *ngIf with double quotes
        .replace(/\s+\*ngIf\s*=\s*'[^']*[\s\S]*?'/g, '') // Multi-line *ngIf with single quotes
        .replace(/\s+\*ngFor\s*=\s*"[^"]*[\s\S]*?"/g, '') // Multi-line *ngFor with double quotes
        .replace(/\s+\*ngFor\s*=\s*'[^']*[\s\S]*?'/g, '') // Multi-line *ngFor with single quotes
        // Handle Angular's new control flow syntax (@if, @for) - only remove the directive lines
        .replace(/^\s*@if\s*\([^)]*\)\s*\{/gm, '') // @if directive line
        .replace(/^\s*@for\s*\([^)]*\)\s*\{/gm, '') // @for directive line
        .replace(/^\s*@else\s*\{/gm, '') // @else directive line
        .replace(/^\s*@else\s+if\s*\([^)]*\)\s*\{/gm, ''); // @else if directive line
      
      // Remove all attribute assignments (including multi-line, greedy)
      // Handles *ngIf, *ngFor, @if, @for, and all other attributes
      const contentWithoutAttributes = contentWithoutComplexAttributes
        .replace(/\s+[^\s=>\/]+=(['"])[\s\S]*?\1/g, '');
      
      const staticTextMatches = Array.from(contentWithoutAttributes.matchAll(/>([^<>{{\[]*?)</g));
      const staticText = new Set(
        staticTextMatches
          .map((m) => m[1].trim())
          .filter((t) => t && !isNumericOnly(t) && !isIgnorableHtmlEntity(t))
      );
      
      // Also find text content within HTML tags more accurately (but exclude expressions and attributes)
      const htmlTextMatches = Array.from(contentWithoutAttributes.matchAll(/<[^>]*>([^<]*?)<\/[^>]*>/g));
      const htmlText = new Set(
        htmlTextMatches
          .map((m) => m[1].trim())
          .filter((t) => t && !isNumericOnly(t) && !isIgnorableHtmlEntity(t))
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
    
    // Report missing keys compared to en.json
    if (Object.keys(missingKeysEn).length > 0) {
      reportContent += 'MISSING KEYS COMPARED TO EN.JSON:\n';
      reportContent += '=============================================================\n';
      for (const file in missingKeysEn) {
        reportContent += `\n${file}:\n`;
        for (const key of missingKeysEn[file]) {
          reportContent += `  - ${key}\n`;
        }
      }
    } else {
      reportContent += 'No missing keys found compared to en.json (excluding object-like keys).\n';
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