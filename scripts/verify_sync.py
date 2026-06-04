#!/usr/bin/env python3
"""Verify / seed admin cloud state. Usage: ADMIN_PASSWORD=xxx python3 scripts/verify_sync.py"""
import json
import os
import sys
import urllib.request

SUPABASE_URL = 'https://wkcgsvtdnsdwydusqepw.supabase.co'
ANON_KEY = (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2dzdnRkbnNkd3lkdXNxZXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzYyMjUsImV4cCI6MjA5NjExMjIyNX0.fQfFsDdj2E3oDYqgCI_DnPqVKwN4aZGgDi-ruN55Pd8'
)
INVENTORY_KEY = 'box_inventory_site_v1'
TABLE = 'assembly_user_state'
EXPECTED = {'shelves': 35, 'boxes': 126, 'partTypes': 78, 'semiFinished': 173}
BACKUP = os.environ.get(
    'BACKUP_JSON', '/Users/idca/Downloads/物料管理系统备份_202606041533.json'
)


def request(url, data=None, headers=None, method=None):
    headers = {**(headers or {})}
    body = None
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def parse_inventory(raw):
    if not raw:
        return {'boxes': [], 'bom': [], 'binds': []}
    parsed = json.loads(raw)
    return {
        'boxes': parsed.get('boxes') or [],
        'bom': parsed.get('bom') or [],
        'binds': parsed.get('binds') or [],
    }


def calc_stats(state):
    shelves = {b.get('shelfCode') for b in state['boxes'] if b.get('shelfCode')}
    part_types = {
        f"{row.get('stockType') or '零件物料'}|{row.get('materialCode') or f'{row.get('materialName')}|{row.get('spec')}'}"
        for row in state['binds']
    }
    semi = sum(
        int(row.get('quantity') or 0)
        for row in state['binds']
        if (row.get('stockType') or '零件物料') == '半成品'
    )
    return {
        'shelves': len(shelves),
        'boxes': len(state['boxes']),
        'partTypes': len(part_types),
        'semiFinished': semi,
    }


def has_inventory(payload):
    if not payload:
        return False
    inv = parse_inventory(payload.get(INVENTORY_KEY))
    return bool(inv['boxes'] or inv['bom'] or inv['binds'])


def main():
    password = os.environ.get('ADMIN_PASSWORD')
    if not password:
        print('Set ADMIN_PASSWORD to run live verification.', file=sys.stderr)
        return 1

    auth = request(
        f'{SUPABASE_URL}/auth/v1/token?grant_type=password',
        {'email': 'admin@inventory.local', 'password': password},
        {'apikey': ANON_KEY},
    )
    token = auth['access_token']
    user_id = auth['user']['id']
    auth_headers = {'apikey': ANON_KEY, 'Authorization': f'Bearer {token}'}

    row = request(
        f'{SUPABASE_URL}/rest/v1/{TABLE}?user_id=eq.{user_id}&select=payload',
        headers={**auth_headers, 'Accept': 'application/json'},
    )
    payload = row[0]['payload'] if row else None

    if not has_inventory(payload):
        print('Cloud empty — seeding from backup...')
        backup = json.load(open(BACKUP, encoding='utf-8'))
        seed = {INVENTORY_KEY: json.dumps(backup, ensure_ascii=False)}
        request(
            f'{SUPABASE_URL}/rest/v1/{TABLE}',
            {'user_id': user_id, 'payload': seed},
            {**auth_headers, 'Prefer': 'resolution=merge-duplicates'},
            method='POST',
        )
        row = request(
            f'{SUPABASE_URL}/rest/v1/{TABLE}?user_id=eq.{user_id}&select=payload',
            headers={**auth_headers, 'Accept': 'application/json'},
        )
        payload = row[0]['payload']

    state = parse_inventory(payload.get(INVENTORY_KEY))
    stats = calc_stats(state)
    ok = True
    for key, exp in EXPECTED.items():
        got = stats[key]
        mark = 'OK' if got == exp else 'FAIL'
        print(f'{mark} {key}: {got} (expected {exp})')
        ok = ok and got == exp
    print(
        f"raw counts: boxes={len(state['boxes'])} bom={len(state['bom'])} binds={len(state['binds'])}"
    )
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
