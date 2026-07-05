// index.js — Ciyaal Xamar Discord Bot
// Commands: !dilaay !kasaar !join !leave !help !icaawi !dm !news !qarsoon
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder,
} from "discord.js";
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from "@discordjs/voice";
import { games, createGame, assignRoles, getAlivePlayers, getGuildGames, addLog, checkWinCondition } from "./game.js";
import { buildLobbyEmbed, buildLobbyButtons, buildRoleDmEmbed, buildKickButtons } from "./embeds.js";
import { startNightPhase, endGame } from "./phases.js";
import { handlePirateMessage, handlePirateInteraction } from "./pirate-handler.js";
import { handleSecretAgentMessage, handleSecretAgentInteraction } from "./secret-agent-handler.js";
import { startAdminReporter, trackCommand } from "./admin-reporter.js";

const MAX_GAMES_PER_GUILD = 5;
const OWNER_ID = "725076744251637760";
const voiceConnections = new Map();

const token = process.env["DISCORD_BOT_TOKEN"];
if (!token) {
  console.error("❌ DISCORD_BOT_TOKEN waa loo baahan yahay.");
  console.error("   cp .env.example .env  →  token ku geli");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot diyaar: ${c.user.tag} | ${c.guilds.cache.size} server`);
  startAdminReporter(c);
});
client.on(Events.MessageCreate, (msg) => handleMessage(msg));
client.on(Events.InteractionCreate, (interaction) => handleInteraction(interaction));
client.login(token).catch(err => { console.error("❌ Login failed:", err.message); process.exit(1); });

// ─── Voice Helper ─────────────────────────────────────────────────────────────
function joinVC(guildId, channelId, adapterCreator) {
  const existing = voiceConnections.get(guildId);
  if (existing) { try { existing.destroy(); } catch {} }

  const connection = joinVoiceChannel({ channelId, guildId, adapterCreator, selfDeaf: true, selfMute: false });
  voiceConnections.set(guildId, connection);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      try { connection.destroy(); } catch {}
      voiceConnections.delete(guildId);
    }
  });
  return connection;
}

// ─── Message Handler ──────────────────────────────────────────────────────────
async function handleMessage(msg) {
  if (msg.author.bot || !msg.guild) return;
  if (await handlePirateMessage(client, msg)) return;
  if (await handleSecretAgentMessage(client, msg)) return;
  const content  = msg.content.trim().toLowerCase();
  const raw      = msg.content.trim();
  const channelId = msg.channel.id;
  const guildId   = msg.guild.id;
  const isOwner   = msg.author.id === OWNER_ID;

  // ── !help ──────────────────────────────────────────────────────────────────
  if (content === "!help") {
    const embed = new EmbedBuilder()
      .setTitle("🎮 CIYAAL XAMAR — Amarrada (Commands)")
      .setColor(0x5865f2)
      .setDescription("Waa kuwan dhammaan amarrada bot-ka:")
      .addFields(
        { name: "🔪 Mafia Ciyaarta", value: ["`!dilaay` — Lobby cusub bilow (adiga waxaad noqon doontaa host)", "`!kasaar` — Host: ciyaaryahan lobby ka saar"].join("\n") },
        { name: "🎧 Voice Channel — 24/7", value: ["`!join` — Bot-ka VC-ga ku soo gal (24/7 joogayaa)", "`!leave` — Bot-ka VC-ka ka saar"].join("\n") },
        { name: "🆘 Caawimo & Xiriir", value: ["`!icaawi [farriin]` — Cilad ama su'aal owner-ka u dir", "  _Tusaale: `!icaawi Bot-ka lobby kuma furin`_"].join("\n") },
        { name: "🔐 Owner-ka Kaliya", value: ["`!dm [farriin]` — Shacabka ciyaarta ku jira DM u dir", "`!news [farriin]` — Server walba dhammaan dadka DM u dir"].join("\n") },
        {
          name: "📌 Mafia Doorarka",
          value: ["🔪 **Dilaaye** — Habeenta ciyaaryahan dila (waa sir)", "🩺 **Dhakhtar** — Habeenta hal qof badbaadi", "⭐ **Sheriff** — Habeenta hal qof toog (haddii Dilaaye yahay wuu dhintaa, haddii kale waxba ma dhacaan)", "🏠 **Shacab** — Maalinta codbixinta ku saaro Dilaayaha"].join("\n"),
        },
        { name: "⚙️ Tirada Doorarka", value: ["`5–9`   ciyaaryahan → 1 Dilaaye · 1 Dhakhtar · 1 Sheriff", "`10–14` ciyaaryahan → 2 Dilaaye · 1 Dhakhtar · 1 Sheriff", "`15–20` ciyaaryahan → 3 Dilaaye · 1 Dhakhtar · 2 Sheriff"].join("\n") },

        {
          name: "🏴‍☠️ Pirate Treasure Hunt — Ciyaarta Cusub",
          value: [
            "`!pirate` — Lobby cusub bilow (2–20 ciyaaryahan, elimination mode)",
            "`!shop` — Alaabta lagu iibsan karo arag (Shield, Lucky Compass, Treasure Map)",
            "`!buy shield` — 🛡️ 1,000 Gold · Deadly Trap kaa badbaadiya (2 mar)",
            "`!buy compass` — 🧭 2,000 Gold · Treasure fursad kordhiya",
            "`!buy map` — 🗺️ 10 Gems · Jasiirad ammaan ah tilmaamiya",
            "`!inventory` — 🎒 Items, Gold iyo Gems-kaaga arag",
            "`!daily` — 🎁 500 Gold + 1 Gem qaado (24 saac kasta)",
            "`!leaderboard` — 🏆 Top 10 Pirates ee ugu badnaa Gold",
          ].join("\n"),
        },
        {
          name: "⚓ Sida Pirate Ciyaaruhu u Shaqeyso",
          value: [
            "🏝️ Kasta round jasiirad dooro (A–E) — 30 ilbiriqsi",
            "💰 Treasure Found +200–500 Gold · 💎 Rare Treasure +1–2 Gems",
            "📦 Item Found: Shield ama Lucky Compass",
            "☠️ Trap: Gold luminta · 💥 Deadly Trap: Ciyaarta waad ka baxaysaa",
            "👑 Hal burcad-badeed oo keliya ayaa guuleysta!",
          ].join("\n"),
        }
      )
      .setFooter({ text: "Ciyaal Xamar Bot · !icaawi haddaad caawimaad u baahantahay" });
    await msg.reply({ embeds: [embed] });
    return;
  }

  // ── !join ──────────────────────────────────────────────────────────────────
  if (content === "!join") {
    const vc = msg.member?.voice?.channel;
    if (!vc) { await msg.reply("⚠️ Marka hore **Voice Channel** gal, kadibna `!join` qor."); return; }
    joinVC(guildId, vc.id, msg.guild.voiceAdapterCreator);
    addLog(guildId, msg.guild.name, `🎧 Bot wuxuu ku biiray VC: ${vc.name}`);
    await msg.reply({ embeds: [
      new EmbedBuilder()
        .setTitle("🎧 24/7 Voice Channel — Online!")
        .setDescription(`Bot-ku wuxuu ku biiray **${vc.name}**.\nHabeen iyo maalin wuu ku sii joogayaa — xitaa dadku marka ay ka baxaan!`)
        .setColor(0x57f287)
        .addFields({ name: "📍 Channel", value: vc.name, inline: true }, { name: "🔇 Xaalad", value: "Maqal · Aan hadlayn", inline: true })
        .setFooter({ text: "`!leave` haddaad rabto bot-ka in uu ka baxo" })
    ]});
    return;
  }

  // ── !leave ─────────────────────────────────────────────────────────────────
  if (content === "!leave") {
    const conn = voiceConnections.get(guildId);
    if (!conn) { await msg.reply("⚠️ Bot-ku voice channel kuma jiro hadda."); return; }
    try { conn.destroy(); } catch {}
    voiceConnections.delete(guildId);
    addLog(guildId, msg.guild.name, `🎧 Bot wuxuu ka baxay VC-ga`);
    await msg.reply("👋 Bot-ku VC-ga wuu ka baxay.");
    return;
  }

  // ── !icaawi ────────────────────────────────────────────────────────────────
  if (content.startsWith("!icaawi")) {
    const report = raw.slice("!icaawi".length).trim();
    if (!report) { await msg.reply("⚠️ Fariintaada qor kadib `!icaawi`.\n_Tusaale: `!icaawi Bot-ka lobby kuma furin`_"); return; }
    const owner = await client.users.fetch(OWNER_ID).catch(() => null);
    if (!owner) { await msg.reply("⚠️ Maamulaha lama gaadhi karin. Dib u isku day."); return; }
    const dmSent = await owner.send({ embeds: [
      new EmbedBuilder()
        .setTitle("🆘 Codsi Caawimo — Ciyaal Xamar Bot")
        .setColor(0xed4245)
        .addFields(
          { name: "👤 Qofka", value: `**${msg.author.displayName ?? msg.author.username}**\n\`${msg.author.id}\``, inline: true },
          { name: "🏠 Server", value: `${msg.guild.name}\n\`${msg.guild.id}\``, inline: true },
          { name: "💬 Farriin", value: report }
        )
        .setFooter({ text: `User: ${msg.author.id} · Server: ${msg.guild.id}` })
        .setTimestamp()
    ]}).then(() => true).catch(() => false);
    if (dmSent) {
      await msg.reply("✅ **Fariintaada maamulaha la gaarsiiiyay!**\nIyagu waxay kugu jawaabi doonaan DM-kaaga. Samiri yar.");
      addLog(guildId, msg.guild.name, `🆘 ${msg.author.username} wuxuu u diray caawimo codsi owner-ka`);
    } else {
      await msg.reply("⚠️ Maamulaha DM-kiisa waa xidnaanaa. Dib u isku day.");
    }
    return;
  }

  // ── !dm — Owner kaliya: Shacabka ciyaarta DM u dir ─────────────────────────
  if (content.startsWith("!dm")) {
    if (!isOwner) { await msg.reply("🔐 Amarka `!dm` kaliya owner-ku wuxuu isticmaali karaa."); return; }
    const farriin = raw.slice("!dm".length).trim();
    if (!farriin) { await msg.reply("⚠️ Fariinta qor kadib `!dm`.\n_Tusaale: `!dm Ciyaarta 5 daqiiqo kadib way bilaabantahay!`_"); return; }

    const game = games.get(channelId);
    if (!game || game.phase === "ended") { await msg.reply("⚠️ Kanaalkan ciyaaro firfircoon ma jirto. `!dilaay` bilow marka hore."); return; }

    // Lobby: dhammaan players; Ciyaar: Shacabka kaliya (nool)
    const targets = game.phase === "lobby"
      ? Array.from(game.players.values())
      : Array.from(game.players.values()).filter(p => p.alive && p.role === "shacab");

    if (targets.length === 0) { await msg.reply("⚠️ Hadda Shacab nool ma jiraan."); return; }

    const dmEmbed = new EmbedBuilder()
      .setTitle("📢 Farriin — Ciyaal Xamar")
      .setDescription(farriin)
      .setColor(0x5865f2)
      .setFooter({ text: `${msg.guild.name} · Ciyaal Xamar Bot` })
      .setTimestamp();

    await msg.reply(`⏳ ${targets.length} qof loo dirayo farriin...`);
    let guulayste = 0, fashilmay = 0;
    for (const player of targets) {
      const user = await client.users.fetch(player.id).catch(() => null);
      if (!user) { fashilmay++; continue; }
      const ok = await user.send({ embeds: [dmEmbed] }).then(() => true).catch(() => false);
      if (ok) guulayste++; else fashilmay++;
    }
    addLog(guildId, msg.guild.name, `📢 Owner wuxuu farriin u diray ${guulayste} Shacab`);
    await msg.channel.send(`✅ **Fariinta la gaarsiiiyay!**\n📨 La diray: **${guulayste}** · ❌ Waa xidnaa: **${fashilmay}**`).catch(() => null);
    return;
  }

  // ── !news — Owner kaliya: server walba dhammaan dadka DM u dir ─────────────
  if (content.startsWith("!news")) {
    if (!isOwner) { await msg.reply("🔐 Amarka `!news` kaliya owner-ku wuxuu isticmaali karaa."); return; }
    const farriin = raw.slice("!news".length).trim();
    if (!farriin) { await msg.reply("⚠️ Fariinta qor kadib `!news`.\n_Tusaale: `!news Bot-ka wuxuu helaya update cusub!`_"); return; }

    const guilds = Array.from(client.guilds.cache.values());
    if (guilds.length === 0) { await msg.reply("⚠️ Bot-ku wali server kuma biirin."); return; }

    const newsEmbed = new EmbedBuilder()
      .setTitle("📰 Wariye — Ciyaal Xamar Bot")
      .setDescription(farriin)
      .setColor(0xf59e0b)
      .addFields({ name: "📡 Isha", value: "Ciyaal Xamar — Bot Maamulaha", inline: true })
      .setFooter({ text: "Ciyaal Xamar Bot · Farriin rasmi ah" })
      .setTimestamp();

    await msg.reply(`⏳ Server **${guilds.length}** ka dhammaan dadka loo dirayo farriin...\n_(Waxay qaadan kartaa daqiiqo yar)_`);

    let totalSent = 0, totalFailed = 0, totalMembers = 0;
    for (const guild of guilds) {
      try {
        const members = await guild.members.fetch();
        const humans  = members.filter(m => !m.user.bot);
        totalMembers  += humans.size;
        for (const [, member] of humans) {
          const ok = await member.user.send({ embeds: [newsEmbed] }).then(() => true).catch(() => false);
          if (ok) totalSent++; else totalFailed++;
        }
      } catch { /* guild fetch failed, skip */ }
    }

    addLog(guildId, msg.guild.name, `📰 Owner wuxuu news u diray ${totalSent}/${totalMembers} qof (${guilds.length} server)`);
    await msg.channel.send(
      `📰 **News la diray!**\n🌐 Serverro: **${guilds.length}**\n👥 Dadka la yiqiin: **${totalMembers}**\n✅ La diray: **${totalSent}**\n❌ DM xidnaa: **${totalFailed}**`
    ).catch(() => null);
    return;
  }

  // ── !dilaay ────────────────────────────────────────────────────────────────
  if (content === "!dilaay") {
    const existing = games.get(channelId);
    if (existing && existing.phase !== "ended") { await msg.reply("⚠️ Kanaalkan ciyaaro socota ayaa ku jirta! Jooji ciyaartii hore ka hor."); return; }
    const guildGames = getGuildGames(guildId);
    if (guildGames.length >= MAX_GAMES_PER_GUILD) { await msg.reply(`⚠️ Servarkaan ${MAX_GAMES_PER_GUILD} ciyaaro ayaa isku mar ka socda.`); return; }
    const game = createGame(guildId, channelId, msg.author.id);
    game.players.set(msg.author.id, {
      id: msg.author.id, username: msg.author.username,
      displayName: msg.member?.displayName ?? msg.author.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, msg.guild.name, `🎮 ${msg.author.username} wuxuu bilaabay ciyaaro cusub`);
    const lobbyMsg = await msg.channel.send({ embeds: [buildLobbyEmbed(game, msg.guild)], components: [buildLobbyButtons(game)] });
    game.lobbyMessageId = lobbyMsg.id;
    return;
  }

  // ── !kasaar ────────────────────────────────────────────────────────────────
  if (content === "!kasaar") {
    const game = games.get(channelId);
    if (!game || game.phase !== "lobby") { await msg.reply("⚠️ Kanaalkan ma jirto lobby furan."); return; }
    if (game.hostId !== msg.author.id) { await msg.reply("⚠️ Kaliya host-ku wuxuu isticmaali karaa `!kasaar`."); return; }
    const kickButtons = buildKickButtons(game, msg.author.id);
    if (kickButtons.length === 0) { await msg.reply("⚠️ Ma jiraan ciyaaryahan la saari karo."); return; }
    await msg.reply({ content: "🚪 Xulo ciyaaryahanka aad saari rabto:", components: kickButtons });
    return;
  }
}

// ─── Night CustomId Parser ────────────────────────────────────────────────────
function parseNightCustomId(customId, prefix) {
  const rest = customId.slice(prefix.length);
  const idx  = rest.indexOf("_");
  if (idx === -1) return null;
  return { gameChannelId: rest.slice(0, idx), targetId: rest.slice(idx + 1) };
}

// ─── Interaction Handler ──────────────────────────────────────────────────────
async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (await handlePirateInteraction(client, interaction)) return;
  if (await handleSecretAgentInteraction(client, interaction)) return;
  const userId   = interaction.user.id;
  const customId = interaction.customId;

  // Night actions (from DM)
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
    addLog(game.guildId, guildName, `🔪 Dilaaye wuxuu xushay bartilmaameedka`);
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

  if (customId.startsWith("night_sheriff_")) {
    const parsed = parseNightCustomId(customId, "night_sheriff_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== "sheriff" || !player.alive) { await interaction.reply({ content: "⚠️ Adigu ma tahid Sheriff nool.", ephemeral: true }); return; }
    if (!game.nightSheriffUsed) game.nightSheriffUsed = new Set();
    if (game.nightSheriffUsed.has(userId)) { await interaction.reply({ content: "⚠️ Hal xabbad oo kaliya ayaad haysataa habeen kasta — waad isticmaashay!", ephemeral: true }); return; }
    game.nightSheriffUsed.add(userId);

    const target = game.players.get(parsed.targetId);
    const guildName = (await client.guilds.fetch(game.guildId).catch(() => null))?.name ?? "Unknown";

    if (!target || !target.alive) {
      await interaction.reply({ content: "⚠️ Ciyaaryahankaan lama heli karo.", ephemeral: true });
      return;
    }

    if (target.role === "dilaaye") {
      target.alive = false;
      addLog(game.guildId, guildName, `💥 Sheriff ${player.displayName} wuxuu toogtay Dilaayaha ${target.displayName}!`);
      await interaction.reply({
        content: `💥 **Sheriff ayaa toogtay ${target.displayName}!**\n🔪 ${target.displayName} wuxuu ahaa Dilaayaha.\n🎉 Dilaayaha waa la dilay!`,
        ephemeral: true,
      });

      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        const sheriffEmbed = new EmbedBuilder()
          .setTitle("💥 SHERIFF-KU WUU TOOGTAY!")
          .setColor(0xffd700)
          .setDescription(
            `⭐ **Sheriff-ku** habeenkii wuxuu toogtay **${target.displayName}**!\n` +
            `🔪 Waxa uu ahaa **Dilaayaha**!\n` +
            `🎉 **Dilaayaha waa la dilay!**`
          )
          .setFooter({ text: "Ciyaal Xamar · Mafia Game" });
        await channel.send({ embeds: [sheriffEmbed] }).catch(() => null);
      }

      const winner = checkWinCondition(game);
      if (winner) {
        if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
        await endGame(client, game, winner);
      }
    } else {
      addLog(game.guildId, guildName, `❌ Sheriff ${player.displayName} wuxuu toogtay ${target.displayName} — ma ahayn Dilaaye`);
      await interaction.reply({
        content: `❌ **${target.displayName}** ma aha Dilaaye.\n🛡️ Sheriff wuxuu dili karaa oo keliya Dilaayaha.\n🌙 Habeenku wuu sii socdaa...`,
        ephemeral: true,
      });
    }
    return;
  }

  // Guild interactions
  if (!interaction.guild) return;
  const guildId   = interaction.guild.id;
  const channelId = interaction.channelId;
  const game      = games.get(channelId);

  if (customId === "lobby_join") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (game.players.has(userId)) { await interaction.reply({ content: "⚠️ Hore baad ku biirtay lobby-ga.", ephemeral: true }); return; }
    if (game.players.size >= 20) { await interaction.reply({ content: "⚠️ Lobby-ga wuu buuxay (20/20).", ephemeral: true }); return; }
    game.players.set(userId, {
      id: userId, username: interaction.user.username,
      displayName: interaction.member?.displayName ?? interaction.user.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ku biiray lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild);
    await interaction.reply({ content: "✅ Lobby-ga waad ku biiray!", ephemeral: true });
    return;
  }

  if (customId === "lobby_leave") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (!game.players.has(userId)) { await interaction.reply({ content: "⚠️ Ma jirtid lobby-ga.", ephemeral: true }); return; }
    if (userId === game.hostId) { await interaction.reply({ content: "⚠️ Host-ku ma bixin karo. JOOJI batoonka isticmaal.", ephemeral: true }); return; }
    game.players.delete(userId);
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ka baxay lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild);
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
    const target   = game.players.get(targetId);
    if (!target) { await interaction.reply({ content: "⚠️ Ciyaaryahanka lama helin.", ephemeral: true }); return; }
    game.players.delete(targetId);
    addLog(guildId, interaction.guild.name, `🚪 ${target.displayName} waa laga saaray lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild);
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
    const isChange    = existingIdx !== -1;
    if (isChange) game.votes.splice(existingIdx, 1);
    game.votes.push({ voterId: userId, targetId });
    const targetName = targetId === "skip" ? "SKIP" : game.players.get(targetId)?.displayName ?? targetId;
    addLog(guildId, interaction.guild.name, `🗳️ ${voter.displayName} wuxuu u codeeyay ${targetName}${isChange ? " (baddalay)" : ""}`);
    await interaction.reply({ content: isChange ? `🔄 Codkaagii waad baddashay → **${targetName}**` : `🗳️ Waxaad u codeysay: **${targetName}**`, ephemeral: true });
    return;
  }
}

// Helper: refresh lobby embed in channel
async function refreshLobbyMsg(game, guild) {
  if (!game.lobbyMessageId) return;
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game, guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
}
