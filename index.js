import 'dotenv/config';

// index.js — Ciyaal Xamar · Discord Bot
// Features: Mafia game (!dilaay), 24/7 VC (!join/!leave), !help, !icaawi

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
} from "discord.js";
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
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
import { startNightPhase } from "./phases.js";

const MAX_GAMES_PER_GUILD = 5;
// Owner user ID — receives !icaawi reports via DM
const OWNER_ID = "725076744251637760";

// Track voice connections per guild
const voiceConnections = new Map();

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) {
  console.error("❌ DISCORD_BOT_TOKEN is not set.");
  console.error("   1. cp .env.example .env");
  console.error("   2. .env ku geli: DISCORD_BOT_TOKEN=your_token");
  console.error("   3. Ama Endercloud Startup Variables ku dar token-ka");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot diyaar: ${c.user.tag} | ${c.guilds.cache.size} server`);
});

client.on(Events.MessageCreate, (msg) => handleMessage(client, msg));
client.on(Events.InteractionCreate, (interaction) => handleInteraction(client, interaction));

client.login(token).catch((err) => {
  console.error("❌ Discord login failed:", err.message);
  process.exit(1);
});

// ─── Voice Helper ────────────────────────────────────────────────────────────

function joinVC(guildId, channelId, adapterCreator) {
  const existing = voiceConnections.get(guildId);
  if (existing) {
    try { existing.destroy(); } catch { /* ignore */ }
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  voiceConnections.set(guildId, connection);

  // Auto-reconnect when disconnected unexpectedly
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      try { connection.destroy(); } catch { /* ignore */ }
      voiceConnections.delete(guildId);
    }
  });

  return connection;
}

// ─── Message Handler ─────────────────────────────────────────────────────────

async function handleMessage(client, msg) {
  if (msg.author.bot) return;
  if (!msg.guild) return;

  const content = msg.content.trim().toLowerCase();
  const raw = msg.content.trim();
  const channelId = msg.channel.id;
  const guildId = msg.guild.id;

  // ── !help ────────────────────────────────────────────────────────────────
  if (content === "!help") {
    const helpEmbed = new EmbedBuilder()
      .setTitle("🎮 CIYAAL XAMAR — Amarrada (Commands)")
      .setColor(0x5865f2)
      .setDescription("Waa kuwan dhammaan amarrada bot-ka:")
      .addFields(
        {
          name: "🔪 Mafia Ciyaarta",
          value: [
            "`!dilaay` — Lobby cusub bilow (adiga waxaad noqon doontaa host)",
            "`!kasaar` — Host: ciyaaryahan lobby ka saar",
          ].join("\n"),
        },
        {
          name: "🎧 Voice Channel — 24/7",
          value: [
            "`!join` — Bot-ka VC-ga ku soo gal (24/7 joogayaa, xitaa dadku marka ay ka baxaan)",
            "`!leave` — Bot-ka VC-ka ka saar",
          ].join("\n"),
        },
        {
          name: "🆘 Caawimo",
          value: [
            "`!icaawi [farriin]` — Cilad ama su'aal owner-ka u dir si toos ah",
            "  _Tusaale: `!icaawi Bot-ka lobby kuma furin, caawimaad u baahan ahay`_",
          ].join("\n"),
        },
        {
          name: "📌 Mafia Doorarka",
          value: [
            "🔪 **Dilaaye** — Habeenta ciyaaryahan dila (waa sir)",
            "🩺 **Dhakhtar** — Habeenta hal qof badbaadi",
            "🕵️ **Danbi-baare** — Habeenta hal qof baari (Dilaaye mise maya)",
            "🏠 **Shacab** — Maalinta codbixinta ku saaro Dilaayaha",
          ].join("\n"),
        },
        {
          name: "⚙️ Tirada Doorarka",
          value: [
            "`5–9`  ciyaaryahan → 1 Dilaaye · 1 Dhakhtar · 1 Danbi-baare",
            "`10–14` ciyaaryahan → 2 Dilaaye · 1 Dhakhtar · 1 Danbi-baare",
            "`15–20` ciyaaryahan → 3 Dilaaye · 1 Dhakhtar · 2 Danbi-baare",
          ].join("\n"),
        }
      )
      .setFooter({ text: "Ciyaal Xamar Bot · !icaawi haddaad caawimaad u baahantahay" });

    await msg.reply({ embeds: [helpEmbed] });
    return;
  }

  // ── !join ─────────────────────────────────────────────────────────────────
  if (content === "!join") {
    const voiceChannel = msg.member?.voice?.channel;
    if (!voiceChannel) {
      await msg.reply("⚠️ Marka hore **Voice Channel** gal, kadibna `!join` qor.");
      return;
    }

    joinVC(guildId, voiceChannel.id, msg.guild.voiceAdapterCreator);
    addLog(guildId, msg.guild.name, `🎧 Bot wuxuu ku biiray VC: ${voiceChannel.name}`);

    const embed = new EmbedBuilder()
      .setTitle("🎧 24/7 Voice Channel — Online!")
      .setDescription(
        `Bot-ku wuxuu ku biiray **${voiceChannel.name}**.\n` +
        "Habeen iyo maalin wuu ku sii joogayaa — xitaa dadku marka ay ka baxaan!"
      )
      .setColor(0x57f287)
      .addFields(
        { name: "📍 Channel", value: voiceChannel.name, inline: true },
        { name: "🔇 Xaalad", value: "Deaf · Aan hadlayn", inline: true }
      )
      .setFooter({ text: "`!leave` haddaad rabto bot-ka in uu ka baxo" });

    await msg.reply({ embeds: [embed] });
    return;
  }

  // ── !leave ────────────────────────────────────────────────────────────────
  if (content === "!leave") {
    const conn = voiceConnections.get(guildId);
    if (!conn) {
      await msg.reply("⚠️ Bot-ku voice channel kuma jiro hadda.");
      return;
    }
    try { conn.destroy(); } catch { /* ignore */ }
    voiceConnections.delete(guildId);
    addLog(guildId, msg.guild.name, `🎧 Bot wuxuu ka baxay VC-ga`);
    await msg.reply("👋 Bot-ku VC-ga wuu ka baxay.");
    return;
  }

  // ── !icaawi ───────────────────────────────────────────────────────────────
  if (content.startsWith("!icaawi")) {
    const report = raw.slice("!icaawi".length).trim();
    if (!report) {
      await msg.reply(
        "⚠️ Fariintaada qor kadib `!icaawi`.\n" +
        "_Tusaale: `!icaawi Bot-ka lobby kuma furin`_"
      );
      return;
    }

    const owner = await client.users.fetch(OWNER_ID).catch(() => null);
    if (!owner) {
      await msg.reply("⚠️ Maamulaha lama gaadhi karin. Dib u isku day.");
      return;
    }

    const reportEmbed = new EmbedBuilder()
      .setTitle("🆘 Codsi Caawimo — Ciyaal Xamar Bot")
      .setColor(0xed4245)
      .addFields(
        {
          name: "👤 Qofka",
          value: `**${msg.author.displayName ?? msg.author.username}**\n\`${msg.author.id}\``,
          inline: true,
        },
        {
          name: "🏠 Server",
          value: `${msg.guild.name}\n\`${msg.guild.id}\``,
          inline: true,
        },
        { name: "💬 Farriin", value: report }
      )
      .setFooter({ text: `User ID: ${msg.author.id} · Guild: ${msg.guild.id}` })
      .setTimestamp();

    const dmSent = await owner.send({ embeds: [reportEmbed] }).then(() => true).catch(() => false);

    if (dmSent) {
      await msg.reply(
        "✅ **Fariintaada maamulaha la gaarsiiiyay!**\n" +
        "Iyagu waxay kugu jawaabi doonaan DM-kaaga. Samiri yar."
      );
      addLog(guildId, msg.guild.name, `🆘 ${msg.author.username} wuxuu u diray caawimo codsi owner-ka`);
    } else {
      await msg.reply("⚠️ Maamulaha DM-kiisa waa xidnaanaa. Dib u isku day.");
    }
    return;
  }

  // ── !dilaay ───────────────────────────────────────────────────────────────
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
    return;
  }

  // ── !kasaar ───────────────────────────────────────────────────────────────
  if (content === "!kasaar") {
    const game = games.get(channelId);
    if (!game || game.phase !== "lobby") {
      await msg.reply("⚠️ Kanaalkan ma jirto lobby furan."); return;
    }
    if (game.hostId !== msg.author.id) {
      await msg.reply("⚠️ Kaliya host-ku wuxuu isticmaali karaa `!kasaar`"); return;
    }
    const kickButtons = buildKickButtons(game, msg.author.id);
    if (kickButtons.length === 0) {
      await msg.reply("⚠️ Ma jiraan ciyaaryahan la saari karo."); return;
    }
    await msg.reply({ content: "🚪 Xulo ciyaaryahanka aad saari rabto:", components: kickButtons });
    return;
  }
}

// ─── Night CustomId Parser ────────────────────────────────────────────────────

function parseNightCustomId(customId, prefix) {
  const rest = customId.slice(prefix.length);
  const idx = rest.indexOf("_");
  if (idx === -1) return null;
  return { gameChannelId: rest.slice(0, idx), targetId: rest.slice(idx + 1) };
}

// ─── Interaction Handler ──────────────────────────────────────────────────────

async function handleInteraction(client, interaction) {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const customId = interaction.customId;

  // --- NIGHT ACTIONS (via DM) ---
  if (customId.startsWith("night_kill_")) {
    const parsed = parseNightCustomId(customId, "night_kill_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== "dilaaye" || !player.alive) { await interaction.reply({ content: "⚠️ Adigu ma tahid Dilaaye nool.", ephemeral: true }); return; }
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
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== "dhakhtar" || !player.alive) { await interaction.reply({ content: "⚠️ Adigu ma tahid Dhakhtar nool.", ephemeral: true }); return; }
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
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== "danbi-baare" || !player.alive) { await interaction.reply({ content: "⚠️ Adigu ma tahid Danbi-baare nool.", ephemeral: true }); return; }
    if (game.nightInvestigations.has(userId)) { await interaction.reply({ content: "⚠️ Hore baad baarisay habeentan.", ephemeral: true }); return; }
    game.nightInvestigations.set(userId, parsed.targetId);
    const target = game.players.get(parsed.targetId);
    if (target) {
      await interaction.reply({
        content: `🔍 **${target.displayName}** — ${target.role === "dilaaye" ? "✅ WAA DILAAYE! 🔪" : "❌ Ma aha Dilaaye"}`,
        ephemeral: true,
      });
    }
    return;
  }

  // --- GUILD INTERACTIONS ---
  if (!interaction.guild) return;
  const guildId = interaction.guild.id;
  const channelId = interaction.channelId;
  const game = games.get(channelId);

  if (customId === "lobby_join") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (game.players.has(userId)) { await interaction.reply({ content: "⚠️ Hore baad ku biirtay lobby-ga.", ephemeral: true }); return; }
    if (game.players.size >= 20) { await interaction.reply({ content: "⚠️ Lobby-ga wuu buuxay (20/20).", ephemeral: true }); return; }
    const member = interaction.member;
    game.players.set(userId, {
      id: userId,
      username: interaction.user.username,
      displayName: (member && "displayName" in member ? member.displayName : null) ?? interaction.user.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ku biiray lobby-ga`);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game, interaction.guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
      }
    }
    await interaction.reply({ content: "✅ Lobby-ga waad ku biiray!", ephemeral: true });
    return;
  }

  if (customId === "lobby_leave") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (!game.players.has(userId)) { await interaction.reply({ content: "⚠️ Ma jirtid lobby-ga.", ephemeral: true }); return; }
    if (userId === game.hostId) { await interaction.reply({ content: "⚠️ Host-ku ma bixin karo. KA BIXI baad isticmaali kartaa.", ephemeral: true }); return; }
    game.players.delete(userId);
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ka baxay lobby-ga`);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game, interaction.guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
      }
    }
    await interaction.reply({ content: "👋 Lobby-ga waad ka baxday.", ephemeral: true });
    return;
  }

  if (customId === "lobby_stop") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (userId !== game.hostId) { await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu joojin karaa.", ephemeral: true }); return; }
    if (game.phaseTimer) clearTimeout(game.phaseTimer);
    game.phase = "ended";
    games.delete(channelId);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) { const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null); if (lm) await lm.edit({ components: [] }).catch(() => null); }
    }
    addLog(guildId, interaction.guild.name, `🛑 Host-ku wuxuu joojiyay lobby-ga`);
    await interaction.reply({ content: "🛑 Ciyaarta waa la joojiyay.", ephemeral: true });
    const ch = await client.channels.fetch(game.channelId).catch(() => null);
    if (ch) await ch.send("🛑 Lobby-ga waa la xirray host-ka.").catch(() => null);
    return;
  }

  if (customId === "lobby_start") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (userId !== game.hostId) { await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu bilaabi karaa.", ephemeral: true }); return; }
    if (game.players.size < 5) { await interaction.reply({ content: "⚠️ Ugu yaraan 5 ciyaaryahan ayaa loo baahan yahay.", ephemeral: true }); return; }
    assignRoles(game);
    game.startedAt = new Date();
    addLog(guildId, interaction.guild.name, `🎮 Ciyaarta waa bilaabmay — ${game.players.size} ciyaaryahan`);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) { const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null); if (lm) await lm.edit({ components: [] }).catch(() => null); }
    }
    await interaction.reply({ content: "🎮 Ciyaarta waa bilaabmay! Doorarkiinna DM-kiinna ku fiiri.", ephemeral: false });
    for (const player of Array.from(game.players.values())) {
      const user = await client.users.fetch(player.id).catch(() => null);
      if (user) await user.send({ embeds: [buildRoleDmEmbed(player, game)] }).catch(() => null);
    }
    setTimeout(() => startNightPhase(client, game), 3000);
    return;
  }

  if (customId.startsWith("kick_")) {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (userId !== game.hostId) { await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu saari karaa.", ephemeral: true }); return; }
    const targetId = customId.replace("kick_", "");
    const target = game.players.get(targetId);
    if (!target) { await interaction.reply({ content: "⚠️ Ciyaaryahanka lama helin.", ephemeral: true }); return; }
    game.players.delete(targetId);
    addLog(guildId, interaction.guild.name, `🚪 ${target.displayName} waa laga saaray lobby-ga`);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) {
        const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game, interaction.guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
      }
    }
    await interaction.reply({ content: `🚪 **${target.displayName}** waa laga saaray lobby-ga.`, ephemeral: false });
    const ku = await client.users.fetch(targetId).catch(() => null);
    if (ku) await ku.send("🚪 Host-ku wuu kaa saaray lobby-ga.").catch(() => null);
    return;
  }

  if (customId.startsWith("vote_")) {
    if (!game || game.phase !== "day") { await interaction.reply({ content: "⚠️ Maalinta codbixinta maaha hadda.", ephemeral: true }); return; }
    const voter = game.players.get(userId);
    if (!voter || !voter.alive) { await interaction.reply({ content: "⚠️ Adigu ma codeyn kartid.", ephemeral: true }); return; }
    const targetId = customId === "vote_skip" ? "skip" : customId.replace("vote_", "");
    if (targetId !== "skip") {
      const t = game.players.get(targetId);
      if (!t || !t.alive) { await interaction.reply({ content: "⚠️ Ciyaaryahankaan nool maaha.", ephemeral: true }); return; }
    }
    const existingIdx = game.votes.findIndex(v => v.voterId === userId);
    const isChange = existingIdx !== -1;
    if (isChange) game.votes.splice(existingIdx, 1);
    game.votes.push({ voterId: userId, targetId });
    const targetName = targetId === "skip" ? "SKIP" : game.players.get(targetId)?.displayName ?? targetId;
    addLog(guildId, interaction.guild.name, `🗳️ ${voter.displayName} wuxuu u codeeyay ${targetName}${isChange ? " (baddalay)" : ""}`);
    await interaction.reply({
      content: isChange ? `🔄 Codkaagii waad baddashay → **${targetName}**` : `🗳️ Waxaad u codeysay: **${targetName}**`,
      ephemeral: true,
    });
    return;
  }
}
