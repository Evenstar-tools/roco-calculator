"""Build only the Global entity display dictionary; never changes calculation data."""
import argparse
from collections import defaultdict
import csv
import html
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'data/localization/global/language-table.csv'
FORM_LABELS = ROOT / 'data/localization/global/project-form-labels.json'
OUTPUT = ROOT / 'src/data/global-entity-text.js'
LANGUAGES = {'zh-CN': 'zh', 'en': 'en', 'ja': 'ja'}
ACCEPTED = {'client_verified', 'manual_reviewed'}


def plain(value):
    return html.unescape(re.sub(r'<(?:/?[A-Za-z][^>]*|/)>', '', value or '')).strip()


def translated(row):
    return {locale: plain(row[field]) if locale == 'zh-CN' or row[field + '_status'] in ACCEPTED else ''
            for locale, field in LANGUAGES.items()}


def build():
    with MASTER.open(encoding='utf-8-sig', newline='') as file:
        rows = list(csv.DictReader(file))
    assert len({row['key'] for row in rows}) == len(rows), 'Duplicate ledger key'
    labels = json.loads(FORM_LABELS.read_text(encoding='utf-8'))['labels']
    comparison = json.loads((ROOT / 'data/research/global-client-20261028/stats/compare-report.json').read_text(encoding='utf-8'))
    client_spirits = {row['projectId']: row for row in comparison['records']}
    official_forms = defaultdict(dict)
    for row in rows:
        if row['group'] == 'spirit' and row['field'] == 'form' and all(row[lang + '_status'] == 'client_verified' for lang in ['en', 'ja']):
            text = translated(row)
            official_forms[row['zh']][json.dumps(text, ensure_ascii=False, sort_keys=True)] = (text, row['key'])
    grouped = defaultdict(list)
    for row in rows:
        if row['group'] in ['spirit', 'skill', 'trait', 'project_extra'] and row['entity_id']:
            grouped[(row['group'], row['entity_id'])].append(row)
    catalog = {kind: {} for kind in ['spirit', 'skill', 'trait']}
    project_forms = []
    for (source_kind, local_id), values in sorted(grouped.items()):
        kind = 'skill' if source_kind == 'project_extra' else source_kind
        by_game_id = defaultdict(dict)
        for row in values:
            by_game_id[row['game_id']][row['field']] = row
        candidates = []
        for game_id, fields in sorted(by_game_id.items()):
            name = fields.get('name')
            if not name:
                continue
            available = any(source in name['source_ref'] for source in ['official-name-map.json#', 'client-wish-power.json#']) and name['review_status'] != 'missing_client'
            entry = {'gameIds': [int(game_id)] if game_id else [], 'available': available,
                     'projectName': name['zh_project'] or name['zh']}
            if kind == 'spirit':
                client_spirit = client_spirits.get(local_id)
                assert client_spirit and str(client_spirit['gameId']) == game_id
                entry['catalogAvailable'] = available and not any('疑似' in flag for flag in client_spirit['flags'])
                entry['nativeTraitGameId'] = (client_spirit['clientMetadata'] or {}).get('pet_feature')
            if available:
                entry['name'] = translated(name)
                assert all(entry['name'].values()), (name['key'], 'Missing verified name')
                if kind == 'spirit':
                    form = fields.get('form')
                    if form:
                        text = translated(form)
                        status = 'project_reviewed' if any(form[lang + '_status'] == 'manual_reviewed' for lang in ['en', 'ja']) else 'client_verified'
                        source_key = form['key']
                        if not text['en'] or not text['ja']:
                            status = 'project_reviewed'
                            options = official_forms.get(form['zh'], {})
                            if len(options) == 1:
                                text, source_key = next(iter(options.values()))
                            elif form['zh'] in labels:
                                text = {'zh-CN': plain(form['zh']), **labels[form['zh']]}
                                source_key = 'data/localization/global/project-form-labels.json#' + form['zh']
                            else:
                                raise ValueError(f"Unreviewed project form: {form['key']} / {form['zh']}")
                        if status == 'project_reviewed':
                            project_forms.append({'entityId': local_id, 'gameId': game_id, 'sourceKey': source_key})
                        entry['form'] = text
                        entry['formStatus'] = status
                else:
                    description = fields.get('description')
                    if description and any(source in description['source_ref'] for source in ['official-name-map.json#', 'client-wish-power.json#']):
                        entry['description'] = translated(description)
                        if description['review_status'] == 'source_issue':
                            entry['descriptionStatus'] = 'client_source_issue'
            candidates.append(entry)
        if not candidates:
            continue
        merged = {k:v for k,v in candidates[0].items() if k != 'gameIds'}
        assert all({k:v for k,v in candidate.items() if k != 'gameIds'} == merged for candidate in candidates), (local_id, 'Merged game IDs have divergent display text; require explicit per-game selection')
        catalog[kind][local_id] = {**merged, 'gameIds': sorted({g for candidate in candidates for g in candidate['gameIds']})}
    for row in rows:
        if row['group'] != 'display_override':
            continue
        kind = row['key'].split(':')[1]
        entry = catalog[kind][row['entity_id']]
        assert entry['available'] and row['field'] in entry
        text = translated(row)
        assert all(text.values()), (row['key'], 'Incomplete reviewed display text')
        entry[row['field']] = text
        entry[row['field'] + 'Status'] = 'project_reviewed'
    config = json.loads((ROOT / 'data/localization/global/source-config.json').read_text(encoding='utf-8'))
    meta = {'clientVersion': config['clientVersion'], 'source': 'data/localization/global/language-table.csv',
            'projectFormStatus': 'project_reviewed', 'projectFormCount': len(project_forms),
            'counts': {kind: {'total': len(entries), 'available': sum(e['available'] for e in entries.values())} for kind, entries in catalog.items()}}
    content = '// Generated by scripts/localization/build-entity-catalog.py. Display text only; no calculation data.\n'
    content += 'export const GLOBAL_ENTITY_TEXT_META = Object.freeze(' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + ');\n'
    content += 'export const GLOBAL_ENTITY_TEXT = Object.freeze({\n'
    for kind, entries in catalog.items():
        content += '  ' + json.dumps(kind) + ': {\n'
        content += ''.join('    ' + json.dumps(key) + ': ' + json.dumps(value, ensure_ascii=False, separators=(',', ':')) + ',\n' for key, value in entries.items())
        content += '  },\n'
    content += '});\n'
    native_traits = json.loads((ROOT / 'data/localization/global/client-display-traits.json').read_text(encoding='utf-8'))
    extra_traits = {}
    for row in native_traits['records']:
        assert row['clientSkillType'] == 2
        extra_traits[str(row['gameId'])] = {
            'gameIds': [row['gameId']], 'available': True,
            **{field: {locale: plain(row['localized']['zh_Hans' if locale == 'zh-CN' else locale][field]) for locale in LANGUAGES}
               for field in ['name', 'description']},
        }
    content += 'export const GLOBAL_CLIENT_TRAIT_TEXT = Object.freeze(' + json.dumps(extra_traits, ensure_ascii=False, separators=(',', ':')) + ');\n'
    assert '\ufffd' not in content and '\x00' not in content
    return content, meta


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content, meta = build()
    if args.check:
        assert OUTPUT.read_text(encoding='utf-8') == content, 'Generated entity text is out of date'
    else:
        OUTPUT.write_text(content, encoding='utf-8', newline='\n')
        assert OUTPUT.read_text(encoding='utf-8') == content
    print(json.dumps({'status': 'passed', 'checkOnly': args.check, **meta}, ensure_ascii=False))


if __name__ == '__main__':
    main()
