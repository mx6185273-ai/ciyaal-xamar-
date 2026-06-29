// pirate-embeds.js — Embed & Button builders for Pirate Treasure Hunt
// Ciyaal Xamar · Ka-saaris (Elimination) Mode
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ISLANDS, getAlivePiratePlayers } from './pirate-game.js';

const PIRATE_COLOR   = 0xc0932a;
const SHOP_COLOR     = 0x5865f2;
const WIN_COLOR      = 0xffd700;
const ELIM_COLOR     = 0xed4245;
const DAILY_COLOR    = 0x57f287;
const LEADER_COLOR   = 0xf59e0b;

const BANNER_URL = 'attachment://pirate-banner.png';

// ─── Lobby ────────────────────────────────────────────────────────────────────
export function buildPirateLobbyEmbed(game, guild) {
  const players = Array.from(game.players.values());
  const count   = players.length;

  const playerList = players.length > 0
    ? players.map((p, i) => `\`${i + 1}.\` ${p.displayName}`).join('\n')
    : '_Wali ciyaaryahan kuma biirin_';

  const ready = count >= 2
    ? `✅ Diyaar — Host ⚓ Bilaab wuxuu rixi karaa.`
    : `⚠️ Ugu yaraan 2 ciyaaryahan ayaa loo baahan yahay. (${count}/2)`;

  return new EmbedBuilder()
    .setTitle('🏴‍☠️ Pirate Treasure Hunt')
    .setDescription(
      `🏴‍☠️ **Ugaarsiga Khasnadda Cusub Ayaa Bilaabmay!**\n\n` +
      `👥 **Ciyaartoyda:** ${count}/20\n\n` +
      `🎯 **Ujeeddo:**\nKa badbaad dabinnada halista ah, uruurso khasnadaha,\nkuna guulayso inaad noqoto burcad-badeedka ugu dambeeya ee nool.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🔹 Ugu Yaraan: 2 Ciyaartoy\n` +
      `🔹 Ugu Badnaan: 20 Ciyaartoy\n` +
      `🔹 Nooca: Ka-saaris (Elimination)\n` +
      `🔹 Xaaladda: ${count >= 2 ? '✅ Diyaar' : '⏳ Sugaya Ciyaartoy'}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `Hoos ka dooro badhamada si aad uga qayb gasho.\n\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .addFields({ name: `👥 Ciyaartoyda (${count})`, value: playerList })
    .addFields({ name: '📊 Xaaladda', value: ready })
    .setImage(BANNER_URL)
    .setColor(PIRATE_COLOR)
    .setFooter({ text: `Ciyaal Xamar · Pirate Treasure Hunt` });
}

export function buildPirateLobbyButtons(game) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pirate_join').setLabel('Kubiir').setEmoji('🟢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pirate_leave').setLabel('Kabax').setEmoji('🔴').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('pirate_start').setLabel('Bilaab').setEmoji('⚓').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pirate_stop').setLabel('Jooji').setEmoji('🛑').setStyle(ButtonStyle.Secondary),
  );
}

// ─── Game Start ───────────────────────────────────────────────────────────────
export function buildPirateStartEmbed(game) {
  const alive = getAlivePiratePlayers(game);
  return new EmbedBuilder()
    .setTitle('🏴‍☠️ Ciyaarta Pirate Treasure Hunt Way Bilaabatay!')
    .setDescription(
      `👥 **Ciyaartoyda:** ${alive.length}\n\n` +
      `⚠️ Ka digtoonow dabinnada halista ah.\n\n` +
      `🎯 Hal burcad-badeed oo keliya ayaa badbaadi kara.\n\n` +
      `💰 Uruurso khasnadaha, kana badbaad dabinnada.\n\n` +
      `**Nasiib wacan!**`
    )
    .setColor(PIRATE_COLOR)
    .setImage(BANNER_URL)
    .setFooter({ text: `Ciyaal Xamar · Pirate Treasure Hunt` });
}

// ─── Round ───────────────────────────────────────────────────────────────────
export function buildPirateRoundEmbed(game, safeIslandHints = []) {
  const alive     = getAlivePiratePlayers(game);
  const chosen    = game.roundChoices.size;
  const remaining = alive.length - chosen;

  let hint = '';
  if (safeIslandHints.length > 0) {
    hint = `\n\n🗺️ **Treasure Map Tilmaanka:** ${safeIslandHints.join(', ')} — ammaan buu noqon karaa!`;
  }

  return new EmbedBuilder()
    .setTitle(`🏝️ Round ${game.round}/${game.maxRounds}`)
    .setDescription(
      `**Jasiirad dooro!**${hint}\n\n` +
      `👥 **Ciyaartoyda Nool:** ${alive.length}\n` +
      `⏳ **Dooran Waayay:** ${remaining} qof\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Player kasta hal jasiirad ayuu dooran karaa.\n` +
      `Waqti: **30 ilbiriqsi**`
    )
    .setColor(PIRATE_COLOR)
    .setFooter({ text: `Ciyaal Xamar · Round ${game.round}` });
}

export function buildIslandButtons(game) {
  const alive = getAlivePiratePlayers(game);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pirate_island_A`).setLabel('Island A').setEmoji('🏝️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`pirate_island_B`).setLabel('Island B').setEmoji('🌴').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`pirate_island_C`).setLabel('Island C').setEmoji('⛵').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`pirate_island_D`).setLabel('Island D').setEmoji('🗿').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`pirate_island_E`).setLabel('Island E').setEmoji('🏔️').setStyle(ButtonStyle.Primary),
    )
  ];
}

// ─── Round Results ────────────────────────────────────────────────────────────
export function buildRoundResultsEmbed(game, results) {
  const alive = getAlivePiratePlayers(game);
  const eliminated = results.filter(r => r.type === 'deadly' && !r.saved);

  let resultsText = results.map(r => {
    const name   = `**${r.displayName}**`;
    const island = `[Island ${r.island}]`;
    if (r.skipped) return `🕐 ${name} ${island} — Ma dooranin`;
    if (r.saved)   return `🛡️ ${name} ${island} — Deadly Trap! Ama Shield Kaa Badbaadiyay`;
    return `${r.type === 'deadly' ? '💥' : r.type === 'trap' ? '☠️' : r.type === 'gems' ? '💎' : r.type === 'item' ? '📦' : '💰'} ${name} ${island} — ${r.shortMsg}`;
  }).join('\n');

  if (resultsText.length > 1000) {
    resultsText = resultsText.slice(0, 997) + '...';
  }

  let desc = `**Natiijada Round ${game.round}**\n\n${resultsText}`;

  if (eliminated.length > 0) {
    desc += `\n\n☠️ **La Saaray:**\n${eliminated.map(r => `• ${r.displayName}`).join('\n')}`;
  }

  desc += `\n\n👥 **Ciyaartoyda Nool:** ${alive.length}`;

  return new EmbedBuilder()
    .setTitle(`📊 Round ${game.round} — Natiijada`)
    .setDescription(desc)
    .setColor(eliminated.length > 0 ? ELIM_COLOR : PIRATE_COLOR)
    .setFooter({ text: `Ciyaal Xamar · Pirate Treasure Hunt` });
}

// ─── Elimination ──────────────────────────────────────────────────────────────
export function buildEliminationEmbed(playerName, alivePlayers) {
  return new EmbedBuilder()
    .setTitle('💥 Nasiib Darro!')
    .setDescription(
      `**${playerName}** wuxuu ku dhacay dabin halis ah oo qarxay.\n\n` +
      `☠️ **${playerName}** wuxuu ka baxay ciyaarta.\n\n` +
      `👥 **Ciyaartoyda Nool:** ${alivePlayers}`
    )
    .setColor(ELIM_COLOR)
    .setFooter({ text: `Ciyaal Xamar · Pirate Treasure Hunt` });
}

// ─── Winner ───────────────────────────────────────────────────────────────────
export function buildPirateWinnerEmbed(winner, isLastStanding) {
  const reason = isLastStanding
    ? `${winner.displayName} wuxuu ka badbaaday dhammaan dabinnadii halista ahaa, wuxuuna noqday burcad-badeedkii ugu dambeeyey ee nool.`
    : `${winner.displayName} wuxuu ugu badnaa Gold — **${winner.sessionGold} Gold** — ciyaarta gudaheeda.`;

  return new EmbedBuilder()
    .setTitle('🏆 BURCAD-BADEEDKII UGU DAMBEEYEY EE NOOL')
    .setDescription(
      `👑 **Guuleyste:** ${winner.displayName}\n\n` +
      reason + '\n\n' +
      `💰 Gold la helay: **${winner.sessionGold}**\n` +
      `💎 Gems la helay: **${winner.sessionGems}**`
    )
    .setColor(WIN_COLOR)
    .setImage(BANNER_URL)
    .setFooter({ text: `Ciyaal Xamar · Pirate Treasure Hunt` });
}

// ─── Shop ─────────────────────────────────────────────────────────────────────
export function buildShopEmbed() {
  return new EmbedBuilder()
    .setTitle('🛒 Pirate Shop')
    .setDescription(
      `Waxyaabaha laga iibsan karo:\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🛡️ **Shield** — \`!buy shield\`\n` +
      `Qiimo: **1,000 Gold**\n` +
      `Labo mar ayuu kaa badbaadinayaa Deadly Trap.\n\n` +
      `🧭 **Lucky Compass** — \`!buy compass\`\n` +
      `Qiimo: **2,000 Gold**\n` +
      `Waxay kordhisaa fursadda Treasure helidda.\n\n` +
      `🗺️ **Treasure Map** — \`!buy map\`\n` +
      `Qiimo: **10 Gems**\n` +
      `Waxay kuu tilmaamaysaa hal jasiirad oo ammaan ah.\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .setColor(SHOP_COLOR)
    .setFooter({ text: `Ciyaal Xamar · !buy [item] si aad u ibsato` });
}

// ─── Buy Buttons ──────────────────────────────────────────────────────────────
export function buildShopButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pirate_buy_shield').setLabel('Shield — 1,000 Gold').setEmoji('🛡️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pirate_buy_compass').setLabel('Compass — 2,000 Gold').setEmoji('🧭').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pirate_buy_map').setLabel('Map — 10 Gems').setEmoji('🗺️').setStyle(ButtonStyle.Secondary),
  );
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export function buildInventoryEmbed(user) {
  const inv = user.inventory || [];
  const counts = {};
  for (const item of inv) counts[item] = (counts[item] || 0) + 1;

  const invLines = Object.keys(counts).length > 0
    ? [
        counts.shield        ? `🛡️ Shield x${counts.shield}`               : null,
        counts.lucky_compass ? `🧭 Lucky Compass x${counts.lucky_compass}` : null,
        counts.treasure_map  ? `🗺️ Treasure Map x${counts.treasure_map}`   : null,
      ].filter(Boolean).join('\n')
    : '_Inventory waa madhan tahay_';

  return new EmbedBuilder()
    .setTitle('🎒 Inventory')
    .setDescription(
      `${invLines}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 **Gold:** ${(user.gold || 0).toLocaleString()}\n` +
      `💎 **Gems:** ${user.gems || 0}`
    )
    .setColor(SHOP_COLOR)
    .setFooter({ text: `Ciyaal Xamar · !shop alaabta lagu arko` });
}

// ─── Daily ───────────────────────────────────────────────────────────────────
export function buildDailyEmbed() {
  return new EmbedBuilder()
    .setTitle('🎁 Daily Reward')
    .setDescription(
      `💰 **+500 Gold**\n` +
      `💎 **+1 Gem**\n\n` +
      `24 saac kasta hal mar.`
    )
    .setColor(DAILY_COLOR)
    .setFooter({ text: `Ciyaal Xamar · !daily` });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
export function buildLeaderboardEmbed(users) {
  const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const rows = users.length > 0
    ? users.map((u, i) =>
        `${MEDALS[i] ?? `${i+1}.`} **${u.username}** — ${(u.totalGold || 0).toLocaleString()} Gold`
      ).join('\n')
    : '_Wali ciyaaryahan ma jiraan_';

  return new EmbedBuilder()
    .setTitle('🏆 Top Pirates — Leaderboard')
    .setDescription(rows)
    .setColor(LEADER_COLOR)
    .setFooter({ text: `Ciyaal Xamar · !pirate bilow ciyaarta` });
}
