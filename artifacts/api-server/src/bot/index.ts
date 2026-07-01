import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  type TextChannel,
  type ButtonInteraction,
} from "discord.js";
import path from "node:path";
import { logger } from "../lib/logger.js";
import {
  games,
  createLobby,
  handleLobbyJoin,
  handleLobbyLeave,
  handleLobbyStart,
  handleLobbyStop,
  handleVote,
  forceEndGame,
} from "./game.js";

const lastLocationPerChannel = new Map<string, string>();

function banner(): AttachmentBuilder {
  return new AttachmentBuilder(
    path.resolve(process.cwd(), "assets", "banner.png"),
    { name: "banner.png" },
  );
}

export function startBot(): void {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — Discord bot will not start.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot is online");
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.trim().toLowerCase();
    const channel = message.channel as TextChannel;

    if (content === "!qarsoon") {
      const last = lastLocationPerChannel.get(channel.id) ?? null;
      await createLobby(channel, message.author.id, message.author.displayName, last);
      return;
    }

    if (content === "!caawimo" || content === "!help") {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📖  SECRET AGENT — Tilmaamaha Ciyaarta")
            .setColor(0x1a1a2e)
            .setImage("attachment://banner.png")
            .setDescription(
              [
                "## 🕵️ Ciyaarta waa maxay?",
                "Ciyaar koox ah oo ku saabsan sir-baadhinimo.",
                "Qof walba wuxuu helayaa hal **goob** (Location) sir ah,",
                "marka laga reebo **Secret Agent-ka** oo waxba garanayn.",
                "",
                "## 🚀 Amarrada",
                "▸ `!qarsoon` — Bilaab lobby cusub",
                "▸ `!caawimo` — Tilmaamaha ciyaarta",
                "",
                "## 🎮 Sida Loo Ciyaaro",
                "```",
                "1️⃣  LOBBY",
                "   !qarsoon ku qor — lobby baxayaa",
                "   Qof walba 🟢 Kubiir ku dhufo",
                "   Host-ku ▶️ Bilaab ku riixaa",
                "",
                "2️⃣  DM",
                "   Shacabka → Goobta la helay",
                "   Agent → Ma garanayso goobta",
                "",
                "3️⃣  WADA HADAL (2 minutes)",
                "   Su'aalo is weydaarsadaan",
                "   Agent-ku goobta ka fahamayaa",
                "",
                "4️⃣  CODAYNTA (90 seconds)",
                "   Cood bixiyaan — waa la beddeli karaa",
                "   Qofka ugu badan codeeyay = eedeysane",
                "",
                "5️⃣  NATIIJOOYINKA",
                "   Agent la helay → Shacabku way guuleysteen",
                "   Agent la waayay → Round 2 billawaa!",
                "   Round 2 dib la waayaa → Agent wuu guuleystay",
                "```",
                "",
                "## 🌍 Goobaha",
                "500+ goobood oo kala duwan — xeeb, isbitaal, jaamacad, iyo in ka badan!",
                "",
                "## 🏆 Natiijada",
                "▸ **Shacabku guulayaan:** Agent la qabo",
                "▸ **Agent-ku guulayaa:** 2 round labadabaaba la waayaa",
              ].join("\n"),
            ),
        ],
        files: [banner()],
      });
      return;
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction as ButtonInteraction);
      }
    } catch (err) {
      logger.error({ err }, "Error handling Discord interaction");
    }
  });

  void client.login(token);
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const customId = interaction.customId;

  if (customId.startsWith("vote_")) {
    const game = games.get(channelId);
    if (!game || game.phase !== "VOTING") {
      await interaction.reply({ content: "❌ Codaynta hadda ma socoto.", ephemeral: true });
      return;
    }
    const votedForId = customId.replace("vote_", "");
    await handleVote(interaction, game, votedForId);
    return;
  }

  const game = games.get(channelId);

  switch (customId) {
    case "lobby_join":
      if (!game || game.phase !== "LOBBY") {
        await interaction.reply({ content: "❌ Lobby ma jirto hadda.", ephemeral: true });
        return;
      }
      await handleLobbyJoin(interaction, game);
      break;

    case "lobby_leave":
      if (!game || game.phase !== "LOBBY") {
        await interaction.reply({ content: "❌ Lobby ma jirto hadda.", ephemeral: true });
        return;
      }
      await handleLobbyLeave(interaction, game);
      break;

    case "lobby_start":
      if (!game || game.phase !== "LOBBY") {
        await interaction.reply({ content: "❌ Lobby ma jirto hadda.", ephemeral: true });
        return;
      }
      if (game.location) lastLocationPerChannel.set(channelId, game.location.name);
      await handleLobbyStart(interaction, game);
      break;

    case "lobby_stop":
      if (!game) {
        await interaction.reply({ content: "❌ Ciyaar ma jirto hadda.", ephemeral: true });
        return;
      }
      if (game.phase === "LOBBY") {
        await handleLobbyStop(interaction, game);
      } else {
        if (interaction.user.id !== game.hostId) {
          await interaction.reply({ content: "❌ Host-ka kaliya ayaa joojin kara.", ephemeral: true });
          return;
        }
        await interaction.reply({ content: "⛔ Ciyaartii waa joojisay.", ephemeral: true });
        await forceEndGame(game, "⛔ **Ciyaartii host-ku joojiyay.**");
      }
      break;
  }
}
