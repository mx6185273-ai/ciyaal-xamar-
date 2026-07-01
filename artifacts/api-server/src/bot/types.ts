import type { Message, TextChannel } from "discord.js";
import type { Location } from "./locations.js";

export type GamePhase = "LOBBY" | "DISCUSSION" | "VOTING" | "ENDED";

export interface GameState {
  channelId: string;
  hostId: string;
  players: string[];
  agentId: string | null;
  location: Location | null;
  phase: GamePhase;
  round: 1 | 2;
  lobbyMessage: Message | null;
  discussionMessage: Message | null;
  votingMessage: Message | null;
  votes: Map<string, string>;
  discussionTimer: ReturnType<typeof setTimeout> | null;
  votingTimer: ReturnType<typeof setTimeout> | null;
  lastLocationName: string | null;
  channel: TextChannel;
  playerNames: Map<string, string>;
}
