// bomb-handler.js — Ciyaal Xamar · Bomb Survival Game
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getBalance, addCash, deductCash } from './economy.js';

const bombGames = new Map();
const BET_AMOUNTS = [500, 1000, 2000, 3000, 4000, 5000];
const TILES_COUNT = 10;
const TURN_TIME   = 10;

// ─── Embed / Button Builders ──────────────────────────────────────────────────

function buildLobbyEmbed(game) {
  const players = Array.from(game.players.values());
  const prizePool = players.reduce((s, p) => s + p.bet, 0);
  const playerList = players.length === 0
    ? '_Wali ciyaaryahan ma jiraan_'
    : players.map(p => `👤 **${p.displayName}** — $${p.bet.toLocaleString()}`).join('\n');

  return new EmbedBuilder()
    .setTitle('💣 BOMB SURVIVAL')
    .setColor(0x2b2d31)
    .setDescription('Ku soo biir ciyaarta!\nHost-ku wuxuu bilaabi karaa marka dhammaantood diyaar yihiin.')
    .addFields(
      { name: '👥 Ciyaaryahanno', value: `**${players.length}** / 8`,         inline: true },
      { name: '💰 Prize Pool',    value: `**$${prizePool.toLocaleString()}**`, inline: true },
      { name: '💣 Bombs',         value: 'Random (2 ama 3)',                   inline: true },
      { name: '⏳ Xaalad', value: players.length < 2
        ? '⚠️ Ugu yaraan 2 ciyaaryahan — sugaya...'
        : '✅ Diyaar — Host wuxuu bilaabi karaa.' },
      { name: '📋 Ciyaaryahanno', value: playerList },
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
  const rows = [];
  const chunks = [BET_AMOUNTS.slice(0, 3), BET_AMOUNTS.slice(3)];
  for (const chunk of chunks) {
    rows.push(new ActionRowBuilder().addComponents(
      chunk.map(a => new ButtonBuilder()
        .setCustomId(`bomb_bet_${game.channelId}_${a}`)
        .setLabel(`💵 $${a.toLocaleString()}`)
        .setStyle(ButtonStyle.Secondary))
    ));
  }
  return rows;
}

function buildBoardEmbed(game) {
  const alive = game.alivePlayersOrder.filter(id => game.players.get(id)?.alive);
  const curP  = game.players.get(game.alivePlayersOrder[game.currentPlayerIndex]);
  const prizePool = Array.from(game.players.values()).reduce((s, p) => s + p.bet, 0);
  const aliveList = alive.map(id => `👤 ${game.players.get(id)?.displayName}`).join('\n') || '_Ma jiraan_';

  return new EmbedBuilder()
    .setTitle('💣 BOMB SURVIVAL — CIYAAR SOCDAA')
    .setColor(0xe74c3c)
    .setDescription(`⏳ **${TURN_TIME} ilbiriqsi** oo keliya!\n💡 Xulo tile — cidna ma garanayso meesha bomb-ku yaal!`)
    .addFields(
      { name: '🎮 Jeerka',         value: `**${curP?.displayName ?? '?'}**`,    inline: true },
      { name: '💰 Prize Pool',     value: `**$${prizePool.toLocaleString()}**`, inline: true },
      { name: '👥 Nool',           value: `**${alive.length}**`,                inline: true },
      { name: '📋 Ciyaaryahanno Nool', value: aliveList },
    )
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
}

function buildTileButtons(game, disabled = false) {
  const rows = [];
  const chunks = [game.tiles.slice(0, 5), game.tiles.slice(5)];
  for (const chunk of chunks) {
    rows.push(new ActionRowBuilder().addComponents(chunk.map(tile => {
      let label = `${tile.idx + 1}`, style = ButtonStyle.Secondary;
      if (tile.revealed && tile.hasBomb) { label = '💥'; style = ButtonStyle.Danger; }
      else if (tile.revealed)            { label = '✅'; style = ButtonStyle.Success; }
      return new ButtonBuilder()
        .setCustomId(`bomb_tile_${game.channelId}_${tile.idx}`)
        .setLabel(label).setStyle(style)
        .setDisabled(disabled || tile.revealed);
    })));
  }
  return rows;
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

async function refreshLobbyMsg(client, game) {
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch || !game.lobbyMessageId) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game)], components: buildLobbyButtons(game) }).catch(() => null);
}

async function startGame(client, game) {
  game.phase = 'playing';
  const bombCount = Math.random() < 0.5 ? 2 : 3;
  const shuffled  = Array.from({ length: TILES_COUNT }, (_, i) => i).sort(() => Math.random() - 0.5);
  game.bombs = new Set(shuffled.slice(0, bombCount));
  game.tiles = Array.from({ length: TILES_COUNT }, (_, i) => ({ idx: i, hasBomb: game.bombs.has(i), revealed: false }));
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
    .setDescription(`👥 **Players:** ${game.players.size}\n💰 **Prize Pool:** $${prizePool.toLocaleString()}\n💣 **Bombs:** ${bombCount}\n\n**Good Luck Everyone! 🍀**`)
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' }),
  ]}).catch(() => null);

  await sendTurn(client, game);
}

async function sendTurn(client, game) {
  if (game.phase !== 'playing') return;
  const alive = game.alivePlayersOrder.filter(id => game.players.get(id)?.alive);
  if (alive.length <= 1) { await endGame(client, game); return; }

  let tries = 0;
  while (!game.players.get(game.alivePlayersOrder[game.currentPlayerIndex])?.alive) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.alivePlayersOrder.length;
    if (++tries > game.alivePlayersOrder.length) { await endGame(client, game); return; }
  }

  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;

  const boardMsg = await channel.send({ embeds: [buildBoardEmbed(game)], components: buildTileButtons(game) }).catch(() => null);
  if (boardMsg) game.boardMessageId = boardMsg.id;

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(async () => {
    if (game.phase !== 'playing') return;
    const unrevealed = game.tiles.filter(t => !t.revealed);
    if (unrevealed.length === 0) { await endGame(client, game); return; }
    const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    const curId = game.alivePlayersOrder[game.currentPlayerIndex];
    await processMove(client, game, curId, pick.idx, true);
  }, TURN_TIME * 1000);
}

async function processMove(client, game, userId, tileIdx, isAuto = false) {
  if (game.phase !== 'playing') return;
  if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }

  const tile = game.tiles[tileIdx];
  if (!tile || tile.revealed) return;
  tile.revealed = true;

  const player = game.players.get(userId);
  if (!player) return;

  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;

  const bm = game.boardMessageId ? await channel.messages.fetch(game.boardMessageId).catch(() => null) : null;
  if (bm) await bm.edit({ embeds: [buildBoardEmbed(game)], components: buildTileButtons(game, true) }).catch(() => null);

  if (tile.hasBomb) {
    player.alive = false;
    await channel.send({ embeds: [new EmbedBuilder()
      .setTitle('💥 BOOM!')
      .setColor(0xe74c3c)
      .setDescription(
        `${isAuto ? '⏰ _Waqtigu dhacay — bot random ayuu u dooray_\n\n' : ''}` +
        `**${player.displayName}** waxay doorteen tile **${tileIdx + 1}**.\n\n` +
        `💣 **BOMB!** ${player.displayName} wuu/waxay ka baxday ciyaarta!\n` +
        `💰 Bet-kooda **$${player.bet.toLocaleString()}** Prize Pool-ka ku harayaa.`
      )
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' }),
    ]}).catch(() => null);
  } else {
    await channel.send({ embeds: [new EmbedBuilder()
      .setTitle('✅ SAFE!')
      .setColor(0x57f287)
      .setDescription(
        `${isAuto ? '⏰ _Waqtigu dhacay — bot random ayuu u dooray_\n\n' : ''}` +
        `**${player.displayName}** waxay doorteen tile **${tileIdx + 1}**.\n\n` +
        `✅ **Amaaneed!** Turn-ku wuxuu u gudbayaa ciyaaryahanka xiga.`
      )
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' }),
    ]}).catch(() => null);
  }

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.alivePlayersOrder.length;

  const aliveAfter = game.alivePlayersOrder.filter(id => game.players.get(id)?.alive);
  if (aliveAfter.length <= 1) { await endGame(client, game); }
  else { await sendTurn(client, game); }
}

async function endGame(client, game) {
  if (game.phase === 'ended') return;
  if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
  game.phase = 'ended';
  bombGames.delete(game.channelId);

  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;

  if (game.boardMessageId) {
    const bm = await channel.messages.fetch(game.boardMessageId).catch(() => null);
    if (bm) await bm.edit({ components: buildTileButtons(game, true) }).catch(() => null);
  }

  const prizePool = Array.from(game.players.values()).reduce((s, p) => s + p.bet, 0);
  const alive     = game.alivePlayersOrder.filter(id => game.players.get(id)?.alive);

  if (alive.length === 1) {
    const winner = game.players.get(alive[0]);
    addCash(alive[0], winner?.username ?? '', prizePool);
    await channel.send({ embeds: [new EmbedBuilder()
      .setTitle('👑 WINNER!')
      .setColor(0xffd700)
      .setDescription(
        `## ${winner?.displayName ?? 'Unknown'}\n` +
        `🏆 **Last Survivor**\n\n` +
        `💰 **Prize Won: $${prizePool.toLocaleString()}**\n\n` +
        `**Congratulations! 🎉**`
      )
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' }),
    ]}).catch(() => null);
  } else {
    await channel.send({ embeds: [new EmbedBuilder()
      .setTitle('💣 Ciyaarta Waa Dhammaatay')
      .setColor(0x95a5a6)
      .setDescription('Ciyaarta waa la joojiyay.')
      .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' }),
    ]}).catch(() => null);
  }
}

// ─── Public Handlers ──────────────────────────────────────────────────────────

export async function handleBombMessage(client, msg) {
  if (msg.content.trim().toLowerCase() !== '!bomb') return false;

  const channelId = msg.channel.id;
  const existing = bombGames.get(channelId);
  if (existing && existing.phase !== 'ended') {
    await msg.reply('⚠️ Kanaalkan Bomb Survival ciyaaro socota ayaa ku jirta!');
    return true;
  }

  const game = {
    channelId, guildId: msg.guild.id, hostId: msg.author.id,
    phase: 'lobby', players: new Map(),
    tiles: [], bombs: new Set(), alivePlayersOrder: [],
    currentPlayerIndex: 0,
    lobbyMessageId: null, boardMessageId: null, phaseTimer: null,
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

  // ── JOIN ──────────────────────────────────────────────────────────────────
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

  // ── BET ───────────────────────────────────────────────────────────────────
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

  // ── LEAVE ─────────────────────────────────────────────────────────────────
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

  // ── START ─────────────────────────────────────────────────────────────────
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

  // ── STOP ──────────────────────────────────────────────────────────────────
  if (customId.startsWith('bomb_stop_')) {
    const channelId = customId.slice('bomb_stop_'.length);
    const game = bombGames.get(channelId);
    if (!game)              { await interaction.reply({ content: '⚠️ Ciyaaro ma jirto.', ephemeral: true }); return true; }
    if (userId !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu joojin karaa.', ephemeral: true }); return true; }
    if (game.phase === 'lobby') {
      for (const [pid, p] of game.players) addCash(pid, p.username, p.bet);
    }
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

  // ── TILE SELECTION ────────────────────────────────────────────────────────
  if (customId.startsWith('bomb_tile_')) {
    const rest          = customId.slice('bomb_tile_'.length);
    const lastU         = rest.lastIndexOf('_');
    const channelId     = rest.slice(0, lastU);
    const tileIdx       = parseInt(rest.slice(lastU + 1), 10);
    const game          = bombGames.get(channelId);
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
