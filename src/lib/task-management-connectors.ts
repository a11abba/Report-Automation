import {
  type AuditCapability,
  type IntegrationRecord,
  type NormalizedBusinessSnapshot,
  type PlatformType,
  type TaskManagementItemSnapshot,
} from "@/lib/audit/types";
import {
  baseSnapshot,
  nowEvidence,
  type ConnectorContext,
  type PlatformConnector,
  withSupport,
} from "./connectors";

interface WrikeTask {
  id?: string;
  title?: string;
  status?: string;
  importance?: string | null;
  permalink?: string | null;
  updatedDate?: string | null;
  dates?: {
    due?: string | null;
  } | null;
}

interface WrikeTasksResponse {
  data?: WrikeTask[];
}

function isCompletedStatus(status: string) {
  return status === "Completed" || status === "Cancelled";
}

function isOverdue(task: TaskManagementItemSnapshot, today = new Date()) {
  if (!task.dueDate || isCompletedStatus(task.status)) {
    return false;
  }
  return new Date(`${task.dueDate}T23:59:59Z`).getTime() < today.getTime();
}

function isDateWithinRange(value: string | null | undefined, dateRange: ConnectorContext["dateRange"]) {
  if (!value || !dateRange) {
    return false;
  }
  const time = new Date(value).getTime();
  const startTime = new Date(`${dateRange.startDate}T00:00:00Z`).getTime();
  const endTime = new Date(`${dateRange.endDate}T23:59:59Z`).getTime();
  return Number.isFinite(time) && time >= startTime && time <= endTime;
}

function normalizeWrikeTask(task: WrikeTask): TaskManagementItemSnapshot {
  return {
    id: task.id ?? "unknown",
    title: task.title ?? "Untitled task",
    status: task.status ?? "Unknown",
    importance: task.importance ?? null,
    permalink: task.permalink ?? null,
    dueDate: task.dates?.due ?? null,
    updatedAt: task.updatedDate ?? null,
  };
}

function buildTaskSnapshot(
  client: ConnectorContext["client"],
  integration: IntegrationRecord,
  tasks: TaskManagementItemSnapshot[],
  dateRange?: ConnectorContext["dateRange"],
): NormalizedBusinessSnapshot {
  const snapshot = baseSnapshot(client, "wrike", "task_management", ["task_context"]);
  const activeTasks = tasks.filter((task) => !isCompletedStatus(task.status)).length;
  const completedTasks = tasks.filter((task) => task.status === "Completed").length;
  const overdueTasks = tasks.filter((task) => isOverdue(task)).length;
  const highImportanceTasks = tasks.filter((task) => task.importance === "High").length;
  const recentlyUpdatedTasks = [...tasks]
    .sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 8);
  const actionedTasks = tasks
    .filter((task) => isDateWithinRange(task.updatedAt, dateRange))
    .sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  const completedTasksInPeriod = actionedTasks.filter((task) => task.status === "Completed");
  const activeTasksTouchedInPeriod = actionedTasks.filter((task) => !isCompletedStatus(task.status));
  const overdueOrBlockedTasks = tasks.filter((task) => {
    const normalizedStatus = task.status.toLowerCase();
    return isOverdue(task, dateRange ? new Date(`${dateRange.endDate}T23:59:59Z`) : new Date()) ||
      normalizedStatus.includes("blocked") ||
      normalizedStatus.includes("deferred");
  });

  snapshot.taskManagement = withSupport("supported", {
    provider: "Wrike",
    folderId: integration.settings.taskFolderId ?? null,
    folderName: integration.settings.taskFolderName ?? null,
    totalTasks: tasks.length,
    activeTasks,
    completedTasks,
    overdueTasks,
    highImportanceTasks,
    recentlyUpdatedTasks,
    actionedTasks,
    completedTasksInPeriod,
    activeTasksTouchedInPeriod,
    overdueOrBlockedTasks,
  });
  snapshot.sourceEvidence.push(
    nowEvidence(
      "wrike",
      "task_management",
      "Wrike client folder tasks",
      integration.settings.taskFolderId
        ? `folders/${integration.settings.taskFolderId}/tasks`
        : "tasks/demo",
      tasks.length,
    ),
  );
  return snapshot;
}

function demoWrikeSnapshot(
  client: ConnectorContext["client"],
  integration: IntegrationRecord,
  dateRange?: ConnectorContext["dateRange"],
): NormalizedBusinessSnapshot {
  const actionDate = dateRange ? `${dateRange.startDate}T12:00:00.000Z` : new Date().toISOString();
  const tasks: TaskManagementItemSnapshot[] = [
    {
      id: "wrike_demo_1",
      title: "Review monthly performance narrative",
      status: "Completed",
      importance: "High",
      permalink: null,
      dueDate: null,
      updatedAt: actionDate,
    },
    {
      id: "wrike_demo_2",
      title: "Validate conversion tracking notes before sending the report",
      status: "Active",
      importance: "High",
      permalink: null,
      dueDate: null,
      updatedAt: actionDate,
    },
  ];
  const snapshot = buildTaskSnapshot(client, integration, tasks, dateRange);
  snapshot.operationalFlags.push("wrike_demo_mode");
  return snapshot;
}

function getWrikeEnvironmentToken() {
  return (
    process.env.WRIKE_API_TOKEN?.trim() ||
    process.env.WRIKE_ACCESS_TOKEN?.trim() ||
    ""
  );
}

function getWrikeApiToken(integration: IntegrationRecord) {
  return integration.credentials.apiKey?.trim() || getWrikeEnvironmentToken();
}

async function fetchWrikeFolderTasks(integration: IntegrationRecord) {
  const folderId = integration.settings.taskFolderId?.trim();
  const apiKey = getWrikeApiToken(integration);
  if (!folderId || !apiKey) {
    return null;
  }

  const url = new URL(`https://www.wrike.com/api/v4/folders/${encodeURIComponent(folderId)}/tasks`);
  url.searchParams.set("descendants", "true");
  url.searchParams.append("fields", "dates");
  url.searchParams.append("fields", "importance");
  url.searchParams.append("fields", "permalink");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Wrike task fetch failed: ${detail || response.statusText}`);
  }

  const payload = (await response.json()) as WrikeTasksResponse;
  return (payload.data ?? []).map(normalizeWrikeTask);
}

export class WrikeConnector implements PlatformConnector {
  key = "wrike" as const;

  platformType(): PlatformType {
    return "task_management";
  }

  capabilities(): AuditCapability[] {
    return ["task_context"];
  }

  async validateCredentials(integration: IntegrationRecord) {
    const environmentConfigured = Boolean(getWrikeEnvironmentToken());
    const directTokenConfigured = Boolean(integration.credentials.apiKey?.trim());
    const authenticated = directTokenConfigured || environmentConfigured;
    const resourceSelected = Boolean(integration.settings.taskFolderId?.trim());
    const liveReady = authenticated && resourceSelected && !integration.settings.demoMode;
    return {
      valid: true,
      mode: liveReady ? ("api" as const) : ("demo" as const),
      code: liveReady ? "wrike_folder_ready" : "wrike_folder_demo",
      message: liveReady
        ? "Wrike token and client folder are configured for task-context analysis."
        : environmentConfigured
          ? "Add a Wrike client folder ID to use live task context in the report."
          : "Add WRIKE_API_TOKEN in the environment or save a Wrike token on this connector.",
      environmentConfigured,
      authenticated,
      resourceSelected,
      liveReady,
    };
  }

  async fetchSnapshot(context: ConnectorContext): Promise<NormalizedBusinessSnapshot> {
    const tasks = await fetchWrikeFolderTasks(context.integration);
    if (!tasks) {
      return demoWrikeSnapshot(context.client, context.integration, context.dateRange);
    }
    return buildTaskSnapshot(context.client, context.integration, tasks, context.dateRange);
  }
}
