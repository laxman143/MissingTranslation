import os
import re
import json

def find_missing_translations(root_dir, translation_files, en_file):
    """
    Finds missing translation keys:
    1. Keys missing from other translation files compared to en.json (excluding object-like keys).
    2. Missing static translation keys in HTML files (excluding index.html).
    3. Missing transloco pipe keys in HTML files.

    Args:
        root_dir (str): The root directory to search for HTML files.
        translation_files (list): A list of paths to the translation JSON files (including en.json).
        en_file (str): The path to the English (en.json) translation file.

    Returns:
        tuple: A tuple containing five values:
            - missing_keys_en: Keys missing from other translation files compared to en.json.
            - missing_translations_html: Missing static translation keys in HTML files.
            - missing_transloco_keys: Missing transloco pipe keys in HTML files.
            - total_missing_static: Total count of missing static translations.
            - total_missing_transloco: Total count of missing transloco pipe keys.
    """

    # Part 1: Find missing keys compared to en.json (excluding object-like keys)
    en_translations = {}
    try:
        with open(en_file, 'r', encoding='utf-8') as f:
            en_translations = json.load(f)
        en_keys = set(en_translations.keys())
    except FileNotFoundError:
        print(f"Error: English translation file not found: {en_file}")
        return {}, {}, {}, 0, 0, 0
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON format in: {en_file}")
        return {}, {}, {}, 0, 0, 0

    missing_keys_en = {}
    total_missing_keys_en = 0  # Counter for total missing keys in other files compared to en.json

    for file in translation_files:
        if file != en_file:
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    translations = json.load(f)
                keys = set(translations.keys())
            except FileNotFoundError:
                print(f"Error: Translation file not found: {file}")
                continue
            except json.JSONDecodeError:
                print(f"Error: Invalid JSON format in: {en_file}")
                continue

            # Exclude object-like keys (keys with dots)
            en_keys_filtered = {key for key in en_keys if '.' not in key}
            keys_filtered = {key for key in keys if '.' not in key}

            missing = en_keys_filtered - keys_filtered
            if missing:
                missing_keys_en[file] = list(missing)
                total_missing_keys_en += len(missing)  # Update the counter

    # Part 2: Find missing static translations in HTML files
    missing_translations_html = {}
    missing_transloco_keys = {}  # New dictionary for transloco pipe keys
    all_translations = {en_file: en_keys}  # Start with en.json keys
    for file in translation_files:
        if file != en_file:
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    translations = json.load(f)
                all_translations[file] = set(translations.keys())
            except FileNotFoundError:
                continue
            except json.JSONDecodeError:
                continue

    total_missing_static = 0
    total_missing_transloco = 0

    for root, _, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.html') and file != 'index.html':
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    print(f"Skipping file due to encoding error: {filepath}")
                    continue

                # Find static text
                static_text_matches = re.findall(r">([^<>{{\[]*?)<", content)
                static_text = set(text.strip() for text in static_text_matches if text.strip())

                # Find transloco pipe keys
                transloco_matches = re.findall(r"{{\s*'([^']+)'\s*\|\s*transloco\s*}}", content)
                transloco_keys = set(transloco_matches)

                # Check missing static text
                for key in static_text:
                    is_translated = False
                    for translation_file, keys in all_translations.items():
                        if key in keys:
                            is_translated = True
                            break

                    if not is_translated:
                        if key not in missing_translations_html:
                            missing_translations_html[key] = []
                        missing_translations_html[key].append(filepath)
                        total_missing_static += 1

                # Check missing transloco keys
                for key in transloco_keys:
                     # Skip keys that look like object properties
                    if '.' in key:
                        continue

                    is_translated = False
                    for translation_file, keys in all_translations.items():
                        if key in keys:
                            is_translated = True
                            break

                    if not is_translated:
                        if key not in missing_transloco_keys:
                            missing_transloco_keys[key] = []
                        missing_transloco_keys[key].append(filepath)
                        total_missing_transloco += 1

    return missing_keys_en, missing_translations_html, missing_transloco_keys, total_missing_static, total_missing_transloco, total_missing_keys_en


if __name__ == '__main__':
    # Configuration
    root_directory = './src'  # Replace with your HTML root
    en_file_path = './src/assets/i18n/datasources/en.json'  # Your en.json path
    translation_files_paths = [
        en_file_path,
        './src/assets/i18n/datasources/de.json',
        './src/assets/i18n/datasources/es.json',
        './src/assets/i18n/datasources/fr.json',
    ]  # All translation files

    # Run the analysis
    try:
        missing_keys_en, missing_translations_html, missing_transloco_keys, total_missing_static, total_missing_transloco, total_missing_keys_en = find_missing_translations(
            root_directory, translation_files_paths, en_file_path
        )

        # Output results
        if missing_keys_en:
            print("Missing Keys Compared to en.json (excluding object-like keys):")
            for file, keys in missing_keys_en.items():
                print(f"  {file}:")
                for key in keys:
                    print(f"    - {key}")
        else:
            print("No missing keys found compared to en.json (excluding object-like keys).")

        if missing_translations_html:
            print("\nMissing Static Translations in HTML Files:")
            for key, files in missing_translations_html.items():
                print(f"  Key: {key}")
                for file in files:
                    print(f"    - {file}")
        else:
            print("\nNo missing static translations found in HTML files.")

        if missing_transloco_keys:
            print("\nMissing Word which is not in translation file and showing in HTML:")
            for key, files in missing_transloco_keys.items():
                print(f"  Key: {key}")
                for file in files:
                    print(f"    - {file}")
        else:
            print("\nNo missing transloco pipe keys found in HTML files.")

        print("\nSummary:")
        print(f"  Total missing static translations: {total_missing_static}")
        print(f"  Total missing Word which is not in translation file: {total_missing_transloco}")
        print(f"  Total missing keys in other translation files compared to en.json: {total_missing_keys_en}")

        print("Script completed successfully. Exit code: 0")


    except Exception as e:
        print(f"An error occurred: {e}")
        print("Script failed. Exit code: 1")