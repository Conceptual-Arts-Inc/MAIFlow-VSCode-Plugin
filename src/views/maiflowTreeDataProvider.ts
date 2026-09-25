import * as vscode from "vscode";
import { MAIFlowWorkspaceService } from "../services/maiflowWorkspaceService";
import { TaskSummary, WorkspaceSnapshot, taskStatusLabel } from "../model/workspaceModels";

type Filter = { flowId?: string; projectId?: string };

export type MAIFlowTreeNode =
	| { type: "message"; label: string; description?: string; command?: string; icon?: string; tooltip?: string }
	| { type: "summary"; label: string; description: string; command?: string; tooltip?: string }
	| { type: "task"; task: TaskSummary };

export class MAIFlowTreeDataProvider implements vscode.TreeDataProvider<MAIFlowTreeNode>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<MAIFlowTreeNode | undefined | null | void>();
	private readonly subscriptions: vscode.Disposable[];
	private filter: Filter = {};

	public readonly onDidChangeTreeData = this.changeEmitter.event;

	public constructor(private readonly service: MAIFlowWorkspaceService) {
		this.subscriptions = [
			service.onState(() => this.changeEmitter.fire()),
			service.onBusy(() => this.changeEmitter.fire()),
		];
	}

	public setFilter(filter: Filter): void {
		this.filter = filter;
		this.changeEmitter.fire();
	}

	public getFilter(): Filter { return { ...this.filter }; }

	public clearFilter(): void {
		this.filter = {};
		this.changeEmitter.fire();
	}

	public getTreeItem(element: MAIFlowTreeNode): vscode.TreeItem {
		if (element.type === "message") {
			const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
			item.description = element.description;
			item.command = element.command ? { command: element.command, title: element.label } : undefined;
			item.contextValue = "maiflow.message";
			item.iconPath = new vscode.ThemeIcon(element.icon ?? (element.command ? "gear" : "info"));
			item.tooltip = element.tooltip ?? [element.label, element.description].filter(Boolean).join("\n");
			item.accessibilityInformation = { role: "status", label: [element.label, element.description].filter(Boolean).join(". ") };
			return item;
		}
		if (element.type === "summary") {
			const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
			item.description = element.description;
			item.command = element.command ? { command: element.command, title: "Change MAIFlow filters" } : undefined;
			item.contextValue = "maiflow.summary";
			item.iconPath = new vscode.ThemeIcon("filter");
			item.tooltip = element.tooltip ?? `${element.label}\n${element.description}`;
			item.accessibilityInformation = { role: "button", label: `${element.label}. ${element.description}` };
			return item;
		}

		const task = element.task;
		const context = [taskStatusLabel(task.status), task.flowName, task.projectName].filter(Boolean).join(" · ");
		const item = new vscode.TreeItem(task.title || "Untitled task", vscode.TreeItemCollapsibleState.None);
		item.description = context;
		item.tooltip = new vscode.MarkdownString([
			`**${escapeMarkdown(task.title || "Untitled task")}**`,
			"",
			`${taskStatusLabel(task.status)} · Score ${task.engineScore}`,
			`Priority ${task.priority} · Urgency ${task.urgency} · Impact ${task.impact} · Effort ${task.effortPoints}`,
			task.description || "No description",
		].join("\n\n"));
		item.command = { command: "maiflow.openTask", title: "Open MAIFlow task details", arguments: [task] };
		item.contextValue = "maiflow.task";
		item.iconPath = new vscode.ThemeIcon(task.status === "completed" ? "pass-filled" : task.status === "blocked" ? "warning" : task.status === "in_progress" ? "play-circle" : "circle-outline");
		item.accessibilityInformation = { role: "treeitem", label: `${task.title || "Untitled task"}. ${context}. Engine score ${task.engineScore}` };
		return item;
	}

	public async getChildren(): Promise<MAIFlowTreeNode[]> {
		const state = this.service.getState();
		if (state.kind === "not-configured") {
			return [{ type: "message", label: "Connect MAIFlow", description: "Configure your server URL and API token", command: "maiflow.configure", icon: "plug" }];
		}
		if (state.kind === "loading" && !state.cached) {return [{ type: "message", label: "Loading tasks…", description: "Fetching your MAIFlow workspace", icon: "sync~spin" }];}
		if (state.kind === "failed") {return [
			{ type: "message", label: "Couldn’t load tasks", description: state.error, command: "maiflow.refresh", icon: "error", tooltip: `${state.error}\n\nSelect to retry.` },
		];}

		const snapshot = state.kind === "loading" ? state.cached : state.snapshot;
		if (!snapshot) {return [{ type: "message", label: "No workspace loaded", description: "Refresh to try again", command: "maiflow.refresh", icon: "refresh" }];}
		const nodes: MAIFlowTreeNode[] = [];
		if (state.kind === "stale") {nodes.push({ type: "message", label: "Showing cached tasks", description: "Refresh failed · Select to retry", command: "maiflow.refresh", icon: "warning", tooltip: state.error });}
		const filtered = snapshot.tasks.filter((task) =>
			(!this.filter.flowId || task.flowId === this.filter.flowId) && (!this.filter.projectId || task.projectId === this.filter.projectId),
		);
		nodes.push({
			type: "summary",
			label: `${filtered.length}${filtered.length === snapshot.tasks.length ? "" : ` of ${snapshot.tasks.length}`} ${filtered.length === 1 ? "task" : "tasks"}`,
			description: `${filterName(snapshot, this.filter.flowId, "flow")} · ${filterName(snapshot, this.filter.projectId, "project")}`,
			command: "maiflow.filter",
			tooltip: "Change filters",
		});
		if (!filtered.length) {
			nodes.push({
			 type: "message",
			 label: snapshot.tasks.length ? "No matching tasks" : "No tasks yet",
			 description: snapshot.tasks.length ? "Change the filters to see more tasks" : "Create a task or refresh the workspace",
			 command: snapshot.tasks.length ? "maiflow.filter" : "maiflow.createTask",
			 icon: snapshot.tasks.length ? "filter" : "add",
		});
			return nodes;
		}
		return nodes.concat(filtered.map((task): MAIFlowTreeNode => ({ type: "task", task })));
	}

	public dispose(): void {
		this.subscriptions.forEach((subscription) => subscription.dispose());
		this.changeEmitter.dispose();
	}
}

const filterName = (snapshot: WorkspaceSnapshot, id: string | undefined, kind: "flow" | "project"): string => {
	if (!id) {return kind === "flow" ? "All flows" : "All projects";}
	const items = kind === "flow" ? snapshot.flows : snapshot.projects;
	return items.find((item) => item.id === id)?.name ?? `Selected ${kind}`;
};

const escapeMarkdown = (value: string): string => value.replace(/[\\`*_{}[\]()<>#+\-.!|]/g, "\\$&");
