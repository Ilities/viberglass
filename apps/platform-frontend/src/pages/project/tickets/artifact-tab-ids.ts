import type { TaskStep } from './task-next-move'

/** The artifact tabs (Plan, Code) and the panel they show. */
export const stepTabId = (step: TaskStep) => `task-artifact-tab-${step}`
export const stepPanelId = (step: TaskStep) => `task-artifact-panel-${step}`
