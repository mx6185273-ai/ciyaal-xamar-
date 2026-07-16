// bomb-handler.js — Ciyaal Xamar · Bomb Survival Game v2
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBalance, addCash, deductCash } from './economy.js';

const bombGames = new Map();
const BET_AMOUNTS = [500, 1000, 2000, 3000, 4000, 5000];
const TURN_TIME   = 15;

const BOMB_LOBBY_IMAGE = 'https://cdn.discordapp.com/attachments/1470820767204638742/1523824380075970670/IMG_6568.jpg?ex=6a4e2c4b&is=6a4cdacb&hm=e5edcb48a5ea1a3c72e6e5233b426e9c39dea6ebb83a9f3b79b3484b742b5f45';

function getTileCount(playerCount) {
  if (playerCount >= 7) return 14;
  if (playerCount >= 5) return 12;
  return 10;
}

function getBombCount(tileCount) {
  if (tileCount >= 14) return Math.random() < 0.5 ? 3 : 4;
  return Math.random() < 0.5 ? 2 : 3;
}

function chunkTiles(tiles) {
  const n = tiles.length;
  if (n <= 10) return [tiles.slice(0, 5), tiles.slice(5, 10)];
  if (n <= 12) return [tiles.slice(0, 4), tiles.slice(4, 8), tiles.slice(8, 12)];
  return [tiles.slice(0, 5), tiles.slice(5, 10), tiles.slice(10)];
}

// ─── Embed / Button Builders ──────────────────────────────────────────────────

function buildLobbyEmbed(game) {
  const players   = Array.from(game.players.values());
  const prizePool = players.reduce((s, p) => s + p.bet, 0);
  const list      = players.length === 0
    ? '_Wali ciyaaryahan ma jiraan_'
    : players.map(p => `👤 **${p.displayName}** — $${p.bet.toLocaleString()}`).join('\n');

  return new EmbedBuilder()
    .setTitle('💣 BOMB SURVIVAL')
    .setColor(0x2b2d31)
    .setImage(BOMB_LOBBY_IMAGE)
    .setDescription('Ku soo biir ciyaarta!\nHost-ku wuxuu bilaabi karaa marka dhammaantood diyaar yihiin.')
    .addFields(
      { name: '👥 Ciyaaryahanno', value: `**${players.length}** / 8`,         inline: true },
      { name: '💰 Prize Pool',    value: `**$${prizePool.toLocaleString()}**`, inline: true },
      { name: '💣 Bombs',         value: 'Random',                             inline: true },
      { name: '⏳ Xaalad', value: players.length < 2
          ? '⚠️ Ugu yaraan 2 ciyaaryahan — sugaya...'
          : '✅ Diyaar — Host wuxuu bilaabi karaa.' },
      { name: '📋 Ciyaaryahanno', value: list },
    )
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
}

function buildLobbyButtons(game) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bomb_join_${game.channelId}`).setLabel('Ku biir').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bomb_leave_${game.channelId}`).setLabel('Ka bax').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bomb_start_${game.channelId}`).setLabel('▶️ Bilaab Hadda').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bomb_stop_${game.channelId}`).setLabel('Jooji').setStyle(ButtonStyle.Secondary),
  )];
}

function buildBetButtons(game) {
  return [
    new ActionRowBuilder().addComponents(BET_AMOUNTS.slice(0, 3).map(a =>
      new ButtonBuilder().setCustomId(`bomb_bet_${game.channelId}_${a}`).setLabel(`💵 $${a.toLocaleString()}`).setStyle(ButtonStyle.Secondary))),
    new ActionRowBuilder().addComponents(BET_AMOUNTS.slice(3).map(a =>
      new ButtonBuilder().setCustomId(`bomb_bet_${game.channelId}_${a}`).setLabel(`💵 $${a.toLocaleString()}`).setStyle(ButtonStyle.Secondary))),
  ];
}

function buildTileButtons(game, allDisabled = false) {
  return chunkTiles(game.tiles).map(chunk =>
    new ActionRowBuilder().addComponents(chunk.map(tile => {
      let label = `${tile.idx + 1}`, style = ButtonStyle.Secondary;
      if (tile.revealed && tile.hasBomb) { label = '💥'; style = ButtonStyle.Danger; }
      else if (tile.revealed)            { label = '✅'; style = ButtonStyle.Success; }
      return new ButtonBuilder()
        .setCustomId(`bomb_tile_${game.channelId}_${tile.idx}`)
        .setLabel(label).setStyle(style)
        .setDisabled(allDisabled || tile.revealed);
    }))
  );
}

function getAlive(game) {
  return game.alivePlayersOrder.filter(id => game.players.get(id)?.alive);
}

function buildTurnEmbed(game) {
  const alive     = getAlive(game);
  const curP      = game.players.get(game.alivePlayersOrder[game.currentPlayerIndex]);
  const prizePool = Array.from(game.players.values()).reduce((s, p) => s + p.bet, 0);
  const aliveList = alive.map(id => `👤 ${game.players.get(id)?.displayName}`).join('\n') || '_—_';

  return new EmbedBuilder()
    .setTitle('💣 BOMB SURVIVAL — CIYAAR SOCDAA')
    .setColor(0xe74c3c)
    .setDescription(
      `🎮 **Jeerka: ${curP?.displayName ?? '?'}**\n` +
      `⏳ **${TURN_TIME} ilbiriqsi** — Xulo tile hoose!\n` +
      `💡 Cidna ma garanayso meesha bomb-ku yaal...`
    )
    .addFields(
      { name: '💰 Prize Pool', value: `**$${prizePool.toLocaleString()}**`, inline: true },
      { name: '👥 Nool',       value: `**${alive.length}**`,                inline: true },
      { name: '📋 Ciyaaryahanno Nool', value: aliveList },
    )
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
}

function buildResultEmbed(game, player, tileIdx, isBomb, isAuto) {
  const alive     = getAlive(game);
  const prizePool = Array.from(game.players.values()).reduce((s, p) => s + p.bet, 0);
  const aliveList = alive.map(id => `👤 ${game.players.get(id)?.displayName}`).join('\n') || '_—_';
  const autoNote  = isAuto ? '\n⏰ _Waqtigu dhacay — bot random ayuu u dooray_' : '';

  return new EmbedBuilder()
    .setTitle(isBomb ? '💥 BOOM!' : '✅ SAFE!')
    .setColor(isBomb ? 0xe74c3c : 0x57f287)
    .setDescription(
      `**${player.displayName}** waxay doorteen tile **${tileIdx + 1}**.${autoNote}\n\n` +
      (isBomb
        ? `💣 **BOMB!** ${player.displayName} wuu/waxay ka baxday ciyaarta!\n💰 Bet-kooda waxay ku hadha Prize Pool-ka.`
        : `✅ **Amaaneed!** Ciyaaryahanka xiga jeerkiisu waa.`)
    )
    .addFields(
      { name: '💰 Prize Pool', value: `**$${prizePool.toLocaleString()}**`, inline: true },
      { name: '👥 Nool',       value: `**${alive.length}**`,                inline: true },
      { name: '📋 Ciyaaryahanno Nool', value: aliveList },
    )
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

async function refreshLobbyMsg(client, game) {
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch || !game.lobbyMessageId) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game)], components: buildLobbyButtons(game) }).catch(() => null);
}

async function getBoardMsg(client, game) {
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch || !game.boardMessageId) return null;
  return ch.messages.fetch(game.boardMessageId).catch(() => null);
}

async function startGame(client, game) {
  game.phase = 'playing';
  const tileCount = getTileCount(game.players.size);
  const bombCount = getBombCount(tileCount);
  const shuffled  = Array.from({ length: tileCount }, (_, i) => i).sort(() => Math.random() - 0.5);
  game.bombs      = new Set(shuffled.slice(0, bombCount));
  game.tiles      = Array.from({ length: tileCount }, (_, i) => ({ idx: i, hasBomb: game.bombs.has(i), revealed: false }));
  game.alivePlayersOrder = Array.from(game.players.keys());
  game.currentPlayerIndex = 0;

  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;

  const lm = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (lm) await lm.edit({ components: [] }).catch(() => null);

  const prizePool = Array.from(game.players.values()).reduce((s, p) => s + p.bet, 0);
  await channel.send({ embeds: [new EmbedBuilder()
    .setTitle('💣 Bomb Survival Started!')
    .setColor(0xe74c3c)
    .setDescription(`👥 **Players:** ${game.players.size}\n💰 **Prize Pool:** $${prizePool.toLocaleString()}\n💣 **Bombs:** ${bombCount} / ${tileCount} tiles\n\n**Good Luck Everyone! 🍀**`)
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' }),
  ]}).catch(() => null);

  // One persistent board message — edited throughout game
  const boardMsg = await channel.send({ embeds: [buildTurnEmbed(game)], components: buildTileButtons(game) }).catch(() => null);
  if (boardMsg) game.boardMessageId = boardMsg.id;

  startTurnTimer(client, game);
}

function startTurnTimer(client, game) {
  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(async () => {
    if (game.phase !== 'playing') return;
    const unrevealed = game.tiles.filter(t => !t.revealed);
    if (unrevealed.length === 0) { await endGame(client, game); return; }
    const pick  = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    const curId = game.alivePlayersOrder[game.currentPlayerIndex];
    await processMove(client, game, curId, pick.idx, true);
  }, TURN_TIME * 1000);
}

async function sendTurn(client, game) {
  if (game.phase !== 'playing') return;

  let tries = 0;
  while (!game.players.get(game.alivePlayersOrder[game.currentPlayerIndex])?.alive) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.alivePlayersOrder.length;
    if (++tries > game.alivePlayersOrder.length) { await endGame(client, game); return; }
  }

  const bm = await getBoardMsg(client, game);
  if (bm) await bm.edit({ embeds: [buildTurnEmbed(game)], components: buildTileButtons(game) }).catch(() => null);

  startTurnTimer(client, game);
}

async function processMove(client, game, userId, tileIdx, isAuto = false) {
  if (game.phase !== 'playing') return;
  if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }

  const tile = game.tiles[tileIdx];
  if (!tile || tile.revealed) return;
  tile.revealed = true;

  const player = game.players.get(userId);
  if (!player) return;

  if (tile.hasBomb) player.alive = false;

  // Edit board message with result
  const bm = await getBoardMsg(client, game);
  if (bm) await bm.edit({ embeds: [buildResultEmbed(game, player, tileIdx, tile.hasBomb, isAuto)], components: buildTileButtons(game, true) }).catch(() => null);

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.alivePlayersOrder.length;
  const aliveAfter = getAlive(game);

  if (aliveAfter.length <= 2) {
    setTimeout(() => endGame(client, game), 2500);
  } else {
    setTimeout(() => sendTurn(client, game), 2500);
  }
}

async function endGame(client, game) {
  if (game.phase === 'ended') return;
  if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
  game.phase = 'ended';
  bombGames.delete(game.channelId);

  const prizePool = Array.from(game.players.values()).reduce((s, p) => s + p.bet, 0);
  const alive     = getAlive(game);
  let winEmbed;

  if (alive.length >= 2) {
    const share = Math.floor(prizePool / alive.length);
    for (const id of alive) { const p = game.players.get(id); addCash(id, p?.username ?? '', share); }
    const winnerList = alive.map(id => `👑 **${game.players.get(id)?.displayName}**`).join('\n');
    winEmbed = new EmbedBuilder()
      .setTitle('🎉 QEYBSIGA — Labada Ugu Dambeen!')
      .setColor(0xffd700)
      .setDescription(`${winnerList}\n\n💰 **Prize Pool: $${prizePool.toLocaleString()}**\n🏆 Qof kasta helay: **$${share.toLocaleString()}**\n\n**Congratulations! 🎉**`)
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
  } else if (alive.length === 1) {
    const winner = game.players.get(alive[0]);
    addCash(alive[0], winner?.username ?? '', prizePool);
    winEmbed = new EmbedBuilder()
      .setTitle('👑 WINNER!')
      .setColor(0xffd700)
      .setDescription(`## ${winner?.displayName ?? 'Unknown'}\n🏆 **Last Survivor**\n\n💰 **Prize Won: $${prizePool.toLocaleString()}**\n\n**Congratulations! 🎉**`)
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
  } else {
    winEmbed = new EmbedBuilder()
      .setTitle('💣 Ciyaarta Waa Dhammaatay')
      .setColor(0x95a5a6)
      .setDescription('Ciyaarta waa la joojiyay.')
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
  }

  const bm = await getBoardMsg(client, game);
  if (bm) {
    await bm.edit({ embeds: [winEmbed], components: buildTileButtons(game, true) }).catch(() => null);
  } else {
    const ch = await client.channels.fetch(game.channelId).catch(() => null);
    if (ch) await ch.send({ embeds: [winEmbed] }).catch(() => null);
  }
}

// ─── Public Handlers ──────────────────────────────────────────────────────────

export async function handleBombMessage(client, msg) {
  if (msg.content.trim().toLowerCase() !== '!bomb') return false;
  const channelId = msg.channel.id;
  const existing  = bombGames.get(channelId);
  if (existing && existing.phase !== 'ended') {
    await msg.reply('⚠️ Kanaalkan Bomb Survival ciyaaro socota ayaa ku jirta!');
    return true;
  }
  const game = {
    channelId, guildId: msg.guild.id, hostId: msg.author.id,
    phase: 'lobby', players: new Map(),
    tiles: [], bombs: new Set(), alivePlayersOrder: [],
    currentPlayerIndex: 0, lobbyMessageId: null, boardMessageId: null, phaseTimer: null,
  };
  bombGames.set(channelId, game);
  const sent = await msg.channel.send({ embeds: [buildLobbyEmbed(game)], components: buildLobbyButtons(game) });
  game.lobbyMessageId = sent.id;
  return true;
}

export async function handleBombInteraction(client, interaction) {
  const { customId } = interaction;
  if (!customId.startsWith('bomb_')) return false;
  const userId = interaction.user.id;

  if (customId.startsWith('bomb_join_')) {
    const channelId = customId.slice('bomb_join_'.length);
    const game = bombGames.get(channelId);
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Kanaalkan Bomb Survival lobby ma jirto.', ephemeral: true }); return true; }
    if (game.players.has(userId))        { await interaction.reply({ content: '⚠️ Hore baad ku biirtay ciyaarta.', ephemeral: true }); return true; }
    if (game.players.size >= 8)          { await interaction.reply({ content: '⚠️ Ciyaartu waa buuxatay (8/8).', ephemeral: true }); return true; }
    const bal = getBalance(userId, interaction.user.username);
    await interaction.reply({ content: `💰 Lacagtaada: **$${bal.toLocaleString()}**\n\nXulo bet-kaaga:`, components: buildBetButtons(game), ephemeral: true });
    return true;
  }

  if (customId.startsWith('bomb_bet_')) {
    const parts     = customId.split('_');
    const amount    = parseInt(parts[parts.length - 1], 10);
    const channelId = parts.slice(2, parts.length - 1).join('_');
    const game      = bombGames.get(channelId);
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Lobby-gu waa dhammaatay.', ephemeral: true }); return true; }
    if (game.players.has(userId))        { await interaction.reply({ content: '⚠️ Hore baad ku biirtay ciyaarta.', ephemeral: true }); return true; }
    if (game.players.size >= 8)          { await interaction.reply({ content: '⚠️ Ciyaartu waa buuxatay (8/8).', ephemeral: true }); return true; }
    const result = deductCash(userId, interaction.user.username, amount);
    if (!result.ok) {
      await interaction.reply({ content: `❌ Haragaagu kuma filno **$${amount.toLocaleString()}**.\n💰 Lacagtaada hadda: **$${result.balance.toLocaleString()}**\n\n_Lacag ma lihid? Maamulaha waydiiso._`, ephemeral: true });
      return true;
    }
    game.players.set(userId, {
      id: userId, username: interaction.user.username,
      displayName: interaction.member?.displayName ?? interaction.user.username,
      bet: amount, alive: true,
    });
    await interaction.reply({ content: `✅ Waad ku biirtay! Bet: **$${amount.toLocaleString()}**\n💰 Haraagaaga: **$${result.balance.toLocaleString()}**`, ephemeral: true });
    await refreshLobbyMsg(client, game);
    return true;
  }

  if (customId.startsWith('bomb_leave_')) {
    const channelId = customId.slice('bomb_leave_'.length);
    const game = bombGames.get(channelId);
    if (!game || game.phase !== 'lobby')  { await interaction.reply({ content: '⚠️ Lobby-gu ma jiro.', ephemeral: true }); return true; }
    if (!game.players.has(userId))        { await interaction.reply({ content: '⚠️ Ma jirtid ciyaarta.', ephemeral: true }); return true; }
    if (userId === game.hostId)           { await interaction.reply({ content: '⚠️ Host-ku ma bixin karo. **Jooji** batoonka isticmaal.', ephemeral: true }); return true; }
    const player = game.players.get(userId);
    game.players.delete(userId);
    addCash(userId, interaction.user.username, player.bet);
    await interaction.reply({ content: `👋 Waad ka baxday. Bet-kaagii **$${player.bet.toLocaleString()}** waa laguugu celiyay.`, ephemeral: true });
    await refreshLobbyMsg(client, game);
    return true;
  }

  if (customId.startsWith('bomb_start_')) {
    const channelId = customId.slice('bomb_start_'.length);
    const game = bombGames.get(channelId);
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Lobby-gu ma jiro.', ephemeral: true }); return true; }
    if (userId !== game.hostId)          { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu bilaabi karaa.', ephemeral: true }); return true; }
    if (game.players.size < 2)           { await interaction.reply({ content: '⚠️ Ugu yaraan **2 ciyaaryahan** ayaa loo baahan yahay.', ephemeral: true }); return true; }
    await interaction.reply({ content: '💣 Ciyaarta waa bilaabmaysaa!', ephemeral: true });
    await startGame(client, game);
    return true;
  }

  if (customId.startsWith('bomb_stop_')) {
    const channelId = customId.slice('bomb_stop_'.length);
    const game = bombGames.get(channelId);
    if (!game)                   { await interaction.reply({ content: '⚠️ Ciyaaro ma jirto.', ephemeral: true }); return true; }
    if (userId !== game.hostId)  { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu joojin karaa.', ephemeral: true }); return true; }
    if (game.phase === 'lobby') { for (const [pid, p] of game.players) addCash(pid, p.username, p.bet); }
    if (game.phaseTimer) clearTimeout(game.phaseTimer);
    game.phase = 'ended';
    bombGames.delete(channelId);
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch && game.lobbyMessageId) {
      const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
      if (lm) await lm.edit({ components: [] }).catch(() => null);
    }
    await interaction.reply({ content: '🛑 Bomb Survival waa la joojiyay. Lacagtii lobby-ga waa laga celiyay.', ephemeral: false });
    return true;
  }

  if (customId.startsWith('bomb_tile_')) {
    const rest      = customId.slice('bomb_tile_'.length);
    const lastU     = rest.lastIndexOf('_');
    const channelId = rest.slice(0, lastU);
    const tileIdx   = parseInt(rest.slice(lastU + 1), 10);
    const game      = bombGames.get(channelId);
    if (!game || game.phase !== 'playing') { await interaction.reply({ content: '⚠️ Ciyaaro socota ma jirto.', ephemeral: true }); return true; }
    const currentId = game.alivePlayersOrder[game.currentPlayerIndex];
    if (userId !== currentId)              { await interaction.reply({ content: '⚠️ Jeerkaa maaha hadda — sug!', ephemeral: true }); return true; }
    if (game.tiles[tileIdx]?.revealed)     { await interaction.reply({ content: '⚠️ Tile-kan hore waa la daawadey.', ephemeral: true }); return true; }
    await interaction.deferUpdate().catch(() => null);
    await processMove(client, game, userId, tileIdx, false);
    return true;
  }

  return false;
}
