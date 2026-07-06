// pirate-game.js — Pirate Treasure Hunt game state & logic
// Ciyaal Xamar · Ka-saaris (Elimination) Mode

/** @type {Map<string, object>} Key: channelId */
export const pirateGames = new Map();

export const ISLANDS = [
  { id: 'A', emoji: '🏝️', name: 'Island A' },
  { id: 'B', emoji: '🌴', name: 'Island B' },
  { id: 'C', emoji: '⛵', name: 'Island C' },
  { id: 'D', emoji: '🗿', name: 'Island D' },
  { id: 'E', emoji: '🏔️', name: 'Island E' },
];

export const ITEMS = {
  SHIELD:         { id: 'shield',         name: '🛡️ Shield',          goldCost: 1000, gemCost: 0  },
  LUCKY_COMPASS:  { id: 'lucky_compass',  name: '🧭 Lucky Compass',   goldCost: 2000, gemCost: 0  },
  TREASURE_MAP:   { id: 'treasure_map',   name: '🗺️ Treasure Map',    goldCost: 0,    gemCost: 10 },
};

export function createPirateGame(guildId, channelId, hostId) {
  const game = {
    guildId,
    channelId,
    hostId,
    players: new Map(),
    phase: 'lobby',
    round: 0,
    maxRounds: 10,
    lobbyMessageId: null,
    roundMessageId: null,
    roundChoices: new Map(),
    roundTimer: null,
    createdAt: new Date(),
  };
  pirateGames.set(channelId, game);
  return game;
}

// Roll outcome for a player on an island
// Returns: { type, gold, gems, item, message }
export function rollIslandOutcome(hasLuckyCompass) {
  // Base probabilities (out of 100):
  // 35% Gold, 8% Rare (Gems), 12% Item, 25% Trap, 20% Deadly Trap
  // Lucky Compass: boosts Gold+15, Rare+5, reduces Deadly-10, Trap-10
  let weights = hasLuckyCompass
    ? [50, 13, 14, 15, 8]   // [gold, rare, item, trap, deadly]
    : [35,  8, 12, 25, 20];

  const roll = Math.random() * 100;
  let cumulative = 0;
  let outcome = 4; // default deadly
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) { outcome = i; break; }
  }

  switch (outcome) {
    case 0: { // Gold
      const amount = Math.floor(Math.random() * 301) + 200; // 200-500
      return { type: 'gold', gold: amount, gems: 0, item: null,
        message: `💰 **Khasnad La Helay!**\n+${amount} Gold` };
    }
    case 1: { // Rare Gems
      const gems = Math.floor(Math.random() * 2) + 1; // 1-2
      return { type: 'gems', gold: 0, gems, item: null,
        message: `💎 **Khasnad Nadir!**\n+${gems} Gems` };
    }
    case 2: { // Item
      const items = ['shield', 'lucky_compass'];
      const itm   = items[Math.floor(Math.random() * items.length)];
      const label = itm === 'shield' ? '🛡️ Shield' : '🧭 Lucky Compass';
      return { type: 'item', gold: 0, gems: 0, item: itm,
        message: `📦 **Shay La Helay!**\n${label}` };
    }
    case 3: { // Trap
      const loss = Math.floor(Math.random() * 201) + 100; // 100-300
      return { type: 'trap', gold: -loss, gems: 0, item: null,
        message: `☠️ **Dabin La Helay!**\n-${loss} Gold` };
    }
    case 4: // Deadly Trap
    default:
      return { type: 'deadly', gold: 0, gems: 0, item: null,
        message: `💥 **Dabin Haliste Ah!**\nWaad ka baxday ciyaarta.` };
  }
}

export function getAlivePiratePlayers(game) {
  return Array.from(game.players.values()).filter(p => p.alive);
}

export function getPirateGuildGames(guildId) {
  return Array.from(pirateGames.values()).filter(g => g.guildId === guildId);
}
