// pirate-handler.js — Command & Interaction handler for Pirate Treasure Hunt
// Ciyaal Xamar · Ka-saaris (Elimination) Mode
import { AttachmentBuilder } from 'discord.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  pirateGames,
  createPirateGame,
  getAlivePiratePlayers,
  rollIslandOutcome,
  getPirateGuildGames,
} from './pirate-game.js';

import {
  buildPirateLobbyEmbed,
  buildPirateLobbyButtons,
  buildPirateStartEmbed,
  buildPirateRoundEmbed,
  buildIslandButtons,
  buildRoundResultsEmbed,
  buildPirateWinnerEmbed,
  buildShopEmbed,
  buildShopButtons,
  buildInventoryEmbed,
  buildDailyEmbed,
  buildLeaderboardEmbed,
} from './pirate-embeds.js';

import {
  getUser,
  addGold,
  addGems,
  addItem,
  buyItem,
  claimDaily,
  recordGameEnd,
  getLeaderboard,
  removeItem,
} from './pirate-db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BANNER_PATH = join(__dirname, 'assets', 'pirate-banner.png');
const MAX_PIRATE_GAMES = 5;
const ROUND_TIMEOUT_MS = 30_000;

function getBanner() {
  return new AttachmentBuilder(BANNER_PATH, { name: 'pirate-banner.png' });
}

// ─── Refresh lobby message ────────────────────────────────────────────────────
async function refreshPirateLobby(client, game, guild) {
  if (!game.lobbyMessageId) return;
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (!lm) return;
  await lm.edit({
    embeds:      [buildPirateLobbyEmbed(game, guild)],
    components:  [buildPirateLobbyButtons(game)],
    files:       [getBanner()],
  }).catch(() => null);
}

// ─── Start a round ────────────────────────────────────────────────────────────
async function startPirateRound(client, game) {
  const alive = getAlivePiratePlayers(game);
  if (alive.length <= 1) {
    await endPirateGame(client, game);
    return;
  }

  game.round++;
  game.roundChoices = new Map();

  if (game.round > game.maxRounds) {
    await endPirateGame(client, game, 'rounds');
    return;
  }

  // Check who has treasure map for safe island hint
  const safeHints = [];
  const mapUsers  = alive.filter(p => (p.items || []).includes('treasure_map'));
  if (mapUsers.length > 0) {
    // Pick 1-2 random islands as "safe" hints (just a hint, not guaranteed)
    const islands = ['A','B','C','D','E'];
    const hint    = islands[Math.floor(Math.random() * islands.length)];
    safeHints.push(`Island ${hint}`);
    // Remove one map from each user who has it
    for (const p of mapUsers) {
      const idx = p.items.indexOf('treasure_map');
      if (idx !== -1) p.items.splice(idx, 1);
    }
  }

  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch) return;

  const roundMsg = await ch.send({
    embeds:     [buildPirateRoundEmbed(game, safeHints)],
    components: buildIslandButtons(game),
  }).catch(() => null);

  if (roundMsg) game.roundMessageId = roundMsg.id;

  // Auto-resolve after 30s
  game.roundTimer = setTimeout(() => resolveRound(client, game), ROUND_TIMEOUT_MS);
}

// ─── Resolve round ────────────────────────────────────────────────────────────
async function resolveRound(client, game) {
  if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }

  const alive   = getAlivePiratePlayers(game);
  const results = [];

  for (const player of alive) {
    const choice     = game.roundChoices.get(player.id);
    const hasCompass = (player.items || []).includes('lucky_compass');

    if (!choice) {
      // Skipped — no change
      results.push({ ...player, island: '?', type: 'skipped', skipped: true, shortMsg: 'Ma dooranin', saved: false });
      continue;
    }

    // Remove lucky compass if used
    if (hasCompass) {
      const idx = player.items.indexOf('lucky_compass');
      if (idx !== -1) player.items.splice(idx, 1);
    }

    const outcome = rollIslandOutcome(hasCompass);
    let saved = false;

    if (outcome.type === 'deadly') {
      // Check for shield
      const shieldIdx = (player.items || []).indexOf('shield');
      if (shieldIdx !== -1) {
        player.items.splice(shieldIdx, 1);
        saved = true;
        results.push({ ...player, island: choice, type: 'deadly', saved: true, shortMsg: 'Shield Kaa Badbaadiyay!', gold: 0, gems: 0 });
        continue;
      }
      // Eliminated
      player.alive = false;
      results.push({ ...player, island: choice, type: 'deadly', saved: false, shortMsg: 'Waad ka baxday!', gold: 0, gems: 0 });
      recordGameEnd(player.id, player.displayName, false);
      continue;
    }

    // Apply outcome
    if (outcome.gold > 0)   { player.sessionGold = (player.sessionGold || 0) + outcome.gold; }
    if (outcome.gold < 0)   { player.sessionGold = Math.max(0, (player.sessionGold || 0) + outcome.gold); }
    if (outcome.gems > 0)   { player.sessionGems = (player.sessionGems || 0) + outcome.gems; }
    if (outcome.item)       { player.items = player.items || []; player.items.push(outcome.item); }

    results.push({
      ...player,
      island: choice,
      type: outcome.type,
      saved: false,
      shortMsg: outcome.type === 'gold'  ? `+${outcome.gold} Gold` :
                outcome.type === 'gems'  ? `+${outcome.gems} Gems` :
                outcome.type === 'item'  ? `📦 ${outcome.item}` :
                outcome.type === 'trap'  ? `${outcome.gold} Gold` : '',
      gold: outcome.gold,
      gems: outcome.gems,
    });
  }

  // Update lobby message with results
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (ch && game.roundMessageId) {
    const rm = await ch.messages.fetch(game.roundMessageId).catch(() => null);
    if (rm) await rm.edit({ embeds: [buildRoundResultsEmbed(game, results)], components: [] }).catch(() => null);
  }

  const nowAlive = getAlivePiratePlayers(game);

  if (nowAlive.length <= 1) {
    setTimeout(() => endPirateGame(client, game), 2000);
    return;
  }

  // Next round
  setTimeout(() => startPirateRound(client, game), 4000);
}

// ─── End game ─────────────────────────────────────────────────────────────────
async function endPirateGame(client, game, reason = 'elimination') {
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  const alive = getAlivePiratePlayers(game);

  let winner = null;
  let isLastStanding = false;

  if (alive.length === 1) {
    winner         = alive[0];
    isLastStanding = true;
  } else if (alive.length === 0) {
    // Everyone eliminated — richest by session gold
    const all = Array.from(game.players.values());
    winner = all.sort((a, b) => (b.sessionGold || 0) - (a.sessionGold || 0))[0];
  } else {
    // Rounds finished — richest alive wins
    winner = alive.sort((a, b) => (b.sessionGold || 0) - (a.sessionGold || 0))[0];
  }

  // Persist earnings to DB
  for (const player of game.players.values()) {
    if ((player.sessionGold || 0) > 0) addGold(player.id, player.displayName, player.sessionGold);
    if ((player.sessionGems || 0)  > 0) addGems(player.id, player.displayName, player.sessionGems);
    if (player.items?.length > 0) {
      for (const item of player.items) addItem(player.id, player.displayName, item);
    }
  }
  if (winner) recordGameEnd(winner.id, winner.displayName, true);

  game.phase = 'ended';
  pirateGames.delete(game.channelId);

  if (ch && winner) {
    await ch.send({
      embeds:  [buildPirateWinnerEmbed(winner, isLastStanding)],
      files:   [getBanner()],
    }).catch(() => null);
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────
export async function handlePirateMessage(client, msg) {
  if (msg.author.bot || !msg.guild) return false;
  const content   = msg.content.trim().toLowerCase();
  const raw       = msg.content.trim();
  const channelId = msg.channel.id;
  const guildId   = msg.guild.id;
  const userId    = msg.author.id;
  const username  = msg.member?.displayName ?? msg.author.username;

  // ── !pirate ──────────────────────────────────────────────────────────────
  if (content === '!pirate') {
    const existing = pirateGames.get(channelId);
    if (existing && existing.phase !== 'ended') {
      await msg.reply('⚠️ Kanaalkan ciyaaro pirate ah oo socota ayaa ku jirta! Jooji ciyaartii hore ka hor.');
      return true;
    }
    const guildGames = getPirateGuildGames(guildId);
    if (guildGames.length >= MAX_PIRATE_GAMES) {
      await msg.reply(`⚠️ Servarkaan ${MAX_PIRATE_GAMES} ciyaaro ayaa isku mar ka socda.`);
      return true;
    }
    const game = createPirateGame(guildId, channelId, userId);
    game.players.set(userId, {
      id: userId,
      username: msg.author.username,
      displayName: username,
      alive: true,
      items: [],
      sessionGold: 0,
      sessionGems: 0,
    });
    const lobbyMsg = await msg.channel.send({
      embeds:     [buildPirateLobbyEmbed(game, msg.guild)],
      components: [buildPirateLobbyButtons(game)],
      files:      [getBanner()],
    });
    game.lobbyMessageId = lobbyMsg.id;
    return true;
  }

  // ── !shop ─────────────────────────────────────────────────────────────────
  if (content === '!shop') {
    await msg.reply({ embeds: [buildShopEmbed()], components: [buildShopButtons()] });
    return true;
  }

  // ── !buy ──────────────────────────────────────────────────────────────────
  if (content.startsWith('!buy')) {
    const arg = raw.slice('!buy'.length).trim().toLowerCase();
    let item, goldCost = 0, gemCost = 0, itemId = '';
    if      (arg === 'shield')  { item = '🛡️ Shield';        goldCost = 1000; itemId = 'shield';        }
    else if (arg === 'compass') { item = '🧭 Lucky Compass'; goldCost = 2000; itemId = 'lucky_compass'; }
    else if (arg === 'map')     { item = '🗺️ Treasure Map';  gemCost  = 10;   itemId = 'treasure_map';  }
    else {
      await msg.reply('⚠️ Item saxda ah ma dooranin. Isticmaal: `!buy shield`, `!buy compass`, ama `!buy map`.');
      return true;
    }
    const result = buyItem(userId, username, itemId, goldCost, gemCost);
    if (!result.ok) {
      const need = result.reason === 'gold' ? `**${goldCost.toLocaleString()} Gold**` : `**${gemCost} Gems**`;
      await msg.reply(`❌ Kuma filan ${need} si aad u ibsato **${item}**.`);
      return true;
    }
    await msg.reply(`✅ Waad iibsatay **${item}**!\n💰 Gold: ${result.user.gold.toLocaleString()} · 💎 Gems: ${result.user.gems}`);
    return true;
  }

  // ── !inventory ────────────────────────────────────────────────────────────
  if (content === '!inventory' || content === '!inv') {
    const user = getUser(userId, username);
    await msg.reply({ embeds: [buildInventoryEmbed(user)] });
    return true;
  }

  // ── !daily ────────────────────────────────────────────────────────────────
  if (content === '!daily') {
    const result = claimDaily(userId, username);
    if (!result.ok) {
      const h = Math.floor(result.remaining / 3_600_000);
      const m = Math.floor((result.remaining % 3_600_000) / 60_000);
      await msg.reply(`⏳ Daily reward waa la qaatay horeba.\n**${h}h ${m}m** ka dib ayaad dib u qaadan kartaa.`);
      return true;
    }
    await msg.reply({
      embeds: [buildDailyEmbed().setDescription(
        `💰 **+500 Gold**\n💎 **+1 Gem**\n\n` +
        `💰 Wadarta Gold: **${result.user.gold.toLocaleString()}**\n` +
        `💎 Wadarta Gems: **${result.user.gems}**`
      )],
    });
    return true;
  }

  // ── !leaderboard ──────────────────────────────────────────────────────────
  if (content === '!leaderboard' || content === '!lb') {
    const top = getLeaderboard(10);
    await msg.reply({ embeds: [buildLeaderboardEmbed(top)] });
    return true;
  }

  return false; // not handled here
}

// ─── Interaction Handler ──────────────────────────────────────────────────────
export async function handlePirateInteraction(client, interaction) {
  if (!interaction.isButton()) return false;
  const customId  = interaction.customId;
  if (!customId.startsWith('pirate_')) return false;

  const userId    = interaction.user.id;
  const channelId = interaction.channelId;
  const username  = interaction.member?.displayName ?? interaction.user.username;
  const game      = pirateGames.get(channelId);

  // ── Lobby buttons ─────────────────────────────────────────────────────────
  if (customId === 'pirate_join') {
    if (!game || game.phase !== 'lobby') {
      await interaction.reply({ content: '⚠️ Kanaalkan pirate lobby ma jiro.', ephemeral: true }); return true;
    }
    if (game.players.has(userId)) {
      await interaction.reply({ content: '⚠️ Hore baad ku biirtay lobby-ga.', ephemeral: true }); return true;
    }
    if (game.players.size >= 20) {
      await interaction.reply({ content: '⚠️ Lobby-ga wuu buuxay (20/20).', ephemeral: true }); return true;
    }
    game.players.set(userId, {
      id: userId,
      username: interaction.user.username,
      displayName: username,
      alive: true,
      items: [],
      sessionGold: 0,
      sessionGems: 0,
    });
    await refreshPirateLobby(client, game, interaction.guild);
    await interaction.reply({ content: '✅ Pirate Lobby-ga waad ku biiray! 🏴‍☠️', ephemeral: true });
    return true;
  }

  if (customId === 'pirate_leave') {
    if (!game || game.phase !== 'lobby') {
      await interaction.reply({ content: '⚠️ Kanaalkan pirate lobby ma jiro.', ephemeral: true }); return true;
    }
    if (!game.players.has(userId)) {
      await interaction.reply({ content: '⚠️ Ma jirtid lobby-ga.', ephemeral: true }); return true;
    }
    if (userId === game.hostId) {
      await interaction.reply({ content: '⚠️ Host-ku ma bixin karo. JOOJI batoonka isticmaal.', ephemeral: true }); return true;
    }
    game.players.delete(userId);
    await refreshPirateLobby(client, game, interaction.guild);
    await interaction.reply({ content: '👋 Pirate Lobby-ga waad ka baxday.', ephemeral: true });
    return true;
  }

  if (customId === 'pirate_stop') {
    if (!game || game.phase !== 'lobby') {
      await interaction.reply({ content: '⚠️ Kanaalkan pirate lobby ma jiro.', ephemeral: true }); return true;
    }
    if (userId !== game.hostId) {
      await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu joojin karaa.', ephemeral: true }); return true;
    }
    if (game.roundTimer) clearTimeout(game.roundTimer);
    game.phase = 'ended';
    pirateGames.delete(channelId);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lm) await lm.edit({ components: [] }).catch(() => null);
      }
    }
    await interaction.reply({ content: '🛑 Pirate Ciyaarta waa la joojiyay.', ephemeral: false });
    return true;
  }

  if (customId === 'pirate_start') {
    if (!game || game.phase !== 'lobby') {
      await interaction.reply({ content: '⚠️ Kanaalkan pirate lobby ma jiro.', ephemeral: true }); return true;
    }
    if (userId !== game.hostId) {
      await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu bilaabi karaa.', ephemeral: true }); return true;
    }
    if (game.players.size < 2) {
      await interaction.reply({ content: '⚠️ Ugu yaraan 2 ciyaaryahan ayaa loo baahan yahay.', ephemeral: true }); return true;
    }
    game.phase = 'playing';
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lm) await lm.edit({ components: [] }).catch(() => null);
      }
    }
    await interaction.reply({
      embeds: [buildPirateStartEmbed(game)],
      files:  [getBanner()],
    });
    setTimeout(() => startPirateRound(client, game), 3000);
    return true;
  }

  // ── Island choice ─────────────────────────────────────────────────────────
  if (customId.startsWith('pirate_island_')) {
    if (!game || game.phase !== 'playing') {
      await interaction.reply({ content: '⚠️ Ciyaaro socota ma jirto.', ephemeral: true }); return true;
    }
    const player = game.players.get(userId);
    if (!player || !player.alive) {
      await interaction.reply({ content: '⚠️ Adigu ma dooranin kartid — ciyaarta kama qayb gasho.', ephemeral: true }); return true;
    }
    if (game.roundChoices.has(userId)) {
      await interaction.reply({ content: `⚠️ Hore baad dooratay: **Island ${game.roundChoices.get(userId)}**`, ephemeral: true }); return true;
    }
    const island = customId.replace('pirate_island_', '');
    game.roundChoices.set(userId, island);

    // Update round embed
    const alive = getAlivePiratePlayers(game);
    if (game.roundMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const rm = await ch.messages.fetch(game.roundMessageId).catch(() => null);
        if (rm) await rm.edit({ embeds: [buildPirateRoundEmbed(game)], components: buildIslandButtons(game) }).catch(() => null);
      }
    }

    await interaction.reply({ content: `✅ Waad dooratay **Island ${island}**! Sugid natiiijada...`, ephemeral: true });

    // Resolve early if all alive players chose
    if (game.roundChoices.size >= alive.length) {
      if (game.roundTimer) { clearTimeout(game.roundTimer); game.roundTimer = null; }
      setTimeout(() => resolveRound(client, game), 1500);
    }
    return true;
  }

  // ── Shop buy buttons ──────────────────────────────────────────────────────
  if (customId === 'pirate_buy_shield' || customId === 'pirate_buy_compass' || customId === 'pirate_buy_map') {
    let itemId, itemName, goldCost = 0, gemCost = 0;
    if      (customId === 'pirate_buy_shield')  { itemId = 'shield';        itemName = '🛡️ Shield';        goldCost = 1000; }
    else if (customId === 'pirate_buy_compass') { itemId = 'lucky_compass'; itemName = '🧭 Lucky Compass'; goldCost = 2000; }
    else                                         { itemId = 'treasure_map';  itemName = '🗺️ Treasure Map';  gemCost  = 10;   }

    const result = buyItem(userId, username, itemId, goldCost, gemCost);
    if (!result.ok) {
      const need = result.reason === 'gold' ? `**${goldCost.toLocaleString()} Gold**` : `**${gemCost} Gems**`;
      await interaction.reply({ content: `❌ Kuma filan ${need} si aad u ibsato **${itemName}**.`, ephemeral: true });
      return true;
    }
    await interaction.reply({
      content: `✅ Waad iibsatay **${itemName}**!\n💰 Gold: ${result.user.gold.toLocaleString()} · 💎 Gems: ${result.user.gems}`,
      ephemeral: true,
    });
    return true;
  }

  return false;
}
