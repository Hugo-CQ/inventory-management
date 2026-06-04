#!/usr/bin/env python3
"""Offline tests for sync guard logic (no network)."""
import json
import re
import sys

INVENTORY_KEY = 'box_inventory_site_v1'
PREFIX = 'assembly_'


def has_meaningful(payload):
    if not payload or not isinstance(payload, dict):
        return False
    raw = payload.get(INVENTORY_KEY)
    if raw:
        try:
            parsed = json.loads(raw)
            if (parsed.get('boxes') or parsed.get('bom') or parsed.get('binds')):
                return True
        except json.JSONDecodeError:
            pass
    for key, value in payload.items():
        if not (key.startswith(PREFIX) or key == INVENTORY_KEY):
            continue
        if key == INVENTORY_KEY:
            continue
        if isinstance(value, str) and value.strip() not in ('', '[]', '{}'):
            return True
    return False


def test_meaningful():
    assert not has_meaningful({})
    assert not has_meaningful({INVENTORY_KEY: json.dumps({'boxes': [], 'bom': [], 'binds': []})})
    assert has_meaningful(
        {INVENTORY_KEY: json.dumps({'boxes': [{'boxCode': 'X'}], 'bom': [], 'binds': []})}
    )
    assert has_meaningful({f'{PREFIX}pending': '["x"]'})


def test_html_has_bridge():
    path = 'assembly_material_management_merged_v18.html'
    html = open(path, encoding='utf-8').read()
    required = [
        'bootstrapAfterAuth',
        'reloadAllFrames',
        'hasMeaningfulPayload',
        'assembly-apply-storage',
        'cloudLoading',
        'syncPill',
        "loadFrame('inventoryFrame', 'inventory', true)",
        '已跳过空数据上传',
    ]
    missing = [s for s in required if s not in html]
    if missing:
        print('FAIL missing in html:', missing)
        return False
    if 'frame.srcdoc = decodeHtml(pages.inventory)' in html:
        print('FAIL reloadInventoryFrame still uses raw decodeHtml')
        return False
    print('OK html bridge checks')
    return True


if __name__ == '__main__':
    test_meaningful()
    print('OK meaningful payload tests')
    ok = test_html_has_bridge()
    sys.exit(0 if ok else 1)
