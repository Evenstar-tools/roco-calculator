"""Regressions for preserving edits and tracking source changes in the ledger."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('language_table', ROOT / 'scripts/localization/language-table.py')
TABLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TABLE)


def record(key='ui:物攻'):
    row = dict.fromkeys(TABLE.FIELDS, '')
    row.update(key=key, group='ui', field='message', zh='物攻', zh_project='物攻', en='P. ATK', ja='物攻',
               en_status='client_verified', ja_status='client_verified', review_status='source_verified',
               source_ref='table:ATTRIBUTE_CONF:2:attribute_name')
    return row


class LanguageTableTests(unittest.TestCase):
    def test_sync_preserves_manual_cells_and_appends_new_rows(self):
        existing = record()
        existing.update(en='Physical Attack', en_status='manual_reviewed', review_status='manual_reviewed',
                        notes='此处为长标签，人工确认。')
        expected = {row['key']: row for row in [record(), record('ui:新字段')]}
        once = TABLE.merge([existing], expected)
        self.assertEqual(once[0], existing)
        self.assertEqual(TABLE.merge(once, expected), once)
        self.assertEqual(len(once), 2)

    def test_changed_source_is_reported_without_overwriting(self):
        original = record()
        changed = record()
        changed.update(zh='物理攻击', en='Physical Attack')
        merged = TABLE.merge([original], {changed['key']: changed})
        self.assertEqual(merged[0], original)
        issues = TABLE.audit(merged, {changed['key']: changed})
        self.assertIn('source_changed', {issue['issue'] for issue in issues})
        self.assertIn('official_source_differs', {issue['issue'] for issue in issues})

    def test_missing_translation_is_explicit_and_not_copied_from_chinese(self):
        row = record()
        row.update(en='', ja='', en_status='missing', ja_status='missing', review_status='missing_client')
        issues = TABLE.audit([row], {row['key']: row})
        self.assertEqual([issue['language'] for issue in issues if issue['issue'] == 'missing_translation'], ['en', 'ja'])
        self.assertFalse(any(issue['severity'] == 'error' for issue in issues))
        self.assertEqual(row['en'], '')

    def test_manual_review_closes_gap_but_lost_placeholder_blocks(self):
        row = record('ui:剩余{hp}')
        row.update(zh='剩余{hp}', zh_project='剩余{hp}', en='Remaining {hp}', ja='残り{hp}',
                   en_status='manual_reviewed', ja_status='manual_reviewed', review_status='manual_reviewed', notes='结果栏人工确认')
        expected = {row['key']: row.copy()}
        self.assertEqual(TABLE.audit([row], expected), [])
        row['ja'] = '残り'
        self.assertTrue(any(issue['issue'] == 'placeholder_mismatch' and issue['severity'] == 'error'
                            for issue in TABLE.audit([row], expected)))

    def test_csv_preserves_multiline_unicode_and_rejects_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'language-table.csv'
            row = record()
            row['notes'] = '一行,含逗号\n二行「引用」'
            TABLE.write_csv(path, TABLE.FIELDS, [row])
            self.assertEqual(TABLE.read_master(path), [row])
            TABLE.write_csv(path, TABLE.FIELDS, [row, row])
            with self.assertRaisesRegex(ValueError, '重复key'):
                TABLE.read_master(path)

    def test_source_deletion_does_not_remove_maintained_row(self):
        row = record()
        self.assertEqual(TABLE.merge([row], {}), [row])
        self.assertIn('not_in_current_inventory', {issue['issue'] for issue in TABLE.audit([row], {})})


if __name__ == '__main__':
    unittest.main()
