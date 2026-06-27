// index.js — Bot entry point, command and interaction handlers
// Ciyaal Xamar · Discord Mafia Bot

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from "discord.js";
import {
  games,
  createGame,
  assignRoles,
  getAlivePlayers,
  getDilaayePlayers,
  getGuildGames,
  addLog,
} from "./game.js";
import {
  buildLobbyEmbed,
  buildLobbyButtons,
  buildRoleDmEmbed,
  buildKickButtons,
} from "./embeds.js";
import { startNightPhase, endGame } from "./phases.js";

const MAX_GAMES_PER_GUILD = 5;

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) {
  console.error("❌ DISCORD_BOT_TOKEN is not set. Exiting.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot diyaar: ${c.user.tag} | ${c.guilds.cache.size} server`);
});

client.on(Events.MessageCreate, (msg) => handleMessage(client, msg));
client.on(Events.InteractionCreate, (interaction) => handleInteraction(client, interaction));

client.login(token).catch((err) => {
  console.error("❌ Discord login failed:", err);
  process.exit(1);
});

// ---------------------------------------------------------------------------

async function handleMessage(client, msg) {
  if (msg.author.bot) return;
  if (!msg.guild) return;

  const content = msg.content.trim().toLowerCase();
  const channelId = msg.channel.id;
  const guildId = msg.guild.id;

  if (content === "!dilaay") {
    const existing = games.get(channelId);
    if (existing && existing.phase !== "ended") {
      await msg.reply("⚠️ Kanaalkan ciyaaro socota ayaa ku jirta! Jooji ciyaartii hore ka hor intaadan cusub bilaabin.");
      return;
    }

    const guildGames = getGuildGames(guildId);
    if (guildGames.length >= MAX_GAMES_PER_GUILD) {
      await msg.reply(`⚠️ Servarkaan ${MAX_GAMES_PER_GUILD} ciyaaro ayaa isku mar ka socda. Sugso in mid dhammaato.`);
      return;
    }

    const game = createGame(guildId, channelId, msg.author.id);
    game.players.set(msg.author.id, {
      id: msg.author.id,
      username: msg.author.username,
      displayName: msg.member?.displayName ?? msg.author.username,
      role: null,
      alive: true,
      protected: false,
    });

    addLog(guildId, msg.guild.name, `🎮 ${msg.author.username} wuxuu bilaabay ciyaaro cusub`);

    const embed = buildLobbyEmbed(game, msg.guild);
    const buttons = buildLobbyButtons(game);

    const lobbyMsg = await msg.channel.send({ embeds: [embed], components: [buttons] });
    game.lobbyMessageId = lobbyMsg.id;
  }

  if (content === "!kasaar") {
    const game = games.get(channelId);
    if (!game || game.phase !== "lobby") {
      await msg.reply("⚠️ Kanaalkan ma jirto lobby furan.");
      return;
    }
    if (game.hostId !== msg.author.id) {
      await msg.reply("⚠️ Kaliya host-ku wuxuu isticmaali karaa !kasaar");
      return;
    }

    const kickButtons = buildKickButtons(game, msg.author.id);
    if (kickButtons.length === 0) {
      await msg.reply("⚠️ Ma jiraan ciyaaryahan la saari karo.");
      return;
    }

    await msg.reply({ content: "🚪 Xulo ciyaaryahanka aad saari rabto:", components: kickButtons });
  }
}

// Parse night-action customId: night_kill_{gameChannelId}_{targetId}
function parseNightCustomId(customId, prefix) {
  const rest = customId.slice(prefix.length);
  const idx = rest.indexOf("_");
  if (idx === -1) return null;
  return { gameChannelId: rest.slice(0, idx), targetId: rest.slice(idx + 1) };
}

async function handleInteraction(client, interaction) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const customId = interaction.customId;

  // --- NIGHT ACTIONS (via DM — look up game by embedded channelId) ---

  if (customId.startsWith("night_kill_")) {
    const parsed = parseNightCustomId(customId, "night_kill_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") {
      await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return;
    }
    const player = game.players.get(userId);
    if (!player || player.role !== "dilaaye" || !player.alive) {
      await interaction.reply({ content: "⚠️ Adigu ma tahid Dilaaye nool.", ephemeral: true }); return;
    }
    game.nightKillTarget = parsed.targetId;
    const target = game.players.get(parsed.targetId);
    const guildName = (await client.guilds.fetch(game.guildId).catch(() => null))?.name ?? "Unknown";
    addLog(game.guildId, guildName, `🔪 Dilaaye wuxuu xushay bartilmaameedka habeentii`);
    await interaction.reply({ content: `🔪 Waad dooratay: **${target?.displayName ?? parsed.targetId}**`, ephemeral: true });
    return;
  }

  if (customId.startsWith("night_save_")) {
    const parsed = parseNightCustomId(customId, "night_save_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") {
      await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return;
    }
    const player = game.players.get(userId);
    if (!player || player.role !== "dhakhtar" || !player.alive) {
      await interaction.reply({ content: "⚠️ Adigu ma tahid Dhakhtar nool.", ephemeral: true }); return;
    }
    game.nightSaveTarget = parsed.targetId;
    const target = game.players.get(parsed.targetId);
    const guildName = (await client.guilds.fetch(game.guildId).catch(() => null))?.name ?? "Unknown";
    addLog(game.guildId, guildName, `🛡️ Dhakhtarku wuxuu xushay badbaadinta`);
    await interaction.reply({ content: `🛡️ Waad badbaadisay: **${target?.displayName ?? parsed.targetId}**`, ephemeral: true });
    return;
  }

  if (customId.startsWith("night_investigate_")) {
    const parsed = parseNightCustomId(customId, "night_investigate_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") {
      await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return;
    }
    const player = game.players.get(userId);
    if (!player || player.role !== "danbi-baare" || !player.alive) {
      await interaction.reply({ content: "⚠️ Adigu ma tahid Danbi-baare nool.", ephemeral: true }); return;
    }
    if (game.nightInvestigations.has(userId)) {
      await interaction.reply({ content: "⚠️ Hore baad baarisay habeentan. Hal baaritaan oo kaliya.", ephemeral: true }); return;
    }
    game.nightInvestigations.set(userId, parsed.targetId);
    const target = game.players.get(parsed.targetId);
    if (target) {
      const isDilaaye = target.role === "dilaaye";
      await interaction.reply({
        content: `🔍 **${target.displayName}** — ${isDilaaye ? "✅ WAA DILAAYE! 🔪" : "❌ Ma aha Dilaaye — garan karo"}`,
        ephemeral: true,
      });
    }
    return;
  }

  // --- GUILD INTERACTIONS (lobby + voting) ---
  if (!interaction.guild) return;

  const guildId = interaction.guild.id;
  const channelId = interaction.channelId;
  const game = games.get(channelId);

  if (customId === "lobby_join") {
    if (!game || game.phase !== "lobby") {
      await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return;
    }
    if (game.players.has(userId)) {
      await interaction.reply({ content: "⚠️ Hore baad ku biirtay lobby-ga.", ephemeral: true }); return;
    }
    if (game.players.size >= 20) {
      await interaction.reply({ content: "⚠️ Lobby-ga wuu buuxay (20/20).", ephemeral: true }); return;
    }
    const member = interaction.member;
    game.players.set(userId, {
      id: userId,
      username: interaction.user.username,
      displayName: (member && "displayName" in member ? member.displayName : null) ?? interaction.user.username,
      role: null,
      alive: true,
      protected: false,
    });
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ku biiray lobby-ga`);
    if (game.lobbyMessageId) {
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        const lobbyMsg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lobbyMsg) {
          await lobbyMsg.edit({ embeds: [buildLobbyEmbed(game, interaction.guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
        }
      }
    }
    await interaction.reply({ content: "✅ Lobby-ga waad ku biiray!", ephemeral: true });
    return;
  }

  if (customId === "lobby_leave") {
    if (!game || game.phase !== "lobby") {
      await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return;
    }
    if (!game.players.has(userId)) {
      await interaction.reply({ content: "⚠️ Ma jirtid lobby-ga.", ephemeral: true }); return;
    }
    if (userId === game.hostId) {
      await interaction.reply({ content: "⚠️ Host-ku ma bixin karo. KA BIXI baad isticmaali kartaa.", ephemeral: true }); return;
    }
    game.players.delete(userId);
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ka baxay lobby-ga`);
    if (game.lobbyMessageId) {
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        const lobbyMsg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lobbyMsg) {
          await lobbyMsg.edit({ embeds: [buildLobbyEmbed(game, interaction.guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
        }
      }
    }
    await interaction.reply({ content: "👋 Lobby-ga waad ka baxday.", ephemeral: true });
    return;
  }

  if (customId === "lobby_stop") {
    if (!game || game.phase !== "lobby") {
      await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return;
    }
    if (userId !== game.hostId) {
      await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu joojin karaa.", ephemeral: true }); return;
    }
    if (game.phaseTimer) clearTimeout(game.phaseTimer);
    game.phase = "ended";
    games.delete(channelId);
    if (game.lobbyMessageId) {
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        const lobbyMsg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lobbyMsg) await lobbyMsg.edit({ components: [] }).catch(() => null);
      }
    }
    addLog(guildId, interaction.guild.name, `🛑 Host-ku wuxuu joojiyay lobby-ga`);
    await interaction.reply({ content: "🛑 Ciyaarta waa la joojiyay.", ephemeral: true });
    const channel = await client.channels.fetch(game.channelId).catch(() => null);
    if (channel) await channel.send("🛑 Lobby-ga waa la xirray host-ka.").catch(() => null);
    return;
  }

  if (customId === "lobby_start") {
    if (!game || game.phase !== "lobby") {
      await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return;
    }
    if (userId !== game.hostId) {
      await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu bilaabi karaa.", ephemeral: true }); return;
    }
    if (game.players.size < 5) {
      await interaction.reply({ content: "⚠️ Ugu yaraan 5 ciyaaryahan ayaa loo baahan yahay.", ephemeral: true }); return;
    }
    assignRoles(game);
    game.startedAt = new Date();
    addLog(guildId, interaction.guild.name, `🎮 Ciyaarta waa bilaabmay — ${game.players.size} ciyaaryahan`);
    if (game.lobbyMessageId) {
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        const lobbyMsg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lobbyMsg) await lobbyMsg.edit({ components: [] }).catch(() => null);
      }
    }
    await interaction.reply({ content: "🎮 Ciyaarta waa bilaabmay! Doorarkiinna DM-kiinna ku fiiri.", ephemeral: false });
    const allPlayers = Array.from(game.players.values());
    for (const player of allPlayers) {
      const user = await client.users.fetch(player.id).catch(() => null);
      if (!user) continue;
      const roleEmbed = buildRoleDmEmbed(player, game);
      await user.send({ embeds: [roleEmbed] }).catch(() => null);
    }
    setTimeout(() => startNightPhase(client, game), 3000);
    return;
  }

  if (customId.startsWith("kick_")) {
    if (!game || game.phase !== "lobby") {
      await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return;
    }
    if (userId !== game.hostId) {
      await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu saari karaa.", ephemeral: true }); return;
    }
    const targetId = customId.replace("kick_", "");
    const target = game.players.get(targetId);
    if (!target) {
      await interaction.reply({ content: "⚠️ Ciyaaryahanka lama helin.", ephemeral: true }); return;
    }
    game.players.delete(targetId);
    addLog(guildId, interaction.guild.name, `🚪 ${target.displayName} waa laga saaray lobby-ga`);
    if (game.lobbyMessageId) {
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        const lobbyMsg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lobbyMsg) {
          await lobbyMsg.edit({ embeds: [buildLobbyEmbed(game, interaction.guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
        }
      }
    }
    await interaction.reply({ content: `🚪 **${target.displayName}** waa laga saaray lobby-ga.`, ephemeral: false });
    const kickedUser = await client.users.fetch(targetId).catch(() => null);
    if (kickedUser) await kickedUser.send("🚪 Host-ku wuu kaa saaray lobby-ga.").catch(() => null);
    return;
  }

  if (customId.startsWith("vote_")) {
    if (!game || game.phase !== "day") {
      await interaction.reply({ content: "⚠️ Maalinta codbixinta maaha hadda.", ephemeral: true }); return;
    }
    const voter = game.players.get(userId);
    if (!voter || !voter.alive) {
      await interaction.reply({ content: "⚠️ Adigu ma codeyn kartid (dhintay ama ma jirtid).", ephemeral: true }); return;
    }
    const targetId = customId === "vote_skip" ? "skip" : customId.replace("vote_", "");
    if (targetId !== "skip") {
      const target = game.players.get(targetId);
      if (!target || !target.alive) {
        await interaction.reply({ content: "⚠️ Ciyaaryahankaan nool maaha.", ephemeral: true }); return;
      }
    }
    const existingIdx = game.votes.findIndex(v => v.voterId === userId);
    const isChange = existingIdx !== -1;
    if (isChange) game.votes.splice(existingIdx, 1);
    game.votes.push({ voterId: userId, targetId });
    const targetName = targetId === "skip" ? "SKIP" : game.players.get(targetId)?.displayName ?? targetId;
    addLog(guildId, interaction.guild.name, `🗳️ ${voter.displayName} wuxuu u codeeyay ${targetName}${isChange ? " (baddalay)" : ""}`);
    await interaction.reply({
      content: isChange
        ? `🔄 Codkaagii waad baddashay → **${targetName}**`
        : `🗳️ Waxaad u codeysay: **${targetName}**`,
      ephemeral: true,
    });
    return;
  }
}
