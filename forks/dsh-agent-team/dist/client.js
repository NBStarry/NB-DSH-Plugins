window.__ModuleLoader__.load({
  id: '@local/dsh-agent-team-fork',
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/experimental/client-ui-agent-team/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// packages/experimental/client-ui-agent-team/src/client/management.js
var R = __toESM(require("react"), 1);
var h = R.createElement;
var zh = {
  title: "\u56E2\u961F\u7BA1\u7406",
  close: "\u5173\u95ED",
  refresh: "\u5237\u65B0\u6210\u5458",
  loading: "\u6B63\u5728\u8BFB\u53D6\u56E2\u961F\u2026",
  save: "\u4FDD\u5B58\u8BBE\u5B9A",
  saving: "\u6B63\u5728\u4FDD\u5B58\u2026",
  label: "\u663E\u793A\u540D\u79F0",
  description: "\u804C\u8D23\u7B80\u4ECB",
  instructions: "\u5DE5\u4F5C\u6307\u4EE4",
  select: "\u9009\u62E9\u56E2\u961F\u6210\u5458",
  empty: "\u5C1A\u65E0\u56E2\u961F\u6210\u5458\u3002\u9700\u8981\u5206\u5DE5\u65F6\u8BA9\u8D1F\u8D23\u4EBA\u6309\u89D2\u8272\u521B\u5EFA\u3002",
  hint: "\u4FEE\u6539\u4FDD\u7559\u6210\u5458\u4E0A\u4E0B\u6587\uFF0C\u4ECE\u4E0B\u4E00\u6B21\u6A21\u578B\u8BF7\u6C42\u751F\u6548\uFF0C\u4E0D\u4F1A\u5524\u9192\u6216\u4E2D\u65AD\u6210\u5458\u3002\u5185\u90E8 target \u4E0D\u53D8\uFF1B\u4E0D\u4FEE\u6539\u6A21\u578B\u548C\u5DE5\u5177\u6743\u9650\u3002\u6E05\u7A7A\u5DE5\u4F5C\u6307\u4EE4\u53EF\u64A4\u9500\u9644\u52A0\u6307\u4EE4\u3002",
  readonly: "\u8BF7\u56DE\u5230\u56E2\u961F\u4E3B\u4F1A\u8BDD\u7F16\u8F91\u6210\u5458\u3002",
  saved: "\u5DF2\u4FDD\u5B58\uFF1B\u4E0B\u4E00\u6B21\u6A21\u578B\u8BF7\u6C42\u751F\u6548\u3002",
  capacity: "\u56E2\u961F\u6210\u5458",
  mode: "\u4EC5\u56E2\u961F\u6A21\u5F0F \xB7 \u666E\u901A\u5B50 Agent / workflow \u5DF2\u7981\u7528",
  failed: "\u8BE5\u6210\u5458\u521B\u5EFA\u5931\u8D25\u6216\u4ECD\u5728\u51C6\u5907\u4E2D\uFF0C\u4E0D\u80FD\u7F16\u8F91\u3002",
  error: "\u8BF7\u6C42\u5931\u8D25",
  dirty: "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF0C\u8BF7\u5148\u4FDD\u5B58\u6216\u64A4\u9500\u4FEE\u6539\u3002",
  discard: "\u653E\u5F03\u4FEE\u6539",
  target: "\u5185\u90E8 target",
  revision: "\u8BBE\u5B9A\u7248\u672C",
  safety: "\u89D2\u8272\u6307\u4EE4\u4E0D\u80FD\u8986\u76D6\u7CFB\u7EDF\u89C4\u5219\u6216\u6388\u4E88\u989D\u5916\u6743\u9650\u3002",
  capacityTitle: "\u56E2\u961F\u6210\u5458\u6570\u91CF\u4E0A\u9650",
  capacitySave: "\u4FDD\u5B58\u4E0A\u9650",
  capacityReset: "\u6062\u590D\u5F53\u524D\u503C",
  capacityHint: "\u9650\u5236\u6BCF\u4E2A\u56E2\u961F\u7D2F\u8BA1\u521B\u5EFA\u7684\u6210\u5458\u6570\uFF0C\u4E0D\u542B\u8D1F\u8D23\u4EBA\uFF0C\u521B\u5EFA\u5931\u8D25\u7684\u6210\u5458\u4E5F\u5360\u540D\u989D\u3002\u964D\u4F4E\u4E0A\u9650\u4E0D\u4F1A\u5220\u9664\u5DF2\u6709\u6210\u5458\u6216\u5386\u53F2\uFF1B\u5DF2\u8FBE\u5230\u4E0A\u9650\u7684\u56E2\u961F\u4E0D\u80FD\u7EE7\u7EED\u521B\u5EFA\u6210\u5458\u3002",
  capacityScope: "\u5F71\u54CD\u5F53\u524D\u914D\u7F6E\u4E0B\u7684\u5168\u90E8\u56E2\u961F\u3002\u4FDD\u5B58\u4F1A\u91CD\u8F7D\u56E2\u961F\u670D\u52A1\uFF0C\u4EC5\u5728\u5168\u90E8\u6210\u5458\u7A7A\u95F2\u65F6\u5141\u8BB8\u3002",
  capacitySaved: "\u4EBA\u6570\u4E0A\u9650\u5DF2\u4FDD\u5B58\uFF0C\u65E0\u9700\u65B0\u5EFA\u4F1A\u8BDD\u3002",
  policySummary: "\u4E3B\u4F1A\u8BDD\u5DE5\u4F5C\u6A21\u5F0F\u4E0E\u53EF\u7F16\u8F91\u63D0\u793A\u8BCD",
  policyMode: "\u4E3B\u4F1A\u8BDD\u5DE5\u4F5C\u6A21\u5F0F",
  coordinator: "\u9ED8\u8BA4\u56E2\u961F\u6267\u884C\uFF08\u4E3B\u4F1A\u8BDD\u8D1F\u8D23\u534F\u8C03\uFF09",
  balanced: "\u6309\u9700\u59D4\u6D3E\uFF08\u4E3B\u4F1A\u8BDD\u4E5F\u76F4\u63A5\u6267\u884C\uFF09",
  coordinatorPrompt: "\u9ED8\u8BA4\u534F\u8C03\u6A21\u5F0F \xB7 \u8D1F\u8D23\u4EBA\u63D0\u793A\u8BCD",
  balancedPrompt: "\u6309\u9700\u59D4\u6D3E\u6A21\u5F0F \xB7 \u8D1F\u8D23\u4EBA\u63D0\u793A\u8BCD",
  memberPrompt: "\u56E2\u961F\u6210\u5458\u901A\u7528\u63D0\u793A\u8BCD",
  policyHint: "\u8D1F\u8D23\u4EBA\u548C\u6267\u884C\u6210\u5458\u5206\u522B\u4F7F\u7528\u81EA\u5DF1\u7684\u63D0\u793A\u8BCD\uFF0C\u907F\u514D\u4E92\u76F8\u8F6C\u4EA4\u4EFB\u52A1\u3002\u4FDD\u5B58\u540E\u5728\u4E0B\u4E00\u6B21\u6A21\u578B\u6B65\u9AA4\u751F\u6548\uFF0C\u4E0D\u5524\u9192\u6210\u5458\uFF0C\u4E0D\u6E05\u7A7A\u4F1A\u8BDD\u3002\u4F5C\u7528\u4E8E\u5F53\u524D\u914D\u7F6E\u4E0B\u5168\u90E8\u4F1A\u8BDD\u3002",
  policyGuard: "\u8FD9\u91CC\u4FEE\u6539\u7684\u662F\u884C\u4E3A\u6307\u5BFC\uFF1B\u666E\u901A\u5B50 Agent / workflow \u4ECD\u88AB\u7981\u7528\u3002\u4E00\u7EA7\u6210\u5458\u4EC5\u53EF\u5728\u5B9E\u65F6\u6DF1\u5EA6\u914D\u7F6E\u5141\u8BB8\u65F6\u4F7F\u7528\u53D7\u63A7\u672C\u5730\u4E8C\u7EA7\u59D4\u6D3E\u3002",
  policyReset: "\u5168\u90E8\u6062\u590D\u7EE7\u627F\u9ED8\u8BA4\u503C",
  policyDiscard: "\u653E\u5F03\u672C\u9875\u4FEE\u6539",
  tasksTitle: "\u4EFB\u52A1\u4E0E\u5F52\u6863",
  activeTasks: "\u6D3B\u52A8\u4EFB\u52A1",
  archivedTasks: "\u5DF2\u5F52\u6863",
  archive: "\u5F52\u6863",
  unarchive: "\u6062\u590D",
  taskRefresh: "\u5237\u65B0\u4EFB\u52A1",
  taskSelect: "\u9009\u62E9\u4EFB\u52A1",
  taskEmpty: "\u6B64\u5217\u8868\u6682\u65E0\u4EFB\u52A1\u3002",
  taskHint: "\u5B8C\u6210\u4F46\u672A\u5F52\u6863\u7684\u4EFB\u52A1\u4ECD\u5360\u989D\u5EA6\uFF1B\u4EC5\u660E\u786E\u5F52\u6863\u624D\u91CA\u653E\u3002\u6062\u590D\u4FDD\u7559 ID\u3001\u8D1F\u8D23\u4EBA\u548C\u4F9D\u8D56\uFF0C\u4F46\u9700\u8981\u53EF\u7528\u989D\u5EA6\u3002",
  archiveUnsupported: "\u6B64 Host \u4E0D\u652F\u6301\u4EFB\u52A1\u5F52\u6863 v1\uFF1A\u4EC5\u53EF\u67E5\u770B\uFF0C\u4E0D\u4F1A\u6267\u884C\u5199\u5165\u3002",
  taskConfirm: "\u786E\u8BA4\u5904\u7406\u4EE5\u4E0B\u4EFB\u52A1\uFF1F\u9010\u9879\u68C0\u67E5\u7248\u672C\uFF1B\u6279\u91CF\u53EF\u80FD\u90E8\u5206\u6210\u529F\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002",
  cancel: "\u53D6\u6D88",
  confirm: "\u786E\u8BA4",
  partial: "\u90E8\u5206\u6216\u5168\u90E8\u64CD\u4F5C\u672A\u786E\u8BA4\uFF1B\u8BF7\u9010\u9879\u67E5\u770B\u7ED3\u679C\u5E76\u5237\u65B0\uFF0C\u52FF\u76F2\u76EE\u91CD\u8BD5\u3002",
  previous: "\u4E0A\u4E00\u9875",
  next: "\u4E0B\u4E00\u9875",
  rejected: "\u5DF2\u62D2\u7EDD",
  applied: "\u5DF2\u5E94\u7528",
  unconfirmed: "\u672A\u786E\u8BA4",
  "not-attempted": "\u672A\u5C1D\u8BD5",
  revisionLabel: "\u7248\u672C",
  modelsTitle: "\u6210\u5458\u6A21\u578B",
  modelsRefresh: "\u67E5\u8BE2\u6388\u6743\u6A21\u578B",
  modelsHint: "\u53EA\u5217\u51FA Host \u6743\u5A01\u6388\u6743\u8DEF\u7EBF\u3002\u4FDD\u5B58\u9700\u518D\u6B21\u6388\u6743\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5524\u9192\u6210\u5458\u6216\u6539\u53D8\u5168\u5C40\u9ED8\u8BA4\u503C\u3002",
  modelsUnsupported: "\u6388\u6743\u80FD\u529B\u4E0D\u53EF\u7528\u6216\u672A\u5141\u8BB8\u663E\u5F0F\u9009\u62E9\uFF1B\u6B64\u5904\u4EC5\u67E5\u770B\u3002",
  coldModel: "\u6210\u5458\u672A\u5728\u7EBF\uFF1A\u6B64\u5904\u4E0D\u5524\u9192\u3001\u4E0D\u5199\u5165\uFF0C\u8BF7\u5728\u660E\u786E\u6388\u6743\u5524\u9192\u540E\u53E6\u884C\u64CD\u4F5C\u3002",
  modelSelect: "\u6388\u6743\u6A21\u578B",
  modelSave: "\u5E94\u7528\u6240\u9009\u6A21\u578B",
  modelConfirm: "\u786E\u8BA4\u5728\u6B64\u6210\u5458\u4E0B\u4E00\u6B21\u672A\u51C6\u5907\u7684\u6A21\u578B\u6B65\u9AA4\u5E94\u7528\u6240\u9009\u8DEF\u7EBF\uFF1F",
  modelSaved: "\u9009\u62E9\u5DF2\u5E94\u7528\u5E76\u6301\u4E45\u5316\u3002",
  modelUnconfirmed: "\u7ED3\u679C\u672A\u5B8C\u5168\u786E\u8BA4\uFF1B\u9009\u62E9\u53EF\u80FD\u5DF2\u5E94\u7528\uFF0C\u8BF7\u5237\u65B0\u72B6\u6001\uFF0C\u4E0D\u8981\u76F4\u63A5\u91CD\u8BD5\u3002",
  policyUnavailable: "\u914D\u7F6E\u5C1A\u672A\u52A0\u8F7D\u6216\u63D2\u4EF6\u672A\u542F\u7528\u3002",
  policyConflict: "\u914D\u7F6E\u5DF2\u5728\u5176\u4ED6\u9875\u9762\u66F4\u6539\uFF1B\u8BF7\u653E\u5F03\u672C\u9875\u4FEE\u6539\u540E\u91CD\u65B0\u7F16\u8F91\u3002",
  policyFailed: "\u4FDD\u5B58\u672A\u88AB\u63A5\u53D7\uFF0C\u4FEE\u6539\u5DF2\u4FDD\u7559\u3002",
  policySaved: "\u6A21\u5F0F\u4E0E\u63D0\u793A\u8BCD\u5DF2\u4FDD\u5B58\u3002"
};
var en = {
  title: "Team management",
  close: "Close",
  refresh: "Refresh members",
  loading: "Reading team\u2026",
  save: "Save settings",
  saving: "Saving\u2026",
  label: "Display name",
  description: "Responsibility",
  instructions: "Work instructions",
  select: "Select a teammate",
  empty: "No teammates yet. Ask the Lead to create a role when needed.",
  hint: "Edits preserve context and apply on the next model request, without waking or interrupting a member. Internal targets, models and tool permissions stay unchanged. Clear instructions to remove the extra guidance.",
  readonly: "Open the Team Lead conversation to edit members.",
  saved: "Saved; applies on the next model request.",
  capacity: "Team members",
  mode: "Team-only mode \xB7 ordinary subagents / workflow disabled",
  failed: "Failed or provisioning members cannot be edited.",
  error: "Request failed",
  dirty: "Unsaved edits: save or discard before changing members.",
  discard: "Discard edits",
  target: "Internal target",
  revision: "Settings revision",
  safety: "Role instructions cannot override system policy or grant permissions.",
  capacityTitle: "Team member limit",
  capacitySave: "Save limit",
  capacityReset: "Reset to current value",
  capacityHint: "Limits cumulative teammate creation per Team, excluding the Lead and including failed creations. Lowering the limit deletes no members or history; Teams at the limit cannot create more members.",
  capacityScope: "Applies to every Team in this profile. Saving reloads the Team service and is allowed only when all teammates are idle.",
  capacitySaved: "Member limit saved; keep using this conversation.",
  policySummary: "Conversation mode and editable prompts",
  policyMode: "Main conversation mode",
  coordinator: "Team executes by default; main conversation coordinates",
  balanced: "Delegate as needed; main conversation may execute",
  coordinatorPrompt: "Coordinator mode \xB7 Lead prompt",
  balancedPrompt: "On-demand mode \xB7 Lead prompt",
  memberPrompt: "Shared teammate prompt",
  policyHint: "Leads and executors receive different prompts to avoid delegation loops. Saving applies on the next model step, without waking members or clearing conversations. Applies to every conversation in this profile.",
  policyGuard: "These fields guide behavior; ordinary subagent / workflow tools remain blocked. Level-1 members may use controlled local level-2 delegation only when the live depth policy allows it.",
  policyReset: "Restore all inherited defaults",
  policyDiscard: "Discard page edits",
  tasksTitle: "Tasks and archive",
  activeTasks: "Active tasks",
  archivedTasks: "Archived",
  archive: "Archive",
  unarchive: "Restore",
  taskRefresh: "Refresh tasks",
  taskSelect: "Select task",
  taskEmpty: "No tasks in this list.",
  taskHint: "Completed tasks still consume capacity until explicitly archived. Restore preserves IDs, owners and dependencies but requires capacity.",
  archiveUnsupported: "This Host lacks task archive v1. Read-only; no writes will be attempted.",
  taskConfirm: "Confirm these tasks? Each revision is checked separately. Batches may partially succeed; no automatic retries.",
  cancel: "Cancel",
  confirm: "Confirm",
  partial: "Some outcomes are unconfirmed. Inspect each result and refresh; do not blindly retry.",
  previous: "Previous page",
  next: "Next page",
  rejected: "Rejected",
  applied: "Applied",
  unconfirmed: "Unconfirmed",
  "not-attempted": "Not attempted",
  revisionLabel: "Revision",
  modelsTitle: "Member model",
  modelsRefresh: "Read authorized models",
  modelsHint: "Only Host-authorized routes are listed. Saving rechecks authorization, never wakes members or changes global defaults.",
  modelsUnsupported: "Authority is unavailable or explicit selection is disallowed. Read-only here.",
  coldModel: "Member is cold: this panel never wakes or writes to it. A wake requires a separate explicit request.",
  modelSelect: "Authorized model",
  modelSave: "Apply selected model",
  modelConfirm: "Apply this route on the member\u2019s next unprepared model step?",
  modelSaved: "Selection applied and durably saved.",
  modelUnconfirmed: "Outcome is not fully confirmed; selection may have applied. Refresh status before any retry.",
  policyUnavailable: "Configuration has not loaded or the plugin is disabled.",
  policyConflict: "Settings changed elsewhere. Discard these edits and edit again.",
  policyFailed: "Save was not accepted; your edits were kept.",
  policySaved: "Mode and prompts saved."
};
var css = `
/* Geometry follows DSH Modal, Button and Input; colors stay theme-owned.
   No runtime dependency on private UI components or hashed native classes. */
.local-team-admin-dialog{box-sizing:border-box;width:min(640px,calc(100vw - 48px));max-height:calc(100dvh - 48px);margin:auto;padding:0 0 24px;border:0;border-radius:28px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;overflow:auto;box-shadow:0 0 0 .5px var(--dsw-alias-border-l1),0 3px 8px color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent),0 0 20px color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.local-team-admin-dialog::backdrop{background:var(--dsw-alias-bg-mask-1,color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent));backdrop-filter:blur(4px)}
.local-team-admin-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.local-team-admin-dialog>.local-team-admin-head{padding:22px 14px 12px 24px}
.local-team-admin-dialog h2{margin:0;font-size:16px;line-height:24px;font-weight:500}
.local-team-admin-body{padding:0 24px;min-width:0}
.local-team-admin-dialog p{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.local-team-admin-dialog .local-team-admin-mode{display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;padding:3px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.local-team-admin-dialog label{display:grid;gap:6px;margin-top:16px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.local-team-admin-dialog input:not([type=checkbox]),.local-team-admin-dialog textarea,.local-team-admin-dialog select{box-sizing:border-box;width:100%;min-width:0;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4,var(--dsw-alias-border-l2));border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}
.local-team-admin-dialog textarea{height:144px;min-height:96px;padding:8px;resize:vertical;line-height:22px}
.local-team-admin-dialog select{padding-right:8px}
.local-team-admin-dialog input:not([type=checkbox]):focus,.local-team-admin-dialog textarea:focus,.local-team-admin-dialog select:focus{border-color:var(--dsw-alias-brand-primary)}
.local-team-admin-dialog input:disabled,.local-team-admin-dialog textarea:disabled,.local-team-admin-dialog select:disabled{opacity:.5;cursor:default}
.local-team-admin-dialog button,.local-team-admin-trigger{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;white-space:nowrap}
.local-team-admin-dialog button:disabled,.local-team-admin-trigger:disabled{opacity:.4;cursor:not-allowed}
.local-team-admin-dialog button:focus-visible,.local-team-admin-trigger:focus-visible,.local-team-admin-dialog summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.local-team-admin-dialog .local-team-admin-close{flex:none;width:28px;height:28px;padding:0;border-radius:8px;color:var(--dsw-alias-label-secondary)}
.local-team-admin-dialog .local-team-admin-compact{height:28px;padding:0 10px;border-radius:8px;font-size:12px;line-height:18px}
.local-team-admin-trigger{height:28px;padding:3px 2px;border-radius:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.local-team-admin-dialog .local-team-admin-primary{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}
.local-team-admin-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:.5px solid var(--dsw-alias-border-l1)}
.local-team-admin-dialog .local-team-admin-meta{margin-top:8px;font-size:12px;line-height:18px}
.local-team-admin-dialog .local-team-admin-capacity{margin:16px 0;padding:12px 0;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.local-team-admin-dialog summary{cursor:pointer;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.local-team-admin-dialog .local-team-admin-capacity[open] summary{margin-bottom:10px}
.local-team-admin-dialog .local-team-admin-check{display:flex;align-items:center;gap:6px;margin:10px 0;font-size:12px;line-height:20px;cursor:pointer}
.local-team-admin-dialog .local-team-admin-check input{flex:none;width:16px;height:16px;margin:0;padding:0;accent-color:var(--dsw-alias-brand-primary);cursor:inherit}
.local-team-admin-check input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.local-team-admin-dialog .local-team-admin-error,.local-team-admin-dialog .local-team-admin-saved{margin-top:12px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.local-team-admin-dialog .local-team-admin-error{color:var(--dsw-alias-state-error-primary)}
.local-team-admin-dialog .local-team-admin-saved{color:var(--dsw-alias-state-success-primary)}
@media(hover:hover){.local-team-admin-dialog button:hover:not(:disabled),.local-team-admin-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}.local-team-admin-dialog .local-team-admin-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}}
@media(max-width:480px){.local-team-admin-dialog{width:calc(100vw - 32px);max-height:calc(100dvh - 32px);border-radius:20px}.local-team-admin-body{padding:0 20px}.local-team-admin-dialog>.local-team-admin-head{padding-left:20px}.local-team-admin-footer{flex-wrap:wrap}}
`;
function TaskManagement({ execute, t }) {
  const [data, setData] = R.useState(null), [archived, setArchived] = R.useState(false), [selected, setSelected] = R.useState([]);
  const [pending, setPending] = R.useState(null), [results, setResults] = R.useState(null), [busy, setBusy] = R.useState(false), [error, setError] = R.useState("");
  const request = R.useRef(null);
  R.useEffect(() => () => request.current?.abort(), []);
  const run = async (args, after) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const value = await execute(args, controller.signal);
      if (!controller.signal.aborted) after(value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  const load = (offset = 0, showArchived = archived) => run({ action: "list", archived: showArchived, offset, limit: 25 }, (value) => {
    setData(value);
    setArchived(showArchived);
    setSelected([]);
    setPending(null);
  });
  const rows = (data?.tasks ?? []).filter((task) => !!task.archived === archived);
  const prepare = (items) => {
    setPending({ action: archived ? "unarchive" : "archive", items: items.map((task) => ({ taskId: task.id, expectedRevision: task.revision })) });
    setResults(null);
  };
  return h(
    "details",
    { className: "local-team-admin-capacity" },
    h("summary", null, t("tasksTitle")),
    h("p", null, t("taskHint")),
    h("button", { type: "button", disabled: busy || !!pending, onClick: () => load() }, t("taskRefresh")),
    data && !data.archiveSupported && h("p", null, t("archiveUnsupported")),
    h("div", null, ...[false, true].map((value) => h("button", { key: String(value), type: "button", disabled: busy || !!pending, "aria-pressed": archived === value, onClick: () => load(0, value) }, t(value ? "archivedTasks" : "activeTasks")))),
    data && h(
      "div",
      null,
      h("button", { type: "button", disabled: busy || !!pending || !data.offset, onClick: () => load(Math.max(0, data.offset - 25)) }, t("previous")),
      h("span", null, `${rows.length ? data.offset + 1 : data.offset}\u2013${data.offset + rows.length}`),
      h("button", { type: "button", disabled: busy || !!pending || data.nextOffset === null, onClick: () => load(data.nextOffset) }, t("next"))
    ),
    data && !rows.length && h("p", null, t("taskEmpty")),
    h("ul", { style: { paddingLeft: 20 } }, rows.map((task) => h(
      "li",
      { key: task.id },
      h("label", { className: "local-team-admin-check" }, h("input", { type: "checkbox", checked: selected.includes(task.id), disabled: busy || !!pending || !data.canEdit || task.status !== "completed", onChange: (e) => setSelected((old) => e.target.checked ? [...old, task.id] : old.filter((id) => id !== task.id)), "aria-label": `${t("taskSelect")} ${task.id}` }), `${task.subject ?? task.id} \xB7 ${task.status} \xB7 ${t("revisionLabel")} ${task.revision}`),
      h("button", { type: "button", disabled: busy || !!pending || !data.canEdit || task.status !== "completed", onClick: () => prepare([task]) }, t(archived ? "unarchive" : "archive"))
    ))),
    h("button", { type: "button", disabled: busy || !!pending || !data?.canEdit || !selected.length, onClick: () => prepare(rows.filter((task) => selected.includes(task.id))) }, `${t(archived ? "unarchive" : "archive")} (${selected.length})`),
    pending && h(
      "div",
      { role: "group", "aria-label": t("taskConfirm") },
      h("p", null, t("taskConfirm")),
      h("p", null, pending.items.map((item) => `${item.taskId}@${item.expectedRevision}`).join(", ")),
      h("button", { type: "button", disabled: busy, onClick: () => setPending(null) }, t("cancel")),
      h("button", { type: "button", disabled: busy, onClick: () => run(pending, (value) => {
        setResults(value);
        setPending(null);
        setSelected([]);
        setData(null);
      }) }, t(busy ? "saving" : "confirm"))
    ),
    error && h("p", { role: "alert" }, error),
    results && h("div", { role: "status" }, !results.allApplied && h("p", null, t("partial")), h("ul", null, results.results.map((result) => h("li", { key: result.taskId }, `${result.taskId}: ${t(result.outcome)}${result.error ? ` \u2014 ${result.error}` : ""}`))))
  );
}
function MemberModel({ target, execute, t, canEdit }) {
  const [data, setData] = R.useState(null), [route, setRoute] = R.useState(""), [confirm, setConfirm] = R.useState(false);
  const [busy, setBusy] = R.useState(false), [error, setError] = R.useState(""), [notice, setNotice] = R.useState("");
  const request = R.useRef(null);
  R.useEffect(() => {
    setData(null);
    setRoute("");
    setConfirm(false);
    setError("");
    setNotice("");
    return () => request.current?.abort();
  }, [target]);
  const run = async (work, after) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await work(controller.signal);
      if (!controller.signal.aborted) after(value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  const load = () => run((signal) => Promise.all([execute({ action: "routes", target }, signal), execute({ action: "status", target }, signal)]), ([authority, status]) => {
    setData({ authority, status });
    setRoute("");
    setConfirm(false);
  });
  const options = data?.authority?.routes ?? [];
  const writable = canEdit && data?.status.live && data?.authority.explicitSelection && !data?.authority.failClosed;
  return h(
    "details",
    { className: "local-team-admin-capacity" },
    h("summary", null, t("modelsTitle")),
    h("p", null, t("modelsHint")),
    h("button", { type: "button", disabled: busy, onClick: load }, t("modelsRefresh")),
    data && !data.status.live && h("p", null, t("coldModel")),
    data && !writable && h("p", null, `${t("modelsUnsupported")} ${data.authority.reason ?? ""}`),
    data && h("p", null, `${data.status.selection?.provider ?? "\u2014"} / ${data.status.selection?.model ?? "\u2014"}`),
    h("label", null, t("modelSelect"), h("select", { value: route, disabled: busy || !writable || confirm, onChange: (e) => setRoute(e.target.value) }, h("option", { value: "" }, "\u2014"), options.map((item, index) => h("option", { key: `${item.provider}/${item.model}`, value: String(index) }, `${item.provider} / ${item.model}`)))),
    h("button", { type: "button", disabled: busy || !writable || route === "" || confirm, onClick: () => setConfirm(true) }, t("modelSave")),
    confirm && h(
      "div",
      { role: "group", "aria-label": t("modelConfirm") },
      h("p", null, t("modelConfirm")),
      h("button", { type: "button", disabled: busy, onClick: () => setConfirm(false) }, t("cancel")),
      h("button", { type: "button", disabled: busy || !writable, onClick: () => run(async (signal) => {
        try {
          return await execute({ action: "set", target, expectedSelection: data.status.selection, ...options[Number(route)], wake: false }, signal);
        } finally {
          if (!signal.aborted) {
            setData(null);
            setConfirm(false);
          }
        }
      }, (value) => {
        setNotice(t(value.applied === true && value.saved === true && !value.error ? "modelSaved" : "modelUnconfirmed"));
        setData(null);
        setConfirm(false);
      }) }, t(busy ? "saving" : "confirm"))
    ),
    error && h("p", { role: "alert" }, error),
    notice && h("p", { role: "status" }, notice)
  );
}
function TeamSettings({ sessionId, execute, executeCapacity, executeTasks, executeModel, t, useAccess, onOpenChange }) {
  const allowed = useAccess("commands/execute");
  const [open, setOpen] = R.useState(false);
  R.useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  const [data, setData] = R.useState(null);
  const [target, setTarget] = R.useState("");
  const [draft, setDraft] = R.useState(null);
  const [dirty, setDirty] = R.useState(false);
  const [busy, setBusy] = R.useState(false);
  const [notice, setNotice] = R.useState("");
  const [error, setError] = R.useState("");
  const [capacityDraft, setCapacityDraft] = R.useState("");
  const capacityDirty = data !== null && capacityDraft !== String(data.limit);
  const capacityValid = /^\d+$/.test(capacityDraft) && Number.isSafeInteger(Number(capacityDraft)) && Number(capacityDraft) >= 1;
  const dialog = R.useRef(null);
  const trigger = R.useRef(null);
  const request = R.useRef(null);
  const titleId = R.useId();
  const row = data?.members.find((x) => x.target === target);
  const select = (member) => {
    setTarget(member?.target ?? "");
    setDraft(member ? { displayName: member.displayName, description: member.description, instructions: member.instructions } : null);
    setDirty(false);
  };
  const run = async (args, after, executor = execute) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await executor(args, controller.signal);
      if (controller.signal.aborted) return;
      after(value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message || t("error"));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  const load = () => {
    if (dirty || capacityDirty) {
      setError(t("dirty"));
      return;
    }
    run({ action: "list" }, (value) => {
      setData(value);
      setCapacityDraft(String(value.limit));
      select(value.members.find((x) => x.target === target) ?? value.members[0]);
    });
  };
  R.useEffect(() => {
    setOpen(false);
    setData(null);
    setDraft(null);
    setTarget("");
    setDirty(false);
    setCapacityDraft("");
    setError("");
    setNotice("");
  }, [sessionId]);
  R.useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    load();
    return () => {
      request.current?.abort();
      dialog.current?.close();
    };
  }, [open, sessionId]);
  const close = () => {
    if (busy) return;
    if (dirty || capacityDirty) {
      setError(t("dirty"));
      return;
    }
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus());
  };
  const change = (name, value) => {
    setDraft((old) => ({ ...old, [name]: value }));
    setDirty(true);
    setNotice("");
  };
  const save = () => run({ action: "update", target, expectedRevision: row.revision, ...draft }, (value) => {
    const member = value.member;
    setData((old) => ({ ...old, members: old.members.map((x) => x.target === member.target ? member : x) }));
    select(member);
    setNotice(t("saved"));
  });
  return h(
    R.Fragment,
    null,
    h("style", null, css),
    h("button", { ref: trigger, type: "button", className: "local-team-admin-trigger", disabled: !allowed, onClick: () => setOpen(true), "aria-haspopup": "dialog" }, t("title")),
    open && h(
      "dialog",
      { ref: dialog, className: "local-team-admin-dialog", "aria-labelledby": titleId, onCancel: (e) => {
        e.preventDefault();
        close();
      }, onClick: (e) => {
        if (e.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
        }
      } },
      h("div", { className: "local-team-admin-head" }, h("h2", { id: titleId }, t("title")), h("button", { type: "button", className: "local-team-admin-close", "aria-label": t("close"), title: t("close"), disabled: busy, onClick: close }, h("svg", { width: 16, height: 16, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true }, h("path", { d: "M5 5l10 10M15 5L5 15", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })))),
      h(
        "div",
        { className: "local-team-admin-body" },
        h("p", { className: "local-team-admin-mode" }, t("mode")),
        h("p", null, t("hint")),
        h("div", { className: "local-team-admin-head" }, h("span", null, data ? `${t("capacity")} ${data.members.length} / ${data.limit ?? "\u2014"}` : t("loading")), h("button", { type: "button", className: "local-team-admin-compact", disabled: busy || dirty || capacityDirty, onClick: load }, t("refresh"))),
        data && !data.canEdit && h("p", null, t("readonly")),
        data?.canEdit && h(
          "details",
          { className: "local-team-admin-capacity" },
          h("summary", null, t("capacityTitle")),
          h(
            "form",
            { onSubmit: (e) => {
              e.preventDefault();
              if (busy || dirty || !capacityDirty || !capacityValid) return;
              run({ action: "set", limit: Number(capacityDraft), expectedLimit: data.limit }, (value) => {
                setData((old) => ({ ...old, limit: value.limit }));
                setCapacityDraft(String(value.limit));
                setNotice(t("capacitySaved"));
              }, executeCapacity);
            } },
            h("label", null, t("capacityTitle"), h("input", { type: "number", min: 1, max: Number.MAX_SAFE_INTEGER, step: 1, inputMode: "numeric", required: true, value: capacityDraft, disabled: busy, onChange: (e) => {
              setCapacityDraft(e.target.value);
              setNotice("");
            } })),
            h("p", null, t("capacityHint")),
            h("p", null, t("capacityScope")),
            h(
              "div",
              { className: "local-team-admin-footer" },
              h("button", { type: "button", disabled: busy || !capacityDirty, onClick: () => {
                setCapacityDraft(String(data.limit));
                setError("");
              } }, t("capacityReset")),
              h("button", { type: "submit", className: "local-team-admin-primary", disabled: busy || dirty || !capacityDirty || !capacityValid }, t(busy ? "saving" : "capacitySave"))
            )
          )
        ),
        error && h("p", { role: "alert", className: "local-team-admin-error" }, error),
        notice && h("p", { role: "status", className: "local-team-admin-saved" }, notice),
        executeTasks && h(TaskManagement, { execute: executeTasks, t }),
        target && executeModel && h(MemberModel, { key: target, target, execute: executeModel, canEdit: !!data?.canEdit, t }),
        data?.members.length === 0 && h("p", null, t("empty")),
        !!data?.members.length && h("label", null, t("select"), h("select", { value: target, disabled: busy || dirty, onChange: (e) => {
          select(data.members.find((x) => x.target === e.target.value));
          setNotice("");
          setError("");
        } }, data.members.map((x) => h("option", { value: x.target, key: x.target }, `${x.displayName} \xB7 ${x.target} \xB7 ${x.status}`)))),
        row && draft && h(
          "form",
          { onSubmit: (e) => {
            e.preventDefault();
            save();
          } },
          h("p", { className: "local-team-admin-meta" }, `${t("target")}: ${target} \xB7 ${t("revision")}: ${row.revision}${row.model ? ` \xB7 ${row.model}` : ""}`),
          (row.status === "failed" || row.status === "provisioning") && h("p", null, t("failed")),
          h(
            "fieldset",
            { disabled: busy || !data.canEdit || row.status === "failed" || row.status === "provisioning", style: { border: 0, padding: 0, margin: 0 } },
            h("label", null, t("label"), h("input", { value: draft.displayName, maxLength: 64, required: true, onChange: (e) => change("displayName", e.target.value) })),
            h("label", null, t("description"), h("input", { value: draft.description, maxLength: 200, onChange: (e) => change("description", e.target.value) })),
            h("label", null, t("instructions"), h("textarea", { value: draft.instructions, maxLength: 4e3, onChange: (e) => change("instructions", e.target.value) })),
            h("p", null, t("safety")),
            h("div", { className: "local-team-admin-footer" }, h("button", { type: "button", disabled: !dirty, onClick: () => {
              select(row);
              setError("");
            } }, t("discard")), h("button", { type: "submit", className: "local-team-admin-primary", disabled: !dirty }, t(busy ? "saving" : "save")))
          )
        )
      )
    )
  );
}
var policyKeys = ["mode", "coordinatorPrompt", "balancedPrompt", "memberPrompt"];
var policyCss = `.local-team-policy{font:inherit;color:var(--dsw-alias-label-primary);max-width:760px}.local-team-policy p{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.local-team-policy label{display:grid;gap:6px;margin-top:20px;font-size:14px;line-height:22px}.local-team-policy select,.local-team-policy textarea{box-sizing:border-box;width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:8px;outline:none}.local-team-policy select{height:36px;padding:0 8px}.local-team-policy textarea{min-height:160px;resize:vertical;line-height:22px}.local-team-policy select:focus,.local-team-policy textarea:focus{border-color:var(--dsw-alias-brand-primary)}.local-team-policy footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:20px}.local-team-policy button{height:36px;padding:0 14px;border:0;border-radius:12px;background:transparent;color:inherit;font:inherit;cursor:pointer}.local-team-policy button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}.local-team-policy button[type=submit]{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,var(--dsw-alias-bg-base))}.local-team-policy button:disabled,.local-team-policy fieldset:disabled{opacity:.5;cursor:default}.local-team-policy button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.local-team-policy [role=alert]{color:var(--dsw-alias-state-error-primary)}.local-team-policy [role=status]{color:var(--dsw-alias-state-success-primary)}`;
function PolicyConfig({ view, form, t }) {
  if (view === "summary") return h("span", null, t("policySummary"));
  return h(PolicyEditor, { form, t });
}
function PolicyEditor({ form, t }) {
  const [edits, setEdits] = R.useState(null);
  const [busy, setBusy] = R.useState(false);
  const [error, setError] = R.useState("");
  const [saved, setSaved] = R.useState(false);
  const state = form?.state;
  if (state?.status !== "ready" || !state.value) return h("p", null, t("policyUnavailable"));
  const values = edits?.value ?? state.value;
  const conflict = edits !== null && edits.revision !== state.revision;
  const change = (key, value) => {
    setEdits((old) => ({ value: { ...old?.value ?? state.value, [key]: value }, revision: old?.revision ?? state.revision }));
    setSaved(false);
    setError("");
  };
  const submit = async (reset) => {
    if (busy || !state.writable || !reset && (!edits || conflict)) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const ops = (reset ? policyKeys : policyKeys.filter((key) => edits.value[key] !== state.value[key])).map((key) => reset ? { op: "unset", path: [key] } : { op: "set", path: [key], value: edits.value[key] });
      if (!ops.length) {
        setEdits(null);
        return;
      }
      const accepted = await form.mutate(ops, reset ? state.revision : edits.revision);
      if (!accepted) {
        setError(t("policyFailed"));
        return;
      }
      setEdits(null);
      setSaved(true);
    } catch (e) {
      setError(e.message || t("policyFailed"));
    } finally {
      setBusy(false);
    }
  };
  const leadField = values.mode === "coordinator" ? "coordinatorPrompt" : "balancedPrompt";
  return h(
    "form",
    { className: "local-team-policy", onSubmit: (e) => {
      e.preventDefault();
      submit(false);
    } },
    h("style", null, policyCss),
    h("p", null, t("policyHint")),
    h("p", null, t("policyGuard")),
    conflict && h("p", { role: "alert" }, t("policyConflict")),
    error && h("p", { role: "alert" }, error),
    saved && h("p", { role: "status" }, t("policySaved")),
    h(
      "fieldset",
      { disabled: busy || !state.writable, style: { padding: 0, border: 0, margin: 0 } },
      h("label", null, t("policyMode"), h(
        "select",
        { value: values.mode, onChange: (e) => change("mode", e.target.value) },
        h("option", { value: "coordinator" }, t("coordinator")),
        h("option", { value: "balanced" }, t("balanced"))
      )),
      h("label", null, t(leadField), h("textarea", { value: values[leadField], maxLength: 12e3, rows: 8, onChange: (e) => change(leadField, e.target.value) })),
      h("label", null, t("memberPrompt"), h("textarea", { value: values.memberPrompt, maxLength: 12e3, rows: 6, onChange: (e) => change("memberPrompt", e.target.value) })),
      h(
        "footer",
        null,
        h("button", { type: "button", disabled: !!edits, onClick: () => submit(true) }, t("policyReset")),
        h("button", { type: "button", disabled: !edits, onClick: () => {
          setEdits(null);
          setError("");
          setSaved(false);
        } }, t("policyDiscard")),
        h("button", { type: "submit", disabled: !edits || conflict }, t(busy ? "saving" : "save"))
      )
    )
  );
}

// packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx
var import_react = require("react");
var import_react_dom = require("react-dom");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// packages/experimental/client-ui-agent-team/src/client/TeamAction.module.css
var TeamAction_default = {
  root: "TeamAction_root",
  trigger: "TeamAction_trigger",
  triggerLabel: "TeamAction_triggerLabel",
  count: "TeamAction_count",
  panel: "TeamAction_panel",
  panelCompact: "TeamAction_panelCompact",
  roster: "TeamAction_roster",
  body: "TeamAction_body",
  taskTitle: "TeamAction_taskTitle",
  member: "TeamAction_member",
  memberCurrent: "TeamAction_memberCurrent",
  memberDot: "TeamAction_memberDot",
  inactiveIcon: "TeamAction_inactiveIcon",
  memberText: "TeamAction_memberText",
  memberName: "TeamAction_memberName",
  memberNameText: "TeamAction_memberNameText",
  memberModel: "TeamAction_memberModel",
  currentTag: "TeamAction_currentTag",
  meta: "TeamAction_meta",
  diagnostic: "TeamAction_diagnostic",
  error: "TeamAction_error",
  warning: "TeamAction_warning",
  tasks: "TeamAction_tasks",
  emptyNotice: "TeamAction_emptyNotice",
  task: "TeamAction_task",
  taskState: "TeamAction_taskState",
  clampedDescription: "TeamAction_clampedDescription",
  expandToggle: "TeamAction_expandToggle",
  expandToggleOpen: "TeamAction_expandToggleOpen",
  notice: "TeamAction_notice"
};

// packages/experimental/client-ui-agent-team/src/client/TeamAction.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function statusKey(status) {
  switch (status) {
    case "pending":
      return "status.pending";
    case "in_progress":
      return "status.in_progress";
    case "completed":
      return "status.completed";
    /* v8 ignore next -- Team views omit deleted task tombstones. */
    case "deleted":
      return "status.completed";
  }
}
function memberStatusKey(status) {
  switch (status) {
    case "running":
      return "memberStatus.running";
    case "inactive":
      return "memberStatus.inactive";
    case "provisioning":
      return "memberStatus.provisioning";
    case "failed":
      return "memberStatus.failed";
  }
}
function memberDotState(status) {
  switch (status) {
    case "running":
    case "provisioning":
      return "ongoing";
    case "failed":
      return "error";
  }
}
function taskDotState(task) {
  switch (task.status) {
    case "pending":
      return task.ready ? "idle" : "warning";
    case "in_progress":
      return "ongoing";
    case "completed":
      return "done";
    /* v8 ignore next -- Team views omit deleted task tombstones. */
    case "deleted":
      return "idle";
  }
}
function TeamMemberRow({
  member,
  memberCount,
  sessionId,
  useSessions,
  useSessionStatus,
  openTeammate,
  onError,
  t
}) {
  const model = useSessions((state) => state.projectionsBySession[member.id]?.values.modelSelection?.next?.model);
  const running = useSessionStatus((state) => state.get(member.id)?.running);
  const summaryRunning = useSessions((state) => state.byId[member.id]?.running);
  const status = member.phase === "active" ? (running ?? summaryRunning) === true ? "running" : "inactive" : member.phase;
  const isCurrent = member.id === sessionId;
  const highlightCurrent = isCurrent && memberCount > 1;
  const inert = isCurrent || status === "failed" || status === "provisioning";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: t("open"), side: "bottom", gap: 4, disabled: inert, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: highlightCurrent ? `${TeamAction_default.member} ${TeamAction_default.memberCurrent}` : TeamAction_default.member,
      disabled: inert,
      onClick: () => {
        try {
          openTeammate(sessionId, member.id);
        } catch (reason) {
          onError(String(reason));
        }
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: TeamAction_default.memberDot, children: status === "inactive" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconUserOutlineRegular, { size: 14, className: TeamAction_default.inactiveIcon }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: memberDotState(status) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: TeamAction_default.memberText, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: TeamAction_default.memberName, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: TeamAction_default.memberNameText, children: member.name }),
            isCurrent && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "info", className: TeamAction_default.currentTag, children: t("current") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
            t(memberStatusKey(status)),
            model !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: TeamAction_default.memberModel, children: ` \xB7 ${t("model")}: ${model}` })
          ] }),
          member.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { className: TeamAction_default.diagnostic, children: member.error })
        ] })
      ]
    }
  ) });
}
function TaskCard({ task, t }) {
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [clamped, setClamped] = (0, import_react.useState)(false);
  const textRef = (0, import_react.useRef)(null);
  (0, import_react.useLayoutEffect)(() => {
    if (expanded) return;
    const paragraph = textRef.current;
    if (paragraph === null) return;
    const measure = () => {
      setClamped(paragraph.scrollHeight > paragraph.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => {
      observer.disconnect();
    };
  }, [task.description, expanded]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: TeamAction_default.task, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: TeamAction_default.taskTitle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: task.subject }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: TeamAction_default.taskState, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: taskDotState(task) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t(statusKey(task.status)) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { ref: textRef, className: expanded ? void 0 : TeamAction_default.clampedDescription, children: task.description }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: TeamAction_default.meta, children: [
      (clamped || expanded) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          className: TeamAction_default.expandToggle,
          "aria-expanded": expanded,
          onClick: () => {
            setExpanded((current) => !current);
          },
          children: [
            t(expanded ? "task.collapse" : "task.expand"),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 12, className: expanded ? TeamAction_default.expandToggleOpen : void 0 })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: task.id }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t("owner"),
        ": ",
        task.ownerName ?? t("unowned")
      ] }),
      task.status === "pending" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: task.ready ? t("ready") : t("blocked") }),
      task.blockedBy.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t("blockedBy"),
        ": ",
        task.blockedBy.join(", ")
      ] }),
      task.writeScopes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t("writeScopes"),
        ": ",
        task.writeScopes.join(", ")
      ] }),
      task.writeScopeWarnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: TeamAction_default.warning, children: warning }, warning))
    ] })
  ] });
}
function TeamAction({
  sessionId,
  useSession,
  useSessions,
  useSessionStatus,
  useAccess,
  openTeammate,
  executeManagement,
  t
}) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [managementOpen, setManagementOpen] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const rootRef = (0, import_react.useRef)(null);
  const triggerRef = (0, import_react.useRef)(null);
  const triggerLabelRef = (0, import_react.useRef)(null);
  const panelRef = (0, import_react.useRef)(null);
  const position = (0, import_dsh_client_ui_primitives.useAnchoredPosition)({
    open,
    anchorRef: triggerRef,
    panelRef,
    gap: 5,
    margin: 16
  });
  const positioned = position !== null;
  const leadSessionId = useSession((snapshot) => snapshot.subagent?.address.parentSessionId) ?? sessionId;
  const team = useSessions((state) => state.projectionsBySession[leadSessionId]?.values.agentTeam);
  const opening = useSession((snapshot) => snapshot.openState === "loading");
  const listing = useSessions((state) => state.phase === "pending");
  const hoverTimer = (0, import_react.useRef)(void 0);
  const pinnedRef = (0, import_react.useRef)(false);
  const cancelHoverChange = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = void 0;
  };
  (0, import_react.useEffect)(() => {
    cancelHoverChange();
    pinnedRef.current = false;
    setOpen(false);
    setError(null);
  }, [sessionId]);
  (0, import_react.useEffect)(() => cancelHoverChange, []);
  const managementChanged = (0, import_react.useCallback)((next) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = void 0;
    if (next) pinnedRef.current = true;
    setManagementOpen(next);
  }, []);
  (0, import_react.useLayoutEffect)(() => {
    if (open && positioned && pinnedRef.current) panelRef.current?.focus();
  }, [open, positioned]);
  const changeOpen = (next) => {
    cancelHoverChange();
    if (!next) pinnedRef.current = false;
    setOpen(next);
  };
  const scheduleHoverOpen = () => {
    cancelHoverChange();
    if (open) return;
    const label = triggerLabelRef.current;
    if (label === null) return;
    if (getComputedStyle(label).display === "none") return;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = void 0;
      changeOpen(true);
    }, 150);
  };
  const scheduleHoverClose = () => {
    cancelHoverChange();
    if (pinnedRef.current || managementOpen) return;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = void 0;
      changeOpen(false);
    }, 120);
  };
  (0, import_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open && !managementOpen, changeOpen, panelRef);
  (0, import_react.useEffect)(() => {
    if (!open || managementOpen) return;
    const dismiss = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelHoverChange();
      pinnedRef.current = false;
      setOpen(false);
      if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    };
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
    };
  }, [open, managementOpen]);
  const compact = team !== void 0 && team.members.length === 1 && team.tasks.length === 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      ref: rootRef,
      className: TeamAction_default.root,
      "data-team-action": true,
      onMouseLeave: scheduleHoverClose,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            ref: triggerRef,
            onMouseEnter: scheduleHoverOpen,
            className: TeamAction_default.trigger,
            "aria-label": t("trigger"),
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            onClick: () => {
              cancelHoverChange();
              pinnedRef.current = true;
              if (!open) changeOpen(true);
              else panelRef.current?.focus();
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconUsersOutlineRegular, { size: 14 }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { ref: triggerLabelRef, className: TeamAction_default.triggerLabel, children: t("trigger") })
            ]
          }
        ),
        open && (0, import_react_dom.createPortal)(
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              ref: panelRef,
              className: compact ? `${TeamAction_default.panel} ${TeamAction_default.panelCompact}` : TeamAction_default.panel,
              style: position ?? { visibility: "hidden", left: 0, top: 0 },
              role: "dialog",
              tabIndex: -1,
              "aria-label": t("trigger"),
              "data-team-panel": true,
              onMouseEnter: cancelHoverChange,
              onMouseLeave: scheduleHoverClose,
              children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: TeamAction_default.body, children: [
                executeManagement !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  TeamSettings,
                  {
                    sessionId,
                    execute: (args, signal) => executeManagement(sessionId, "team-roles", args, signal),
                    executeCapacity: (args, signal) => executeManagement(sessionId, "team-capacity", args, signal),
                    executeTasks: (args, signal) => executeManagement(sessionId, "team-manage-tasks", args, signal),
                    executeModel: (args, signal) => executeManagement(sessionId, "team-model", args, signal),
                    t: (key) => t(`manage.${key}`),
                    useAccess,
                    onOpenChange: managementChanged
                  }
                ),
                error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: TeamAction_default.error, role: "alert", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: "error" }),
                  error
                ] }),
                team === void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: TeamAction_default.notice, role: "status", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: opening || listing ? "ongoing" : "warning" }),
                  t(opening || listing ? "loading" : "unavailable")
                ] }),
                team !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                  team.failure !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: TeamAction_default.error, role: "alert", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: "error" }),
                    t("failure", { message: team.failure })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: [
                      t("roster"),
                      team.members.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: TeamAction_default.count, children: team.members.length })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: TeamAction_default.roster, children: team.members.map((member) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      TeamMemberRow,
                      {
                        member,
                        memberCount: team.members.length,
                        sessionId,
                        useSessions,
                        useSessionStatus,
                        openTeammate,
                        onError: setError,
                        t
                      },
                      member.id
                    )) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { children: team.tasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: TeamAction_default.emptyNotice, children: t("empty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: [
                      t("tasks"),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: TeamAction_default.count, children: team.tasks.length })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: TeamAction_default.tasks, children: team.tasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TaskCard, { task, t }, task.id)) })
                  ] }) })
                ] })
              ] })
            }
          ),
          document.body
        )
      ]
    }
  );
}

// packages/experimental/client-ui-agent-team/src/client/locales.ts
function managementDictionary(source) {
  return Object.fromEntries(Object.entries(source).map(([key, text]) => [`manage.${key}`, text]));
}
var NS = "agent-team";
var zh2 = {
  ...managementDictionary(zh),
  trigger: "\u667A\u80FD\u4F53\u56E2\u961F",
  loading: "\u6B63\u5728\u52A0\u8F7D\u56E2\u961F\u2026",
  unavailable: "Team \u6682\u4E0D\u53EF\u7528",
  failure: "\u56E2\u961F\u6301\u4E45\u8BB0\u5F55\u65E0\u6548\uFF1A{message}",
  empty: "\u6682\u65E0\u5171\u4EAB\u4EFB\u52A1\uFF0C\u53EF\u4EE5\u901A\u8FC7\u5BF9\u8BDD\u521B\u5EFA",
  roster: "\u6210\u5458",
  tasks: "\u5171\u4EAB\u4EFB\u52A1",
  model: "\u6A21\u578B",
  open: "\u6253\u5F00\u6210\u5458\u4F1A\u8BDD",
  current: "\u5F53\u524D\u4F1A\u8BDD",
  owner: "Owner",
  unowned: "\u672A\u5206\u914D",
  blockedBy: "\u4F9D\u8D56",
  writeScopes: "\u5199\u5165\u8303\u56F4",
  ready: "\u53EF\u5F00\u59CB",
  blocked: "\u88AB\u4F9D\u8D56\u963B\u585E",
  "task.expand": "\u5C55\u5F00",
  "task.collapse": "\u6536\u8D77",
  "memberStatus.running": "\u8FD0\u884C\u4E2D",
  "memberStatus.inactive": "\u672A\u8FD0\u884C",
  "memberStatus.provisioning": "\u51C6\u5907\u4E2D",
  "memberStatus.failed": "\u5931\u8D25",
  "status.pending": "\u5F85\u5904\u7406",
  "status.in_progress": "\u8FDB\u884C\u4E2D",
  "status.completed": "\u5DF2\u5B8C\u6210"
};
var en2 = {
  ...managementDictionary(en),
  trigger: "Agent team",
  loading: "Loading team\u2026",
  unavailable: "Team is unavailable",
  failure: "Invalid persisted team record: {message}",
  empty: "No shared tasks yet. Create them through the conversation.",
  roster: "Members",
  tasks: "Shared tasks",
  model: "Model",
  open: "Open member conversation",
  current: "Current chat",
  owner: "Owner",
  unowned: "Unowned",
  blockedBy: "Blocked by",
  writeScopes: "Write scopes",
  ready: "Ready",
  blocked: "Blocked by dependencies",
  "task.expand": "Show more",
  "task.collapse": "Show less",
  "memberStatus.running": "Running",
  "memberStatus.inactive": "Inactive",
  "memberStatus.provisioning": "Provisioning",
  "memberStatus.failed": "Failed",
  "status.pending": "Pending",
  "status.in_progress": "In progress",
  "status.completed": "Completed"
};
var ja = {
  ...managementDictionary(en),
  "trigger": "\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30C1\u30FC\u30E0",
  "loading": "\u30C1\u30FC\u30E0\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026",
  "unavailable": "\u30C1\u30FC\u30E0\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093",
  "failure": "\u4FDD\u5B58\u3055\u308C\u305F\u30C1\u30FC\u30E0\u30EC\u30B3\u30FC\u30C9\u304C\u7121\u52B9\u3067\u3059: {message}",
  "empty": "\u5171\u6709\u30BF\u30B9\u30AF\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002\u4F1A\u8A71\u304B\u3089\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "roster": "\u30E1\u30F3\u30D0\u30FC",
  "tasks": "\u5171\u6709\u30BF\u30B9\u30AF",
  "model": "\u30E2\u30C7\u30EB",
  "open": "\u30E1\u30F3\u30D0\u30FC\u306E\u4F1A\u8A71\u3092\u958B\u304F",
  "current": "\u73FE\u5728\u306E\u30C1\u30E3\u30C3\u30C8",
  "owner": "\u30AA\u30FC\u30CA\u30FC",
  "unowned": "\u30AA\u30FC\u30CA\u30FC\u306A\u3057",
  "blockedBy": "\u30D6\u30ED\u30C3\u30AF\u5143",
  "writeScopes": "\u66F8\u304D\u8FBC\u307F\u30B9\u30B3\u30FC\u30D7",
  "ready": "\u6E96\u5099\u5B8C\u4E86",
  "blocked": "\u4F9D\u5B58\u95A2\u4FC2\u306B\u3088\u308A\u30D6\u30ED\u30C3\u30AF\u4E2D",
  "task.expand": "\u3082\u3063\u3068\u898B\u308B",
  "task.collapse": "\u6298\u308A\u305F\u305F\u3080",
  "memberStatus.running": "\u5B9F\u884C\u4E2D",
  "memberStatus.inactive": "\u975E\u30A2\u30AF\u30C6\u30A3\u30D6",
  "memberStatus.provisioning": "\u30D7\u30ED\u30D3\u30B8\u30E7\u30CB\u30F3\u30B0\u4E2D",
  "memberStatus.failed": "\u5931\u6557",
  "status.pending": "\u4FDD\u7559\u4E2D",
  "status.in_progress": "\u9032\u884C\u4E2D",
  "status.completed": "\u5B8C\u4E86"
};
var es = {
  ...managementDictionary(en),
  trigger: "equipo de agentes",
  loading: "Cargando equipo\u2026",
  unavailable: "El equipo no est\xE1 disponible",
  failure: "Registro de equipo persistente no v\xE1lido: {message}",
  empty: "A\xFAn no hay tareas compartidas. Cr\xE9elos a trav\xE9s de la conversaci\xF3n.",
  roster: "Miembros",
  tasks: "Tareas compartidas",
  model: "modelo",
  open: "Abrir conversaci\xF3n de miembros",
  current: "charla actual",
  owner: "propietario",
  unowned: "Sin due\xF1o",
  blockedBy: "Bloqueado por",
  writeScopes: "Escribir alcances",
  ready: "Listo",
  blocked: "Bloqueado por dependencias",
  "task.expand": "Mostrar m\xE1s",
  "task.collapse": "Mostrar menos",
  "memberStatus.running": "corriendo",
  "memberStatus.inactive": "Inactivo",
  "memberStatus.provisioning": "Aprovisionamiento",
  "memberStatus.failed": "Fallido",
  "status.pending": "Pendiente",
  "status.in_progress": "En progreso",
  "status.completed": "Completado"
};
var fr = {
  ...managementDictionary(en),
  trigger: "\xC9quipe d'agents",
  loading: "Chargement de l'\xE9quipe\u2026",
  unavailable: "L'\xE9quipe n'est pas disponible",
  failure: "Enregistrement d'\xE9quipe persistant non valide\xA0: {message}",
  empty: "Aucune t\xE2che partag\xE9e pour l'instant. Cr\xE9ez-les \xE0 travers la conversation.",
  roster: "Membres",
  tasks: "T\xE2ches partag\xE9es",
  model: "Mod\xE8le",
  open: "Conversation ouverte avec les membres",
  current: "Discussion actuelle",
  owner: "Propri\xE9taire",
  unowned: "Sans propri\xE9taire",
  blockedBy: "Bloqu\xE9 par",
  writeScopes: "\xC9crire des \xE9tendues",
  ready: "Pr\xEAt",
  blocked: "Bloqu\xE9 par les d\xE9pendances",
  "task.expand": "Afficher plus",
  "task.collapse": "Afficher moins",
  "memberStatus.running": "Courir",
  "memberStatus.inactive": "Inactif",
  "memberStatus.provisioning": "Approvisionnement",
  "memberStatus.failed": "\xC9chec",
  "status.pending": "En attente",
  "status.in_progress": "En cours",
  "status.completed": "Termin\xE9"
};
var de = {
  ...managementDictionary(en),
  trigger: "Agententeam",
  loading: "Team wird geladen\u2026",
  unavailable: "Team ist nicht verf\xFCgbar",
  failure: "Ung\xFCltiger beibehaltener Teamdatensatz: {message}",
  empty: "Noch keine geteilten Aufgaben. Erstellen Sie sie durch das Gespr\xE4ch.",
  roster: "Mitglieder",
  tasks: "Geteilte Aufgaben",
  model: "Modell",
  open: "\xD6ffnen Sie die Mitgliederkonversation",
  current: "Aktueller Chat",
  owner: "Besitzer",
  unowned: "Unbesessen",
  blockedBy: "Blockiert von",
  writeScopes: "Bereiche schreiben",
  ready: "Bereit",
  blocked: "Blockiert durch Abh\xE4ngigkeiten",
  "task.expand": "Mehr anzeigen",
  "task.collapse": "Weniger anzeigen",
  "memberStatus.running": "Laufen",
  "memberStatus.inactive": "Inaktiv",
  "memberStatus.provisioning": "Bereitstellung",
  "memberStatus.failed": "Fehlgeschlagen",
  "status.pending": "Ausstehend",
  "status.in_progress": "In Bearbeitung",
  "status.completed": "Abgeschlossen"
};
var ru = {
  ...managementDictionary(en),
  trigger: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0430\u0433\u0435\u043D\u0442\u043E\u0432",
  loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u044B\u2026",
  unavailable: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430",
  failure: "\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043D\u044B\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u044B\u0439 \u0440\u0435\u043A\u043E\u0440\u0434: {message}.",
  empty: "\u041E\u0431\u0449\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u043F\u043E\u043A\u0430 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0438\u0445 \u043F\u043E\u0441\u0440\u0435\u0434\u0441\u0442\u0432\u043E\u043C \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430.",
  roster: "\u0427\u043B\u0435\u043D\u044B",
  tasks: "\u041E\u0431\u0449\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
  model: "\u041C\u043E\u0434\u0435\u043B\u044C",
  open: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0431\u0435\u0441\u0435\u0434\u0443 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432",
  current: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0447\u0430\u0442",
  owner: "\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446",
  unowned: "\u041D\u0435\u0432\u043B\u0430\u0434\u0435\u044E\u0449\u0438\u0439",
  blockedBy: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
  writeScopes: "\u0417\u0430\u043F\u0438\u0441\u044C \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439",
  ready: "\u0413\u043E\u0442\u043E\u0432\u043E",
  blocked: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u044F\u043C\u0438",
  "task.expand": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435",
  "task.collapse": "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0435\u043D\u044C\u0448\u0435",
  "memberStatus.running": "\u0411\u0435\u0433",
  "memberStatus.inactive": "\u041D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439",
  "memberStatus.provisioning": "\u043E\u0431\u0435\u0441\u043F\u0435\u0447\u0435\u043D\u0438\u0435",
  "memberStatus.failed": "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C",
  "status.pending": "\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F",
  "status.in_progress": "\u0412 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435",
  "status.completed": "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"
};
var pt = {
  ...managementDictionary(en),
  trigger: "Equipe de agentes",
  loading: "Carregando equipe\u2026",
  unavailable: "A equipe n\xE3o est\xE1 dispon\xEDvel",
  failure: "Registro de equipe persistente inv\xE1lido: {message}",
  empty: "Ainda n\xE3o h\xE1 tarefas compartilhadas. Crie-os atrav\xE9s da conversa.",
  roster: "Membros",
  tasks: "Tarefas compartilhadas",
  model: "Modelo",
  open: "Abrir conversa entre membros",
  current: "Bate-papo atual",
  owner: "Propriet\xE1rio",
  unowned: "Sem dono",
  blockedBy: "Bloqueado por",
  writeScopes: "Escrever escopos",
  ready: "Pronto",
  blocked: "Bloqueado por depend\xEAncias",
  "task.expand": "Mostrar mais",
  "task.collapse": "Mostrar menos",
  "memberStatus.running": "Correndo",
  "memberStatus.inactive": "Inativo",
  "memberStatus.provisioning": "Provisionamento",
  "memberStatus.failed": "Falha",
  "status.pending": "Pendente",
  "status.in_progress": "Em andamento",
  "status.completed": "Conclu\xEDdo"
};

// packages/experimental/client-ui-agent-team/src/client/mount.ts
var inject = ["sessions", "uiWorkspace", "slots", "locale", "remote", "remote.commands"];
function registerAgentTeamUi(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: zh2, en: en2, ja, es, fr, de, ru, pt }), "client-ui-agent-team: dictionaries");
  const sessions = ctx.sessions;
  const leadSessionId = (sessionId) => {
    const address = sessions.binding(sessionId)?.session.getSnapshot().subagent?.address;
    return address?.parentSessionId ?? sessionId;
  };
  ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
    name: "plugins.row.config",
    key: "@local/dsh-agent-team-fork#fork-management",
    locale: NS
  }, (props) => PolicyConfig({ ...props, t: (key) => props.t(`manage.${key}`) })));
  const actions = {
    async executeManagement(sessionId, name, args, signal) {
      const response = await ctx.remote.commands.execute(sessionId, "/" + name + " " + JSON.stringify(args), [], signal);
      if (!response.ok) throw new Error(response.error.message);
      const result = response.value?.result;
      if (!result || result.kind !== "success" || typeof result.text !== "string") throw new Error(result?.text ?? "Team command unavailable");
      return JSON.parse(result.text);
    },
    openTeammate(sessionId, childSessionId) {
      const parentSessionId = leadSessionId(sessionId);
      if ((sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) === 0) return;
      if (childSessionId === parentSessionId) {
        ctx.uiWorkspace.openSession(parentSessionId);
        return;
      }
      ctx.uiWorkspace.openSession({
        parentSessionId,
        childSessionId,
        mode: "continuable"
      });
    }
  };
  ctx.slots.inject(
    "conversation.session.header.actions",
    () => ctx.slots.register({
      name: "conversation.session.header.actions",
      id: "agent-team",
      order: -20,
      locale: NS,
      inject: () => actions
    }, TeamAction)
  );
}

// packages/experimental/client-ui-agent-team/src/client/index.ts
function apply(ctx) {
  registerAgentTeamUi(ctx);
}

    const plugin = module.exports;
    const forkStylesheet = "/* packages/experimental/client-ui-agent-team/src/client/TeamAction.module.css */\n.TeamAction_root {\n  position: relative;\n}\n.TeamAction_trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-height: 28px;\n  padding: 3px 7px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  cursor: pointer;\n}\n.TeamAction_trigger:focus-visible {\n  color: var(--dsw-alias-label-primary);\n}\n@media (hover: hover) {\n  .TeamAction_trigger:hover {\n    color: var(--dsw-alias-label-primary);\n  }\n}\n@container (max-width: 480px) {\n  .TeamAction_triggerLabel {\n    display: none;\n  }\n}\n.TeamAction_count {\n  color: var(--dsw-alias-label-caption);\n  font-size: 12px;\n  font-weight: 400;\n  font-variant-numeric: tabular-nums;\n  line-height: 16px;\n}\n.TeamAction_panel {\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\n  display: flex;\n  flex-direction: column;\n  position: fixed;\n  z-index: 100;\n  box-sizing: border-box;\n  width: min(500px, 100vw - 32px);\n  max-height: min(680px, calc(100vh - 32px));\n  padding: 8px 2px 0;\n  overflow: hidden;\n  border: 0;\n  border-radius: 12px;\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n}\n.TeamAction_panel::before {\n  content: \"\";\n  position: absolute;\n  z-index: -1;\n  inset: 0;\n  border-radius: 12px;\n  background: var(--dsw-specific-menu);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n}\n.TeamAction_panelCompact {\n  width: min(320px, 100vw - 32px);\n}\n.TeamAction_panelCompact .TeamAction_roster {\n  grid-template-columns: minmax(0, 1fr);\n}\n.TeamAction_body {\n  --dsh-scrollbar-track-margin: 8px;\n  flex: 1 1 auto;\n  min-height: 0;\n  padding: 0 9px 16px 14px;\n  overflow-y: auto;\n  scrollbar-gutter: stable;\n}\n.TeamAction_taskTitle {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.TeamAction_taskTitle strong {\n  font-size: 13px;\n  font-weight: 500;\n}\n.TeamAction_panel h3 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 16px 0 8px 4px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 500;\n}\n.TeamAction_body section:first-of-type h3 {\n  margin-top: 8px;\n}\n.TeamAction_roster {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 8px;\n}\n.TeamAction_member {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  min-width: 0;\n  padding: 10px 12px;\n  border: 0;\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);\n  box-shadow: var(--dsw-elevation-stroke);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  text-align: left;\n  cursor: pointer;\n}\n.TeamAction_member:disabled {\n  cursor: default;\n}\n.TeamAction_memberCurrent {\n  --dsw-elevation-stroke-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);\n  box-shadow: var(--dsw-elevation-stroke), inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);\n}\n.TeamAction_member:not(:disabled):focus-visible {\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);\n  box-shadow: var(--dsw-elevation-panel);\n}\n@media (hover: hover) {\n  .TeamAction_member:not(:disabled):hover {\n    --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);\n    box-shadow: var(--dsw-elevation-panel);\n  }\n}\n.TeamAction_memberDot {\n  display: inline-flex;\n  align-items: center;\n  flex: none;\n  height: 1lh;\n}\n.TeamAction_inactiveIcon {\n  color: var(--dsw-alias-label-tertiary);\n}\n.TeamAction_memberText {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n.TeamAction_memberName {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n}\n.TeamAction_memberNameText,\n.TeamAction_memberText small {\n  overflow: hidden;\n  white-space: nowrap;\n  text-overflow: ellipsis;\n}\n.TeamAction_memberModel {\n  display: none;\n}\n.TeamAction_member:focus-visible .TeamAction_memberModel {\n  display: inline;\n}\n@media (hover: hover) {\n  .TeamAction_member:hover .TeamAction_memberModel {\n    display: inline;\n  }\n}\n.TeamAction_currentTag {\n  display: inline-block;\n  flex: 0 999 auto;\n  min-width: 0;\n  padding: 0 4px;\n  overflow: hidden;\n  font-size: 10px;\n  line-height: 15px;\n  text-overflow: ellipsis;\n}\n.TeamAction_memberText small,\n.TeamAction_meta {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n.TeamAction_diagnostic,\n.TeamAction_error,\n.TeamAction_warning {\n  color: var(--dsw-alias-state-error-primary);\n}\n.TeamAction_tasks {\n  display: flex;\n  flex-direction: column;\n  gap: 7px;\n}\n.TeamAction_emptyNotice {\n  margin: 16px 0 0 4px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n.TeamAction_task {\n  padding: 11px 13px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 9px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n.TeamAction_taskState {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  margin-left: auto;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n.TeamAction_task p {\n  margin: 5px 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n  white-space: pre-wrap;\n}\n.TeamAction_clampedDescription {\n  display: -webkit-box;\n  overflow: hidden;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n}\n.TeamAction_expandToggle {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  float: right;\n  margin-left: 10px;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 20px;\n  cursor: pointer;\n}\n.TeamAction_expandToggle:focus-visible {\n  color: var(--dsw-alias-label-primary);\n}\n@media (hover: hover) {\n  .TeamAction_expandToggle:hover {\n    color: var(--dsw-alias-label-primary);\n  }\n}\n.TeamAction_expandToggle svg {\n  transition: transform 120ms ease;\n}\n.TeamAction_expandToggleOpen {\n  transform: rotate(180deg);\n}\n.TeamAction_meta {\n  line-height: 20px;\n}\n.TeamAction_meta > span {\n  margin-right: 10px;\n}\n.TeamAction_notice,\n.TeamAction_error {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 9px;\n  font-size: 12px;\n}\n@media (hover: none) {\n  .TeamAction_memberModel {\n    display: inline;\n  }\n}\n";
    return { ...plugin, apply(ctx, ...args) {
      if (forkStylesheet) ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshPlugin = '@local/dsh-agent-team-fork';
        style.textContent = forkStylesheet;
        document.head.appendChild(style);
        return () => style.remove();
      });
      return plugin.apply(ctx, ...args);
    } };
  }
});
