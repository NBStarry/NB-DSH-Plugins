import {
  forkRuntimeConfigEntry,
  isForkTeamService
} from "./chunks/chunk-2LWEGNUA.js";

// management/capacity.js
var inject = ["agents", "commands", "configEditor"];
function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer.`);
  return value;
}
function createCapacityManager(ctx) {
  let changing = false;
  function entry() {
    return forkRuntimeConfigEntry(ctx);
  }
  function status() {
    if (!isForkTeamService(ctx)) throw new Error("Fork Team runtime is not active; refusing to inspect the stock Team service.");
    const teams = ctx.get("agentTeams");
    if (!teams) throw new Error("Agent Teams service is unavailable.");
    const busy = [];
    for (const agent of ctx.agents.list()) {
      const membership = teams.tryMembership(agent);
      if (membership?.role !== "lead") continue;
      for (const member of teams.listMembers(agent)) {
        if (member.role === "teammate" && (member.status === "running" || member.status === "provisioning")) busy.push({ teamId: membership.id, target: member.name, status: member.status });
      }
    }
    return { limit: positiveInteger(entry().options.config?.maxMembers ?? 16, "current limit"), busy, scope: "current-profile-all-teams" };
  }
  async function setLimit(agent, limit, expectedLimit, signal) {
    if (!isForkTeamService(ctx)) throw new Error("Fork Team runtime is not active; refusing to edit the stock Team service.");
    positiveInteger(limit, "limit");
    positiveInteger(expectedLimit, "expectedLimit");
    if (changing) throw new Error("Another Team capacity change is in progress.");
    if (ctx.agents.get(agent.id) !== agent) throw new Error("The receiving conversation is no longer live.");
    changing = true;
    const disposers = [];
    const guarded = /* @__PURE__ */ new Set();
    const guardAgent = (a) => {
      if (guarded.has(a)) return;
      guarded.add(a);
      disposers.push(a.ctx.tools.guard((exec) => ["spawn_teammate", "spawn_teammate_with_model"].includes(exec.name) ? "Team capacity is being updated. Retry after the configuration change finishes." : void 0));
    };
    try {
      signal?.throwIfAborted();
      for (const a of ctx.agents.list()) guardAgent(a);
      disposers.push(ctx.on("agent/created", ({ agent: agent2 }) => {
        guardAgent(agent2);
      }));
      const before = status();
      if (before.limit !== expectedLimit) throw new Error("\u4EBA\u6570\u4E0A\u9650\u5DF2\u88AB\u5176\u4ED6\u9875\u9762\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u65B0\u4FDD\u5B58\u3002");
      if (before.limit === limit) return { changed: false, ...before };
      if (before.busy.length) throw new Error(`\u6682\u4E0D\u4FEE\u6539\u4E0A\u9650\uFF1A\u8FD8\u6709 ${before.busy.length} \u540D\u56E2\u961F\u6210\u5458\u6B63\u5728\u8FD0\u884C\u6216\u51C6\u5907\u4E2D\u3002\u8BF7\u7B49\u5F85\u4EFB\u52A1\u5B8C\u6210\u518D\u4FDD\u5B58\uFF1B\u4E0D\u4F1A\u4E2D\u65AD\u6210\u5458\u3002`);
      await ctx.configEditor.edit(entry(), (current) => {
        signal?.throwIfAborted();
        const latest = status();
        if (latest.limit !== expectedLimit) throw new Error("\u4EBA\u6570\u4E0A\u9650\u5DF2\u88AB\u5176\u4ED6\u9875\u9762\u4FEE\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u65B0\u4FDD\u5B58\u3002");
        if (latest.busy.length) throw new Error("A teammate became active before the change. Wait and retry; no capacity change was written.");
        return { ...current, maxMembers: limit };
      });
      const after = status();
      if (after.limit !== limit) throw new Error("Capacity reconciliation did not apply. Check configuration diagnostics.");
      return { changed: true, ...after, preservedHistory: true, note: "Existing members and conversations are retained, including when lowering the limit. Teams at or above the new cumulative limit cannot create more members. Idle runtimes may cold-resume later." };
    } finally {
      for (const dispose of disposers.reverse()) dispose();
      changing = false;
    }
  }
  return { status, setLimit };
}
function apply(ctx) {
  const active = ctx.get?.("agentTeams");
  if (active !== void 0 && !isForkTeamService(ctx)) {
    throw new Error("fork-capacity: non-fork agentTeams service is active; refusing to register fork capacity. Stop the old Team row during an idle maintenance window.");
  }
  if (ctx.configEditor.entries().some((e) => e.options.name === "@local/dsh-team-capacity" && e.fiber?.state === 2)) {
    throw new Error("Standalone Team capacity is active. Disable local-team-capacity through the official Plugin Manager before enabling local-team-manager-capacity; both own team-capacity.");
  }
  const manager = createCapacityManager(ctx);
  ctx.effect(() => ctx.commands.register({
    name: "team-capacity",
    description: "User-only: read or set the Team member limit when teammates are idle. Applies to this profile and preserves existing members.",
    input: { hint: '{"action":"status"} or {"action":"set","limit":12,"expectedLimit":8}' },
    async handler({ agent, rawInput, signal }) {
      try {
        const args = rawInput.trim() ? JSON.parse(rawInput) : { action: "status" };
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected a JSON object.");
        const allowed = args.action === "set" ? ["action", "limit", "expectedLimit"] : ["action"];
        for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
        let value;
        if (args.action === "status") value = manager.status();
        else if (args.action === "set") value = await manager.setLimit(agent, args.limit, args.expectedLimit, signal);
        else throw new Error("action must be status or set.");
        return { kind: "success", text: JSON.stringify(value) };
      } catch (error) {
        return { kind: "error", text: error.message };
      }
    }
  }));
}
export {
  apply,
  createCapacityManager,
  inject
};
