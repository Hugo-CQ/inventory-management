#!/usr/bin/env node
/**
 * Live verify / seed admin cloud. ADMIN_PASSWORD required.
 * Run: ADMIN_PASSWORD=... node scripts/verify_sync.mjs
 */
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://wkcgsvtdnsdwydusqepw.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2dzdnRkbnNkd3lkdXNxZXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzYyMjUsImV4cCI6MjA5NjExMjIyNX0.fQfFsDdj2E3oDYqgCI_DnPqVKwN4aZGgDi-ruN55Pd8';
const INVENTORY_KEY = 'box_inventory_site_v1';
const TABLE = 'assembly_user_state';
const EXPECTED = { shelves: 35, boxes: 126, partTypes: 78, semiFinished: 173 };
const BACKUP =
  process.env.BACKUP_JSON || '/Users/idca/Downloads/物料管理系统备份_202606041533.json';

const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error('Set ADMIN_PASSWORD to run live verification.');
  process.exit(1);
}

async function api(url, { method = 'GET', body, token } = {}) {
  const headers = { apikey: ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.message || json?.error_description || text || res.statusText);
  return json;
}

function parseInventory(raw) {
  if (!raw) return { boxes: [], bom: [], binds: [] };
  const parsed = JSON.parse(raw);
  return {
    boxes: Array.isArray(parsed.boxes) ? parsed.boxes : [],
    bom: Array.isArray(parsed.bom) ? parsed.bom : [],
    binds: Array.isArray(parsed.binds) ? parsed.binds : []
  };
}

function calcStats(state) {
  const shelves = new Set(state.boxes.map((b) => b.shelfCode).filter(Boolean));
  const partTypes = new Set(
    state.binds.map(
      (row) =>
        `${row.stockType || '零件物料'}|${row.materialCode || `${row.materialName}|${row.spec}`}`
    )
  );
  const semiFinished = state.binds
    .filter((row) => (row.stockType || '零件物料') === '半成品')
    .reduce((sum, row) => sum + (parseInt(row.quantity, 10) || 0), 0);
  return {
    shelves: shelves.size,
    boxes: state.boxes.length,
    partTypes: partTypes.size,
    semiFinished
  };
}

function hasInventory(payload) {
  if (!payload) return false;
  const inv = parseInventory(payload[INVENTORY_KEY]);
  return inv.boxes.length > 0 || inv.bom.length > 0 || inv.binds.length > 0;
}

const auth = await api(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  body: { email: 'admin@inventory.local', password }
});
const token = auth.access_token;
const userId = auth.user.id;

let rows = await api(`${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${userId}&select=payload`, {
  token
});
let payload = rows[0]?.payload;

if (!hasInventory(payload)) {
  console.log('Cloud empty — seeding from backup...');
  const backup = JSON.parse(readFileSync(BACKUP, 'utf8'));
  await api(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    token,
    body: { user_id: userId, payload: { [INVENTORY_KEY]: JSON.stringify(backup) } }
  });
  rows = await api(`${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${userId}&select=payload`, {
    token
  });
  payload = rows[0]?.payload;
}

const state = parseInventory(payload?.[INVENTORY_KEY]);
const stats = calcStats(state);
let ok = true;
for (const [key, expected] of Object.entries(EXPECTED)) {
  const pass = stats[key] === expected;
  console.log(`${pass ? 'OK' : 'FAIL'} ${key}: ${stats[key]} (expected ${expected})`);
  if (!pass) ok = false;
}
console.log(`raw: boxes=${state.boxes.length} bom=${state.bom.length} binds=${state.binds.length}`);
process.exit(ok ? 0 : 1);
