# missing-translation CLI Tool

A CLI tool to find missing translation keys in Angular projects using Transloco or similar i18n solutions.

## Features
- Scans your source code (HTML templates) for static text and translation keys.
- Compares found keys against your translation JSON files (e.g., en.json, de.json, etc.).
- Reports missing keys and generates a detailed report file.
- Supports optional prefix handling for translation keys.

## Installation & Usage
You can run the tool directly with npx (no installation required):

```
npx missing-translation@latest <srcDir> <enFile> [otherFiles...] [--key-prefix <prefix>]
```

- `<srcDir>`: Source directory to scan (e.g., `./src`)
- `<enFile>`: Source translation file (e.g., `./src/assets/i18n/en.json`)
- `[otherFiles...]`: Other translation files to compare (e.g., `./src/assets/i18n/de.json` ...)
- `--key-prefix <prefix>`: (Optional) If provided, the tool will automatically add a dot ('.') for matching. For example, if you pass `--key-prefix datasources`, it will match keys like `datasources.DATASOURCE_NAME` in your HTML and check for `DATASOURCE_NAME` in your translation JSON.

### Example: Without Prefix
```
npx missing-translation@latest ./src ./src/assets/i18n/en.json ./src/assets/i18n/de.json
```

### Example: With Prefix
```
npx missing-translation@latest ./src ./src/assets/i18n/datasources/en.json ./src/assets/i18n/datasources/de.json --key-prefix datasources
```
- If your HTML uses keys like `datasources.DATASOURCE_NAME`, but your JSON uses just `DATASOURCE_NAME`, the tool will check for `DATASOURCE_NAME`.
- If your HTML uses keys like `datasources.test.DATASOURCE_NAME`, the tool will check for `test.DATASOURCE_NAME` in your translation JSON (which should be flattened).
- Keys without the prefix (e.g., `RAHI`) are always checked as written.

## How Prefix Logic Works
- The prefix is case-sensitive and only removed from the start of the key if present.
- The tool automatically adds a dot ('.') to the prefix for matching, so you only need to pass the prefix (e.g., `datasources`).
- If the key in HTML starts with the prefix (plus dot), the prefix is removed and the rest of the key is checked in the translation JSON.
- If the key does not start with the prefix, it is checked as written.
- This helps catch missing keys even if developers sometimes forget to add the prefix in the HTML.

## Output
- A summary is printed in the terminal.
- A detailed report file is generated in the project root.

## Contributing
Pull requests and issues are welcome! Please open an issue to discuss your ideas or report bugs.

## License
MIT 