// secret-agent-handler.js — 🕵️ Secret Agent Game
  import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

  // ─── Goobaha ──────────────────────────────────────────────────────────────────
  const LOCATIONS = [
    { name: 'Xeeb', emoji: '🏖️' },
    { name: 'Isbitaal', emoji: '🏥' },
    { name: 'Masaajid', emoji: '🕌' },
    { name: 'Garoon Diyaaradeed', emoji: '✈️' },
    { name: 'Iskuul', emoji: '🏫' },
    { name: 'Bangi', emoji: '🏦' },
    { name: 'Makhaayad', emoji: '🍽️' },
    { name: 'Shineemo', emoji: '🎬' },
    { name: 'Suuq', emoji: '🛒' },
    { name: 'Garoon Kubadeed', emoji: '⚽' },
    { name: 'Hotel', emoji: '🏨' },
    { name: 'Deked', emoji: '🚢' },
    { name: 'Kaam', emoji: '🏕️' },
    { name: 'Matxaf', emoji: '🏛️' },
    { name: 'Beerta Madadaalada', emoji: '🎡' },
    { name: 'Xafiis', emoji: '🏢' },
    { name: 'Xarunta Dab-damiska', emoji: '🚒' },
    { name: 'Saldhig Booliis', emoji: '🚓' },
    { name: 'Gym', emoji: '🏋️' },
    { name: 'Coffee Shop', emoji: '☕' },
  ];

  // ─── Active Games ─────────────────────────────────────────────────────────────
  export const agentGames = new Map(); // channelId → game

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  function timerBar(current, total) {
    const pct = Math.max(0, Math.min(1, current / total));
    const filled = Math.round(pct * 15);
    const color = pct > 0.5 ? '🟩' : pct > 0.25 ? '🟨' : '🟥';
    return color.repeat(filled) + '⬛'.repeat(15 - filled);
  }

  function createAgentGame(guildId, channelId, hostId) {
    return {
      guildId, channelId, hostId,
      phase: 'lobby',
      players: new Map(),
      agentId: null,
      location: null,
      round: 1,
      maxRounds: 2,
      votes: new Map(),
      lobbyMessageId: null,
      phaseMessageId: null,
      phaseInterval: null,
      phaseTimeout: null,
      agentGuessedOnce: false,
    };
  }

  function endGame(game) {
    if (game.phaseInterval) clearInterval(game.phaseInterval);
    if (game.phaseTimeout) clearTimeout(game.phaseTimeout);
    game.phase = 'ended';
    agentGames.delete(game.channelId);
  }

  // ─── Embeds ───────────────────────────────────────────────────────────────────
  function buildLobbyEmbed(game, guild) {
    const players = Array.from(game.players.values());
    const list = players.length
      ? players.map((p, i) => `\`${i + 1}.\` **${p.displayName}**`).join('\n')
      : '_Ma jiro ciyaaryahan wali_';
    return new EmbedBuilder()
      .setTitle('🕵️ SECRET AGENT — Lobby')
      .setColor(0x1a1a2e)
      .setDescription('**Ku biir ciyaarta!** Ugu yaraan **3 qof** ayaa loo baahan yahay bilaabista.\n\n🌍 Goob sir ah la dooran doonaa • 🕵️ Hal qof Agent ah ayaa dooran doonaa')
      .addFields(
        { name: `👥 Ciyaaryahanka (${players.length}/15)`, value: list },
        { name: '⏱️ Hab-dhismeedka', value: '💬 Wadahadal **120** ilbiriqsi\n🗳️ Codeyn **90** ilbiriqsi (bedeli kartaa)\n🔄 Max **2** Round haddii agent la waayo' },
      )
      .setFooter({ text: `${guild.name} · Ciyaal Xamar Bot` })
      .setTimestamp();
  }

  function buildLobbyButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sa_join').setLabel('🟢 Kubiir').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sa_leave').setLabel('🔴 Kabax').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('sa_start').setLabel('▶️ Bilaab').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sa_stop').setLabel('⛔ Jooji').setStyle(ButtonStyle.Secondary),
    );
  }

  function buildDiscussionEmbed(game, timeLeft) {
    const bar = timerBar(timeLeft, 120);
    const players = Array.from(game.players.values());
    const list = players.map(p => `• **${p.displayName}**`).join('\n');
    return new EmbedBuilder()
      .setTitle('🗣️ WADAHADAL — Doodda Way Bilaabatay!')
      .setColor(timeLeft > 60 ? 0x2d6a4f : timeLeft > 30 ? 0xfca311 : 0xc9184a)
      .setDescription(`${bar}\n## ⏳ \`${fmtTime(timeLeft)}\` Waqti Hartay`)
      .addFields(
        { name: `🔴 Round ${game.round}/${game.maxRounds}`, value: `${game.players.size} ciyaaryahan`, inline: true },
        { name: '🎯 Meesha', value: 'Sir — Agent kaliya ma garanayso!', inline: true },
        { name: '👥 Ciyaaryahanka', value: list },
        { name: '📜 Xeerka', value: '• Qof walba wuxuu hal su\'aal waydiiyaa qof kale\n• Agent-ku wuu isku dayayaa inuu goobta ogaado\n• Shacabku waxay raadiyaan cidda Agent-ka ah' },
      )
      .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent · Codeyntu way timaanaysaa!' });
  }

  function buildVotingEmbed(game, timeLeft) {
    const bar = timerBar(timeLeft, 90);
    const tally = new Map();
    for (const [, tid] of game.votes) tally.set(tid, (tally.get(tid) || 0) + 1);
    const players = Array.from(game.players.values());
    const voteLines = players
      .map(p => {
        const c = tally.get(p.id) || 0;
        const blocks = '🟥'.repeat(c) + '⬜'.repeat(Math.max(0, 4 - c));
        return `${blocks} **${p.displayName}** — ${c} cod`;
      })
      .join('\n');
    return new EmbedBuilder()
      .setTitle('🗳️ CODEYNTA — Yaa Secret Agent-ka?')
      .setColor(timeLeft > 45 ? 0xc9184a : timeLeft > 20 ? 0xff6b6b : 0xff0000)
      .setDescription(`${bar}\n## ⏳ \`${fmtTime(timeLeft)}\` Waqti Hartay`)
      .addFields(
        { name: '📊 Codadka Hadda', value: voteLines || '_Wali cod lama bixin_' },
        { name: '💡 Xeerka', value: `${game.votes.size}/${players.length} qof ayaa codeeyay • Waxaad bedeli kartaa codkaaga` },
      )
      .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent · DM-kaaga eeg si aad u codeysato!' });
  }

  function buildVoteButtons(game, voterId) {
    const others = Array.from(game.players.values()).filter(p => p.id !== voterId);
    const rows = [];
    for (let i = 0; i < others.length && rows.length < 5; i += 4) {
      const chunk = others.slice(i, i + 4);
      rows.push(new ActionRowBuilder().addComponents(
        chunk.map(p =>
          new ButtonBuilder()
            .setCustomId(`sa_vote_${game.channelId}_${p.id}`)
            .setLabel(`👤 ${p.displayName.slice(0, 25)}`)
            .setStyle(ButtonStyle.Primary)
        )
      ));
    }
    return rows;
  }

  function buildLocationButtons(game) {
    const rows = [];
    for (let i = 0; i < LOCATIONS.length && rows.length < 5; i += 4) {
      const chunk = LOCATIONS.slice(i, i + 4);
      rows.push(new ActionRowBuilder().addComponents(
        chunk.map(loc =>
          new ButtonBuilder()
            .setCustomId(`sa_guess_${game.channelId}_${loc.name}`)
            .setLabel(`${loc.emoji} ${loc.name}`)
            .setStyle(ButtonStyle.Secondary)
        )
      ));
    }
    return rows;
  }

  // ─── DMs ──────────────────────────────────────────────────────────────────────
  async function sendRoleDMs(client, game) {
    const locList = LOCATIONS.map(l => `${l.emoji} ${l.name}`).join(' · ');
    for (const player of game.players.values()) {
      const user = await client.users.fetch(player.id).catch(() => null);
      if (!user) continue;
      if (player.id === game.agentId) {
        await user.send({ embeds: [
          new EmbedBuilder()
            .setTitle('🕵️ ADIGA WAA SECRET AGENT!')
            .setColor(0x1a1a2e)
            .setDescription(
              '## ⚠️ MA TAQAANID GOOBTA\n\n' +
              'Isku day inaad ka fahanto goobta su\'aalaha la isweydiiyo.\n' +
              'Jawaab si dabiici ah — taxaddar!'
            )
            .addFields(
              { name: '🎯 Ujeedadaada', value: '• Goobta ka ogaaw wadahadal\n• Iska dhig inaad goobta taqaanid\n• Shacabka kuma ogeysiin goobta' },
              { name: '⚡ Haddii La Kugu Xukumo', value: '**HAL FURSAD** oo kaliya ayaad heleysaa.\nHaddii aad goobta sax u qiyaasto — ADIGA OO GUULAYSTA! 🏆\nHaddii aad qalato — SHACABKU way guuleystaan.' },
              { name: '🌍 Goobaha Suurtogalka ah', value: locList },
            )
            .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent · KHIYAANO. CAQLI. DOOD. GUUL.' })
            .setTimestamp()
        ]}).catch(() => null);
      } else {
        await user.send({ embeds: [
          new EmbedBuilder()
            .setTitle('📍 Goobta Aad Ku Jirtid')
            .setColor(0x2d6a4f)
            .setDescription(
              `# ${game.location.emoji} **${game.location.name}**\n\n` +
              'Dhammaan ciyaaryahanka (agent-ka marka laga reebo) waxay ku jiraan **isla goobtan**.\n' +
              'Agent-ka **ma garanayso** goobta — isku day inaad ka helato!'
            )
            .addFields(
              { name: '🎯 Ujeedadaada', value: '• Su\'aalo wax laga jawaabi karo goobta ku wee\n• Agent-ka ogaaw (ka fiirso cidda aan jawaabaha ku habboonayn)\n• Codeynta Agent-ka ku xukum' },
              { name: '🌍 Dhammaan Goobaha (Tixraac)', value: locList },
            )
            .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent · KHIYAANO. CAQLI. DOOD. GUUL.' })
            .setTimestamp()
        ]}).catch(() => null);
      }
    }
  }

  // ─── Phase: Wadahadal (120s) ───────────────────────────────────────────────────
  async function startDiscussion(client, game, channel) {
    game.phase = 'discussion';
    let timeLeft = 120;

    const msg = await channel.send({ embeds: [buildDiscussionEmbed(game, timeLeft)] }).catch(() => null);
    if (msg) game.phaseMessageId = msg.id;

    game.phaseInterval = setInterval(async () => {
      timeLeft -= 5;
      if (timeLeft <= 0) { clearInterval(game.phaseInterval); return; }
      if (msg) await msg.edit({ embeds: [buildDiscussionEmbed(game, timeLeft)] }).catch(() => null);
    }, 5_000);

    game.phaseTimeout = setTimeout(async () => {
      clearInterval(game.phaseInterval);
      await startVoting(client, game, channel);
    }, 120_000);
  }

  // ─── Phase: Codeyn (90s) ──────────────────────────────────────────────────────
  async function startVoting(client, game, channel) {
    game.phase = 'voting';
    game.votes = new Map();
    let timeLeft = 90;

    // DM voting buttons to each player
    for (const player of game.players.values()) {
      const user = await client.users.fetch(player.id).catch(() => null);
      if (!user) continue;
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🗳️ Waqtiga Codeynta Waa Yimid!')
            .setColor(0xc9184a)
            .setDescription('**Hoos ka dooro** cidda aad u malaynayso inay tahay Secret Agent.\nWaxaad **bedeli kartaa** codkaaga 90 ilbiriqsi gudahood.')
            .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
        ],
        components: buildVoteButtons(game, player.id),
      }).catch(() => null);
    }

    // Live voting embed in channel
    const msg = await channel.send({ embeds: [buildVotingEmbed(game, timeLeft)] }).catch(() => null);
    if (msg) game.phaseMessageId = msg.id;

    game.phaseInterval = setInterval(async () => {
      timeLeft -= 5;
      if (timeLeft <= 0) { clearInterval(game.phaseInterval); return; }
      if (msg) await msg.edit({ embeds: [buildVotingEmbed(game, timeLeft)] }).catch(() => null);
    }, 5_000);

    game.phaseTimeout = setTimeout(async () => {
      clearInterval(game.phaseInterval);
      await resolveVoting(client, game, channel);
    }, 90_000);
  }

  // ─── Resolve Voting ───────────────────────────────────────────────────────────
  async function resolveVoting(client, game, channel) {
    const tally = new Map();
    for (const [, tid] of game.votes) tally.set(tid, (tally.get(tid) || 0) + 1);

    let topId = null, topCount = 0;
    for (const [id, count] of tally) {
      if (count > topCount) { topCount = count; topId = id; }
    }

    if (!topId) {
      // No votes → agent not caught
      return await handleNoCatch(client, game, channel);
    }

    if (topId === game.agentId) {
      // Agent caught → final guess
      const suspected = game.players.get(topId);
      await channel.send({ embeds: [
        new EmbedBuilder()
          .setTitle('🎯 AGENT-KA WAA LA HELAY!')
          .setColor(0xfca311)
          .setDescription(
            `Codeyntu waxay xushay **${suspected?.displayName ?? 'Qof'}** — oo runtii **Secret Agent** ah!\n\n` +
            '⚡ **Laakiin... Agent-ka waxaa u hadhay HAL FURSAD!**\n' +
            'Haddii uu goobta sax u qiyaasto — wuu guuleysan doonaa!'
          )
          .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
      ]}).catch(() => null);
      await agentFinalGuess(client, game, channel);
    } else {
      // Wrong person
      const suspected = game.players.get(topId);
      if (game.round < game.maxRounds) {
        game.round++;
        await channel.send({ embeds: [
          new EmbedBuilder()
            .setTitle('❌ Qof Khalad Ah La Xushay!')
            .setColor(0xff6b6b)
            .setDescription(
              `Dadku waxay u codeeyeen **${suspected?.displayName ?? '?'}** — laakiin **Agent ma aha**!\n\n` +
              `😈 Agent-ku wuu baxsaday! **Round ${game.round}** ayaa bilaabmaya...`
            )
            .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
        ]}).catch(() => null);
        setTimeout(() => startDiscussion(client, game, channel), 4_000);
      } else {
        await agentWins(client, game, channel);
      }
    }
  }

  async function handleNoCatch(client, game, channel) {
    if (game.round < game.maxRounds) {
      game.round++;
      await channel.send({ embeds: [
        new EmbedBuilder()
          .setTitle(`🔄 Round ${game.round} Bilaabmaya!`)
          .setColor(0xfca311)
          .setDescription(`Cid codeysan waysay! Agent-ka **kama bixin** Round ${game.round - 1}.\n\n120 ilbiriqsi oo dood ah ayaa bilaabanaya...`)
          .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
      ]}).catch(() => null);
      setTimeout(() => startDiscussion(client, game, channel), 4_000);
    } else {
      await agentWins(client, game, channel);
    }
  }

  async function agentWins(client, game, channel) {
    const agent = game.players.get(game.agentId);
    await channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle('😈 SECRET AGENT WUU GUULEYSTAY!')
        .setColor(0x1a1a2e)
        .setDescription(`**${agent?.displayName ?? 'Agent-ka'}** ayaa guuleystay!\nShacabku ma heli karin **${game.maxRounds}** round gudahood!`)
        .addFields(
          { name: '🕵️ Agent-ka Ahaa', value: `**${agent?.displayName ?? '?'}**`, inline: true },
          { name: '📍 Goobta Ahayd', value: `${game.location.emoji} **${game.location.name}**`, inline: true },
          { name: '🏆 Natiijada', value: '🕵️ **SECRET AGENT** ayaa guuleystay!' },
        )
        .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
        .setTimestamp()
    ]}).catch(() => null);
    endGame(game);
  }

  async function agentFinalGuess(client, game, channel) {
    game.phase = 'agent-guess';
    const agentUser = await client.users.fetch(game.agentId).catch(() => null);
    if (!agentUser) {
      // If we can't DM agent, shacab wins automatically
      await shacabWins(client, game, channel, 'DM');
      return;
    }
    await agentUser.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚡ HAL FURSAD — Goobta Qiyaas!')
          .setColor(0xff6b6b)
          .setDescription(
            'Shacabku waa kugu xukumay!\n\n' +
            '**Haddii aad goobta SAX u qiyaasato — ADIGA OO GUULAYSTA! 🏆**\n' +
            'Haddii aad qalato — Shacabku way guuleystaan.\n\n' +
            '👇 **Hal goob dooro — HAL ISKU DAY KALIYA!**'
          )
          .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent · HAL FURSAD!' })
      ],
      components: buildLocationButtons(game),
    }).catch(async () => {
      await shacabWins(client, game, channel, 'DM');
    });
  }

  async function shacabWins(client, game, channel, reason) {
    const agent = game.players.get(game.agentId);
    await channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle('🎉 SHACABKU WAY GUULEYSTEEN!')
        .setColor(0x2d6a4f)
        .setDescription(reason === 'guess'
          ? `Agent-ku wuxuu qiyaastay goob khalad ah!\n\nGoobta runta ahayd waxay ahayd:\n# ${game.location.emoji} **${game.location.name}**`
          : `Agent-ka waa la helay!\n\nGoobta ahayd: ${game.location.emoji} **${game.location.name}**`
        )
        .addFields(
          { name: '🕵️ Agent-ka Ahaa', value: `**${agent?.displayName ?? '?'}**`, inline: true },
          { name: '📍 Goobta Ahayd', value: `${game.location.emoji} **${game.location.name}**`, inline: true },
          { name: '🏆 Natiijada', value: '👥 **SHACABKU** ayaa guuleystay!' },
        )
        .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
        .setTimestamp()
    ]}).catch(() => null);
    endGame(game);
  }

  // ─── Refresh Lobby ────────────────────────────────────────────────────────────
  async function refreshLobby(game, guild, channel) {
    if (!game.lobbyMessageId || !channel) return;
    const msg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [buildLobbyEmbed(game, guild)], components: [buildLobbyButtons()] }).catch(() => null);
  }

  // ─── Message Handler ──────────────────────────────────────────────────────────
  export async function handleSecretAgentMessage(client, msg) {
    if (msg.author.bot || !msg.guild) return false;
    const content = msg.content.trim().toLowerCase();
    if (content !== '!qarsoon') return false;

    const channelId = msg.channel.id;
    const existing = agentGames.get(channelId);
    if (existing && existing.phase !== 'ended') {
      await msg.reply('⚠️ Kanaalkan ciyaaro Secret Agent ah ayaa socota!');
      return true;
    }

    const game = createAgentGame(msg.guild.id, channelId, msg.author.id);
    game.players.set(msg.author.id, {
      id: msg.author.id,
      username: msg.author.username,
      displayName: msg.member?.displayName ?? msg.author.username,
    });
    agentGames.set(channelId, game);

    const lobbyMsg = await msg.channel.send({
      embeds: [buildLobbyEmbed(game, msg.guild)],
      components: [buildLobbyButtons()],
    }).catch(() => null);
    if (lobbyMsg) game.lobbyMessageId = lobbyMsg.id;
    return true;
  }

  // ─── Interaction Handler ──────────────────────────────────────────────────────
  export async function handleSecretAgentInteraction(client, interaction) {
    if (!interaction.isButton()) return false;
    const { customId, user } = interaction;

    // ── Lobby ────────────────────────────────────────────────────────────────
    if (customId === 'sa_join') {
      const game = agentGames.get(interaction.channelId);
      if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Lobby ma furana.', ephemeral: true }); return true; }
      if (game.players.has(user.id)) { await interaction.reply({ content: '⚠️ Hore baad ku biirtay!', ephemeral: true }); return true; }
      if (game.players.size >= 15) { await interaction.reply({ content: '⚠️ Lobby wuu buuxay (15/15).', ephemeral: true }); return true; }
      game.players.set(user.id, { id: user.id, username: user.username, displayName: interaction.member?.displayName ?? user.username });
      await refreshLobby(game, interaction.guild, interaction.channel);
      await interaction.reply({ content: '✅ Lobby-ga waad ku biiray! Diyaarso...', ephemeral: true });
      return true;
    }

    if (customId === 'sa_leave') {
      const game = agentGames.get(interaction.channelId);
      if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Lobby ma furana.', ephemeral: true }); return true; }
      if (!game.players.has(user.id)) { await interaction.reply({ content: '⚠️ Ma jirtid lobby-ga.', ephemeral: true }); return true; }
      if (user.id === game.hostId) { await interaction.reply({ content: '⚠️ Host-ku ma bixin karo. ⛔ Jooji isticmaal.', ephemeral: true }); return true; }
      game.players.delete(user.id);
      await refreshLobby(game, interaction.guild, interaction.channel);
      await interaction.reply({ content: '👋 Lobby-ga waad ka baxday.', ephemeral: true });
      return true;
    }

    if (customId === 'sa_stop') {
      const game = agentGames.get(interaction.channelId);
      if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Lobby ma furana.', ephemeral: true }); return true; }
      if (user.id !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu joojin karaa.', ephemeral: true }); return true; }
      if (game.lobbyMessageId) {
        const lm = await interaction.channel.messages.fetch(game.lobbyMessageId).catch(() => null);
        if (lm) await lm.edit({ components: [] }).catch(() => null);
      }
      endGame(game);
      await interaction.reply({ content: '⛔ Ciyaarta waa la joojiyay.', ephemeral: true });
      return true;
    }

    if (customId === 'sa_start') {
      const game = agentGames.get(interaction.channelId);
      if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Lobby ma furana.', ephemeral: true }); return true; }
      if (user.id !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu bilaabi karaa.', ephemeral: true }); return true; }
      if (game.players.size < 3) { await interaction.reply({ content: '⚠️ Ugu yaraan **3 qof** ayaa loo baahan yahay.', ephemeral: true }); return true; }

      const playerIds = Array.from(game.players.keys());
      game.agentId = pickRandom(playerIds);
      game.location = pickRandom(LOCATIONS);

      const lm = await interaction.channel.messages.fetch(game.lobbyMessageId).catch(() => null);
      if (lm) await lm.edit({ components: [] }).catch(() => null);

      await interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🕵️ CIYAARTA WAA BILAABATAY!')
          .setColor(0x1a1a2e)
          .setDescription(
            `**${game.players.size}** ciyaaryahan ayaa ciyaarta ku jira!\n\n` +
            '📩 **DM-kaaga fiiri** — doorkaaga iyo goobta ku jiraan.\n\n' +
            '💬 **120 ilbiriqsi** oo wadahadal ah ayaa bilaabanaya...'
          )
          .setFooter({ text: 'Ciyaal Xamar Bot · KHIYAANO. CAQLI. DOOD. GUUL.' })
      ]});
      await sendRoleDMs(client, game);
      setTimeout(() => startDiscussion(client, game, interaction.channel), 3_000);
      return true;
    }

    // ── Vote ─────────────────────────────────────────────────────────────────
    if (customId.startsWith('sa_vote_')) {
      const rest = customId.slice('sa_vote_'.length);
      const sep = rest.indexOf('_');
      const gameChannelId = rest.slice(0, sep);
      const targetId = rest.slice(sep + 1);

      const game = agentGames.get(gameChannelId);
      if (!game || game.phase !== 'voting') { await interaction.reply({ content: '⚠️ Codeynta ma socoto.', ephemeral: true }); return true; }
      if (!game.players.has(user.id)) { await interaction.reply({ content: '⚠️ Adigu ciyaarta kuma jirto.', ephemeral: true }); return true; }

      const prev = game.votes.get(user.id);
      game.votes.set(user.id, targetId);
      const target = game.players.get(targetId);
      const targetName = target?.displayName ?? targetId;

      if (prev && prev !== targetId) {
        const prevName = game.players.get(prev)?.displayName ?? prev;
        await interaction.reply({ content: `🔄 Codkaaga waa la bedelay: **${prevName}** → **${targetName}**`, ephemeral: true });
      } else {
        await interaction.reply({ content: `✅ Waad codeysay: **${targetName}**`, ephemeral: true });
      }
      return true;
    }

    // ── Agent Guess ───────────────────────────────────────────────────────────
    if (customId.startsWith('sa_guess_')) {
      const rest = customId.slice('sa_guess_'.length);
      const sep = rest.indexOf('_');
      const gameChannelId = rest.slice(0, sep);
      const guessedName = rest.slice(sep + 1);

      const game = agentGames.get(gameChannelId);
      if (!game || game.phase !== 'agent-guess') { await interaction.reply({ content: '⚠️ Fursadu dhammaatay ama ciyaarta waa dhammaatay.', ephemeral: true }); return true; }
      if (user.id !== game.agentId) { await interaction.reply({ content: '⚠️ Adigu ma tihid Agent-ka.', ephemeral: true }); return true; }
      if (game.agentGuessedOnce) { await interaction.reply({ content: '⚠️ Hal fursad oo kaliya ayaad haysatay — waa la isticmaalay!', ephemeral: true }); return true; }
      game.agentGuessedOnce = true;

      const channel = await client.channels.fetch(gameChannelId).catch(() => null);

      if (guessedName === game.location.name) {
        await interaction.reply({ content: `✅ **${game.location.emoji} ${game.location.name}** — SAX! WAD GUULEYSATAY! 🏆`, ephemeral: true });
        if (channel) await channel.send({ embeds: [
          new EmbedBuilder()
            .setTitle('😈 SECRET AGENT WUU GUULEYSTAY!')
            .setColor(0x1a1a2e)
            .setDescription(
              `**${game.players.get(game.agentId)?.displayName ?? 'Agent-ka'}** ayaa goobta sax u qiyaastay!\n\n` +
              `# ${game.location.emoji} **${game.location.name}**`
            )
            .addFields(
              { name: '🏆 Natiijada', value: '🕵️ **SECRET AGENT** ayaa guuleystay!' },
            )
            .setFooter({ text: 'Ciyaal Xamar Bot · Secret Agent' })
            .setTimestamp()
        ]}).catch(() => null);
      } else {
        await interaction.reply({ content: `❌ **${guessedName}** — QALAD! Goobta waxay ahayd ${game.location.emoji} **${game.location.name}**`, ephemeral: true });
        if (channel) await shacabWins(client, game, channel, 'guess');
        return true;
      }
      endGame(game);
      return true;
    }

    return false;
  }
  