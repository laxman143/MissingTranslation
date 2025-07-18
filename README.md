# Missing Translation CLI

A CLI tool to check for missing translation keys in your project. It compares translation files (e.g., en.json, es.json) and scans your HTML files for static text and Transloco pipe usages.

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

You can specify multiple groups in a single command. Each group is parsed as:

```
<srcDir> <enFile> [otherFiles...]
```

If you omit `[otherFiles...]`, the tool will automatically find all other `.json` files in the same directory as `<enFile>` and compare them.

### Examples

#### 1. Single feature, explicit files
```
npx missingtranslation src/client src/client/i18n/en.json src/client/i18n/es.json src/client/i18n/de.json
```
- Compares `en.json` to `es.json` and `de.json`
- Scans `src/client` for HTML usages

#### 2. Single feature, auto-discover
```
npx missingtranslation src/client src/client/i18n/en.json
```
- Compares `en.json` to all other `.json` files in the same folder
- Scans `src/client` for HTML usages

#### 3. Multiple features, auto-discover
```
npx missingtranslation src/client/feature src/client/feature/asset.en.json src/client/feature2 src/client/feature2/asset.en.json
```
- For each group, compares `en.json` to all other `.json` files in the same folder
- Scans the corresponding `srcDir` for HTML usages

#### 4. Multiple features, explicit files
```
npx missingtranslation src/client/feature src/client/feature/asset.en.json src/client/feature/asset.de.json src/client/feature2 src/client/feature2/asset.en.json src/client/feature2/asset.es.json
```
- For each group, compares `en.json` to the specified files only
- Scans the corresponding `srcDir` for HTML usages

#### 5. Prefix support
```
npx missingtranslation src/client src/client/i18n/en.json --key-prefix myPrefix.
```
- Strips `myPrefix.` from translation keys when checking for their existence

## Output

- The tool prints a detailed report to the terminal and saves it as a timestamped file (e.g., `missing-translations-report-YYYY-MM-DD_HH-MM-SS.txt`).
- If you run with a single group, the report is simple and focused on that group.
- If you run with multiple groups, the report contains a section for each group and a global summary at the end.

## Exit Codes

- Returns `0` if no missing translations are found.
- Returns `1` if any missing translations are detected (suitable for CI/CD pipelines).

## License
MIT 
