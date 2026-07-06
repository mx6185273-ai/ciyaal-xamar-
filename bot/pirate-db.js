// pirate-db.js — Persistent storage for Pirate Treasure Hunt
// Uses a JSON file for persistence (no external DB needed)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'pirate-data.json');

function loadData() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
    return { users: {} };
  }
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { users: {} };
  }
}

function saveData(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getUser(userId, username) {
  const data = loadData();
  if (!data.users[userId]) {
    data.users[userId] = {
      id: userId,
      username,
      gold: 0,
      gems: 0,
      totalGold: 0,
      totalWins: 0,
      totalGames: 0,
      inventory: [],
      lastDaily: null,
    };
    saveData(data);
  }
  return data.users[userId];
}

export function saveUser(user) {
  const data = loadData();
  data.users[user.id] = user;
  saveData(data);
}

export function addGold(userId, username, amount) {
  const data = loadData();
  if (!data.users[userId]) getUser(userId, username);
  const fresh = loadData();
  fresh.users[userId].gold = Math.max(0, (fresh.users[userId].gold || 0) + amount);
  if (amount > 0) fresh.users[userId].totalGold = (fresh.users[userId].totalGold || 0) + amount;
  saveData(fresh);
  return fresh.users[userId];
}

export function addGems(userId, username, amount) {
  const data = loadData();
  if (!data.users[userId]) getUser(userId, username);
  const fresh = loadData();
  fresh.users[userId].gems = Math.max(0, (fresh.users[userId].gems || 0) + amount);
  saveData(fresh);
  return fresh.users[userId];
}

export function addItem(userId, username, item) {
  const data = loadData();
  if (!data.users[userId]) getUser(userId, username);
  const fresh = loadData();
  fresh.users[userId].inventory = fresh.users[userId].inventory || [];
  fresh.users[userId].inventory.push(item);
  saveData(fresh);
  return fresh.users[userId];
}

export function removeItem(userId, itemName) {
  const data = loadData();
  if (!data.users[userId]) return null;
  const idx = data.users[userId].inventory.findIndex(i => i === itemName);
  if (idx === -1) return null;
  data.users[userId].inventory.splice(idx, 1);
  saveData(data);
  return data.users[userId];
}

export function buyItem(userId, username, item, goldCost, gemCost) {
  const data = loadData();
  if (!data.users[userId]) getUser(userId, username);
  const fresh = loadData();
  const u = fresh.users[userId];
  if (goldCost && u.gold < goldCost) return { ok: false, reason: 'gold' };
  if (gemCost  && u.gems  < gemCost)  return { ok: false, reason: 'gems'  };
  if (goldCost) u.gold -= goldCost;
  if (gemCost)  u.gems -= gemCost;
  u.inventory = u.inventory || [];
  u.inventory.push(item);
  saveData(fresh);
  return { ok: true, user: u };
}

export function claimDaily(userId, username) {
  const data  = loadData();
  if (!data.users[userId]) getUser(userId, username);
  const fresh = loadData();
  const u     = fresh.users[userId];
  const now   = Date.now();
  const last  = u.lastDaily ? new Date(u.lastDaily).getTime() : 0;
  const diff  = now - last;
  const COOLDOWN = 24 * 60 * 60 * 1000;
  if (diff < COOLDOWN) {
    const remaining = COOLDOWN - diff;
    return { ok: false, remaining };
  }
  u.gold     = (u.gold || 0) + 500;
  u.gems     = (u.gems || 0) + 1;
  u.lastDaily = new Date().toISOString();
  saveData(fresh);
  return { ok: true, user: u };
}

export function recordGameEnd(userId, username, won) {
  const data = loadData();
  if (!data.users[userId]) getUser(userId, username);
  const fresh = loadData();
  fresh.users[userId].totalGames = (fresh.users[userId].totalGames || 0) + 1;
  if (won) fresh.users[userId].totalWins = (fresh.users[userId].totalWins || 0) + 1;
  saveData(fresh);
}

export function getLeaderboard(limit = 10) {
  const data  = loadData();
  const users = Object.values(data.users);
  return users
    .sort((a, b) => (b.totalGold || 0) - (a.totalGold || 0))
    .slice(0, limit);
}
