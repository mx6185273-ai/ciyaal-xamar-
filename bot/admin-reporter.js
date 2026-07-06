// admin-reporter.js — Pushes Discord bot stats to the Ciyaal Xamar Admin Panel
import 'dotenv/config';

const ADMIN_URL    = process.env["ADMIN_PANEL_URL"]    ?? "";
const ADMIN_SECRET = process.env["ADMIN_SECRET"]       ?? "ciyaalxamar-admin-2024";
const REPORT_INTERVAL = 5 * 60 * 1000;

export const stats = {
  commandsUsed: 0,
  recentCommands: new Map(),
  activityByDay: new Map(),
};

export function trackCommand(name, description) {
  stats.commandsUsed++;
  const entry = stats.recentCommands.get(name) ?? { name, description, usedCount: 0, lastUsed: "" };
  entry.usedCount++;
  entry.lastUsed = getRelativeTime(new Date());
  stats.recentCommands.set(name, entry);
  const today = new Date().toLocaleDateString("en", { month: "short", day: "numeric" });
  stats.activityByDay.set(today, (stats.activityByDay.get(today) ?? 0) + 1);
}

export async function pushLog(type, message, serverName, userId, username) {
  if (!ADMIN_URL) return;
  try {
    await fetch(`${ADMIN_URL}/api/__cxadmin/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ type, message, serverName, userId: userId || null, username: username || null, timestamp: new Date().toISOString() }),
    });
  } catch {}
}

function getRelativeTime(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export async function reportStats(client) {
  if (!ADMIN_URL) return;
  try {
    const servers = client.guilds.cache.size;
    let users = 0;
    for (const guild of client.guilds.cache.values()) users += guild.memberCount;

    const activityData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en", { month: "short", day: "numeric" });
      activityData.push({ label, value: stats.activityByDay.get(label) ?? 0 });
    }

    const topServers = Array.from(client.guilds.cache.values())
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, 10)
      .map(g => ({
        id: g.id,
        name: g.name,
        members: g.memberCount,
        status: "online",
        icon: g.iconURL({ size: 64 }) ?? null,
        joinedAt: g.joinedAt?.toISOString() ?? null,
      }));

    const recentCommands = Array.from(stats.recentCommands.values())
      .sort((a, b) => b.usedCount - a.usedCount)
      .slice(0, 5);

    const payload = {
      servers, users,
      commandsUsed: stats.commandsUsed,
      uptimeSeconds: Math.floor(process.uptime()),
      pingMs: Math.round(client.ws.ping),
      botName: client.user?.username ?? "Ciyaal Xamar",
      botId:   client.user?.id ?? "—",
      prefix: "!",
      library: "discord.js v14",
      language: `Node.js v${process.versions.node}`,
      status: "online",
      recentCommands,
      topServers,
      activityData,
    };

    const res = await fetch(`${ADMIN_URL}/api/__cxadmin/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify(payload),
    });
    if (res.ok) console.log(`📊 Admin stats updated · Servers: ${servers} · Users: ${users}`);
    else console.warn(`⚠️ Admin update failed: ${res.status}`);
  } catch (err) {
    console.warn(`⚠️ Admin reporter error: ${err.message}`);
  }
}

export function startAdminReporter(client) {
  if (!ADMIN_URL) { console.log("ℹ️  ADMIN_PANEL_URL not set — admin reporter disabled."); return; }
  setTimeout(() => reportStats(client), 8_000);
  setInterval(() => reportStats(client), REPORT_INTERVAL);
  console.log(`📡 Admin reporter started → ${ADMIN_URL}`);
}
