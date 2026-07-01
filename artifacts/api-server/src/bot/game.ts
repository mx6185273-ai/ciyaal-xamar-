import path from "node:path";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type TextChannel,
  type ButtonInteraction,
} from "discord.js";
import type { GameState } from "./types.js";
import { getRandomLocation } from "./locations.js";
import { logger } from "../lib/logger.js";

export const games = new Map<string, GameState>();

const DISCUSSION_MS = 120_000;
const VOTING_MS = 90_000;

function bannerAttachment(): AttachmentBuilder {
  const bannerPath = path.resolve(process.cwd(), "assets", "banner.png");
  return new AttachmentBuilder(bannerPath, { name: "banner.png" });
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

function lobbyRow(playerCount: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("lobby_join")
      .setLabel(`🟢 Kubiir (${playerCount}/15)`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lobby_leave")
      .setLabel("🔴 Kabax")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("lobby_start")
      .setLabel("▶️ Bilaab")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lobby_stop")
      .setLabel("⛔ Jooji")
      .setStyle(ButtonStyle.Secondary),
  );
}

function lobbyEmbed(game: GameState): EmbedBuilder {
  const playerLines =
    game.players.length === 0
      ? "_Wali qof kuma soo galin_"
      : game.players.map((id) => `> 👤 <@${id}>`).join("\n");

  return new EmbedBuilder()
    .setTitle("🕵️  SECRET AGENT — LOBBY")
    .setColor(0x1a1a2e)
    .setImage("attachment://banner.png")
    .setDescription(
      [
        "## 📩 Doorkaaga DM ayaa laguugu soo diray.",
        "## 👤 Hal qof waa Secret Agent.",
        "## 💬 Wada hadla adigoon sirta sheegin.",
        "## 🎯 Soo hel Agent-ka ama Agent-ku ha ogaado goobta.",
        "",
        `### 👥 Players: **${game.players.length}/15**`,
        playerLines,
        "",
        "⚠️ Ugu yaraan **3 qof** ayaa loo baahan yahay",
      ].join("\n"),
    )
    .setFooter({
      text: `Host: ${game.playerNames.get(game.hostId) ?? game.hostId}  •  !caawimo = tilmaamaha`,
    });
}

export async function createLobby(
  channel: TextChannel,
  hostId: string,
  hostName: string,
  lastLocationName: string | null,
): Promise<void> {
  if (games.has(channel.id)) {
    await channel.send({
      content: "⚠️ Ciyaar horey buu ku socday channel-kan. Marka hore **⛔ Jooji**.",
    });
    return;
  }

  const game: GameState = {
    channelId: channel.id,
    hostId,
    players: [hostId],
    agentId: null,
    location: null,
    phase: "LOBBY",
    round: 1,
    lobbyMessage: null,
    discussionMessage: null,
    votingMessage: null,
    votes: new Map(),
    discussionTimer: null,
    votingTimer: null,
    lastLocationName,
    channel,
    playerNames: new Map([[hostId, hostName]]),
  };

  games.set(channel.id, game);

  const msg = await channel.send({
    embeds: [lobbyEmbed(game)],
    components: [lobbyRow(game.players.length)],
    files: [bannerAttachment()],
  });

  game.lobbyMessage = msg;
}

export async function handleLobbyJoin(
  interaction: ButtonInteraction,
  game: GameState,
): Promise<void> {
  await interaction.deferUpdate();

  if (game.players.includes(interaction.user.id)) {
    await interaction.followUp({ content: "✅ Horeba waxaad ku jirtay lobby-ga!", ephemeral: true });
    return;
  }
  if (game.players.length >= 15) {
    await interaction.followUp({ content: "❌ Lobby-gu buuxsantay (15/15).", ephemeral: true });
    return;
  }

  game.players.push(interaction.user.id);
  game.playerNames.set(interaction.user.id, interaction.user.displayName);

  await game.lobbyMessage?.edit({
    embeds: [lobbyEmbed(game)],
    components: [lobbyRow(game.players.length)],
  });
}

export async function handleLobbyLeave(
  interaction: ButtonInteraction,
  game: GameState,
): Promise<void> {
  await interaction.deferUpdate();

  if (!game.players.includes(interaction.user.id)) {
    await interaction.followUp({ content: "❌ Laguma jirin lobby-ga.", ephemeral: true });
    return;
  }
  if (interaction.user.id === game.hostId) {
    await interaction.followUp({
      content: "❌ Host-ku ma baxo lobby-ga. **⛔ Jooji** isticmaal.",
      ephemeral: true,
    });
    return;
  }

  game.players = game.players.filter((id) => id !== interaction.user.id);
  await game.lobbyMessage?.edit({
    embeds: [lobbyEmbed(game)],
    components: [lobbyRow(game.players.length)],
  });
}

export async function handleLobbyStart(
  interaction: ButtonInteraction,
  game: GameState,
): Promise<void> {
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: "❌ Host-ka kaliya ayaa ciyaarta bilaabi kara.", ephemeral: true });
    return;
  }
  if (game.players.length < 3) {
    await interaction.reply({ content: "❌ Ugu yaraan **3 qof** ayaa loo baahan yahay.", ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  await startRound(game);
}

export async function handleLobbyStop(
  interaction: ButtonInteraction,
  game: GameState,
): Promise<void> {
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: "❌ Host-ka kaliya ayaa joojin kara.", ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  clearTimers(game);
  await game.channel.send({ content: "🚫 **Lobby-ga waa la xiray.**" });
  games.delete(game.channelId);
}

// ─── Round ────────────────────────────────────────────────────────────────────

async function startRound(game: GameState): Promise<void> {
  game.phase = "DISCUSSION";
  game.votes = new Map();

  if (game.round === 1) {
    const location = getRandomLocation(game.lastLocationName ?? undefined);
    game.location = location;
    game.lastLocationName = location.name;
    const agentIdx = Math.floor(Math.random() * game.players.length);
    game.agentId = game.players[agentIdx];
  }

  await game.lobbyMessage?.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle("🕵️ SECRET AGENT — Bilaabmay!")
        .setColor(0x57f287)
        .setImage("attachment://banner.png")
        .setDescription(
          [
            `## 🔄 Round ${game.round}/2`,
            "",
            "📩 **Doorkaaga DM ayaa laguugu soo diray.**",
            `👥 **Ciyaartoyda:** ${game.players.map((id) => `<@${id}>`).join(" ")}`,
          ].join("\n"),
        ),
    ],
    components: [],
  });

  await sendDMs(game);
  await sendDiscussionMessage(game);
}

async function sendDMs(game: GameState): Promise<void> {
  const location = game.location!;
  const vocabSample = location.vocab.slice(0, 8).join("  •  ");
  const dmFailed: string[] = [];

  for (const playerId of game.players) {
    try {
      const user = await game.channel.client.users.fetch(playerId);

      if (playerId === game.agentId) {
        const embed = new EmbedBuilder()
          .setTitle("🕵️  ADIGA WAA SECRET AGENT!")
          .setColor(0xed4245)
          .setImage("attachment://banner.png")
          .setDescription(
            [
              "```",
              "╔══════════════════════════════╗",
              "║     🔴  SECRET AGENT         ║",
              "║  Ma tagaanid goobta.         ║",
              "║  Isku day inaad ogaato!      ║",
              "╚══════════════════════════════╝",
              "```",
              "",
              "🎯 **Hadafkaaga:**",
              "▸ Dood la mid ah shacabka",
              "▸ Ka faham goobta wadahadallka",
              "▸ Ha is muujin!",
              "",
              "⚠️ **Haddaad la qabto, ciyaarta waa dhammaataa.**",
              "",
              `⏱️ **Waqtiga:** 2 mins wada hadal  •  90 sec codayn`,
              `🔄 **Round:** ${game.round}/2`,
            ].join("\n"),
          );

        await user.send({ embeds: [embed], files: [bannerAttachment()] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle("📍  GOOBTA SIR AH")
          .setColor(0x5865f2)
          .setImage("attachment://banner.png")
          .setDescription(
            [
              "```",
              "╔══════════════════════════════╗",
              `║  DADKA CAADIGA AH            ║`,
              `║  Goobtii:                    ║`,
              `║  ${location.emoji}  ${location.name.padEnd(22)}║`,
              "╚══════════════════════════════╝",
              "```",
              "",
              "👥 Qofka kale oo dhan waxay helaan **isla goobtan**.",
              "🕵️ **Secret Agent-ku ma garanayso goobta — ha cadayn!**",
              "",
              `💡 **Erayada kugu saabsan:** ${vocabSample}`,
              "",
              "🎯 **Hadafkaaga:**",
              "▸ Weydii su'aalo caqli-badan",
              "▸ Ka hel Agent-ka",
              "▸ Ha sheegin goobta si toos ah!",
              "",
              `⏱️ **Waqtiga:** 2 mins wada hadal  •  90 sec codayn`,
              `🔄 **Round:** ${game.round}/2`,
            ].join("\n"),
          );

        await user.send({ embeds: [embed], files: [bannerAttachment()] });
      }
    } catch {
      dmFailed.push(`<@${playerId}>`);
      logger.warn({ playerId }, "Failed to DM player");
    }
  }

  if (dmFailed.length > 0) {
    await game.channel.send({
      content: `⚠️ DM lama awoodi karin (DM xidnaanayaan): ${dmFailed.join(", ")}`,
    });
  }
}

async function sendDiscussionMessage(game: GameState): Promise<void> {
  const endTime = Math.floor((Date.now() + DISCUSSION_MS) / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`🗣️  WADA HADAL — Round ${game.round}/2`)
    .setColor(0xfee75c)
    .setImage("attachment://banner.png")
    .setDescription(
      [
        `## ⏳ Waqtiga dhammaada: <t:${endTime}:R>`,
        "",
        `👥 **Ciyaartoyda:**`,
        game.players.map((id) => `▸ <@${id}>`).join("\n"),
        "",
        "```",
        "📋  XEERARKA WADA HADLKA",
        "──────────────────────────────",
        "▸ Qof walba wuxuu hal su'aal",
        "  waydiiyaa qof kale",
        "▸ Jawaabtu waa inay gaaban tahay",
        "▸ Agent-ku wuxuu isku dayayaa",
        "  inuu goobta ka ogaado",
        "▸ Shacabku waxay raadineenaa",
        "  Agent-ka si taxadar leh",
        "──────────────────────────────",
        "🕵️  YAA AGENT-KA?",
        "```",
        "",
        `🔄 **Round ${game.round}/2** — Codayntu waxay billawsaa **120 sekan** kadib`,
      ].join("\n"),
    );

  const msg = await game.channel.send({
    embeds: [embed],
    files: [bannerAttachment()],
  });

  game.discussionMessage = msg;

  game.discussionTimer = setTimeout(() => {
    void startVoting(game);
  }, DISCUSSION_MS);
}

// ─── Voting ───────────────────────────────────────────────────────────────────

async function startVoting(game: GameState): Promise<void> {
  if (game.phase !== "DISCUSSION") return;
  game.phase = "VOTING";
  game.votes = new Map();

  await game.discussionMessage?.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle("🗣️  Wada Hadlka Waa Dhammaatay!")
        .setColor(0x95a5a6)
        .setDescription("⏰ Waqtiga dhammaday — Codaynta way bilaabatay!"),
    ],
    components: [],
  });

  const endTime = Math.floor((Date.now() + VOTING_MS) / 1000);
  const rows = buildVoteRows(game.players, game.playerNames);

  const embed = new EmbedBuilder()
    .setTitle(`🗳️  CODAYNTA — Round ${game.round}/2`)
    .setColor(0xe67e22)
    .setImage("attachment://banner.png")
    .setDescription(
      [
        `## ⏳ Waqtiga dhammaada: <t:${endTime}:R>`,
        "",
        "```",
        "🗳️  YAA U MALAYNAYSAA",
        "    INUU YAHAY SECRET AGENT?",
        "──────────────────────────────",
        "▸ Qof walba wuxuu hal cod",
        "  bixinayaa — waa la beddeli karaa",
        "▸ Qofka ugu badan u codeeyay",
        "  ayaa la eedeeyaa",
        "──────────────────────────────",
        "👇  DOORO QOF",
        "```",
        "",
        game.players.map((id) => `▸ <@${id}>`).join("\n"),
      ].join("\n"),
    );

  const msg = await game.channel.send({
    embeds: [embed],
    files: [bannerAttachment()],
    components: rows,
  });

  game.votingMessage = msg;

  game.votingTimer = setTimeout(() => {
    void finalizeVoting(game);
  }, VOTING_MS);
}

export async function handleVote(
  interaction: ButtonInteraction,
  game: GameState,
  votedForId: string,
): Promise<void> {
  await interaction.deferUpdate();

  if (!game.players.includes(interaction.user.id)) {
    await interaction.followUp({ content: "❌ Adigu ciyaarta kuma jirtid.", ephemeral: true });
    return;
  }
  if (interaction.user.id === votedForId) {
    await interaction.followUp({ content: "❌ Nafta adigu kuu codi kartid.", ephemeral: true });
    return;
  }

  const prev = game.votes.get(interaction.user.id);
  game.votes.set(interaction.user.id, votedForId);

  const votedName = game.playerNames.get(votedForId) ?? votedForId;

  if (prev) {
    const prevName = game.playerNames.get(prev) ?? prev;
    await interaction.followUp({
      content: `🔄 Codadkaagii waa la bedelay: **${prevName}** → **${votedName}**`,
      ephemeral: true,
    });
  } else {
    const remaining = game.players.filter((id) => !game.votes.has(id)).length;
    await interaction.followUp({
      content: `✅ Codadkaagii: **${votedName}** ✔️ (${remaining > 0 ? `${remaining} qof weli codayn waayey` : "dhammaan waa la codeyay!"})`,
      ephemeral: true,
    });
  }

  if (game.votes.size >= game.players.length) {
    clearTimers(game);
    void finalizeVoting(game);
  }
}

function buildVoteRows(
  players: string[],
  names: Map<string, string>,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < players.length; i += 5) {
    const chunk = players.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      chunk.map((id) =>
        new ButtonBuilder()
          .setCustomId(`vote_${id}`)
          .setLabel(`👤 ${names.get(id) ?? id}`)
          .setStyle(ButtonStyle.Primary),
      ),
    );
    rows.push(row);
  }
  return rows;
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

async function finalizeVoting(game: GameState): Promise<void> {
  if (game.phase !== "VOTING") return;
  game.phase = "ENDED";

  clearTimers(game);
  await game.votingMessage?.edit({ components: [] });

  const tally = new Map<string, number>();
  for (const v of game.votes.values()) {
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }

  let maxVotes = 0;
  let accused = "";
  for (const [id, count] of tally) {
    if (count > maxVotes) { maxVotes = count; accused = id; }
  }

  const agentName  = game.playerNames.get(game.agentId ?? "") ?? "?";
  const accusedName = accused ? (game.playerNames.get(accused) ?? accused) : "Qof kuma codin";
  const isAgentCaught = accused !== "" && accused === game.agentId;

  const voteLines = game.players
    .map((id) => {
      const v = game.votes.get(id);
      const vName = v ? (game.playerNames.get(v) ?? v) : "Cod bixin waayo";
      return `▸ <@${id}>  →  **${vName}**`;
    })
    .join("\n");

  await game.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📊  Natiijooyinka Codaynta")
        .setColor(0x9b59b6)
        .setDescription(
          [
            "```",
            "VOTE RESULTS",
            "──────────────────────────────",
            ...game.players.map((id) => {
              const v = game.votes.get(id);
              const vName = v ? (game.playerNames.get(v) ?? v) : "—";
              const name = (game.playerNames.get(id) ?? id).padEnd(15);
              return `${name} → ${vName}`;
            }),
            "──────────────────────────────",
            `Ugu codeeyay: ${accusedName} (${maxVotes} cod)`,
            "```",
            voteLines,
          ].join("\n"),
        ),
    ],
  });

  if (!isAgentCaught) {
    if (game.round === 1) {
      await game.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("😈  Agent-ka Baxsaday — Round 1!")
            .setColor(0xe74c3c)
            .setImage("attachment://banner.png")
            .setDescription(
              [
                `❌ **${accusedName}** ma ahayn Agent-ka!`,
                "",
                "```",
                "⚠️  GAME WAA SOCON DOONA!",
                "──────────────────────────",
                "  Round 2 ayaa bilaabanaya",
                "  Agent-ku wali way ku jira!",
                "──────────────────────────",
                `  🕵️  Agent-ka: ???`,
                `  📍  Goobta: ???`,
                "```",
                "",
                "🔄 **Round 2** 10 sekan gudahood!",
              ].join("\n"),
            ),
        ],
        files: [bannerAttachment()],
      });

      game.round = 2;
      game.phase = "DISCUSSION";

      setTimeout(() => {
        void startRound(game);
      }, 10_000);
      return;
    }

    await game.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("😈  AGENT-KU WUU GUULEYSTAY!")
          .setColor(0xed4245)
          .setImage("attachment://banner.png")
          .setDescription(
            [
              `❌ **${accusedName}** ma ahayn Agent-ka!`,
              "",
              "```",
              "╔══════════════════════════════╗",
              "║   🏆  SECRET AGENT WINS!     ║",
              "║                              ║",
              `║  Agent-ka: ${agentName.padEnd(18)}║`,
              `║  Goobta:   ${(game.location?.name ?? "?").padEnd(18)}║`,
              "╚══════════════════════════════╝",
              "```",
              "",
              "Shacabku waxay ku guul darreysteen 2 round!",
              "",
              "🔁 Ciyaar kale: `!qarsoon`",
            ].join("\n"),
          ),
      ],
      files: [bannerAttachment()],
    });

    games.delete(game.channelId);
    return;
  }

  await game.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎉  SHACABKU WAY GUULEYSTEEN!")
        .setColor(0x57f287)
        .setImage("attachment://banner.png")
        .setDescription(
          [
            `✅ **${agentName}** ayaa ahaa Secret Agent-ka!`,
            "",
            "```",
            "╔══════════════════════════════╗",
            "║   🏆  CIVILIANS WIN!         ║",
            "║                              ║",
            `║  Agent-ka: ${agentName.padEnd(18)}║`,
            `║  Goobta:   ${(game.location?.name ?? "?").padEnd(18)}║`,
            `║  Round:    ${String(game.round).padEnd(18)}║`,
            "╚══════════════════════════════╝",
            "```",
            "",
            "Ururka ayaa ogaaday qofka sirta lahaa! 🎊",
            "",
            "🔁 Ciyaar kale: `!qarsoon`",
          ].join("\n"),
        ),
    ],
    files: [bannerAttachment()],
  });

  games.delete(game.channelId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearTimers(game: GameState): void {
  if (game.discussionTimer) { clearTimeout(game.discussionTimer); game.discussionTimer = null; }
  if (game.votingTimer) { clearTimeout(game.votingTimer); game.votingTimer = null; }
}

export async function forceEndGame(game: GameState, msg?: string): Promise<void> {
  clearTimers(game);
  if (msg) await game.channel.send({ content: msg });
  games.delete(game.channelId);
}
