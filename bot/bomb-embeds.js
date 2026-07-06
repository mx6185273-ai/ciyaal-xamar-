// bomb-embeds.js — Embeds & buttons for Bomb Survival
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { MAX_PLAYERS, BET_AMOUNTS } from './bomb-game.js';

const BOMB_COLOR   = 0x2b2d31;
const WIN_COLOR    = 0xffd700;
const DANGER_COLOR = 0xed4245;
const SAFE_COLOR   = 0x57f287;

export function buildBombLobbyEmbed(game) {
  const players = Array.from(game.players.values());
  const list = players.length
    ? players.map((p) => `👤 **${p.name}** — $${p.bet.toLocaleString()}`).join('\n')
    : '_Wali ciyaaryahan kuma biirin_';
  return new EmbedBuilder()
    .setTitle('💣 Bomb Survival')
    .setDescription(
      `👥 **Players:** ${players.length}/${MAX_PLAYERS}\n` +
      `💰 **Prize Pool:** $${game.prizePool.toLocaleString()}\n` +
      `💣 **Bombs:** Random (2 ama 3)\n\n` +
      `⏳ Waiting for Players…\n\n` +
      `━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━`
    )
    .setColor(BOMB_COLOR)
    .setFooter({ text: 'Ciyaal Xamar · Bomb Survival' });
}

export function buildBombLobbyButtons(game) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bomb_join').setLabel('Ku biir').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bomb_leave').setLabel('Ka bax').setEmoji('🚪').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('bomb_start').setLabel('Bilaab').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bomb_stop').setLabel('Jooji').setEmoji('🛑').setStyle(ButtonStyle.Secondary),
  );
}

export function buildBetButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    BET_AMOUNTS.slice(0, 3).map((a) =>
      new ButtonBuilder().setCustomId(`bomb_bet_${a}`).setLabel(`$${a.toLocaleString()}`).setEmoji('💵').setStyle(ButtonStyle.Secondary)
    )
  );
  const row2 = new ActionRowBuilder().addComponents(
    BET_AMOUNTS.slice(3, 6).map((a) =>
      new ButtonBuilder().setCustomId(`bomb_bet_${a}`).setLabel(`$${a.toLocaleString()}`).setEmoji('💵').setStyle(ButtonStyle.Secondary)
    )
  );
  return [row1, row2];
}

export function buildBombStartEmbed(game) {
  return new EmbedBuilder()
    .setTitle('💣 Bomb Survival Started!')
    .setDescription(
      `👥 **Players:** ${game.players.size}\n` +
      `💰 **Prize Pool:** $${game.prizePool.toLocaleString()}\n` +
      `💣 **Bombs:** ${game.bombCount}\n\n` +
      `Good Luck Everyone! 🍀`
    )
    .setColor(BOMB_COLOR);
}

export function buildBombBoardEmbed(game, currentPlayer, timeLeftSec) {
  const alive = Array.from(game.players.values()).filter((p) => p.alive);
  const aliveList = alive.map((p) => `👤 ${p.name}`).join(' · ');
  return new EmbedBuilder()
    .setTitle('💣 Bomb Survival — Round')
    .setDescription(
      `🎯 Marka: **${currentPlayer.name}**\n⏳ Wakhti: **${timeLeftSec}s**\n\n` +
      `👥 **Ciyaartoyda haray (${alive.length}):**\n${aliveList}\n\n` +
      `💰 **Prize Pool:** $${game.prizePool.toLocaleString()}`
    )
    .setColor(BOMB_COLOR)
    .setFooter({ text: 'Dooro tile — Kaliya ciyaaryahanka marka ah ayaa dooran kara' });
}

export function buildTileButtons(game) {
  const rows = [];
  for (let r = 0; r < 2; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      const tile = game.tiles[i];
      const btn = new ButtonBuilder()
        .setCustomId(`bomb_tile_${i}`)
        .setLabel(`${i + 1}`)
        .setStyle(tile.revealed ? (tile.isBomb ? ButtonStyle.Danger : ButtonStyle.Success) : ButtonStyle.Secondary)
        .setDisabled(tile.revealed);
      btn.setEmoji(tile.revealed ? (tile.isBomb ? '💥' : '✅') : '🟦');
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

export function buildBombResultEmbed(player, tile, tileIndex) {
  if (tile.isBomb) {
    return new EmbedBuilder()
      .setTitle('💥 BOOM!')
      .setDescription(`**${player.name}** wuxuu taabtay tile #${tileIndex + 1} — 💣 Bomb ayaa ku dhacay!\n\n☠️ Waa laga saaray ciyaarta.`)
      .setColor(DANGER_COLOR);
  }
  return new EmbedBuilder()
    .setTitle('✅ Safe!')
    .setDescription(`**${player.name}** wuxuu taabtay tile #${tileIndex + 1} — Waa nabad!\n\nTurn-ku wuxuu u gudbayaa ciyaaryahanka xiga.`)
    .setColor(SAFE_COLOR);
}

export function buildBombWinnerEmbed(winner, prize) {
  return new EmbedBuilder()
    .setTitle('👑 WINNER')
    .setDescription(
      `# ${winner.name}\n\n🏆 **Last Survivor**\n💰 **Prize Won:** $${prize.toLocaleString()}\n\nCongratulations! 🎉`
    )
    .setColor(WIN_COLOR);
}

export function buildBombCancelledEmbed() {
  return new EmbedBuilder()
    .setTitle('🛑 Bomb Survival Cancelled')
    .setDescription('Ciyaarta waa la joojiyay. Dhammaan bets-yadii waa la soo celiyay.')
    .setColor(DANGER_COLOR);
}
