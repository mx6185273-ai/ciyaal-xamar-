// bomb-game.js — Bomb Survival game state & logic
export const bombGames = new Map(); // channelId -> game

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const BET_AMOUNTS = [500, 1000, 2000, 3000, 4000, 5000];
export const TILE_COUNT = 10;
export const TURN_TIME_MS = 10_000;

export function createBombGame(channelId, guildId, hostId, hostName) {
  const game = {
    channelId,
    guildId,
    hostId,
    hostName,
    status: 'lobby', // lobby | playing | ended
    players: new Map(), // userId -> { id, name, bet, alive }
    prizePool: 0,
    bombCount: 0,
    tiles: [],
    turnOrder: [],
    turnIndex: 0,
    lobbyMessageId: null,
    boardMessageId: null,
    turnTimeout: null,
    createdAt: Date.now(),
  };
  bombGames.set(channelId, game);
  return game;
}

export function getBombGame(channelId) {
  return bombGames.get(channelId);
}

export function deleteBombGame(channelId) {
  const game = bombGames.get(channelId);
  if (game?.turnTimeout) clearTimeout(game.turnTimeout);
  bombGames.delete(channelId);
}

export function getAliveBombPlayers(game) {
  return Array.from(game.players.values()).filter((p) => p.alive);
}

export function rollBombTiles() {
  const bombCount = Math.random() < 0.5 ? 2 : 3;
  const positions = new Set();
  while (positions.size < bombCount) {
    positions.add(Math.floor(Math.random() * TILE_COUNT));
  }
  const tiles = Array.from({ length: TILE_COUNT }, (_, i) => ({
    isBomb: positions.has(i),
    revealed: false,
  }));
  return { tiles, bombCount };
}

export function getCurrentBombPlayer(game) {
  const alive = getAliveBombPlayers(game);
  if (alive.length === 0) return null;
  const order = game.turnOrder.filter((id) => game.players.get(id)?.alive);
  if (order.length === 0) return null;
  const idx = game.turnIndex % order.length;
  return game.players.get(order[idx]);
}

export function advanceBombTurn(game) {
  const order = game.turnOrder.filter((id) => game.players.get(id)?.alive);
  if (order.length === 0) return;
  game.turnIndex = (game.turnIndex + 1) % order.length;
}
