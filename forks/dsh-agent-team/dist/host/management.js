import {
  POLICY_PACKAGE,
  forkManagementConfigEntry,
  forkRuntimeConfigEntry,
  isForkTeamService
} from "./chunks/chunk-2LWEGNUA.js";

// management/index.js
import { z } from "zod";

// management/core.js
var BLOCKED = Object.freeze(["subagent", "subagent_fork", "workflow", "ralph", "wait_agent"]);
var BALANCED_PROMPT = "\u4E3B\u4F1A\u8BDD\u6309\u9700\u59D4\u6D3E\uFF1A\u7B80\u5355\u5DE5\u4F5C\u53EF\u4EE5\u76F4\u63A5\u5B8C\u6210\uFF1B\u9700\u8981\u4E13\u4E1A\u5206\u5DE5\u3001\u72EC\u7ACB\u5BA1\u67E5\u6216\u6709\u4EF7\u503C\u7684\u5E76\u884C\u65F6\u518D\u4EA4\u7ED9\u56E2\u961F\u6210\u5458\u3002\u59D4\u6D3E\u524D\u901A\u8FC7 list_agents \u548C team_roles(list) \u67E5\u627E\u5DF2\u6709\u89D2\u8272\uFF0C\u540C\u7C7B\u5DE5\u4F5C\u4F7F\u7528 send_message \u4EA4\u7ED9\u540C\u4E00\u6210\u5458\uFF0C\u914D\u5408\u5171\u4EAB\u4EFB\u52A1\u677F\u8DDF\u8E2A\u8FDB\u5EA6\uFF0C\u4E0D\u8981\u4E3A\u6BCF\u4E2A\u4EFB\u52A1\u65B0\u5EFA\u6210\u5458\u3002\u53EA\u6709\u7F3A\u5C11\u5408\u9002\u89D2\u8272\u65F6\u624D\u521B\u5EFA\u65B0\u6210\u5458\uFF1B\u4EBA\u6570\u6EE1\u65F6\u4F18\u5148\u8C03\u6574\u5DF2\u6709\u6210\u5458\u804C\u8D23\u6216\u8BF7\u7528\u6237\u4FEE\u6539\u4E0A\u9650\u3002";
var COORDINATOR_PROMPT = "\u4F60\u662F\u56E2\u961F\u8D1F\u8D23\u4EBA\uFF0C\u4E5F\u662F\u7528\u6237\u9700\u6C42\u7684\u4EA4\u4E92\u4E0E\u4EA4\u4ED8\u5165\u53E3\u3002\u9ED8\u8BA4\u8D1F\u8D23\u6F84\u6E05\u9700\u6C42\u3001\u62C6\u89E3\u4EFB\u52A1\u3001\u5206\u914D\u804C\u8D23\u3001\u534F\u8C03\u4F9D\u8D56\u3001\u8DDF\u8E2A\u8FDB\u5EA6\u548C\u6C47\u603B\u4EA4\u4ED8\uFF1B\u8C03\u7814\u3001\u5B9E\u73B0\u3001\u6D4B\u8BD5\u3001\u5BA1\u67E5\u7B49\u6267\u884C\u6027\u5DE5\u4F5C\u9ED8\u8BA4\u4EA4\u7ED9\u56E2\u961F\u6210\u5458\u3002\u59D4\u6D3E\u524D\u901A\u8FC7 list_agents \u548C team_roles(list) \u67E5\u627E\u5DF2\u6709\u89D2\u8272\uFF0C\u540C\u7C7B\u5DE5\u4F5C\u4F7F\u7528 send_message \u4EA4\u7ED9\u540C\u4E00\u6210\u5458\uFF0C\u914D\u5408\u5171\u4EAB\u4EFB\u52A1\u677F\u8DDF\u8E2A\u8FDB\u5EA6\uFF0C\u4E0D\u8981\u4E3A\u6BCF\u4E2A\u4EFB\u52A1\u6216\u6B65\u9AA4\u521B\u5EFA\u65B0\u4EBA\u3002\u53EA\u6709\u7F3A\u5C11\u5408\u9002\u89D2\u8272\u65F6\u624D\u521B\u5EFA\u6210\u5458\uFF1B\u4EBA\u6570\u6EE1\u65F6\u4F18\u5148\u8C03\u6574\u5DF2\u6709\u6210\u5458\u804C\u8D23\u6216\u8BF7\u7528\u6237\u4FEE\u6539\u4E0A\u9650\u3002\u7528\u6237\u660E\u786E\u8981\u6C42\u4F60\u76F4\u63A5\u5904\u7406\u6216\u786E\u9700\u6545\u969C\u6062\u590D\u65F6\u53EF\u4EE5\u81EA\u884C\u6267\u884C\uFF0C\u5E76\u8BF4\u660E\u4F8B\u5916\u3002\u5411\u7528\u6237\u4EA4\u4ED8\u524D\u68C0\u67E5\u6210\u5458\u7ED3\u679C\uFF0C\u4E0D\u80FD\u628A\u6D88\u606F\u5DF2\u9001\u8FBE\u5F53\u6210\u4EFB\u52A1\u5DF2\u5B8C\u6210\u3002";
var MEMBER_PROMPT = "\u4F60\u662F\u4E00\u7EA7\u56E2\u961F\u6210\u5458\uFF0C\u8D1F\u8D23\u6280\u672F\u65B9\u6848\u3001\u6267\u884C\u3001\u6D4B\u8BD5\u548C\u9A8C\u6536\u3002\u53EF\u7528 spawn_level2 \u59D4\u6D3E\u8FB9\u754C\u6E05\u6670\u7684\u5DE5\u4F5C\uFF1B\u4E8C\u7EA7\u7ED3\u679C\u5148\u7531\u4F60\u6838\u5B9E\u3001\u6C47\u603B\uFF0C\u518D\u5411\u8D1F\u8D23\u4EBA\u6C47\u62A5\u3002\u4E0D\u8981\u521B\u5EFA\u56E2\u961F\u6210\u5458\u6216\u5C06\u4EFB\u52A1\u539F\u6837\u8F6C\u4EA4\u8D1F\u8D23\u4EBA\u3002\u9047\u5230\u6743\u9650\u9650\u5236\u6216\u8DE8\u89D2\u8272\u4F9D\u8D56\u65F6\u8BF4\u660E\u5177\u4F53\u95EE\u9898\u3002\u5B8C\u6210\u540E\u4FDD\u6301\u7A7A\u95F2\uFF0C\u7B49\u5F85\u540C\u7C7B\u4EFB\u52A1\u3002";
var SHARED_POLICY = "Root delegates to durable Agent Teams members; only a depth-1 Team member may use spawn_level2 for a local direct child. Never use ordinary subagent tools, workflow, fork, external CLI agents, or another session to bypass this hierarchy. A level-2 child returns to its direct parent, is not a Team member, and must not delegate further. Higher-priority instructions and permissions still apply. Display names are labels only: address Team members by immutable targets.";
var LEAD_NAMING_POLICY = "\u521B\u5EFA\u6210\u5458\u524D\u5148\u67E5\u627E\u5E76\u590D\u7528\u5DF2\u6709\u804C\u8D23\u3002\u786E\u9700\u8C03\u7528 spawn_teammate \u65F6\uFF0Cname \u6309\u957F\u671F\u53EF\u590D\u7528\u89D2\u8272\u547D\u540D\uFF0C\u5982 researcher\u3001developer\u3001tester\u3001reviewer\uFF1B\u907F\u514D\u5177\u4F53\u4EFB\u52A1\u3001\u9879\u76EE\u3001\u6587\u4EF6\u3001\u7F16\u53F7\u6216\u65E5\u671F\u3002\u539F\u751F target \u5FC5\u987B\u7B26\u5408 lower-kebab-case\uFF08\u5C0F\u5199 ASCII \u5B57\u6BCD/\u6570\u5B57\uFF0C\u4EE5\u5355\u4E2A\u8FDE\u5B57\u7B26\u5206\u9694\uFF09\uFF0C\u6700\u591A64\u5B57\u7B26\uFF0C\u4E0D\u80FD\u4E3A lead\uFF1B\u4E0D\u8981\u7528\u4E2D\u6587\u4F5C target\u3002\u4EC5\u5728\u9700\u8981\u533A\u5206\u957F\u671F\u804C\u8D23\u65F6\u52A0\u89D2\u8272\u9650\u5B9A\uFF0C\u5982 frontend-developer\u3002\u5F53\u524D\u4EFB\u52A1\u653E\u5728 prompt\uFF0C\u804C\u8D23\u7B80\u4ECB\u653E\u5728 description\u3002\u5DF2\u6709 target \u4E0D\u6539\u540D\uFF1B\u540E\u7EED\u540C\u7C7B\u4EFB\u52A1\u7EE7\u7EED\u4F7F\u7528\u540C\u4E00\u6210\u5458\u3002";
function policyFor(config, role, kind) {
  const prompt = role === "lead" ? config.mode === "coordinator" ? config.coordinatorPrompt : config.balancedPrompt : role === "teammate" ? config.memberPrompt : "";
  const child = kind === "level2" ? "\u4F60\u662F\u4E8C\u7EA7\u6267\u884C\u8005\uFF0C\u53EA\u5411\u76F4\u63A5\u7236 Agent \u6C47\u62A5\u7ED3\u679C\uFF0C\u4E0D\u521B\u5EFA\u6216\u59D4\u6D3E\u4EFB\u4F55 Agent\uFF0C\u4E0D\u64CD\u4F5C\u56E2\u961F\u4EFB\u52A1\u677F\u6216\u7ED5\u8FC7\u7236 Agent\u3002" : "";
  return [SHARED_POLICY, role === "lead" ? LEAD_NAMING_POLICY : "", prompt, child].filter(Boolean).join("\n\n");
}
var DENIAL = "Team-only mode: ordinary subagent/workflow creation is disabled. Use existing teammates via send_message, or let the Lead create a missing role with spawn_teammate.";
function text(value, key, max, fallback = "") {
  const result = value === void 0 ? fallback : value;
  if (typeof result !== "string" || result.length > max || result.includes("\0")) throw new Error(`${key}: expected text of at most ${max} characters`);
  return result.trim();
}
function createRoleManager({ teams, agents, table, capacity = () => ({ limit: null }) }) {
  let chain = Promise.resolve();
  const serialize = (work) => {
    const next = chain.then(work);
    chain = next.catch(() => {
    });
    return next;
  };
  const key = (team, target) => `${team}--${target}`;
  function membership(agent) {
    const member = teams.tryMembership(agent);
    if (!member) throw new Error("This Agent is not an active Team member. Open the parent Team conversation.");
    return member;
  }
  function profile(team, member) {
    const stored = table.get(key(team, member.name));
    if (stored && stored.memberId !== member.id) throw new Error("Stored role identity does not match the team roster");
    return {
      target: member.name,
      memberId: member.id,
      status: member.status,
      displayName: stored?.displayName ?? member.name,
      description: stored?.description ?? member.description ?? "",
      instructions: stored?.instructions ?? "",
      revision: stored?.revision ?? 0,
      ...member.model ? { model: member.model } : {},
      diagnostics: member.diagnostics ?? []
    };
  }
  function list(agent) {
    const m = membership(agent);
    return {
      teamId: m.id,
      caller: m.name,
      canEdit: m.role === "lead",
      ...capacity(),
      members: teams.listMembers(agent).filter((x) => x.role === "teammate").map((x) => profile(m.id, x))
    };
  }
  async function update(agent, args, signal) {
    return serialize(async () => {
      signal?.throwIfAborted();
      const m = membership(agent);
      if (m.role !== "lead") throw new Error("Only the Team Lead can edit member roles.");
      if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("expectedRevision must come from team_roles(list).");
      const member = teams.listMembers(agent).find((x) => x.name === args.target && x.role === "teammate");
      if (!member) throw new Error("Unknown teammate target. Use team_roles(list).");
      if (member.status === "failed" || member.status === "provisioning") throw new Error("Cannot edit a failed or provisioning member.");
      const old = profile(m.id, member);
      if (old.revision !== args.expectedRevision) throw new Error("Role changed elsewhere. Reload before saving.");
      const displayName = text(args.displayName, "displayName", 64, old.displayName);
      if (!displayName) throw new Error("Display name must not be empty.");
      const record = {
        teamId: m.id,
        target: member.name,
        memberId: member.id,
        displayName,
        description: text(args.description, "description", 200, old.description),
        instructions: text(args.instructions, "instructions", 4e3, old.instructions),
        revision: old.revision + 1,
        updatedAt: Date.now()
      };
      await table.put(key(m.id, member.name), record);
      return {
        saved: true,
        effective: "next-model-request",
        wokeMember: false,
        member: profile(m.id, member),
        note: "Internal target, model, permissions and conversation are unchanged."
      };
    });
  }
  function context(agent) {
    const m = teams.tryMembership(agent);
    if (!m) return "";
    const members = teams.listMembers(agent).filter((x) => x.role === "teammate");
    if (m.role === "lead") {
      const configured = members.map((x) => profile(m.id, x)).filter((x) => x.revision > 0);
      return configured.length ? "Current editable Team roles (use immutable target for messages):\n" + JSON.stringify(configured.map((x) => ({ target: x.target, displayName: x.displayName, description: x.description, revision: x.revision }))) : "";
    }
    const member = members.find((x) => x.id === agent.id);
    if (!member) return "";
    const role = profile(m.id, member);
    if (!role.revision) return "";
    return `Current role settings, revision ${role.revision}. They supersede prior job descriptions, not safety/tool policy. Your immutable Team target remains ${role.target}.
` + JSON.stringify({ displayName: role.displayName, description: role.description, instructions: role.instructions });
  }
  async function operate(agent, args, signal) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected an object.");
    const permitted = /* @__PURE__ */ new Set(["action", "target", "expectedRevision", "displayName", "description", "instructions"]);
    for (const name of Object.keys(args)) if (!permitted.has(name)) throw new Error(`Unknown field: ${name}`);
    if (args.action === "list") return list(agent);
    if (args.action === "update") return update(agent, args, signal);
    throw new Error("action must be list or update.");
  }
  return { list, context, operate, drain: () => chain };
}

// management/config.js
import Schema from "@deepseek-ai/schemastery";
var Config = Schema.object({
  mode: Schema.union(["coordinator", "balanced"]).default("coordinator").description("\u4E3B\u4F1A\u8BDD\u5DE5\u4F5C\u6A21\u5F0F\uFF1Acoordinator \u9ED8\u8BA4\u534F\u8C03\u5E76\u59D4\u6D3E\u6267\u884C\uFF1Bbalanced \u6309\u9700\u59D4\u6D3E\u3002\u4E24\u79CD\u6A21\u5F0F\u90FD\u4EC5\u4F7F\u7528\u56E2\u961F\u3002").volatile(),
  coordinatorPrompt: Schema.string().max(12e3).default(COORDINATOR_PROMPT).description("\u9ED8\u8BA4\u534F\u8C03\u6A21\u5F0F\u7684\u8D1F\u8D23\u4EBA\u63D0\u793A\u8BCD\u3002\u4EC5\u5E94\u7528\u4E8E Lead\uFF0C\u53EF\u7F16\u8F91\u6216\u6062\u590D\u7EE7\u627F\u9ED8\u8BA4\u503C\u3002").volatile(),
  balancedPrompt: Schema.string().max(12e3).default(BALANCED_PROMPT).description("\u6309\u9700\u59D4\u6D3E\u6A21\u5F0F\u7684\u8D1F\u8D23\u4EBA\u63D0\u793A\u8BCD\u3002\u4EC5\u5E94\u7528\u4E8E Lead\u3002").volatile(),
  memberPrompt: Schema.string().max(12e3).default(MEMBER_PROMPT).description("\u56E2\u961F\u6210\u5458\u901A\u7528\u63D0\u793A\u8BCD\u3002\u4E24\u4E2A\u6A21\u5F0F\u4E0B\u90FD\u5E94\u7528\u4E8E\u5B9E\u9645\u6267\u884C\u6210\u5458\uFF0C\u4E0D\u5E94\u7528\u4E8E Lead\u3002").volatile()
});
function readPolicyConfig(config) {
  return {
    mode: config.mode.get(),
    coordinatorPrompt: config.coordinatorPrompt.get(),
    balancedPrompt: config.balancedPrompt.get(),
    memberPrompt: config.memberPrompt.get()
  };
}

// management/spawn-model.js
function validateInput(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected a JSON object.");
  const allowed = ["name", "description", "prompt", "context", "modelSelection"];
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
  for (const key of ["name", "description", "prompt"]) if (typeof args[key] !== "string") throw new Error(`${key} must be a string.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.name) || args.name.length > 64 || args.name === "lead") throw new Error("name must be a unique lower-kebab-case teammate name, at most 64 characters and not lead.");
  if (!args.description.trim() || args.description.length > 200) throw new Error("description must be non-empty and at most 200 characters.");
  if (!args.prompt.trim()) throw new Error("prompt must be non-empty.");
  if (args.context !== void 0 && !["fresh", "fork"].includes(args.context)) throw new Error("context must be fresh or fork.");
  if (Object.hasOwn(args, "modelSelection") && (args.modelSelection === null || typeof args.modelSelection !== "object" || Array.isArray(args.modelSelection))) throw new Error("modelSelection must be an object.");
}
var SPAWN_MODEL_TOOL = {
  name: "spawn_teammate_with_model",
  description: "Create a durable teammate, then optionally change its model. The first request may use the previous model; no extra wake is performed.",
  parameters: { type: "object", additionalProperties: false, required: ["name", "description", "prompt"], properties: {
    name: { type: "string", description: "Unique lower-kebab-case teammate name." },
    description: { type: "string", description: "Short description of the delegated responsibility." },
    prompt: { type: "string", description: "Complete initial task for the teammate." },
    context: { type: "string", enum: ["fresh", "fork"], description: "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh." },
    modelSelection: { type: "object", additionalProperties: false, required: ["provider", "model"], description: "Optional LLM selection applied after creation, not guaranteed for the first request.", properties: {
      provider: { type: "string", description: "LLM provider ID." },
      model: { type: "string", description: "Exact advertised model ID." },
      reasoningEffort: { type: "string", description: "Explicit supported effort; omission means Auto." },
      serviceTier: { type: "string", enum: ["default", "priority"], description: "Explicit supported tier; omission means Auto." }
    } }
  } }
};
function createSpawnModelOperation({ teams, agents, manager }) {
  return async function spawnModel(caller, args, signal) {
    validateInput(args);
    const request = structuredClone(args);
    const operationSignal = signal ?? new AbortController().signal;
    operationSignal.throwIfAborted();
    if (!caller || agents.get(caller.id) !== caller) throw new Error("Caller is no longer the exact live Agent.");
    const membership = teams.tryMembership(caller);
    if (!membership || membership.role !== "lead" || membership.root !== caller) throw new Error("Only the exact Team Lead can create teammates.");
    if (request.modelSelection !== void 0) await manager.preflight(caller, request.modelSelection, operationSignal);
    operationSignal.throwIfAborted();
    const context = request.context ?? "fresh";
    let created;
    if (request.modelSelection !== void 0) manager.assertSpawnAuthority(caller, request.modelSelection);
    try {
      created = await teams.spawnTeammate(caller, {
        name: request.name,
        description: request.description,
        prompt: [{ type: "text", text: request.prompt }],
        context,
        provider: context === "fork" ? "fork" : "spawn",
        signal: operationSignal
      });
    } catch (error) {
      return {
        created: "unknown",
        firstRequestGuaranteed: false,
        error: `Official creation did not return success: ${error.message}. A failed or provisioning roster entry may remain; inspect the Team before retrying.`
      };
    }
    const member = created.member;
    const base = { created: true, member, memberId: member?.id, firstRequestGuaranteed: false };
    if (request.modelSelection === void 0) return base;
    if (!member || typeof member.id !== "string" || !member.id || member.name !== request.name || member.role !== "teammate") {
      return { ...base, applied: false, saved: false, error: "Creation returned an unexpected member identity; no model selection was attempted. Inspect the Team." };
    }
    try {
      const result = await manager.operate(caller, { action: "set", target: member.name, ...request.modelSelection }, operationSignal, member.id);
      return { ...base, ...result, created: true, memberId: member.id, firstRequestGuaranteed: false };
    } catch (error) {
      const cold = /Member is cold/.test(error.message);
      return {
        ...base,
        applied: false,
        saved: false,
        ...cold ? { requiresWake: true } : {},
        error: `${error.message}. The teammate was created; inspect its status before retrying${cold ? " or explicitly request wake via team_member_model" : ""}.`
      };
    }
  };
}

// management/authority.js
import { Context } from "@deepseek-ai/cordis";
import { parentAgentOptionsForDelegation } from "@deepseek-ai/dsh-subagent";
var ACTIVE_FIBER_STATE = 2;
function unavailableAuthority(reason = "Host model-selection authority is unavailable.") {
  return { status: "unconfigured", routes: [], explicitSelection: false, failClosed: false, source: "parent-route", reason };
}
function invalidAuthority(reason) {
  return { status: "invalid", routes: [], explicitSelection: false, failClosed: true, source: "parent-route", reason };
}
function detached(routes) {
  return routes.map((route) => ({ provider: route.provider, model: route.model }));
}
function assertRoutes(routes) {
  if (!Array.isArray(routes)) throw new Error("subagent model selection requires an array of routes");
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of routes) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || typeof candidate.provider !== "string" || candidate.provider.length === 0 || typeof candidate.model !== "string" || candidate.model.length === 0) {
      throw new Error("subagent model selection requires non-empty provider and model ids");
    }
    const key = `${candidate.provider}\0${candidate.model}`;
    if (seen.has(key)) throw new Error(`subagent model selection repeats route "${candidate.provider}/${candidate.model}"`);
    seen.add(key);
  }
}
function readDurablePolicy(events) {
  if (!Array.isArray(events)) return void 0;
  const policy = events.find((event) => event?.type === "subagent/model-selection-policy");
  if (policy === void 0) return void 0;
  const allowedModels = policy.data?.allowedModels;
  try {
    assertRoutes(allowedModels);
  } catch {
    return null;
  }
  if (allowedModels.length === 0) return null;
  return detached(allowedModels);
}
function serviceBinding(ctx, name) {
  try {
    const key = ctx?.[Context.isolate]?.[name];
    if (key === void 0) return void 0;
    const record = ctx.reflect?.store?.[key];
    if (record === void 0) return void 0;
    return { key, record };
  } catch {
    return void 0;
  }
}
function readMountedSetting(hostCtx, agent) {
  const hostBinding = serviceBinding(hostCtx, "subagentModelSelection");
  const targetCtx = agent?.ctx;
  const targetBinding = serviceBinding(targetCtx, "subagentModelSelection");
  if (hostBinding === void 0 && targetBinding === void 0) return { mounted: false };
  if (targetCtx === void 0) return { mounted: true, error: "cold target has no live context to bind its model-selection authority" };
  if (targetBinding === void 0) return { mounted: true, error: "target context cannot see the mounted model-selection service" };
  const ownerCtx = targetBinding.record.ctx;
  const ownerBinding = ownerCtx === void 0 ? void 0 : serviceBinding(ownerCtx, "subagentModelSelection");
  if (!ownerCtx || !ownerBinding || ownerBinding.key !== targetBinding.key || ownerBinding.record.uid !== targetBinding.record.uid || ownerCtx.fiber?.uid !== targetBinding.record.ctx?.fiber?.uid) {
    return { mounted: true, error: "model-selection service owner realm is unprovable" };
  }
  let rows;
  try {
    rows = ownerCtx.get?.("configEditor")?.entries?.() ?? [];
  } catch (error) {
    return { mounted: true, error: `config editor is unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  const policyRows = rows.filter((row2) => row2?.options?.name === POLICY_PACKAGE);
  if (policyRows.length !== 1) {
    return { mounted: true, error: `expected exactly one active policy row "${POLICY_PACKAGE}", found ${policyRows.length}` };
  }
  const row = policyRows[0];
  if (!row.fiber || row.fiber.state !== ACTIVE_FIBER_STATE) {
    return { mounted: true, error: "the model-selection policy row is not active in this context" };
  }
  if (row.fiber.uid !== ownerCtx.fiber?.uid) {
    return { mounted: true, error: "policy row fiber is not the model-selection service provider fiber" };
  }
  const settings = ownerCtx.get?.("settings");
  if (!settings || typeof settings.describe !== "function") {
    return { mounted: true, error: "settings service is unavailable in the policy row owner context" };
  }
  let descriptors;
  try {
    descriptors = settings.describe({ redactSecrets: true });
  } catch (error) {
    return { mounted: true, error: `settings descriptors are unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  const matches = descriptors.filter((descriptor) => String(descriptor?.ns) === String(row.options?.id));
  if (matches.length !== 1) {
    return { mounted: true, error: `expected one settings descriptor for the policy row, found ${matches.length}` };
  }
  const value = matches[0]?.value;
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.enabled !== "boolean") {
    return { mounted: true, error: "the model-selection policy descriptor has an invalid shape" };
  }
  if (!value.enabled) {
    return { mounted: true, authority: { status: "disabled", routes: [], explicitSelection: false, failClosed: false, source: "parent-route", reason: "subagent model selection is disabled by the Host setting" } };
  }
  try {
    assertRoutes(value.allowedModels);
  } catch (error) {
    return { mounted: true, error: `the model-selection policy is invalid: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (value.allowedModels.length === 0) {
    return { mounted: true, error: "enabled model selection advertises no allowed route" };
  }
  return { mounted: true, authority: { status: "allowed", routes: detached(value.allowedModels), explicitSelection: true, failClosed: false, source: "settings" } };
}
function resolveAuthority(ctx, durable, agent) {
  const mounted = readMountedSetting(ctx, agent);
  if (mounted.mounted) {
    if (mounted.error !== void 0) return invalidAuthority(mounted.error);
    return mounted.authority;
  }
  if (durable === null) return invalidAuthority("recorded model-selection policy is invalid");
  if (durable === void 0) {
    return { status: "unconfigured", routes: [], explicitSelection: false, failClosed: false, source: "parent-route", reason: "no model-selection setting service is mounted in this profile" };
  }
  return { status: "unconfigured", routes: detached(durable), explicitSelection: true, failClosed: false, source: "session" };
}
function parentRouteOf(agent, events) {
  if (agent) {
    try {
      const inherited = parentAgentOptionsForDelegation(agent);
      if (inherited?.provider && inherited?.model) return { provider: inherited.provider, model: inherited.model };
    } catch {
    }
  }
  if (Array.isArray(events)) {
    const selection2 = events.findLast?.((event) => event?.type === "model/selection") ?? [...events].reverse().find((event) => event?.type === "model/selection");
    if (selection2?.data && typeof selection2.data.provider === "string") return { provider: selection2.data.provider, model: selection2.data.model };
    const header = [...events].reverse().find((event) => event?.type === "request/header");
    const config = header?.data?.header?.config;
    if (config && typeof config.provider === "string") return { provider: config.provider, model: config.model };
  }
  return void 0;
}
function createModelAuthority(ctx) {
  return ({ caller, agent, sessionId, events }) => {
    let durable;
    if (agent?.session && typeof agent.session.snapshotEvents === "function") {
      const mounted = ctx.get?.("subagentModelSelection") !== void 0;
      durable = mounted ? void 0 : readDurablePolicy(agent.session.snapshotEvents());
    } else if (Array.isArray(events)) {
      durable = readDurablePolicy(events);
    } else {
      return { ...unavailableAuthority("Cold session policy inspection is unsupported; no wake was attempted."), sessionId, writable: false };
    }
    const authority = resolveAuthority(ctx, durable, agent);
    const parentRoute = parentRouteOf(agent, events);
    return {
      ...authority,
      routes: detached(authority.routes),
      sessionId,
      ...parentRoute === void 0 ? {} : { parentRoute },
      writable: false
    };
  };
}
function assertModelAuthorized(authority, next) {
  if (authority?.explicitSelection !== true || authority.failClosed === true || !Array.isArray(authority.routes) || !authority.routes.some((route) => route.provider === next.provider && route.model === next.model)) {
    throw new Error(`Model selection is not authorized (${authority?.status ?? "unconfigured"}): ${authority?.reason ?? "requested route is not allowed"}`);
  }
}

// management/model.js
var WAKE_TEXT = "The user authorized this one wake to apply a model selection. Briefly acknowledge, then finish without tools or delegation. Do not start other work.";
function object(value, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.");
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown field: ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`Missing field: ${key}`);
}
function id(value, name) {
  if (typeof value !== "string" || !value || value.length > 256 || value.trim() !== value || /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error(`${name}: expected a non-empty identifier (max 256 characters).`);
  return value;
}
function selection(value) {
  if (value === null) return null;
  object(value, ["provider", "model", "reasoningEffort", "serviceTier"], ["provider", "model"]);
  const result = { provider: id(value.provider, "provider"), model: id(value.model, "model") };
  if (value.reasoningEffort !== void 0) result.reasoningEffort = id(value.reasoningEffort, "reasoningEffort");
  if (value.serviceTier !== void 0) {
    if (!["default", "priority"].includes(value.serviceTier)) throw new Error("serviceTier must be default or priority.");
    result.serviceTier = value.serviceTier;
  }
  return result;
}
var equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function createTeamModelManager({ teams, agents, llm, sessions, sessionQuery, onCreated, authority = () => unavailableAuthority(), wakeTimeoutMs = 18e4 }) {
  const readAuthority = (caller, start) => authority({ caller, agent: start.child, sessionId: start.member.id, events: start.events });
  const authorize = (caller, start, next) => assertModelAuthorized(readAuthority(caller, start), next);
  let chain = Promise.resolve();
  const lifetime = new AbortController();
  function roster(caller, target) {
    if (lifetime.signal.aborted) throw new Error("Team model control is closed.");
    if (!caller || agents.get(caller.id) !== caller) throw new Error("Caller is no longer the exact live Agent.");
    const membership = teams.tryMembership(caller);
    if (!membership || membership.role !== "lead" || membership.root !== caller) throw new Error("Only the exact Team Lead can select a member model.");
    const member = teams.listMembers(caller).find((row) => row.role === "teammate" && row.name === target);
    if (!member) throw new Error("Unknown teammate target. Use team_roles(list).");
    if (member.status === "failed" || member.status === "provisioning") throw new Error("Cannot select a failed or provisioning member.");
    return { membership: { ...membership }, member: { ...member } };
  }
  function resolve(caller, target) {
    const found = roster(caller, target), child = agents.get(found.member.id);
    if (!child) return { ...found, child: null };
    const membership = teams.tryMembership(child);
    if (!membership || membership.role !== "teammate" || membership.id !== found.membership.id || membership.root !== caller || membership.name !== target) throw new Error("Member identity does not match this Team.");
    return { ...found, child, current: selection(child.model.current() ?? null) };
  }
  function sameIdentity(start, fresh) {
    if (fresh.member.id !== start.member.id || fresh.membership.id !== start.membership.id) throw new Error("Team member identity changed. Reload before switching.");
  }
  async function inspect(caller, target, signal) {
    signal.throwIfAborted();
    const start = resolve(caller, target);
    if (start.child) return start;
    if (!sessionQuery) throw new Error("Member is cold (not live); cold observation service is unavailable.");
    const observation = await sessionQuery.observeSession(start.member.id, { signal, projectionMode: "all" });
    try {
      signal.throwIfAborted();
      const header = observation.header;
      if (header.id !== start.member.id || header.parentSession !== caller.id || header.origin !== "subagent") throw new Error("Persisted member lineage does not match this Team.");
      const view = observation.projections?.values?.modelSelection;
      if (!view || !Object.hasOwn(view, "next")) throw new Error("Cold member modelSelection projection is unavailable.");
      const current = selection(view.next);
      const fresh = resolve(caller, target);
      sameIdentity(start, fresh);
      return fresh.child ? fresh : {
        ...fresh,
        current,
        asOfSeq: observation.cursor,
        events: Array.isArray(observation.events) ? structuredClone(observation.events.filter((event) => ["subagent/model-selection-policy", "request/header", "model/selection"].includes(event.type))) : void 0
      };
    } finally {
      observation[Symbol.dispose]();
    }
  }
  function assertLive(caller, target, start, expected, signal) {
    signal.throwIfAborted();
    const fresh = resolve(caller, target);
    sameIdentity(start, fresh);
    if (!fresh.child || fresh.child !== start.child) throw new Error("Team member identity changed or became cold. Reload before switching.");
    if (!equal(fresh.current, expected)) throw new Error("Model selection changed. Read status again before switching.");
    return fresh;
  }
  async function validate(next, signal) {
    signal.throwIfAborted();
    if (!llm.listProviders().some((provider) => provider.id === next.provider)) throw new Error("LLM provider is not registered.");
    const models = await llm.listModels(next.provider);
    signal.throwIfAborted();
    if (!models.some((model) => model.id === next.model)) throw new Error("Model is not in this provider's advertised catalog.");
    await llm.resolveCallConfig({ ...next }, signal);
    signal.throwIfAborted();
  }
  async function apply2(caller, target, start, expected, next, signal, onApplied = () => {
  }) {
    authorize(caller, start, next);
    assertLive(caller, target, start, expected, signal);
    start.child.model.select(next);
    const result = {
      applied: true,
      saved: false,
      memberId: start.member.id,
      target,
      selection: next,
      effective: "next-unprepared-model-step",
      wokeMember: false,
      changedGlobalDefault: false,
      durability: "unconfirmed"
    };
    onApplied(result);
    try {
      if (!await sessions.flush(start.child.session)) throw new Error("No persistence listener participated.");
      result.saved = true;
      result.durability = "flushed";
    } catch (error) {
      result.error = `Selection applied, but durability is unconfirmed: ${error.message}. Inspect status; do not blindly retry.`;
    }
    return result;
  }
  async function liveSet(caller, args, start, expected, next, signal) {
    assertLive(caller, args.target, start, expected, signal);
    await validate(next, signal);
    assertLive(caller, args.target, start, expected, signal);
    return apply2(caller, args.target, start, expected, next, signal);
  }
  async function coldSet(caller, args, start, expected, next, signal) {
    if (args.wake !== true) throw new Error("Member is cold; explicit wake:true is required.");
    if (!onCreated || !teams.sendMessage) throw new Error("Official cold wake/serial creation gate is unavailable.");
    if (expected === null) throw new Error("Cold member has no recorded model choice; cannot compare an exact transition.");
    const checkCold = async () => {
      const fresh = await inspect(caller, args.target, signal);
      sameIdentity(start, fresh);
      if (fresh.child) throw new Error("Member became live; retry against its current live instance.");
      if (!equal(fresh.current, expected)) throw new Error("Cold model selection changed. Retry with a fresh snapshot.");
      start = fresh;
    };
    await validate(next, signal);
    await checkCold();
    authorize(caller, start, next);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error("Official cold wake timed out.")), wakeTimeoutMs);
    const wakingSignal = AbortSignal.any([signal, deadline.signal]);
    let applied, gateSeen = false, remove, sendStarted = false;
    try {
      remove = onCreated(async ({ agent, source, signal: initSignal }) => {
        if (agent.id !== start.member.id) return;
        if (gateSeen) throw new Error("Duplicate model-selection creation gate.");
        gateSeen = true;
        const gateSignal = AbortSignal.any([wakingSignal, ...initSignal ? [initSignal] : []]);
        gateSignal.throwIfAborted();
        if (source !== "resume") throw new Error("Expected an official resume for the existing member.");
        const live = resolve(caller, args.target);
        sameIdentity(start, live);
        if (live.child !== agent) throw new Error("Resumed Agent does not match the exact Team member.");
        assertLive(caller, args.target, live, expected, gateSignal);
        await validate(next, gateSignal);
        const result = await apply2(caller, args.target, live, expected, next, gateSignal, (value) => {
          applied = value;
        });
        if (!result.saved) throw new Error(result.error);
      });
      authorize(caller, start, next);
      sendStarted = true;
      const receipt = await teams.sendMessage(caller, { target: args.target, content: [{ type: "text", text: WAKE_TEXT }], signal: wakingSignal });
      if (!applied) return {
        applied: false,
        saved: false,
        target: args.target,
        memberId: start.member.id,
        wakeAttempted: true,
        wokeMember: true,
        messageAccepted: true,
        messageId: receipt.messageId,
        error: "Official wake was accepted without this creation gate. Model selection was not applied; do not blindly retry."
      };
      return { ...applied, wakeAttempted: true, wokeMember: true, messageAccepted: true, messageId: receipt.messageId };
    } catch (error) {
      if (!sendStarted) throw error;
      if (!applied) return {
        applied: false,
        saved: false,
        target: args.target,
        memberId: start.member.id,
        wakeAttempted: true,
        wokeMember: "unknown",
        messageAccepted: "unknown",
        gateSeen,
        error: `No selection was applied by this operation; official wake outcome is unconfirmed: ${error.message}. No automatic retry was made.`
      };
      return {
        ...applied,
        wakeAttempted: true,
        wokeMember: "unknown",
        messageAccepted: "unknown",
        error: `Selection was applied but official wake completion is unconfirmed: ${error.message}. Inspect status before retrying.`
      };
    } finally {
      clearTimeout(timer);
      remove?.();
    }
  }
  async function preflight(caller, next, signal) {
    const combined = AbortSignal.any([lifetime.signal, ...signal ? [signal] : []]);
    combined.throwIfAborted();
    if (!caller || agents.get(caller.id) !== caller) throw new Error("Caller is no longer the exact live Agent.");
    const membership = teams.tryMembership(caller);
    if (!membership || membership.role !== "lead" || membership.root !== caller) throw new Error("Only the exact Team Lead can select a member model.");
    const requested = selection(next);
    if (!requested) throw new Error("A model selection is required.");
    const start = { child: caller, member: { id: caller.id } };
    authorize(caller, start, requested);
    await validate(requested, combined);
    combined.throwIfAborted();
    authorize(caller, start, requested);
    return requested;
  }
  function operate(caller, args, signal, expectedMemberId) {
    const fields = ["action", "target", "expectedSelection", "provider", "model", "reasoningEffort", "serviceTier", "wake"];
    object(args, fields, ["action", "target"]);
    id(args.target, "target");
    if (!["status", "routes", "set"].includes(args.action)) throw new Error("action must be status, routes or set.");
    if (args.action !== "set" && Object.keys(args).some((key) => !["action", "target"].includes(key))) throw new Error("status/routes accept only action and target.");
    if (args.action === "set") {
      object(args, fields, ["provider", "model"]);
      if (Object.hasOwn(args, "expectedSelection")) selection(args.expectedSelection);
      selection({
        provider: args.provider,
        model: args.model,
        ...args.reasoningEffort === void 0 ? {} : { reasoningEffort: args.reasoningEffort },
        ...args.serviceTier === void 0 ? {} : { serviceTier: args.serviceTier }
      });
      if (args.wake !== void 0 && typeof args.wake !== "boolean") throw new Error("wake must be boolean.");
    }
    const request = structuredClone(args);
    const combined = AbortSignal.any([lifetime.signal, ...signal ? [signal] : []]);
    const work = async () => {
      if (expectedMemberId !== void 0 && roster(caller, request.target).member.id !== expectedMemberId) throw new Error("Created teammate identity changed. Inspect the Team before switching.");
      const start = await inspect(caller, request.target, combined);
      if (expectedMemberId !== void 0 && start.member.id !== expectedMemberId) throw new Error("Created teammate identity changed. Inspect the Team before switching.");
      if (request.action === "routes") return { ...readAuthority(caller, start), target: request.target, memberId: start.member.id, live: !!start.child, writable: false };
      if (request.action === "status") return {
        target: request.target,
        memberId: start.member.id,
        selection: start.current,
        live: !!start.child,
        ...!start.child ? { asOfSeq: start.asOfSeq, requiresWake: true } : {}
      };
      const expected = Object.hasOwn(request, "expectedSelection") ? selection(request.expectedSelection) : start.current;
      if (!equal(start.current, expected)) throw new Error("Model selection changed. Read status again before switching.");
      const next2 = selection({
        provider: request.provider,
        model: request.model,
        ...request.reasoningEffort === void 0 ? {} : { reasoningEffort: request.reasoningEffort },
        ...request.serviceTier === void 0 ? {} : { serviceTier: request.serviceTier }
      });
      authorize(caller, start, next2);
      return start.child ? liveSet(caller, request, start, expected, next2, combined) : coldSet(caller, request, start, expected, next2, combined);
    };
    const next = chain.then(work);
    chain = next.catch(() => {
    });
    return next;
  }
  function assertSpawnAuthority(caller, next) {
    if (lifetime.signal.aborted || agents.get(caller?.id) !== caller) throw new Error("Caller is no longer live.");
    const member = teams.tryMembership(caller);
    if (member?.role !== "lead" || member.root !== caller) throw new Error("Only the exact Team Lead can create teammates.");
    authorize(caller, { child: caller, member: { id: caller.id } }, selection(next));
  }
  return { operate, preflight, assertSpawnAuthority, close() {
    lifetime.abort(new Error("Team model control unloaded."));
    return chain;
  } };
}
var TEAM_MODEL_TOOL = {
  name: "team_member_model",
  description: "Read or change an existing teammate model after the user requests it. Lead only; preserves context and global defaults. No additional plugin confirmation is shown.",
  parameters: { type: "object", additionalProperties: false, required: ["action", "target"], properties: {
    action: { type: "string", enum: ["status", "set"] },
    target: { type: "string", description: "Immutable teammate target in this Team." },
    provider: { type: "string", description: "LLM provider ID; required for set." },
    model: { type: "string", description: "Exact advertised model ID; required for set." },
    reasoningEffort: { type: "string", description: "Explicit supported effort; omission means Auto." },
    serviceTier: { type: "string", enum: ["default", "priority"], description: "Explicit supported tier; omission means Auto." },
    wake: { type: "boolean", description: "Allow one official message to wake a cold member only if the user requested a wake. Defaults false. May cause model requests and costs." }
  } }
};
function registerTeamModelCommand(ctx) {
  const manager = createTeamModelManager({
    teams: ctx.agentTeams,
    agents: ctx.agents,
    llm: ctx.llm,
    sessions: ctx.sessions,
    sessionQuery: ctx.get?.("sessionQuery"),
    authority: createModelAuthority(ctx),
    onCreated: (listener) => ctx.on("agent/created", listener)
  });
  ctx.effect(() => () => manager.close());
  ctx.effect(() => ctx.tools.register({
    ...TEAM_MODEL_TOOL,
    output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    execute: (args, exec) => manager.operate(exec.agent, args, exec.signal)
  }, { when: ({ agent }) => !!agent && ctx.agentTeams.tryMembership(agent)?.role === "lead" }));
  const spawnModel = createSpawnModelOperation({ teams: ctx.agentTeams, agents: ctx.agents, manager });
  ctx.effect(() => ctx.tools.register({
    ...SPAWN_MODEL_TOOL,
    output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    execute: (args, exec) => spawnModel(exec.agent, args, exec.signal)
  }, { when: ({ agent }) => !!agent && ctx.agentTeams.tryMembership(agent)?.role === "lead" }));
  ctx.effect(() => ctx.commands.register({
    name: "team-model",
    description: "Inspect or change a teammate model, optionally waking a cold member; no extra plugin confirmation.",
    input: { hint: '{"action":"status","target":"reviewer"} or {"action":"set","target":"reviewer","provider":"...","model":"...","wake":true}' },
    async handler({ agent, rawInput, signal }) {
      try {
        const result = await manager.operate(agent, JSON.parse(rawInput), signal);
        return { kind: result.saved === false || result.error ? "error" : "success", text: JSON.stringify(result) };
      } catch (error) {
        return { kind: "error", text: error.message };
      }
    }
  }));
}

// management/hierarchy.js
var LEVEL2_TOOL = "spawn_level2";
var HIERARCHY_LIMIT = 2;
var validDepth = (n) => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
function classify(ctx, agent) {
  try {
    if (!agent || typeof agent.id !== "string" || ctx.agents.get(agent.id) !== agent || !agent.options || !agent.session?.header) return { kind: "unknown", depth: null };
    const stored = agent.session.header.delegationDepth;
    const runtime = agent.options.subagentDepth;
    if (stored !== void 0 && !validDepth(stored) || runtime !== void 0 && !validDepth(runtime)) return { kind: "unknown", depth: null };
    const depth = Math.max(stored ?? 0, runtime ?? 0);
    const member = ctx.agentTeams.tryMembership(agent);
    if (member?.role === "lead" && member.root === agent && depth === 0) return { kind: "root", depth };
    if (member?.role === "teammate" && member.root && member.root !== agent && ctx.agents.get(member.root.id) === member.root && depth === 1 && agent.session.header.parentSession === member.root.id) return { kind: "level1", depth };
    if (!member && depth === 2 && typeof agent.session.header.parentSession === "string") return { kind: "level2", depth };
    return { kind: "unknown", depth };
  } catch {
    return { kind: "unknown", depth: null };
  }
}
function delegationState(ctx, agent) {
  const identity = classify(ctx, agent);
  const service = ctx.get?.("subagents");
  let backend = "unknown", defaultMaxDepth = null, configuredMaxDepth = null;
  try {
    if (service && typeof service.getProvider === "function") {
      const provider = service.getProvider("spawn");
      backend = !provider ? "unavailable" : provider.name === "spawn" && provider.inheritsParentContext === false && provider.capabilities?.depthLimit === true && typeof provider.prepareContinuable === "function" && typeof provider.start !== "function" ? "available" : "unsupported";
    }
  } catch {
  }
  if (service && typeof service.resolveMaxDepth === "function") {
    try {
      const value = service.resolveMaxDepth();
      if (validDepth(value)) defaultMaxDepth = value;
    } catch {
    }
    try {
      const value = service.resolveMaxDepth(HIERARCHY_LIMIT);
      if (validDepth(value)) configuredMaxDepth = value;
    } catch {
    }
  }
  const effectiveMaxDepth = configuredMaxDepth === null ? null : Math.min(HIERARCHY_LIMIT, configuredMaxDepth);
  return {
    ...identity,
    backend,
    platformMaxDepth: defaultMaxDepth,
    defaultMaxDepth,
    configuredMaxDepth,
    hierarchyMaxDepth: HIERARCHY_LIMIT,
    effectiveMaxDepth,
    eligible: identity.kind === "level1" && backend === "available" && effectiveMaxDepth !== null && effectiveMaxDepth >= 2
  };
}
function guardDecision(ctx, blocked, denial, exec) {
  if (blocked.includes(exec.name)) return denial;
  if (exec.name === LEVEL2_TOOL && !delegationState(ctx, exec.agent).eligible) return "Only an exact live level-1 Team member may start a local level-2 child within the current platform depth limit.";
  if (exec.name === "spawn_teammate" || exec.name === "spawn_teammate_with_model") {
    if (classify(ctx, exec.agent).kind !== "root") return "Only the exact depth-zero Team Lead may create a Team member.";
    if (!exec.arguments || typeof exec.arguments !== "object" || Array.isArray(exec.arguments) || exec.arguments.context !== void 0 && exec.arguments.context !== "fresh") return "Only fresh Team delegation is permitted; invalid or missing arguments are rejected.";
  }
}
function level2Tool(ctx, agent) {
  return {
    name: LEVEL2_TOOL,
    description: "Start a focused local continuable level-2 child. Only a depth-1 Team member may call this; the child returns to you, not the Team board. Verify and aggregate its result for the Lead.",
    parameters: { type: "object", additionalProperties: false, required: ["description", "prompt"], properties: {
      description: { type: "string", description: "Short focused task label." },
      prompt: { type: "string", description: "Complete task and acceptance criteria; report results to your direct parent." }
    } },
    output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    async execute(args, exec) {
      if (exec.agent !== agent || !delegationState(ctx, agent).eligible) throw new Error("Level-2 delegation is unavailable for this caller or current depth policy.");
      if (!args || Object.keys(args).some((key) => !["description", "prompt"].includes(key)) || typeof args.description !== "string" || !args.description.trim() || args.description.length > 200 || typeof args.prompt !== "string" || !args.prompt.trim()) throw new Error("Provide a nonempty description (at most 200 characters) and prompt.");
      exec.signal.throwIfAborted();
      const service = ctx.get("subagents");
      const state = delegationState(ctx, agent);
      if (!state.eligible) throw new Error("Level-2 delegation policy changed; retry after checking status.");
      const activation = await service.startActivation({ provider: "spawn", label: args.description.trim(), request: {
        parent: agent,
        maxDepth: state.effectiveMaxDepth,
        prompt: [{ type: "text", text: args.prompt }]
      }, signal: exec.signal, delivery: "parent" });
      return { kind: "activation", subagentId: activation.childId };
    }
  };
}

// management/coordination.js
var modes = /* @__PURE__ */ new Set(["coordinator", "balanced"]);
var coordinationScope = "profile-wide";
var coordinationBoundary = "Root execution constraints are behavioral guidance, not an OS sandbox; custom prompts and higher-priority instructions still apply.";
function createCoordinationManager(ctx, config) {
  let changing = false;
  function authorize(agent) {
    if (classify(ctx, agent).kind !== "root") throw new Error("Only the exact live depth-zero Team Lead may inspect or change coordination mode.");
  }
  function entry() {
    return forkManagementConfigEntry(ctx);
  }
  function status(agent) {
    authorize(agent);
    const row = entry();
    const mode = config.mode.get();
    if (!modes.has(mode)) throw new Error("Current coordination mode is unknown.");
    return { mode, scope: coordinationScope, boundary: coordinationBoundary, entryAvailable: !!row };
  }
  async function operate(agent, args, signal) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected an object.");
    const allowed = args.action === "set" ? ["action", "mode", "expectedMode"] : ["action"];
    if (Object.keys(args).some((k) => !allowed.includes(k))) throw new Error("Unexpected coordination mode field.");
    if (args.action === "status") return status(agent);
    if (args.action !== "set" || !modes.has(args.mode) || !modes.has(args.expectedMode)) throw new Error("Use status or set with mode and expectedMode.");
    if (changing) throw new Error("Another coordination mode change is in progress.");
    const requested = args.mode, expected = args.expectedMode;
    changing = true;
    try {
      signal?.throwIfAborted();
      const before = status(agent);
      const selectedEntry = entry();
      if (before.mode !== expected) throw new Error("Coordination mode changed; read status and retry.");
      if (before.mode === requested) return { changed: false, ...before };
      await ctx.configEditor.edit(selectedEntry, (current, inherited) => {
        signal?.throwIfAborted();
        authorize(agent);
        if (entry() !== selectedEntry) throw new Error("Configuration entry was replaced; retry.");
        const effective = current.mode ?? inherited.mode ?? "coordinator";
        if (effective !== expected || config.mode.get() !== expected) throw new Error("Coordination mode changed; read status and retry.");
        return { ...current, mode: requested };
      });
      const after = status(agent);
      if (after.mode !== requested) throw new Error("Mode change was persisted but reconciliation is unconfirmed; check status before retrying.");
      return { changed: true, ...after, promptsPreserved: true };
    } finally {
      changing = false;
    }
  }
  return { status, operate };
}

// management/failures.js
import { randomUUID } from "node:crypto";
var WINDOW_MS = 1e4;
var HARD = /(?:AUTH|UNAUTHORIZED|FORBIDDEN|QUOTA_EXHAUSTED|CONTEXT_WINDOW_EXCEEDED|MODEL_SWITCH_COMPACTION_FAILED|INVALID_REQUEST)/;
var MAX_CODES = 4;
var bounded = (value, max) => typeof value === "string" ? value.split(/[\r\n]/, 1)[0].replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max) : "";
function createFailureReporter(ctx, { windowMs = WINDOW_MS } = {}) {
  const entries = /* @__PURE__ */ new Map();
  let closed = false;
  function live(agent, session) {
    if (closed || !agent || ctx.agents.get(agent.id) !== agent || agent.session !== session) return;
    const member = ctx.agentTeams.tryMembership(agent);
    if (member?.role !== "teammate" || !member.root || ctx.agents.get(member.root.id) !== member.root) return;
    const rows = ctx.agentTeams.listMembers(agent);
    if (!rows.some((row) => row.id === agent.id && row.name === member.name && row.role === "teammate" && !["failed", "provisioning"].includes(row.status))) return;
    if (!rows.some((row) => row.id === member.root.id && row.name === "lead" && row.role === "lead")) return;
    return member;
  }
  function schedule(entry) {
    if (entry.timer || closed) return;
    entry.timer = setTimeout(() => {
      entry.timer = void 0;
      flush(entry);
    }, windowMs);
    entry.timer.unref?.();
  }
  function text2(entry) {
    const parts = [...entry.codes.entries()].map(([code, item]) => `${code}\xD7${item.count}: ${item.message}`);
    if (entry.other) parts.push(`\u5176\u4ED6\xD7${entry.other}`);
    return `\u6210\u5458 ${entry.name} \u56DE\u5408\u5931\u8D25\uFF08${new Date(entry.time).toISOString()}\uFF1B\u8FDE\u7EED ${entry.consecutive} \u6B21\uFF0C\u672C\u7A97\u53E3 ${entry.count} \u6B21\uFF09\uFF1A${parts.join("\uFF1B")}\u3002\u8BF7\u5411\u7528\u6237\u8BF4\u660E\u9519\u8BEF\u53CA\u5F71\u54CD\uFF0C\u518D\u7B49\u5F85\u6307\u793A\u6216\u6309\u5DF2\u6709\u6388\u6743\u5904\u7406\u3002`;
  }
  function owner(entry) {
    if (closed || ctx.agents.get(entry.root.id) !== entry.root || entry.root.session !== entry.rootSession) return;
    if (entry.root.ctx?.fiber?.uid === null || entry.root.ctx?.fiber?.state === 5) return;
    const rows = ctx.agentTeams.listMembers(entry.root);
    if (!rows.some((row) => row.id === entry.memberId && row.name === entry.name && row.role === "teammate")) return;
    return rows.find((row) => row.id === entry.root.id && row.name === "lead" && row.role === "lead");
  }
  function flush(entry) {
    if (closed || !entry.count || entry.sending || entry.deliveryUnconfirmed) return;
    try {
      const lead = owner(entry);
      if (!lead) {
        entries.delete(entry.memberId);
        return;
      }
      if (!entry.hard && lead.status !== "running") return;
      const message = {
        id: randomUUID(),
        role: "user",
        content: [{ type: "text", text: text2(entry) }],
        source: { kind: "local-team-failure", form: "notice", summary: bounded(`\u6210\u5458 ${entry.name} \u56DE\u5408\u5931\u8D25`, 120) }
      };
      entry.sending = true;
      entry.root.send(message, "next-step", entry.hard);
      entry.count = 0;
      entry.codes.clear();
      entry.other = 0;
      entry.hard = false;
    } catch (error) {
      entry.deliveryUnconfirmed = true;
      entry.count = 0;
      entry.codes.clear();
      entry.other = 0;
      entry.hard = false;
      if (!closed) ctx.logger.warn(`Team-only: failure report delivery unconfirmed for ${entry.name}; no automatic retry: ${bounded(error?.message, 120) || "unknown"}`);
    } finally {
      entry.sending = false;
    }
  }
  function observe(session, event) {
    if (closed || event?.type !== "turn/end" || !Number.isSafeInteger(event.seq) || !Number.isSafeInteger(event.data?.turn)) return;
    const agent = ctx.agents.get(session?.id);
    try {
      const member = live(agent, session);
      if (!member) return;
      let entry = entries.get(agent.id);
      if (entry && (entry.root !== member.root || entry.name !== member.name)) {
        clearTimeout(entry.timer);
        entries.delete(agent.id);
        entry = void 0;
      }
      if (!entry) {
        entry = { memberId: agent.id, root: member.root, rootSession: member.root.session, name: member.name, lastSeq: -1, consecutive: 0, count: 0, codes: /* @__PURE__ */ new Map(), other: 0, hard: false };
        entries.set(agent.id, entry);
      }
      if (event.seq <= entry.lastSeq) return;
      entry.lastSeq = event.seq;
      if (event.data.reason?.kind !== "error") {
        entry.consecutive = 0;
        delete entry.lastFailure;
        return;
      }
      entry.deliveryUnconfirmed = false;
      const error = event.data.reason.error;
      const code = bounded(error?.code, 64) || "UNKNOWN";
      const message = bounded(error?.message, 160) || "\u65E0\u539F\u56E0";
      entry.time = Number.isFinite(event.time) && Math.abs(event.time) <= 864e13 ? event.time : Date.now();
      entry.consecutive++;
      entry.count++;
      entry.hard ||= HARD.test(code.toUpperCase());
      entry.lastFailure = { code, message: bounded(error?.message, 120) || "\u65E0\u539F\u56E0", time: new Date(entry.time).toISOString(), consecutive: entry.consecutive, windowCount: entry.count };
      const existing = entry.codes.get(code);
      if (existing) {
        existing.count++;
        existing.message = message;
      } else if (entry.codes.size < MAX_CODES) entry.codes.set(code, { count: 1, message });
      else entry.other++;
      schedule(entry);
    } catch (error) {
      if (!closed) ctx.logger.warn(`Team-only: failure observation unavailable: ${bounded(error?.message, 120) || "unknown"}`);
    }
  }
  function snapshot(root, memberId) {
    const entry = entries.get(memberId);
    if (!entry?.lastFailure || entry.root !== root) return;
    try {
      if (!owner(entry)) return;
      return { ...entry.lastFailure, ...entry.deliveryUnconfirmed ? { delivery: "unconfirmed" } : {} };
    } catch {
      return;
    }
  }
  function status({ agent, status: status2 }) {
    if (closed || status2 !== "running") return;
    for (const entry of entries.values()) if (entry.root === agent && !entry.timer && !entry.hard) flush(entry);
  }
  function disposeAgent(agent) {
    for (const [member, value] of entries) if (value.root === agent) {
      if (value.timer) clearTimeout(value.timer);
      entries.delete(member);
    }
  }
  function close() {
    closed = true;
    for (const entry of entries.values()) if (entry.timer) clearTimeout(entry.timer);
    entries.clear();
  }
  return { observe, status, snapshot, disposeAgent, close };
}

// management/task-management.js
function createTaskManagement({ teams, agents }) {
  const supported = () => teams.taskArchiveVersion === 1 && typeof teams.updateTask === "function" && typeof teams.listTasks === "function";
  function membership(agent) {
    if (!agent || agents.get(agent.id) !== agent) throw new Error("Receiving conversation is no longer live.");
    const member = teams.tryMembership(agent);
    if (!member) throw new Error("Open a Team conversation to inspect tasks.");
    return member;
  }
  async function operate(agent, args, signal) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Expected an object.");
    const allowed = args.action === "list" ? ["action", "archived", "offset", "limit"] : ["action", "items"];
    if (Object.keys(args).some((key) => !allowed.includes(key))) throw new Error("Unknown task management field.");
    const member = membership(agent);
    if (args.action === "list") {
      const offset = args.offset ?? 0, limit = args.limit ?? 25, archived = args.archived ?? false;
      if (typeof archived !== "boolean" || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("Expected archived boolean, offset >= 0 and limit 1\u201350.");
      const archiveSupported = supported();
      const page = archiveSupported ? teams.listTasks(agent, { archivedOnly: archived, offset, limit: limit + 1 }) : archived ? [] : teams.listTasks(agent).slice(offset, offset + limit + 1);
      const tasks = page.slice(0, limit).map(({ id: id2, subject, status, revision, ownerName, archived: archived2, archivedAt }) => ({ id: id2, subject: String(subject ?? id2).slice(0, 500), status, revision, ownerName, archived: !!archived2, archivedAt }));
      return {
        archiveSupported,
        canEdit: archiveSupported && member.role === "lead",
        archived,
        offset,
        nextOffset: page.length > limit ? offset + limit : null,
        tasks
      };
    }
    if (!["archive", "unarchive"].includes(args.action)) throw new Error("action must be list, archive or unarchive.");
    if (member.role !== "lead" || member.root !== agent) throw new Error("Only the exact Team Lead may archive or restore tasks.");
    if (!supported()) throw new Error("This Host does not support task archive v1. Tasks remain read-only here.");
    if (!Array.isArray(args.items) || args.items.length < 1 || args.items.length > 100) throw new Error("Select 1\u2013100 tasks.");
    const seen = /* @__PURE__ */ new Set();
    const items = args.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["taskId", "expectedRevision"].includes(key)) || typeof item.taskId !== "string" || !item.taskId || item.taskId.length > 256 || !Number.isSafeInteger(item.expectedRevision) || item.expectedRevision < 1 || seen.has(item.taskId)) throw new Error("Each task needs a unique id and its observed revision.");
      seen.add(item.taskId);
      return { taskId: item.taskId, expectedRevision: item.expectedRevision };
    });
    const results = [];
    for (const item of items) {
      if (signal?.aborted) {
        results.push({ taskId: item.taskId, outcome: "not-attempted", error: "Request cancelled; refresh before another operation." });
        continue;
      }
      try {
        const current = membership(agent);
        if (current.role !== "lead" || current.root !== agent || !supported()) throw new Error("Team archive authority changed. Refresh before another operation.");
        const task = await teams.updateTask(agent, { ...item, action: args.action });
        results.push({ taskId: item.taskId, outcome: "applied", task });
      } catch (error) {
        const rejected = ["TEAM_TASK_STALE_REVISION", "TEAM_TASK_ARCHIVED", "TEAM_TASK_ALREADY_ARCHIVED", "TEAM_TASK_NOT_ARCHIVED", "TEAM_TASK_NOT_COMPLETED", "TEAM_TASK_LIMIT", "TEAM_TASK_DELETED", "TEAM_TASK_NOT_FOUND", "TEAM_LEAD_REQUIRED"].includes(error.code);
        results.push({ taskId: item.taskId, outcome: rejected ? "rejected" : "unconfirmed", code: error.code, error: error.message || String(error) });
      }
    }
    return { action: args.action, results, allApplied: results.every((result) => result.outcome === "applied") };
  }
  return { operate };
}
function registerTaskManagement(ctx) {
  const manager = createTaskManagement({ teams: ctx.agentTeams, agents: ctx.agents });
  ctx.effect(() => ctx.commands.register({
    name: "team-manage-tasks",
    description: "Inspect official Team tasks or explicitly archive/restore completed tasks with per-task revision checks.",
    input: { hint: '{"action":"list"} or {"action":"archive","items":[{"taskId":"task-1","expectedRevision":2}]}' },
    async handler({ agent, rawInput, signal }) {
      try {
        return { kind: "success", text: JSON.stringify(await manager.operate(agent, JSON.parse(rawInput), signal)) };
      } catch (error) {
        return { kind: "error", text: error.message || String(error) };
      }
    }
  }));
}

// management/team-model-discovery.js
import { defineTool } from "@deepseek-ai/dsh-tools";
import { parentAgentOptionsForDelegation as parentAgentOptionsForDelegation2 } from "@deepseek-ai/dsh-subagent";
function modelLine(provider, model) {
  return `${provider}/${model.id} \u2014 ${model.name}${model.description === void 0 ? "" : `: ${model.description}`}`;
}
function currentRoute(agent) {
  const inherited = parentAgentOptionsForDelegation2(agent);
  if (inherited?.provider && inherited?.model) {
    return { provider: inherited.provider, model: inherited.model };
  }
  throw new Error("Cannot discover Team child LLM routes without an inherited caller route.");
}
function effectiveSelection(authority, agent) {
  if (authority.failClosed) throw new Error(`cannot discover Team child LLM routes: ${authority.reason ?? "authorization is unavailable"}`);
  if (authority.explicitSelection) return { authority, routes: authority.routes };
  return { authority, routes: [currentRoute(agent)] };
}
function createTeamModelDiscoveryTool(ctx, agent) {
  const authority = createModelAuthority(ctx);
  function selection2() {
    return effectiveSelection(authority({ caller: agent, agent, sessionId: agent.id }), agent);
  }
  async function list(args, signal) {
    const llm = ctx.get("llm");
    if (llm === void 0) throw new Error("cannot discover Team child LLM routes because the `llm` service is unavailable");
    if (args.model !== void 0 && args.provider === void 0) throw new Error("`model` requires `provider`");
    const initial = selection2();
    if (args.provider === void 0) {
      const providers = llm.listProviders().filter((provider) => initial.routes.some((route) => route.provider === provider.id));
      return providers.length === 0 ? "(no LLM providers)" : providers.map((provider) => `${provider.id} \u2014 ${provider.name}`).join("\n");
    }
    if (args.provider.length === 0) throw new Error("`provider` must be non-empty");
    const allowedRoutes = initial.routes.filter((route) => route.provider === args.provider);
    const firstRoute = allowedRoutes[0];
    if (firstRoute === void 0) throw new Error(`LLM provider "${args.provider}" is not allowed for this Team session`);
    if (!llm.listProviders().some((provider) => provider.id === args.provider)) throw new Error(`LLM provider "${args.provider}" is not registered`);
    if (args.model === void 0) {
      const advertised = initial.authority.explicitSelection ? await llm.listModels(args.provider) : [await llm.resolveModelInfo(args.provider, firstRoute.model, signal)];
      signal.throwIfAborted();
      const refreshed2 = selection2();
      if (!refreshed2.routes.some((route) => route.provider === args.provider)) {
        throw new Error(`child LLM provider "${args.provider}" is no longer allowed for this Team session; retry discovery`);
      }
      const authorized = new Set(refreshed2.routes.filter((route) => route.provider === args.provider).map((route) => route.model));
      const models = advertised.filter((model2) => authorized.has(model2.id));
      return models.length === 0 ? `(no advertised models for ${args.provider})` : models.map((model2) => modelLine(args.provider, model2)).join("\n");
    }
    if (args.model.length === 0) throw new Error("`model` must be non-empty");
    if (!allowedRoutes.some((route) => route.model === args.model)) throw new Error(`LLM route "${args.provider}/${args.model}" is not allowed for this Team session`);
    const model = await llm.resolveModelInfo(args.provider, args.model, signal);
    const refreshed = selection2();
    if (!refreshed.routes.some((route) => route.provider === args.provider && route.model === args.model)) {
      throw new Error(`LLM route "${args.provider}/${args.model}" is no longer allowed for this Team session; retry discovery`);
    }
    signal.throwIfAborted();
    const efforts = model.reasoning?.efforts.map((effort) => `${effort.id}${model.reasoning?.defaultEffort === effort.id ? " (default)" : ""} \u2014 ${effort.name}${effort.description === void 0 ? "" : `: ${effort.description}`}`).join("\n") || "(no advertised reasoning efforts)";
    return `${modelLine(args.provider, model)}
Reasoning efforts:
${efforts}`;
  }
  return defineTool({
    name: "list_subagent_models",
    description: "Inspect the Team-authorized child LLM routes without changing any Agent. No arguments: providers; `provider`: allowed models; `provider` + `model`: that model and its reasoning efforts. Use returned ids for Team model selection; this scoped view shadows the generic inventory inside Team sessions.",
    parameters: {
      provider: { type: "string", description: "Registered LLM provider id." },
      model: { type: "string", description: "Exact model id; requires provider." }
    },
    output: { schema: { type: "string" }, render: (_args, result) => [{ type: "text", text: result }] },
    async execute(args, exec) {
      if (exec.agent !== agent) throw new Error("Invalid Team model discovery caller");
      return await list(args, exec.signal);
    }
  });
}

// management/index.js
var inject = ["agents", "agentTeams", "tools", "systemPrompt", "storageDomain", "commands", "configEditor"];
var FIBER_UNLOADING = 5;
var WAIT_POLICY = "\u4E0D\u8981\u8C03\u7528 wait_agent \u963B\u585E\u7B49\u5F85\u3002\u7528 list_agents \u548C team_task_list \u67E5\u770B\u72B6\u6001\u540E\u7EE7\u7EED\u72EC\u7ACB\u5DE5\u4F5C\uFF1B\u6210\u5458\u5B8C\u6210\u4F1A\u4EE5\u6D88\u606F\u81EA\u52A8\u9001\u8FBE\uFF0C\u786E\u9700\u7B49\u5F85\u65F6\u5728\u540E\u7EED\u6B65\u9AA4\u590D\u67E5\u3002";
var FAILURE_POLICY = "\u6536\u5230\u6210\u5458\u5931\u8D25\u4E0A\u62A5\u540E\uFF0C\u5148\u5411\u7528\u6237\u8BF4\u660E\u8C01\u51FA\u9519\u3001\u9519\u8BEF\u539F\u56E0\u53CA\u5DF2\u77E5\u5F71\u54CD\uFF1B\u4E0D\u8981\u9759\u9ED8\u5FFD\u7565\u6216\u53EA\u8BB0\u65E5\u5FD7\uFF0C\u7B49\u5F85\u7528\u6237\u6307\u793A\u6216\u6309\u5DF2\u6709\u6388\u6743\u5904\u7406\u3002\u7528\u6237\u8BE2\u95EE\u56E2\u961F\u72B6\u6001\u65F6\uFF0C\u82E5\u6210\u5458\u6709 lastFailure\uFF0C\u4E3B\u52A8\u8BF4\u660E\u8C01\u51FA\u9519\u3001\u9519\u8BEF\u539F\u56E0\u53CA\u5DF2\u77E5\u5F71\u54CD\uFF0C\u4E0D\u8981\u53EA\u62A5 running/inactive\u3002";
var parameters = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: { type: "string", enum: ["list", "update"] },
    target: { type: "string", description: "Immutable teammate target from list; required for update." },
    expectedRevision: { type: "integer", minimum: 0, description: "Revision returned by list; required for update." },
    displayName: { type: "string", maxLength: 64, description: "Editable display label; does not rename the message target." },
    description: { type: "string", maxLength: 200, description: "New responsibility summary." },
    instructions: { type: "string", maxLength: 4e3, description: "Full replacement role instructions. Empty clears them. Takes effect on the next model request without waking the member." }
  }
};
var schema = z.object({
  teamId: z.string(),
  target: z.string(),
  memberId: z.string(),
  displayName: z.string().min(1).max(64),
  description: z.string().max(200),
  instructions: z.string().max(4e3),
  revision: z.number().int().min(1),
  updatedAt: z.number()
}).strict();
async function apply(ctx, config = Config({})) {
  if (!isForkTeamService(ctx)) {
    throw new Error("fork-management: non-fork agentTeams service is active; refusing to bind fork management. Stop the old Team row during an idle maintenance window.");
    ;
  }
  let closing = false, manager;
  const start = Promise.withResolvers();
  const opening = start.promise.then(() => ctx.storageDomain.open({ name: "local_team_roles", version: 1, layout: "per-record", tables: { members: { valueSchema: schema } } }));
  ctx.effect(() => async () => {
    closing = true;
    const domain2 = await opening.catch(() => void 0);
    if (!domain2) return;
    try {
      await manager?.drain();
    } finally {
      await domain2.close();
    }
  });
  start.resolve();
  const domain = await opening;
  if (closing) return;
  const installations = /* @__PURE__ */ new Map();
  const coordination = createCoordinationManager(ctx, config);
  const failures = createFailureReporter(ctx);
  ctx.effect(() => () => failures.close());
  ctx.on("session/event", (session, event) => failures.observe(session, event));
  ctx.on("agent/status", (event) => failures.status(event));
  manager = createRoleManager({
    teams: ctx.agentTeams,
    table: domain.table("members"),
    capacity: () => {
      const entry = forkRuntimeConfigEntry(ctx);
      let activeTeammatesAcrossHost = 0;
      for (const a of ctx.agents.list()) {
        const m = ctx.agentTeams.tryMembership(a);
        if (m?.role === "lead") activeTeammatesAcrossHost += ctx.agentTeams.listMembers(a).filter((x) => x.role === "teammate" && (x.status === "running" || x.status === "provisioning")).length;
      }
      return { limit: entry?.options.config?.maxMembers ?? 16, activeTeammatesAcrossHost };
    }
  });
  ctx.inject(["llm", "sessions"], registerTeamModelCommand);
  function hierarchyStatus(agent) {
    if (classify(ctx, agent).kind !== "root") throw new Error("Only the exact Team Lead can inspect hierarchy status.");
    const members = ctx.agentTeams.listMembers(agent);
    const rows = members.map((row) => {
      const live = ctx.agents.get(row.id);
      const lastFailure = row.role === "teammate" ? failures.snapshot(agent, row.id) : void 0;
      return { target: row.name, status: row.status, ...live ? delegationState(ctx, live) : { kind: "unknown", depth: null, eligible: false }, ...lastFailure ? { lastFailure } : {} };
    });
    const liveChildren = ctx.agents.list().filter((a) => !members.some((row) => row.id === a.id) && a.session?.header?.parentSession && members.some((row) => row.id === a.session.header.parentSession)).map((a) => ({ id: a.id, parentId: a.session.header.parentSession, ...delegationState(ctx, a) }));
    return { mode: readPolicyConfig(config).mode, boundary: coordinationBoundary, caller: delegationState(ctx, agent), members: rows, liveChildren };
  }
  const ownerClosing = () => closing || ctx.fiber?.uid === null || ctx.fiber?.state === FIBER_UNLOADING;
  async function install(agent) {
    if (ownerClosing() || installations.has(agent)) return;
    const state = { dispose: null, ownerDispose: null, denied: /* @__PURE__ */ new Set(), warnings: [] };
    installations.set(agent, state);
    try {
      state.dispose = agent.ctx.effect(() => {
        const disposers = [];
        let disposed = false;
        try {
          disposers.push(agent.ctx.tools.guard((exec) => guardDecision(ctx, BLOCKED, DENIAL, exec)));
          disposers.push(agent.ctx.tools.register(level2Tool(ctx, agent), { when: ({ agent: caller }) => caller === agent && delegationState(ctx, agent).eligible }));
          disposers.push(agent.ctx.systemPrompt.section({
            name: "local:team-only",
            order: 970,
            interpolate: false,
            text: () => `${policyFor(readPolicyConfig(config), ctx.agentTeams.tryMembership(agent)?.role, classify(ctx, agent).kind)}

${WAIT_POLICY}${classify(ctx, agent).kind === "root" ? `

${FAILURE_POLICY}` : ""}`
          }));
          disposers.push(agent.ctx.systemPrompt.context({ name: "local:team-role", order: 975, required: true, interpolate: false, text: () => manager.context(agent) }));
          const refresh = () => {
            if (closing || disposed) return;
            const available = BLOCKED.filter((name) => !state.denied.has(name) && agent.ctx.tools.get(name, agent));
            for (const name of available) {
              try {
                const dispose = agent.ctx.tools.restrict({ deny: [name] });
                state.denied.add(name);
                disposers.push(dispose);
              } catch (error) {
                if (!state.warnings.includes(name)) {
                  state.warnings.push(name);
                  ctx.logger.warn(`Team-only: ${name} could not be hidden for ${agent.id}; execution remains guarded: ${error.message}`);
                }
              }
            }
          };
          if (ctx.agentTeams.tryMembership(agent)) {
            const discovery = createTeamModelDiscoveryTool(ctx, agent);
            try {
              disposers.push(agent.ctx.tools.register(discovery, { when: ({ agent: caller }) => caller === agent }));
            } catch (error) {
              if (!/already registered|duplicate tool/iu.test(error?.message ?? "")) throw error;
              disposers.push(agent.ctx.tools.register({ ...discovery, name: "team_list_subagent_models" }, { when: ({ agent: caller }) => caller === agent }));
              disposers.push(agent.ctx.tools.guard((exec) => exec.name === "list_subagent_models" ? "Use team_list_subagent_models for Team-authorized routes; the generic inventory is not Team authority." : void 0));
            }
            disposers.push(agent.ctx.tools.register({
              name: "team_coordination_mode",
              description: "Read or change the profile-wide Lead coordination mode on explicit user request. Changes preserve custom prompts; Lead only.",
              parameters: { type: "object", additionalProperties: false, required: ["action"], properties: {
                action: { type: "string", enum: ["status", "set"] },
                mode: { type: "string", enum: ["coordinator", "balanced"], description: "Required for set." },
                expectedMode: { type: "string", enum: ["coordinator", "balanced"], description: "Current mode from status; required for set." }
              } },
              output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
              execute: (args, exec) => {
                if (exec.agent !== agent) throw new Error("Invalid coordination mode caller");
                return coordination.operate(agent, args, exec.signal);
              }
            }, { when: ({ agent: caller }) => caller === agent && classify(ctx, agent).kind === "root" }));
            disposers.push(agent.ctx.tools.register({
              name: "team_hierarchy_status",
              description: "Read hierarchy, Team status and this plugin run\u2019s last observed member failure, if any. Lead only; does not change configuration or wake agents.",
              parameters: { type: "object", additionalProperties: false, properties: {} },
              output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
              execute: (_args, exec) => {
                if (exec.agent !== agent) throw new Error("Invalid status tool caller");
                return hierarchyStatus(agent);
              }
            }));
            disposers.push(agent.ctx.tools.register({
              name: "team_roles",
              description: "Read editable Team member roles, or update an existing member\u2019s display name, responsibility and instructions. Updates require the Lead and preserve conversation, model, permissions and immutable target. They do not wake the member.",
              parameters,
              output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
              execute: (args, exec) => {
                if (exec.agent !== agent) throw new Error("Invalid role tool caller");
                return manager.operate(agent, args, exec.signal);
              }
            }));
          }
          let scheduled = false;
          disposers.push(agent.ctx.on("tools/change", () => {
            if (scheduled || closing) return;
            scheduled = true;
            queueMicrotask(() => {
              scheduled = false;
              if (ctx.agents.get(agent.id) === agent && !closing) refresh();
            });
          }));
          refresh();
          return () => {
            disposed = true;
            for (const dispose of disposers.reverse()) dispose();
          };
        } catch (error) {
          for (const dispose of disposers.reverse()) dispose();
          throw error;
        }
      });
      state.ownerDispose = ctx.effect(() => state.dispose);
    } catch (error) {
      installations.delete(agent);
      const closingAgent = !state.dispose && error?.code === "INACTIVE_EFFECT" && (agent.ctx.fiber?.uid === null || agent.ctx.fiber?.state === FIBER_UNLOADING);
      const inactiveOwner = error?.code === "INACTIVE_EFFECT" && ownerClosing();
      try {
        await state.dispose?.();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Agent installation and rollback failed");
      }
      if (closingAgent || inactiveOwner) return;
      throw error;
    }
  }
  ctx.effect(() => ctx.tools.guard((exec) => guardDecision(ctx, BLOCKED, DENIAL, exec)));
  ctx.on("agent/created", async ({ agent }) => {
    await install(agent);
  });
  ctx.on("agent/disposed", ({ agent }) => {
    failures.disposeAgent(agent);
    const state = installations.get(agent);
    installations.delete(agent);
    state?.ownerDispose?.();
  });
  for (const agent of ctx.agents.list()) await install(agent);
  if (ownerClosing()) return;
  registerTaskManagement(ctx);
  ctx.effect(() => ctx.commands.register({
    name: "team-hierarchy",
    description: "Read current hierarchy identities and live depth/backend policy (no changes).",
    async handler({ agent }) {
      try {
        return { kind: "success", text: JSON.stringify(hierarchyStatus(agent)) };
      } catch (error) {
        return { kind: "error", text: error.message };
      }
    }
  }));
  ctx.effect(() => ctx.commands.register({
    name: "team-roles",
    description: "Read or edit persistent Team member role settings (JSON).",
    input: { hint: '{"action":"list"} or {"action":"update","target":"researcher","expectedRevision":0,"displayName":"\u8C03\u7814\u5458"}' },
    async handler({ agent, rawInput, signal }) {
      try {
        const value = await manager.operate(agent, rawInput.trim() ? JSON.parse(rawInput) : { action: "list" }, signal);
        return { kind: "success", text: JSON.stringify(value) };
      } catch (error) {
        return { kind: "error", text: error.message };
      }
    }
  }));
}
export {
  Config,
  apply,
  inject
};
