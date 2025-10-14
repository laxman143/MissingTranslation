# Missing Translation CLI

A powerful CLI tool to check for missing translation keys in your project. It compares translation files (e.g., en.json, es.json) and scans your HTML files for static text and translation pipe usages.

## Features

✅ **Smart HTML parsing** - Only text between HTML tags is considered  
✅ **Multiple translation pipes** - Support for any pipe (transloco, translate, i18n, etc.)  
✅ **Flexible file discovery** - Auto-find translation files or specify exact paths  
✅ **Key prefix support** - Handle namespaced translation keys  
✅ **Multi-project support** - Analyze multiple features in one command  
✅ **Detailed reporting** - Timestamped reports with line-by-line references  
✅ **CI/CD ready** - Exit codes for automated workflows  

## How It Works

- **Only text between HTML tags is considered.** All attributes, directives, and Angular syntaxes (e.g., `[attr]`, `(event)`, `#ref`, `*ngIf`, `i18n`, etc.) are ignored automatically.
- **Static text** (e.g., `<button>TEST</button>`) is flagged if not found in your translation files.
- **Translation pipe keys** (e.g., `<button>{{ 'key' | transloco }}</button>`) are extracted and checked for existence in your translation files.
- **Multi-line and indented text** between tags is supported.
- **Variable interpolations** (e.g., `{{ variable }}`) are ignored.
- **Root-level and feature-level grouping:** If you provide both a root path and sub-feature paths, the root scan will automatically skip sub-feature directories to avoid duplicate reporting.

## Installation

You can use this tool via npx (no install required):

```bash
npx missing-translation <args...> [options]

## Usage

### Basic Syntax

```bash
npx missing-translation <srcDir> <enFile> [options]
```

### Options

- `--key-prefix <prefix>` - Optional prefix to strip from translation keys
- `--pipe-name <name>` - Name of the translation pipe to look for (default: "transloco")
- `-h, --help` - Display help information

### Translation File Formats

The `<enFile>` parameter supports three formats:

1. **Filename only** (auto-discovery): `en.json`
   - Searches for the file in the `<srcDir>` directory tree
   
2. **Relative path**: `./i18n/en.json` or `i18n/en.json`
   - Resolves relative to current working directory
   
3. **Absolute path**: `/full/path/to/en.json`
   - Uses the exact path provided

### Multiple Groups Support

The CLI supports checking one or more translation groups in a single command. Each group consists of:

- `<srcDir>`: The directory to scan for HTML files (where translation keys are used)
- `<enFile>`: The source translation file (supports auto-discovery, relative, or absolute paths)
- `[--key-prefix <prefix>]`: (Optional) Prefix to strip from translation keys for this group
- `[--pipe-name <name>]`: (Optional) Translation pipe name (default: "transloco")

You can specify multiple groups in a single command:

```bash
npx missing-translation <srcDir1> <enFile1> [options] <srcDir2> <enFile2> [options]
```

If you omit other translation files, the tool will automatically find all other `.json` files in the same directory as `<enFile>` and compare them.

### Examples

#### 1. Simple usage with auto-discovery
```bash
# Auto-discovers en.json in the source directory
missing-translation ./src/app/customer en.json
```

#### 2. Custom translation pipe
```bash
# Uses 'translate' pipe instead of default 'transloco'
missing-translation ./src/app/customer en.json --pipe-name translate
```

#### 3. With key prefix
```bash
# Strips 'workflow.' prefix when checking keys
missing-translation ./src/app/customer en.json --key-prefix customer
```

#### 4. Relative path for translation file
```bash
# Uses relative path to translation file
missing-translation ./src/app/customer ./src/app/workflow/i18n/en.json
```

#### 5. Multiple groups with different configurations
```bash
# Analyze two different features with different settings
missing-translation \
  ./src/app/customer en.json --key-prefix customer --pipe-name transloco \
  ./src/app/product en.json --key-prefix product --pipe-name translate
```

#### 6. Root-level and feature-level grouping
```bash
# Root scan automatically skips subdirectories to avoid duplicates
missing-translation \
  ./src/app ./assets/i18n/en.json \
  ./src/app/customer ./assets/i18n/en.json \
  ./src/app/product ./assets/i18n/en.json
```

### Supported Translation Pipes

The tool can detect any translation pipe you specify:

- `{{ 'key' | transloco }}` (default)
- `{{ 'key' | translate }}`
- `{{ 'key' | i18n }}`
- `{{ 'key' | t }}`
- Any custom pipe name via `--pipe-name`


## Output

The tool generates comprehensive reports with detailed analysis:

### Report Structure

- **Terminal output**: Real-time progress and detailed findings
- **File output**: Timestamped report file (e.g., `missing-translations-report-2025-10-10_15-42-23.txt`)
- **Auto-editor**: Automatically opens the report in your preferred editor (Cursor, VS Code, etc.)

### Report Sections

Each group analysis includes:

1. **Group Information**
   ```
   ==== GROUP 1: ./src/app/customer ====
   i18nFile: src/app/customer/i18n/en.json
   keyPrefix: customer
   pipeName: transloco
   ```

2. **Missing Translation Structure**
   - Missing top-level objects
   - Missing keys compared to en.json

3. **Static Translations**
   ```
   ---- STATIC TRANSLATIONS ----
   Key: Untranslated Text
     - src/app/customer/component.html:15
   ```

4. **Translation Pipe Keys**
   ```
   **** TRANSLOCO PIPE KEYS ****
   Key: customer.buttons.save
     - src/app/customer/component.html:23
   ```

5. **Summary Statistics**
   ```
   >>>> SUMMARY <<<<
   Total missing static translations: 5
   Total missing transloco pipe keys: 3
   Total missing keys in other translation files: 2
   ```

### Multi-Group Reports

When analyzing multiple groups, you'll get:
- Individual group reports
- Global summary with totals across all groups
- Group-by-group breakdown

## Advanced Features

### Auto-Discovery
- **Translation files**: Automatically finds all `.json` files in the translation directory
- **File structure**: Intelligently searches directory trees for translation files
- **Editor detection**: Auto-opens reports in available editors (Cursor, VS Code, Sublime, etc.)

### Smart Parsing
- **Nested objects**: Flattens nested JSON structures into dot-notation keys
- **Object structure validation**: Detects mismatches between object/leaf key structures
- **Multi-line content**: Handles content spanning multiple lines in HTML
- **Template syntax**: Ignores Angular control flow and template expressions

### Configuration Options
- **Key prefixes**: Strip namespace prefixes for accurate matching
- **Custom pipes**: Support for any translation pipe naming convention
- **Directory exclusion**: Prevents duplicate analysis in nested project structures
- **Flexible paths**: Support for absolute, relative, and auto-discovered file paths

## CI/CD Integration

Perfect for automated workflows:

## CI/CD Integration

Perfect for automated workflows:

### Exit Codes
- Returns `0` if no missing translations are found
- Returns `1` if any missing translations are detected (suitable for CI/CD pipelines)

### GitHub Actions Example
```yaml
name: Check Translations
on: [push, pull_request]
jobs:
  translations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Check missing translations
        run: |
          npx missing-translation \
            ./src/app/customer en.json --key-prefix customer \
            ./src/app/product en.json --key-prefix product
```

## Troubleshooting

### Common Issues

**File not found errors:**
- Ensure translation files exist and paths are correct
- Use auto-discovery (`en.json`) if unsure about exact paths

**Keys not being detected:**
- Verify the pipe name matches your project (`--pipe-name translate`)
- Check if key prefixes need to be specified (`--key-prefix feature`)

**Unexpected results:**
- Review the generated report file for detailed line-by-line analysis
- Check for nested object structures in translation files

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Repository

GitHub: [https://github.com/laxman143/MissingTranslation](https://github.com/laxman143/MissingTranslation) 
