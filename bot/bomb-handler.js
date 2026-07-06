// bomb-handler.js — Message & interaction handling for Bomb Survival
import { AttachmentBuilder } from 'discord.js';
import {
  bombGames,
  createBombGame,
  getBombGame,
  deleteBombGame,
  getAliveBombPlayers,
  rollBombTiles,
  getCurrentBombPlayer,
  advanceBombTurn,
  MIN_PLAYERS,
  MAX_PLAYERS,
  TURN_TIME_MS,
} from './bomb-game.js';
import {
  buildBombLobbyEmbed,
  buildBombLobbyButtons,
  buildBetButtons,
  buildBombStartEmbed,
  buildBombBoardEmbed,
  buildTileButtons,
  buildBombResultEmbed,
  buildBombWinnerEmbed,
  buildBombCancelledEmbed,
} from './bomb-embeds.js';
import { getUser, addGold, recordGameEnd } from './pirate-db.js';

const pendingBets = new Map(); // userId -> channelId (waiting for bet choice)

// ─── !bomb command ──────────────────────────────────────────────────────────
export async function handleBombMessage(client, msg) {
  const content = msg.content.trim().toLowerCase();
  if (content !== '!bomb') return false;

  const channelId = msg.channel.id;
  if (getBombGame(channelId)) {
    await msg.reply('⚠️ Ciyaar Bomb Survival ah ayaa horeba ka socota channel-kan.').catch(() => null);
    return true;
  }

  const game = createBombGame(channelId, msg.guild.id, msg.author.id, msg.author.username);
  const lobbyMsg = await msg.channel.send({
    embeds: [buildBombLobbyEmbed(game)],
    components: [buildBombLobbyButtons(game)],
  });
  game.lobbyMessageId = lobbyMsg.id;
  return true;
}

// ─── Refresh lobby ──────────────────────────────────────────────────────────
async function refreshBombLobby(client, game) {
  if (!game.lobbyMessageId) return;
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (!lm) return;
  await lm.edit({
    embeds: [buildBombLobbyEmbed(game)],
    components: [buildBombLobbyButtons(game)],
  }).catch(() => null);
}

// ─── Start a turn ───────────────────────────────────────────────────────────
async function startBombTurn(client, game) {
  const alive = getAliveBombPlayers(game);
  if (alive.length <= 1) {
    await endBombGame(client, game);
    return;
  }

  const player = getCurrentBombPlayer(game);
  if (!player) {
    await endBombGame(client, game);
    return;
  }

  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch) { deleteBombGame(game.channelId); return; }

  let timeLeft = TURN_TIME_MS / 1000;
  const boardMsg = await ch.send({
    embeds: [buildBombBoardEmbed(game, player, timeLeft)],
    components: buildTileButtons(game),
  }).catch(() => null);
  if (!boardMsg) { deleteBombGame(game.channelId); return; }
  game.boardMessageId = boardMsg.id;
  game.currentTurnPlayerId = player.id;

  game.turnTimeout = setTimeout(async () => {
    await autoPickTile(client, game, boardMsg);
  }, TURN_TIME_MS);
}

async function autoPickTile(client, game, boardMsg) {
  const player = getCurrentBombPlayer(game);
  if (!player) return;
  const unrevealed = game.tiles.map((t, i) => ({ t, i })).filter((x) => !x.t.revealed);
  if (unrevealed.length === 0) { await endBombGame(client, game); return; }
  const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  await resolveTilePick(client, game, player, pick.i, boardMsg);
}

async function resolveTilePick(client, game, player, tileIndex, boardMsg) {
  if (game.turnTimeout) { clearTimeout(game.turnTimeout); game.turnTimeout = null; }
  const tile = game.tiles[tileIndex];
  if (!tile || tile.revealed) return;
  tile.revealed = true;

  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (ch) {
    await ch.send({ embeds: [buildBombResultEmbed(player, tile, tileIndex)] }).catch(() => null);
  }

  if (tile.isBomb) {
    const p = game.players.get(player.id);
    if (p) p.alive = false;
    recordGameEnd(player.id, player.name, false);
  } else {
    advanceBombTurn(game);
  }

  const alive = getAliveBombPlayers(game);
  if (alive.length <= 1) {
    await endBombGame(client, game);
    return;
  }

  await startBombTurn(client, game);
}

async function endBombGame(client, game) {
  const alive = getAliveBombPlayers(game);
  const ch = await client.channels.fetch(game.channelId).catch(() => null);

  if (alive.length === 1) {
    const winner = alive[0];
    const prize = game.prizePool;
    addGold(winner.id, winner.name, prize);
    recordGameEnd(winner.id, winner.name, true);
    if (ch) await ch.send({ embeds: [buildBombWinnerEmbed(winner, prize)] }).catch(() => null);
  } else if (ch) {
    await ch.send('💣 Ciyaarta way dhammaatay — cid ma badbaadin.').catch(() => null);
  }

  deleteBombGame(game.channelId);
}

// ─── Interactions ───────────────────────────────────────────────────────────
export async function handleBombInteraction(client, interaction) {
  const customId = interaction.customId;
  if (!customId.startsWith('bomb_')) return false;

  const channelId = interaction.channel.id;
  const game = getBombGame(channelId);

  // Join → show bet choices
  if (customId === 'bomb_join') {
    if (!game) { await interaction.reply({ content: '⚠️ Ciyaartan ma jirto.', ephemeral: true }); return true; }
    if (game.status !== 'lobby') { await interaction.reply({ content: '⚠️ Ciyaarta waa bilaabatay.', ephemeral: true }); return true; }
    if (game.players.has(interaction.user.id)) { await interaction.reply({ content: '⚠️ Horeba waad ku jirtaa ciyaarta.', ephemeral: true }); return true; }
    if (game.players.size >= MAX_PLAYERS) { await interaction.reply({ content: '⚠️ Ciyaarta way buuxantay.', ephemeral: true }); return true; }
    pendingBets.set(interaction.user.id, channelId);
    await interaction.reply({ content: '💰 Dooro qadarka aad sharad ku dhigayso:', components: buildBetButtons(), ephemeral: true });
    return true;
  }

  // Bet amount chosen
  if (customId.startsWith('bomb_bet_')) {
    const amount = parseInt(customId.replace('bomb_bet_', ''), 10);
    const pendingChannelId = pendingBets.get(interaction.user.id);
    if (!pendingChannelId) { await interaction.reply({ content: '⚠️ Wakhtigii dooriddu wuu dhacay.', ephemeral: true }); return true; }
    const g = getBombGame(pendingChannelId);
    if (!g || g.status !== 'lobby') { await interaction.reply({ content: '⚠️ Ciyaartan ma jirto ama waa bilaabatay.', ephemeral: true }); pendingBets.delete(interaction.user.id); return true; }

    const user = getUser(interaction.user.id, interaction.user.username);
    if ((user.gold || 0) < amount) {
      await interaction.reply({ content: `⚠️ Lacag kuguma filna. Waxaad haysataa $${(user.gold || 0).toLocaleString()}.`, ephemeral: true });
      return true;
    }

    addGold(interaction.user.id, interaction.user.username, -amount);
    g.players.set(interaction.user.id, { id: interaction.user.id, name: interaction.user.username, bet: amount, alive: true });
    g.prizePool += amount;
    pendingBets.delete(interaction.user.id);

    await interaction.reply({ content: `✅ Waad ku biirtay ciyaarta — sharad: $${amount.toLocaleString()}`, ephemeral: true });
    await refreshBombLobby(client, g);
    return true;
  }

  // Leave lobby
  if (customId === 'bomb_leave') {
    if (!game) { await interaction.reply({ content: '⚠️ Ciyaartan ma jirto.', ephemeral: true }); return true; }
    if (game.status !== 'lobby') { await interaction.reply({ content: '⚠️ Ciyaarta waa bilaabatay, kama bixi kartid.', ephemeral: true }); return true; }
    const p = game.players.get(interaction.user.id);
    if (!p) { await interaction.reply({ content: '⚠️ Kuma jirtid ciyaarta.', ephemeral: true }); return true; }
    addGold(interaction.user.id, interaction.user.username, p.bet);
    game.prizePool -= p.bet;
    game.players.delete(interaction.user.id);
    await interaction.reply({ content: '🚪 Waad ka baxday ciyaarta. Sharadkaagii waa lagu soo celiyay.', ephemeral: true });
    await refreshBombLobby(client, game);
    return true;
  }

  // Start game (host only)
  if (customId === 'bomb_start') {
    if (!game) { await interaction.reply({ content: '⚠️ Ciyaartan ma jirto.', ephemeral: true }); return true; }
    if (interaction.user.id !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya kii bilaabay ciyaarta ayaa bilaabi kara.', ephemeral: true }); return true; }
    if (game.status !== 'lobby') { await interaction.reply({ content: '⚠️ Ciyaarta horeba waa socotaa.', ephemeral: true }); return true; }
    if (game.players.size < MIN_PLAYERS) { await interaction.reply({ content: `⚠️ Ugu yaraan ${MIN_PLAYERS} ciyaaryahan ayaa loo baahan yahay.`, ephemeral: true }); return true; }

    game.status = 'playing';
    const { tiles, bombCount } = rollBombTiles();
    game.tiles = tiles;
    game.bombCount = bombCount;
    game.turnOrder = Array.from(game.players.keys());
    game.turnIndex = 0;

    await interaction.reply({ embeds: [buildBombStartEmbed(game)] });
    setTimeout(() => startBombTurn(client, game), 2000);
    return true;
  }

  // Stop game (host only)
  if (customId === 'bomb_stop') {
    if (!game) { await interaction.reply({ content: '⚠️ Ciyaartan ma jirto.', ephemeral: true }); return true; }
    if (interaction.user.id !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya kii bilaabay ciyaarta ayaa joojin kara.', ephemeral: true }); return true; }
    for (const p of game.players.values()) {
      addGold(p.id, p.name, p.bet);
    }
    await interaction.reply({ embeds: [buildBombCancelledEmbed()] });
    deleteBombGame(channelId);
    return true;
  }

  // Tile pick
  if (customId.startsWith('bomb_tile_')) {
    if (!game || game.status !== 'playing') { await interaction.reply({ content: '⚠️ Ciyaartan ma socoto.', ephemeral: true }); return true; }
    const current = getCurrentBombPlayer(game);
    if (!current || current.id !== interaction.user.id) {
      await interaction.reply({ content: '⚠️ Marka kuguma jirto — sug marka aad gaadhid.', ephemeral: true });
      return true;
    }
    const tileIndex = parseInt(customId.replace('bomb_tile_', ''), 10);
    if (game.tiles[tileIndex]?.revealed) {
      await interaction.reply({ content: '⚠️ Tile-kan horeba waa la furay.', ephemeral: true });
      return true;
    }
    await interaction.deferUpdate().catch(() => null);
    const ch = await client.channels.fetch(game.channelId).catch(() => null);
    const boardMsg = ch ? await ch.messages.fetch(game.boardMessageId).catch(() => null) : null;
    await resolveTilePick(client, game, current, tileIndex, boardMsg);
    return true;
  }

  return false;
}
