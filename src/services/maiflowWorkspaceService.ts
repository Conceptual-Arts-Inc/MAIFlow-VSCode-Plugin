import { MAIFlowApi } from "../api/maiflowApi";
import { MAIFlowApiError } from "../api/maiflowApiError";
import { CreateTaskRequest, MAIFlowMapping, ProjectViewState, TaskSummary, UpdateTaskRequest, WorkspaceSnapshot, sortWorkspaceForDisplay } from "../model/workspaceModels";
import { MAIFlowSettings } from "./maiflowSettings";
import { MAIFlowTokenStore } from "./maiflowTokenStore";

export class MAIFlowWorkspaceService {
	private readonly stateListeners = new Set<(state: ProjectViewState) => void>();
	private readonly busyListeners = new Set<(busy: boolean) => void>();
	private currentState: ProjectViewState = { kind: "not-configured" };
	private currentSnapshot?: WorkspaceSnapshot;
	private selected?: TaskSummary;
	private busy = false;
	private generation = 0;
	private refreshController?: AbortController;
	private readonly mutationControllers = new Set<AbortController>();

	public constructor(
		private readonly api: MAIFlowApi,
		private readonly settings: MAIFlowSettings,
		private readonly tokenStore: MAIFlowTokenStore,
	) {}

	public onState(listener: (state: ProjectViewState) => void): { dispose(): void } {
		this.stateListeners.add(listener);
		listener(this.currentState);
		return { dispose: () => this.stateListeners.delete(listener) };
	}

	public onBusy(listener: (busy: boolean) => void): { dispose(): void } {
		this.busyListeners.add(listener);
		listener(this.busy);
		return { dispose: () => this.busyListeners.delete(listener) };
	}

	public getState(): ProjectViewState { return this.currentState; }
	public getSnapshot(): WorkspaceSnapshot | undefined { return this.currentSnapshot; }
	public getSelectedTask(): TaskSummary | undefined { return this.selected; }
	public setSelectedTask(task: TaskSummary | undefined): void { this.selected = task; }
	public isBusy(): boolean { return this.busy; }

	public async getMapping(): Promise<MAIFlowMapping> { return this.settings.getMapping(); }

	public async setMapping(mapping: MAIFlowMapping): Promise<void> {
		await this.settings.setMapping(mapping.flowId, mapping.projectId, mapping.useForNewTasks);
	}

	public async refresh(): Promise<void> {
		const configured = await this.settings.isConfigured(this.tokenStore);
		if (!configured) {
			this.refreshController?.abort();
			this.currentSnapshot = undefined;
			this.setState({ kind: "not-configured" });
			this.setBusy(false);
			return;
		}

		this.refreshController?.abort();
		const controller = new AbortController();
		this.refreshController = controller;
		const operation = ++this.generation;
		this.setState({ kind: "loading", cached: this.currentSnapshot });
		this.setBusy(true);
		try {
			const loaded = sortWorkspaceForDisplay(await this.api.loadWorkspace(controller.signal));
			if (operation !== this.generation || controller.signal.aborted) {return;}
			this.currentSnapshot = loaded;
			this.setState(loaded.tasks.length ? { kind: "loaded", snapshot: loaded } : { kind: "empty", snapshot: loaded });
		} catch (error) {
			if (operation !== this.generation || controller.signal.aborted) {return;}
			const message = error instanceof MAIFlowApiError ? error.message : error instanceof Error ? error.message : "Could not load MAIFlow tasks.";
			this.setState(this.currentSnapshot ? { kind: "stale", snapshot: this.currentSnapshot, error: message } : { kind: "failed", error: message });
		} finally {
			if (operation === this.generation) {
				this.refreshController = undefined;
				this.setBusy(false);
			}
		}
	}

	public async createTask(request: CreateTaskRequest): Promise<string> {
		return this.runMutation((signal) => this.api.createTask(request, signal));
	}

	public async updateTask(taskId: string, request: UpdateTaskRequest): Promise<void> {
		return this.runMutation((signal) => this.api.updateTask(taskId, request, signal));
	}

	private async runMutation<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
		this.refreshController?.abort();
		const controller = new AbortController();
		this.mutationControllers.add(controller);
		const operation = ++this.generation;
		this.setBusy(true);
		try {
			const result = await work(controller.signal);
			if (operation === this.generation) {await this.refresh();}
			return result;
		} finally {
			this.mutationControllers.delete(controller);
			if (operation === this.generation) {this.setBusy(false);}
		}
	}

	private setState(state: ProjectViewState): void {
		this.currentState = state;
		this.stateListeners.forEach((listener) => listener(state));
	}

	private setBusy(value: boolean): void {
		this.busy = value;
		this.busyListeners.forEach((listener) => listener(value));
	}

	public dispose(): void {
		this.refreshController?.abort();
		this.mutationControllers.forEach((controller) => controller.abort());
		this.mutationControllers.clear();
		this.generation += 1;
		this.stateListeners.clear();
		this.busyListeners.clear();
	}
}
