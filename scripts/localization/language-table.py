"""Maintain the local language ledger. Does not write client or runtime files."""
import argparse
import csv
import html
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / 'data/localization/global'
FIELDS = ['key', 'group', 'field', 'entity_id', 'game_id', 'context', 'zh', 'zh_project',
          'en', 'ja', 'en_status', 'ja_status', 'review_status', 'source_ref', 'notes']
LANG_STATUSES = {'client_verified', 'client_issue', 'project_existing', 'missing', 'manual_reviewed', 'draft'}
REVIEW_STATUSES = {'source_verified', 'needs_context', 'needs_review', 'source_issue', 'missing_client',
                   'missing_zh', 'cn_preview', 'manual_reviewed'}
TOKEN = re.compile(r'\{[A-Za-z][A-Za-z0-9_]*\}')


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert load(path) == data


def write_csv(path, fields, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with path.open(encoding='utf-8-sig', newline='') as stream:
        assert list(csv.DictReader(stream)) == rows, path


def read_master(path):
    if not path.exists():
        return []
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != FIELDS:
            raise ValueError('语言表列名或顺序已变化，请保留固定列头。')
        rows = list(reader)
    keys = [row['key'] for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError('语言表含重复key；停止写入，先处理冲突。')
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError('语言表存在错列或缺列；停止写入。')
    return rows


def source_id(source):
    if source.get('table'):
        return f"table:{source['table']}:{source['rowId']}:{'.'.join(map(str, source['field']))}"
    return f"locres:{source['namespace']}:{source['key']}"


def source_text(source):
    return {lang: source.get('zh_Hans', source.get('zh')) if lang == 'zh' else source.get(lang)
            for lang in ['zh', 'en', 'ja']}


def normalized(text):
    return re.sub(r'\s+', '', html.unescape(re.sub(r'<[^>]*>', '', text or '')))


def plain_by_key(rows):
    return {row['key']: {lang: html.unescape(re.sub(r'<(?:/?[A-Za-z][^>]*|/)>', '', row[lang]))
                         for lang in ['zh', 'en', 'ja']} for row in rows}


def collect(root, config):
    research = root / config['researchDirectory']
    snapshot = load(root / config['cnSnapshot'])
    entities = load(research / 'official-name-map.json')['records']
    bridge = load(research / 'cn-game-id-bridge.json')['records']
    glossary = load(research / 'ui/official-ui-glossary.json')
    mappings = load(research / 'ui/project-term-map.json')['rows']
    raw_ui = load(research / 'ui/client-ui-source-strings.json')['rows']
    locres = load(research / 'ui/locres-ui-trilingual.json')['rows']
    # Import the actual current dictionary rather than depending on a dated inventory.
    module_url = (root / config['uiMessagesModule']).as_uri()
    inventory = json.loads(subprocess.run(['node', str(root / 'scripts/localization/collect-ui-inputs.mjs'),
                                           '--root', str(root)], cwd=root, check=True, capture_output=True,
                                          encoding='utf-8').stdout)
    js = 'const m=await import(new URL("../data/snapshot-extras.js",' + json.dumps(module_url) + '));' \
         + 'process.stdout.write(JSON.stringify(m.withCalculatorExtras({spirits:[],traits:[],skills:[],learnsets:[]}).skills));'
    extra_skills = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=root,
                                            check=True, capture_output=True, encoding='utf-8').stdout)
    messages = inventory['registeredMessages']
    definitions = defaultdict(list)
    for definition in inventory['definitions']:
        definitions[definition['zh']].append(definition)
    result, sources = {}, {}

    def add(key, group, field, zh, en='', ja='', *, entity='', game='', project='', context='',
            ref='', notes='', official=False, review='', evidence=None):
        row = dict.fromkeys(FIELDS, '')
        row.update(key=key, group=group, field=field, entity_id=str(entity or ''), game_id=str(game or ''),
                   context=context, zh=zh or '', zh_project=project or '', en=en or '', ja=ja or '',
                   review_status=review or ('source_verified' if official else 'missing_client'), source_ref=ref, notes=notes)
        for lang in ['en', 'ja']:
            row[lang + '_status'] = ('client_verified' if official else 'project_existing') if row[lang] else 'missing'
            if official and row[lang] and (lang == 'en' and re.search('[\u3400-\u9fff]', row[lang])
                                           or re.search('占位|测试|未翻译', row[lang])):
                row[lang + '_status'] = 'client_issue'
                row['review_status'] = 'source_issue'
        if not row['zh']:
            row['review_status'] = 'missing_zh'
        if key in result:
            # The inventory contains duplicate Close and HP aliases. Never merge different texts.
            comparable = ['group', 'field', 'entity_id', 'game_id', 'zh', 'en', 'ja', 'review_status', 'source_ref']
            if any(result[key][column] != row[column] for column in comparable):
                raise ValueError(f'源键冲突：{key}')
            if evidence:
                sources[key].setdefault('additionalEvidence', []).append(evidence)
            return
        result[key] = row
        sources[key] = {'reference': ref, 'clientVersion': config['clientVersion'] if official else None,
                        'generated': row.copy(), 'evidence': evidence}

    live = {kind: {row['id']: row for row in snapshot[plural]}
            for kind, plural in [('spirit', 'spirits'), ('skill', 'skills'), ('trait', 'traits')]}
    matched = set()
    for row in entities:
        kind, entity_id = row['kind'], row['cnLocalId']
        matched.add((kind, entity_id))
        current = live[kind].get(entity_id, {})
        for field, raw_key, ref_key in [('name', 'nameRaw', 'name'), ('form', 'formRaw', 'form'),
                                         ('description', 'descriptionRaw', 'description' if kind == 'spirit' else 'desc'),
                                         ('flavor', 'flavorTextRaw', 'flavor_text')]:
            texts = {lang: row['localized'][locale][raw_key] for lang, locale in [('zh', 'zh_Hans'), ('en', 'en'), ('ja', 'ja')]}
            project_text = (current.get('fullName', current.get('name', row['zhProject'])) if field == 'name'
                            else current.get('variantName', '') if field == 'form'
                            else current.get('description', '') if field == 'description' else '')
            if field == 'form' and not any(texts.values()) and row['nameRelation'] == 'project-form-label-client-base-name':
                project_form = current.get('variantName') or row['zhProject'].split('（', 1)[-1].rstrip('）')
                add(f"entity:{kind}:{row['gameId']}:form", kind, 'form', project_form, entity=entity_id,
                    game=row['gameId'], project=project_form, context=row['zhProject'],
                    ref=f"{config['researchDirectory']}/official-name-map.json#{kind}/{row['gameId']}/formRaw",
                    notes='项目有形态标签，客户端form为空；不借基础名称拼造英文形态。')
                continue
            if field != 'name' and not any(texts.values()):
                continue
            note = '仅对应文字；客户端规则数值未据此验证。'
            review = ''
            if field == 'description' and project_text and normalized(project_text) != normalized(texts['zh']):
                note += ' 国服项目说明与国际客户端中文不同；英日仅对应zh栏，不作为zh_project的已验译文。'
                review = 'needs_context'
            if kind == 'trait' and row['gameId'] == 200312 and field == 'description':
                note += ' 客户端原文差异：中英威力+30，日文+20；保持原文待校对。'
                review = 'source_issue'
            add(f"entity:{kind}:{row['gameId']}:{field}", kind, field, **texts, entity=entity_id, game=row['gameId'],
                project=project_text, context=row['zhProject'], ref=f"{config['researchDirectory']}/official-name-map.json#{kind}/{row['gameId']}/{raw_key}",
                notes=note, official=True, review=review,
                evidence={'table': row['table'], 'textField': ref_key, 'textIndex': row['textRefs'].get(ref_key),
                          'sourceBasePath': row['sourceBasePath'], 'sourceLocalePattern': row['sourceLocalePattern'],
                          'sourcePak': row['sourcePak'], 'nameRelation': row['nameRelation'],
                          'dev_CN': row['localized']['dev_CN'][raw_key]})

    bridge_by_local = defaultdict(list)
    for row in bridge:
        bridge_by_local[(row['kind'], row['cnLocalId'])].append(row)
    for kind, items in live.items():
        for entity_id, row in items.items():
            if (kind, entity_id) in matched:
                continue
            bridges = bridge_by_local.get((kind, entity_id), [])
            for identity in bridges or [{}]:
                game = identity.get('cnGameId', '')
                key_base = f"entity:{kind}:{game}" if game else f"project-entity:{kind}:{entity_id}"
                name = row.get('fullName', row.get('name', ''))
                for field, value in [('name', name), ('description', row.get('description', '')),
                                     ('form', row.get('variantName', '') if kind == 'spirit' else '')]:
                    if not value:
                        continue
                    add(f'{key_base}:{field}', kind, field, value, entity=entity_id, game=game, project=value,
                        context=name, ref=f"{config['cnSnapshot']}#{kind}/{entity_id}/{field}",
                        notes='当前客户端未对应；有正式ID也不按同名猜译。' if game else '当前中文项目条目缺少已核国际客户端ID。')

    supplemental_path = config.get('supplementalWishPower')
    supplemental = {row['entityId']: row for row in load(root / supplemental_path)['records']} if supplemental_path else {}
    for skill in extra_skills:
        native = supplemental.get(skill['id'])
        for field in ['name', 'description']:
            if native:
                add(f"project-extra:{skill['id']}:{field}", 'project_extra', field,
                    native['localized']['zh_Hans'][field], native['localized']['en'][field], native['localized']['ja'][field],
                    entity=skill['id'], game=native['gameId'], project=skill[field], context=skill['type'],
                    ref=f"{supplemental_path}#{native['gameId']}/{field}", official=True,
                    notes='本机客户端正式愿力冲击，按18属性、技能类型、80威力及2能耗核对；译名映射不覆盖S3计算数值。',
                    evidence={'table': 'SKILL_CONF', 'class': native['clientClass'], 'textRefs': native['textRefs']})
            else:
                add(f"project-extra:{skill['id']}:{field}", 'project_extra', field, skill[field], entity=skill['id'],
                    project=skill[field], context=skill['type'], ref=f"src/data/snapshot-extras.js#{skill['id']}/{field}",
                    notes='计算器动态追加技能；内部属性英文后缀不是正式译名。')

    display_path = config.get('runtimeDisplayOverrides')
    if display_path:
        display_overrides = defaultdict(list)
        for row in load(root / display_path)['records']:
            display_overrides[(row['kind'], row['entityId'], row['field'])].append(row)
        for (kind, entity_id, field), adjustments in display_overrides.items():
            originals = [row for row in result.values() if row['group'] == kind and row['entity_id'] == entity_id and row['field'] == field]
            assert originals, (kind, entity_id, field)
            original = originals[0]
            texts = {lang: original[lang] for lang in ['zh', 'en', 'ja']}
            for adjustment in adjustments:
                texts['zh' if adjustment['locale'] == 'zh-CN' else adjustment['locale']] = adjustment['text']
            key = f'project-display:{kind}:{entity_id}:{field}'
            add(key, 'display_override', field, **texts, entity=entity_id, game=original['game_id'],
                project=original['zh_project'], context='Global S3季中显示校订；客户端原文另行保留',
                ref=f'{display_path}#{entity_id}/{field}', review='manual_reviewed',
                notes=' | '.join(row['reason'] for row in adjustments), evidence={'originalKey': original['key'], 'adjustments': adjustments})
            for lang in ['en', 'ja']:
                if result[key][lang]: result[key][lang + '_status'] = 'manual_reviewed'
            sources[key]['generated'] = result[key].copy()

    # Keep each source key: identical Chinese text is not sufficient to merge meanings.
    for item in glossary['rows']:
        raw = item['raw']
        add(item['sourceId'], 'term', 'text', raw['zh'], raw['en'], raw['ja'], context=item['category'],
            ref=f"{config['researchDirectory']}/ui/official-ui-glossary.json#{item['sourceId']}",
            notes=' | '.join(item['notes']), official=True,
            review='source_issue' if item['status'] != '客户端三语已确认' else '', evidence=glossary['sources'][item['sourceId']])
    for item in raw_ui:
        if not ((item['table'] == 'DESC_NOTE_CONF' and item['field'] == ['desc']) or
                (item['table'] == 'WEATHER_CONF' and item['field'] == ['desc_for_battle'])):
            continue
        add(source_id(item), 'mechanic', 'description', item['zh_Hans'], item['en'], item['ja'],
            context=item['table'], ref=f"{config['researchDirectory']}/ui/client-ui-source-strings.json#{source_id(item)}",
            notes='仅保存原说明；不据此改动国际服计算。', official=True, evidence=item)
    for item in locres:
        if item['en'] in ['I Resist', 'Resists Me', 'Advantaged Against', 'Disadvantaged Against']:
            add(source_id(item), 'matchup', 'text', item['zh'], item['en'], item['ja'],
                context='抗性/弱点方向', ref=f"{config['researchDirectory']}/ui/locres-ui-trilingual.json#{source_id(item)}",
                notes='英日原文已确认；中文源文和进攻/防御场景待对应，不反译填中文。', official=True, evidence=item)

    by_message = defaultdict(list)
    for item in mappings:
        if item.get('projectI18nKey'):
            by_message[item['projectI18nKey']].append(item)
        source = item.get('selectedSource')
        texts = source_text(source) if source else {'zh': item['zh'], 'en': '', 'ja': ''}
        review = '' if source else 'needs_context' if item['status'] == '多义需选择' else 'missing_client'
        # Include zh in the key: HP and 生命 both have internalKey=hp, but are distinct labels.
        key = f"concept:{item['category']}:{item.get('internalKey') or ''}:{item['zh']}"
        add(key, 'concept', 'text', **texts, project=item['zh'], context=item['category'],
            ref=source_id(source) if source else '', notes=item.get('mappingNote', ''), official=bool(source), review=review, evidence=item)
    for zh, old in messages.items():
        choices = by_message.get(zh, [])
        selected = [item['selectedSource'] for item in choices if item.get('selectedSource')]
        # Selection must be unambiguous for every known context of this actual i18n key.
        unambiguous = bool(choices) and len(selected) == len(choices) and len({(s.get('en'), s.get('ja')) for s in selected}) == 1
        source = selected[0] if unambiguous else None
        texts = source_text(source) if source else {'zh': zh, 'en': old.get('en', ''), 'ja': old.get('ja', '')}
        add('ui:' + zh, 'ui', 'message', **texts, project=zh, context=config['uiMessagesModule'],
            ref=source_id(source) if source else f"{config['uiMessagesModule']}#UI_MESSAGES/{zh}",
            official=bool(source), review='' if source else 'needs_context' if any(item['status'] == '多义需选择' for item in choices) else 'needs_review',
            notes='项目中文为实际i18n键。正式来源与项目旧译分开；不是运行时替换指令。',
            evidence={'currentProjectTranslation': old, 'definitionSources': definitions.get(zh, []),
                      'mappingSources': [item.get('selectedSource') for item in choices]})

    missing_calls = defaultdict(list)
    for item in inventory['missingRegisteredCalls']:
        missing_calls[item['zh']].append(item)
    for zh, items in missing_calls.items():
        add('ui:' + zh, 'ui_missing', 'message', zh, project=zh, context='已调用t但尚未登记词典',
            ref='src#unregistered-i18n-call/' + zh, review='needs_review',
            notes='静态调用发现的实际缺键；需补译并另行接入UI_MESSAGES。', evidence=items)
    for item in inventory['unregisteredVisibleText']:
        add('ui-visible:' + item['stableKey'], 'ui_visible', 'visible_text', item['zh'], project=item['zh'],
            context=item['file'] + ' / ' + item['context'], ref=item['file'] + '#' + item['stableKey'],
            review='needs_context', notes='静态可见文本或片段；先核完整句子与上下文，再翻译/接入t，不能逐碎片机械替换。', evidence=item)

    preview = load(root / config['previewCatalog'])
    for item in preview['entries']:
        for field in ['name', 'traitName', 'traitSummary', 'description', 'variantName']:
            value = item.get(field, '')
            if value:
                add(f"cn-preview:{item['key']}:{field}", 'cn_preview', field, value, project=value,
                    entity=item['key'], context=item['name'], review='cn_preview',
                    ref=f"{config['previewCatalog']}#entries/{item['key']}/{field}",
                    notes='国服前瞻单列待译，不推定国际服收录或沿用正式数值。')
        for skill in item.get('skills', []):
            for field in ['name', 'description']:
                if skill.get(field):
                    add(f"cn-preview-skill:{skill['id']}:{field}", 'cn_preview', 'skill_' + field,
                        skill[field], project=skill[field], entity=skill['id'], context=skill['name'], review='cn_preview',
                        ref=f"{config['previewCatalog']}#skills/{skill['id']}/{field}",
                        notes='国服前瞻技能，未建立国际ID对应。', evidence={'owner': item['key'], 'source': skill.get('evidence')})
    announcement_path = config.get('previewAnnouncement')
    if announcement_path:
        announcement = load(root / announcement_path)
        for kind in ['traits', 'skills']:
            for item in announcement.get(kind, []):
                for field, value in [('name', item['name']), ('description', item.get('after') if kind == 'traits'
                                      else item.get('fields', {}).get('description', ['', ''])[-1])]:
                    if isinstance(value, str) and value:
                        add(f"cn-preview-announcement:{kind}:{item['name']}:{field}", 'cn_preview', field,
                            value, project=value, context=announcement['patch']['id'], review='cn_preview',
                            ref=f"{announcement_path}#{kind}/{item['name']}/{field}", notes='国服S5公告文本，不能套用Global旧效果译文。')
    return result, sources, inventory


def merge(existing, generated):
    """Only append. Every existing cell, including manual edits, is preserved."""
    known = {row['key'] for row in existing}
    return [*existing, *[generated[key].copy() for key in sorted(generated.keys() - known)]]


def audit(rows, expected):
    issues = []
    seen = set()

    def issue(row, kind, detail, level='review', lang=''):
        issues.append({'key': row['key'], 'group': row.get('group', ''), 'zh': row.get('zh', ''),
                       'language': lang, 'issue': kind, 'severity': level, 'detail': detail})

    for row in rows:
        key = row['key']
        if not key or key in seen:
            issue(row, 'duplicate_or_empty_key', 'key必须非空且唯一。', 'error')
        seen.add(key)
        current = expected.get(key)
        if current is None:
            issue(row, 'not_in_current_inventory', '来源清单已无此键，保留旧行待检查；不自动删除。')
        elif row['zh'] != current['zh'] or row['zh_project'] != current['zh_project']:
            issue(row, 'source_changed', '源文已变化；现有译文未覆盖。新源文：' + json.dumps(
                {'zh': current['zh'], 'zh_project': current['zh_project']}, ensure_ascii=False))
        if row['review_status'] not in REVIEW_STATUSES:
            issue(row, 'invalid_status', '未知review_status。', 'error')
        elif row['review_status'] not in {'source_verified', 'manual_reviewed', 'missing_zh'}:
            issue(row, row['review_status'], row['notes'] or '待人工确认。')
        if not row['zh']:
            issue(row, 'missing_zh', '未确认中文源文，禁止反译冒充。')
        for lang in ['en', 'ja']:
            value, status = row[lang], row[lang + '_status']
            if status not in LANG_STATUSES:
                issue(row, 'invalid_language_status', status, 'error', lang)
            if not value:
                issue(row, 'missing_translation', '译文为空。', lang=lang)
                if status != 'missing':
                    issue(row, 'empty_claimed_translation', '空值必须标记missing。', 'error', lang)
            elif status == 'missing':
                issue(row, 'inconsistent_status', '已有值却仍标missing。', 'error', lang)
            if current and status in {'client_verified', 'client_issue'} and (current[lang] != value or current['source_ref'] != row['source_ref']):
                issue(row, 'official_source_differs', '标为客户端原文的值或来源已不同，需复核。新来源：' + json.dumps(
                    {'value': current[lang], 'source_ref': current['source_ref']}, ensure_ascii=False), 'error', lang)
            if status in {'project_existing', 'draft', 'client_issue'}:
                issue(row, status, '保留现有值，待语境或原文问题复核。', lang=lang)
            if '\ufffd' in value or '\x00' in value:
                issue(row, 'broken_encoding', '存在替换字符或NUL。', 'error', lang)
            if value and row['group'] == 'ui' and Counter(TOKEN.findall(row['zh_project'])) != Counter(TOKEN.findall(value)):
                issue(row, 'placeholder_mismatch', '参数占位符与当前项目中文不一致。', 'error' if status == 'manual_reviewed' else 'review', lang)
            if status == 'manual_reviewed' and not row['notes'].strip():
                issue(row, 'manual_review_note_missing', '手工确认须在notes写依据或语境。', 'error', lang)
    for key in sorted(expected.keys() - seen):
        issue(expected[key], 'missing_row', '当前来源新增条目，运行sync补入。', 'error')
    return issues


def summarize(rows, issues):
    return {'rows': len(rows), 'groups': dict(Counter(row['group'] for row in rows)),
            'errors': sum(issue['severity'] == 'error' for issue in issues),
            'needsReviewRows': len({issue['key'] for issue in issues}),
            'issues': dict(Counter(issue['issue'] for issue in issues))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['sync', 'check', 'find'])
    parser.add_argument('query', nargs='?', default='')
    parser.add_argument('--needs-review', action='store_true')
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--group', default='')
    parser.add_argument('--directory', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    directory = args.directory.resolve()
    config = load(directory / 'source-config.json')
    path = directory / 'language-table.csv'
    existing = read_master(path)
    expected, sources, inventory = collect(ROOT, config)
    rows = merge(existing, expected) if args.command == 'sync' else existing
    issues = audit(rows, expected)
    summary = summarize(rows, issues)
    if args.command == 'sync':
        issue_fields = ['key', 'group', 'zh', 'language', 'issue', 'severity', 'detail']
        write_csv(directory / '待补与复核.csv', issue_fields, issues)
        save(directory / 'coverage.json', summary)
        if summary['errors']:
            print(json.dumps({'status': 'blocked-master-unchanged', 'report': str(directory / '待补与复核.csv'),
                              **summary, 'errorsDetail': [i for i in issues if i['severity'] == 'error'][:10]}, ensure_ascii=False))
            return 1
        write_csv(path, FIELDS, rows)
        save(directory / 'language-table.json', {'schemaVersion': 1, 'clientVersion': config['clientVersion'],
             'runtimeApplication': False, 'rows': rows, 'plainByKey': plain_by_key(rows)})
        save(directory / 'sources.json', sources)
        save(directory / 'ui-source-inventory.json', inventory)
        print(json.dumps({'status': 'synced', 'added': len(rows) - len(existing), 'master': str(path), **summary}, ensure_ascii=False))
    elif args.command == 'check':
        export = directory / 'language-table.json'
        exported = load(export) if export.exists() else {}
        if exported.get('rows') != rows or exported.get('plainByKey') != plain_by_key(rows):
            summary['errors'] += 1
            summary['exportOutOfDate'] = True
        print(json.dumps({'status': 'passed' if not summary['errors'] else 'failed', **summary,
                          'errorsDetail': [i for i in issues if i['severity'] == 'error'][:10]}, ensure_ascii=False))
    else:
        needs = {issue['key'] for issue in issues}
        found = [row for row in rows if (not args.group or row['group'] == args.group) and
                 (not args.needs_review or row['key'] in needs) and
                 args.query.casefold() in '\n'.join(row.values()).casefold()]
        print(json.dumps({'total': len(found), 'rows': found[:max(args.limit, 0)]}, ensure_ascii=False, indent=2))
    return int(summary['errors'] > 0)


if __name__ == '__main__':
    raise SystemExit(main())
