"""Extract the checked-in offline catalog from USDA's April 2018 SR Legacy CSV ZIP."""
from collections import defaultdict
from io import TextIOWrapper
from pathlib import Path
from zipfile import ZipFile
import csv
import json
import sys

root = Path(__file__).resolve().parent.parent
selected = {}
for line in (root / 'scripts/catalog-selection.txt').read_text(encoding='utf-8').splitlines():
    food_id, name, preparation, aliases = line.split('|')
    selected[food_id] = (name, preparation, aliases.split(','))

keys = {'1008': 'kcal', '1003': 'protein', '1005': 'carbs', '1004': 'fat', '1079': 'fibre'}
nutrients = defaultdict(dict)
servings = {}
with ZipFile(sys.argv[1]) as source:
    def rows(table):
        filename = next(path for path in source.namelist() if path.endswith('/' + table + '.csv'))
        with source.open(filename) as data:
            yield from csv.DictReader(TextIOWrapper(data, encoding='utf-8-sig'))

    foods = {row['fdc_id']: row for row in rows('food') if row['fdc_id'] in selected}
    for row in rows('food_nutrient'):
        food_id, nutrient = row['fdc_id'], row['nutrient_id']
        if food_id in selected and nutrient in keys and row['amount']:
            key = keys[nutrient]
            amount = float(row['amount'])
            if key in nutrients[food_id] and amount != nutrients[food_id][key]:
                raise ValueError(f'Conflicting nutrients for {food_id}')
            nutrients[food_id][key] = amount
    for row in rows('food_portion'):
        food_id, label = row['fdc_id'], row['modifier'].strip()
        if food_id in selected and food_id not in servings and label and row['gram_weight'] and float(row['gram_weight']) > 0:
            display = ' '.join(part for part in (row['amount'], label) if part)
            servings[food_id] = {'name': display, 'amount': float(row['gram_weight'])}

result = []
for food_id, (name, preparation, aliases) in selected.items():
    source_food = foods[food_id]
    assert source_food['data_type'] == 'sr_legacy_food' and 'kcal' in nutrients[food_id]
    result.append({
        'id': 'fdc-' + food_id, 'name': name, 'preparation': preparation,
        'aliases': aliases, 'unit': 'g', 'serving': servings.get(food_id),
        'nutrients': {key: nutrients[food_id].get(key) for key in keys.values()},
        'estimate': 'estimate' in preparation,
        'source': {'kind': 'usda', 'fdc': int(food_id), 'description': source_food['description'], 'release': '2018-04'},
    })
output = 'import type { Food } from "./model.js"\n\nexport const starterFoods: Food[] = ' + json.dumps(result, ensure_ascii=False, indent=2) + '\n'
(root / 'src/catalog-data.ts').write_text(output, encoding='utf-8')
print(f'Extracted {len(result)} USDA food records.')
