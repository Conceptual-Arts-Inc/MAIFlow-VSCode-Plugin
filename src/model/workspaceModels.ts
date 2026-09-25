export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "blocked", "completed"];

export const taskStatusLabel = (status: TaskStatus): string => {
	const labels: Record<TaskStatus, string> = {
		todo: "To do",
		in_progress: "In progress",
		blocked: "Blocked",
		completed: "Completed",
	};
	return labels[status];
};

export interface MemberSummary {
	id: string;
	name: string;
	initials: string;
	role: string;
	imageUrl?: string;
}

export interface OrganizationSummary {
	id: string;
	name: string;
	viewerRole: string;
}

export interface FlowSummary {
	id: string;
	name: string;
	scope: string;
	organizationId?: string;
}

export interface ProjectSummary {
	id: string;
	name: string;
	description: string;
	organizationId?: string;
}

export interface TaskSummary {
	id: string;
	title: string;
	description: string;
	status: TaskStatus;
	flowId: string;
	flowName: string;
	projectId?: string;
	projectName?: string;
	assignee?: MemberSummary;
	priority: number;
	urgency: number;
	impact: number;
	effortPoints: number;
	/** Read-only MAIFlow score-engine value; unlike input scores, this is not limited to 0–10. */
	engineScore: number;
	createdAt: string;
	updatedAt: string;
}

export interface WorkspaceSnapshot {
	viewer?: MemberSummary;
	organizations: OrganizationSummary[];
	projects: ProjectSummary[];
	flows: FlowSummary[];
	tasks: TaskSummary[];
	tasksComplete: boolean;
}

export interface CreateTaskRequest {
	title: string;
	flowId: string;
	description?: string;
	priority?: number;
	urgency?: number;
	impact?: number;
	effortPoints?: number;
	projectId?: string;
}

export interface UpdateTaskRequest {
	title?: string;
	description?: string;
	status?: TaskStatus;
	priority?: number;
	urgency?: number;
	impact?: number;
	effortPoints?: number;
	assigneeId?: string;
	projectId?: string;
	detachProject?: boolean;
}

export interface MAIFlowMapping {
	flowId: string;
	projectId: string;
	useForNewTasks: boolean;
}

export type ProjectViewState =
	| { kind: "not-configured" }
	| { kind: "loading"; cached?: WorkspaceSnapshot }
	| { kind: "loaded"; snapshot: WorkspaceSnapshot }
	| { kind: "empty"; snapshot: WorkspaceSnapshot }
	| { kind: "stale"; snapshot: WorkspaceSnapshot; error: string }
	| { kind: "failed"; error: string; cached?: WorkspaceSnapshot };

const statusOrder: Record<TaskStatus, number> = {
	in_progress: 0,
	blocked: 1,
	todo: 2,
	completed: 3,
};

export const sortWorkspaceForDisplay = (snapshot: WorkspaceSnapshot): WorkspaceSnapshot => ({
	...snapshot,
	organizations: [...snapshot.organizations].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
	projects: [...snapshot.projects].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
	flows: [...snapshot.flows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
	tasks: [...snapshot.tasks].sort((a, b) =>
		(statusOrder[a.status] - statusOrder[b.status]) ||
		(b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt) ||
		(b.engineScore - a.engineScore) ||
		a.title.localeCompare(b.title) ||
		a.id.localeCompare(b.id),
	),
});
