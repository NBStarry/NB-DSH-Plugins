import type { ReactElement } from 'react'
export type ManagementCommand = (args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>
export interface TeamSettingsProps {
  sessionId: string
  execute: ManagementCommand
  executeCapacity: ManagementCommand
  executeTasks: ManagementCommand
  executeModel: ManagementCommand
  t: (key: ManagementKey) => string
  useAccess: (action: 'commands/execute') => boolean
  onOpenChange?: (open: boolean) => void
}
export function TeamSettings(props: TeamSettingsProps): ReactElement
export function PolicyConfig(props: { view: string; form?: unknown; t: (key: ManagementKey) => string }): ReactElement
export type ManagementKey = "title" | "close" | "refresh" | "loading" | "save" | "saving" | "label" | "description" | "instructions" | "select" | "empty" | "hint" | "readonly" | "saved" | "capacity" | "mode" | "failed" | "error" | "dirty" | "discard" | "target" | "revision" | "safety" | "capacityTitle" | "capacitySave" | "capacityReset" | "capacityHint" | "capacityScope" | "capacitySaved" | "policySummary" | "policyMode" | "coordinator" | "balanced" | "coordinatorPrompt" | "balancedPrompt" | "memberPrompt" | "policyHint" | "policyGuard" | "policyReset" | "policyDiscard" | "tasksTitle" | "activeTasks" | "archivedTasks" | "archive" | "unarchive" | "taskRefresh" | "taskSelect" | "taskEmpty" | "taskHint" | "archiveUnsupported" | "taskConfirm" | "cancel" | "confirm" | "partial" | "previous" | "next" | "rejected" | "applied" | "unconfirmed" | "not-attempted" | "revisionLabel" | "modelsTitle" | "modelsRefresh" | "modelsHint" | "modelsUnsupported" | "coldModel" | "modelSelect" | "modelSave" | "modelConfirm" | "modelSaved" | "modelUnconfirmed" | "policyUnavailable" | "policyConflict" | "policyFailed" | "policySaved"
export const managementZh: Record<ManagementKey, string>
export const managementEn: Record<ManagementKey, string>
