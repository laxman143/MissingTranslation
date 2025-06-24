# missing-translation

A CLI tool to find missing translation keys in HTML and JSON files for i18n projects.

## Installation

```
npm install -g ./
```

## Usage

```
missing-translation <rootDir> <enFile> <translationFile1> [translationFile2 ...]
```

- `<rootDir>`: Root directory to search for HTML files (e.g., `./src`)
- `<enFile>`: Path to the English translation JSON file (e.g., `./src/assets/i18n/datasources/en.json`)
- `<translationFile1> [translationFile2 ...]`: Paths to other translation JSON files

## Example

```
missing-translation ./src ./src/assets/i18n/datasources/en.json ./src/assets/i18n/datasources/de.json ./src/assets/i18n/datasources/es.json
```

## What it does

- Finds keys missing from other translation files compared to `en.json` (excluding object-like keys)
- Finds missing static translation keys in HTML files (excluding `index.html`)
- Finds missing transloco pipe keys in HTML files

## Output

The tool prints missing keys and a summary to the console.

## Usage as an npx CLI

You can run this tool directly using npx (after publishing to npm):

```
npx missing-translation <rootDir> <enFile> <translationFile1> [translationFile2 ...]
```

- `<rootDir>`: The root directory to search for HTML files (e.g., `./src`)
- `<enFile>`: Path to your English translation JSON file (e.g., `./src/assets/i18n/en.json`)
- `<translationFile1> [translationFile2 ...]`: Paths to other translation JSON files (e.g., `./src/assets/i18n/de.json`)

### Example

```
npx missing-translation ./src ./src/assets/i18n/en.json ./src/assets/i18n/de.json ./src/assets/i18n/fr.json
```

This will output missing translation keys and summary information to the console.

## Development

- Build: `npm run build`
- Start (dev): `npm start`

---

MIT License 