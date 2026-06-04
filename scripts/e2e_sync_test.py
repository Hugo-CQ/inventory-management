#!/usr/bin/env python3
"""E2E: mock Supabase, login admin, assert dashboard stats after cloud load."""
import json
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BACKUP = Path('/Users/idca/Downloads/物料管理系统备份_202606041533.json')
INVENTORY_KEY = 'box_inventory_site_v1'
EXPECTED = {'statShelves': '35', 'statBoxes': '126', 'statPartTypes': '78', 'statSemiFinished': '173'}
SUPABASE_HOST = 'wkcgsvtdnsdwydusqepw.supabase.co'
MOCK_USER = {
    'id': '00000000-0000-0000-0000-000000000001',
    'aud': 'authenticated',
    'role': 'authenticated',
    'email': 'admin@inventory.local',
    'email_confirmed_at': '2026-01-01T00:00:00Z',
    'app_metadata': {'provider': 'email', 'providers': ['email']},
    'user_metadata': {},
    'created_at': '2026-01-01T00:00:00Z',
}


def start_server():
    import os

    os.chdir(ROOT)

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    httpd = HTTPServer(('127.0.0.1', 0), Handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port, thread


def main():
    backup = json.loads(BACKUP.read_text(encoding='utf-8'))
    cloud_payload = {INVENTORY_KEY: json.dumps(backup, ensure_ascii=False)}

    httpd, port, _thread = start_server()
    base = f'http://127.0.0.1:{port}/assembly_material_management_merged_v18.html'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        def route_handler(route):
            url = route.request.url
            if SUPABASE_HOST not in url:
                return route.continue_()
            if '/auth/v1/token' in url:
                return route.fulfill(
                    status=200,
                    content_type='application/json',
                    body=json.dumps(
                        {
                            'access_token': 'test-access-token',
                            'refresh_token': 'test-refresh-token',
                            'token_type': 'bearer',
                            'expires_in': 3600,
                            'expires_at': int(time.time()) + 3600,
                            'user': MOCK_USER,
                        }
                    ),
                )
            if '/auth/v1/user' in url:
                return route.fulfill(
                    status=200,
                    content_type='application/json',
                    body=json.dumps(MOCK_USER),
                )
            if f'/rest/v1/assembly_user_state' in url and route.request.method == 'GET':
                return route.fulfill(
                    status=200,
                    content_type='application/json',
                    body=json.dumps([{'payload': cloud_payload}]),
                )
            if f'/rest/v1/assembly_user_state' in url and route.request.method in ('POST', 'PATCH'):
                return route.fulfill(status=201, content_type='application/json', body='{}')
            return route.continue_()

        page.route('**/*', route_handler)
        page.goto(base, wait_until='networkidle')
        page.fill('#authEmail', 'admin')
        page.fill('#authPassword', 'test-pass-123')
        page.click('#btnSignIn')
        page.wait_for_selector('#appShell:not(.hidden)', timeout=15000)
        page.wait_for_selector('#syncPill:has-text("云端已同步")', timeout=20000)
        frame = page.frame_locator('#inventoryFrame')
        for el_id, expected in EXPECTED.items():
            text = frame.locator(f'#{el_id}').inner_text(timeout=15000)
            ok = text.strip() == expected
            print(f"{'OK' if ok else 'FAIL'} {el_id}: {text.strip()} (expected {expected})")
            if not ok:
                browser.close()
                httpd.shutdown()
                return 1
        pill = page.locator('#syncPill').inner_text()
        print(f'OK sync pill: {pill}')
        browser.close()

    httpd.shutdown()
    print('E2E passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
