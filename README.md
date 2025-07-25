# Missing Translation CLI

A CLI tool to check for missing translation keys in your project. It compares translation files (e.g., en.json, es.json) and scans your HTML files for static text and Transloco pipe usages.

## How It Works

- **Only text between HTML tags is considered.** All attributes, directives, and Angular syntaxes (e.g., `[attr]`, `(event)`, `#ref`, `*ngIf`, `i18n`, etc.) are ignored automatically.
- **Static text** (e.g., `<button>TEST</button>`) is flagged if not found in your translation files.
- **Transloco keys** (e.g., `<button>{{ 'key' | transloco }}</button>`) are extracted and checked for existence in your translation files.
- **Multi-line and indented text** between tags is supported.
- **Variable interpolations** (e.g., `{{ variable }}`) are ignored.
- **Root-level and feature-level grouping:** If you provide both a root path and sub-feature paths, the root scan will automatically skip sub-feature directories to avoid duplicate reporting.

## Installation

You can use this tool via npx (no install required):

```
npx missingtranslation <args...> [--key-prefix <prefix>]
```

## Usage

The CLI supports checking one or more translation groups in a single command. Each group consists of:

- `<srcDir>`: The directory to scan for HTML files (where translation keys are used)
- `<enFile>`: The source translation file (e.g., en.json)
- `[otherFiles...]`: (Optional) Other translation files to compare (e.g., es.json, de.json)
- `[--key-prefix <prefix>]`: (Optional) Prefix to strip from translation keys for this group

You can specify multiple groups in a single command. Each group is parsed as:

```
<srcDir> <enFile> [otherFiles...] [--key-prefix <prefix>]
```

If you omit `[otherFiles...]`, the tool will automatically find all other `.json` files in the same directory as `<enFile>` and compare them.

### Examples

#### 1. Single feature, auto-discover
```
npx missingtranslation src/client src/client/i18n/en.json
```
- Compares `en.json` to all other `.json` files in the same folder
- Scans `src/client` for HTML usages

#### 2. Multiple features, auto-discover
```
npx missingtranslation src/client/feature src/client/feature/asset.en.json src/client/feature2 src/client/feature2/asset.en.json
```
- For each group, compares `en.json` to all other `.json` files in the same folder
- Scans the corresponding `srcDir` for HTML usages

#### 3. Prefix support (per group)
```
npx missingtranslation src/client src/client/i18n/en.json --key-prefix myPrefix. src/client/feature src/client/feature/en.json --key-prefix featurePrefix.
```
- Strips the given prefix from translation keys when checking for their existence (per group)

#### 4. Root-level and feature-level grouping
```
npx missingtranslation src/app src/assets/i18n/en.json src/app/customer src/assets/i18n/en.json src/app/product src/assets/i18n/en.json
```
- The scan for `src/app` will automatically skip `src/app/customer` and `src/app/product` to avoid duplicate reporting.


## Output

- The tool prints a detailed report to the terminal and saves it as a timestamped file (e.g., `missing-translations-report-YYYY-MM-DD_HH-MM-SS.txt`).
- If you run with a single group, the report is simple and focused on that group.
- If you run with multiple groups, the report contains a section for each group and a global summary at the end.
- **Report formatting:**
  - Each group is numbered and uses unique dividers:
    - `==== GROUP X ====`
    - `---- STATIC TRANSLATIONS ----`
    - `**** TRANLOCO PIPE KEYS ****`
    - `>>>> SUMMARY <<<<`

## Exit Codes

- Returns `0` if no missing translations are found.
- Returns `1` if any missing translations are detected (suitable for CI/CD pipelines).

## License
MIT 
