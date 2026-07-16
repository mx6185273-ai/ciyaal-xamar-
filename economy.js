// economy.js — Ciyaal Xamar · Wallet / Cash Economy
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, 'data');
const DATA_FILE  = join(DATA_DIR, 'economy.json');
const STARTING_CASH = 5000;

function loadData() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
    return { users: {} };
  }
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { return { users: {} }; }
}

function saveData(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getUser(userId, username) {
  const data = loadData();
  if (!data.users[userId]) {
    data.users[userId] = { id: userId, username, cash: STARTING_CASH };
    saveData(data);
  }
  return data.users[userId];
}

export function getBalance(userId, username) {
  return getUser(userId, username).cash;
}

export function addCash(userId, username, amount) {
  const data = loadData();
  const u = data.users[userId] || { id: userId, username, cash: STARTING_CASH };
  u.cash = Math.max(0, (u.cash || 0) + amount);
  data.users[userId] = u;
  saveData(data);
  return u.cash;
}

export function deductCash(userId, username, amount) {
  const data = loadData();
  const u = data.users[userId] || { id: userId, username, cash: STARTING_CASH };
  if ((u.cash || 0) < amount) return { ok: false, balance: u.cash || 0 };
  u.cash = (u.cash || 0) - amount;
  data.users[userId] = u;
  saveData(data);
  return { ok: true, balance: u.cash };
}
