import { normalizeEndpoint } from "./endpointIdentity";
import { MAIFlowApiError } from "./maiflowApiError";
import { McpCapabilityCatalog } from "./mcpModels";
import { McpClient } from "./mcpClient";
import {
	CreateTaskRequest,
	FlowSummary,
	MemberSummary,
	OrganizationSummary,
	ProjectSummary,
	TaskStatus,
	TaskSummary,
	UpdateTaskRequest,
	WorkspaceSnapshot,
} from "../model/workspaceModels";

export interface ConnectionTestResult {
	initialization: { protocolVersion: string; serverName?: string; serverVersion?: string };
	catalog: McpCapabilityCatalog;
}

export interface MAIFlowApiSettings {
	getServerUrl(): string;
}

export interface MAIFlowTokenProvider {
	readToken(endpoint: string): Promise<string | undefined>;
}

const asString = (value: unknown): string | undefined => typeof value === "string" && value ? value : undefined;
const asNumber = (value: unknown): number | undefined => {
	if (typeof value === "number") {return Number.isFinite(value) ? value : undefined;}
	if (typeof value !== "string" || !value.trim()) {return undefined;}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};
const asObject = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const reference = (object: Record<string, unknown>, key: string): string | undefined => asString(object[key]) ?? asString(asObject(object[key])?.id) ?? asString(asObject(object[key])?._id);
const score = (value: unknown, fallback = 0): number => Math.max(0, Math.min(10, Math.trunc(asNumber(value) ?? fallback)));
const engineScore = (value: unknown, fallback = 0): number => Math.max(0, Math.trunc(asNumber(value) ?? fallback));
const firstNumber = (object: Record<string, unknown>, keys: readonly string[]): number | undefined => {
	for (const key of keys) {
		const value = asNumber(object[key]);
		if (value !== undefined) {return value;}
	}
	return undefined;
};
const initials = (name: string): string => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";

export class MAIFlowApi {
	private session?: { endpoint: string; token: string; client: McpClient; initialized: boolean; catalog?: McpCapabilityCatalog };

	public constructor(
		private readonly settings: MAIFlowApiSettings,
		private readonly tokenProvider: MAIFlowTokenProvider,
		private readonly pluginVersion: string,
		private readonly log?: (message: string) => void,
	) {}

	public async testConnection(endpoint: string, token: string, signal?: AbortSignal): Promise<ConnectionTestResult> {
		const normalized = this.normalizeOrThrow(endpoint);
		this.requireToken(token);
		const client = new McpClient(undefined, this.log);
		const initialization = await client.initialize(normalized, token, this.pluginVersion, signal);
		const catalog = await client.capabilities(normalized, token, signal);
		this.session = { endpoint: normalized, token, client, initialized: true, catalog };
		return { initialization, catalog };
	}

	public clearSession(): void {
		this.session = undefined;
	}

	public async loadWorkspace(signal?: AbortSignal): Promise<WorkspaceSnapshot> {
		try {
			return await this.callWorkspace(signal);
		} catch (error) {
			if (!(error instanceof MAIFlowApiError) || error.kind !== "not-found") {throw error;}
			if (this.session) {this.session.catalog = undefined;}
			return this.callWorkspace(signal);
		}
	}

	public async createTask(request: CreateTaskRequest, signal?: AbortSignal): Promise<string> {
		this.validateCreate(request);
		const response = await this.callRoute("POST", "/api/tasks", {
			title: request.title.trim(),
			flowId: request.flowId.trim(),
			...(request.description?.trim() ? { description: request.description } : {}),
			priority: request.priority ?? 5,
			...(request.urgency === undefined ? {} : { urgency: request.urgency }),
			...(request.impact === undefined ? {} : { impact: request.impact }),
			...(request.effortPoints === undefined ? {} : { effortPoints: request.effortPoints }),
			...(request.projectId?.trim() ? { projectId: request.projectId.trim() } : {}),
		}, signal);
		const id = asString(asObject(response.data)?.id);
		if (!id) {throw MAIFlowApiError.protocol("Create task response omitted its id");}
		return id;
	}

	public async updateTask(taskId: string, request: UpdateTaskRequest, signal?: AbortSignal): Promise<void> {
		if (!taskId.trim()) {throw MAIFlowApiError.configuration("Task id cannot be empty.");}
		this.validateUpdate(request);
		const body: Record<string, unknown> = {};
		if (request.title !== undefined) {body.title = request.title;}
		if (request.description !== undefined) {body.description = request.description;}
		if (request.status !== undefined) {body.status = request.status;}
		if (request.priority !== undefined) {body.priority = request.priority;}
		if (request.urgency !== undefined) {body.urgency = request.urgency;}
		if (request.impact !== undefined) {body.impact = request.impact;}
		if (request.effortPoints !== undefined) {body.effortPoints = request.effortPoints;}
		if (request.assigneeId !== undefined) {body.assigneeId = request.assigneeId;}
		if (request.detachProject) {body.projectId = null;}
		else if (request.projectId !== undefined) {body.projectId = request.projectId;}
		await this.callRoute("PUT", `/api/tasks/${encodeURIComponent(taskId)}`, body, signal);
	}

	private async callWorkspace(signal?: AbortSignal): Promise<WorkspaceSnapshot> {
		const response = await this.callRoute("GET", "/api/workspace/tasks", undefined, signal);
		return mapWorkspace(asObject(response.data) ?? response);
	}

	private async callRoute(method: string, path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
		const session = await this.getSession();
		if (!session.initialized) {
			await session.client.initialize(session.endpoint, session.token, this.pluginVersion, signal);
			session.initialized = true;
		}
		const catalog = session.catalog ?? await session.client.capabilities(session.endpoint, session.token, signal);
		session.catalog = catalog;
		if (!catalog.allows(method, path)) {throw MAIFlowApiError.protocol(`The configured MAIFlow server does not advertise ${method} ${path}`);}
		const result = await session.client.callTool(session.endpoint, session.token, "maiflow_api_request", {
			method,
			path,
			...(body === undefined ? {} : { body }),
		}, signal);
		const structured = result.structuredContent;
		const status = asNumber(structured?.status);
		const ok = typeof structured?.ok === "boolean" ? structured.ok : !result.isError;
		const response = asObject(structured?.response) ?? this.parseTextResponse(result.textContent);
		if (!ok || (status !== undefined && (status < 200 || status >= 300))) {
			throw MAIFlowApiError.fromStatus(status ?? 500, asString(response?.error) ?? asString(response?.message) ?? result.textContent);
		}
		return response ?? {};
	}

	private async getSession(): Promise<NonNullable<MAIFlowApi["session"]>> {
		const endpoint = this.normalizeOrThrow(this.settings.getServerUrl());
		const token = this.requireToken(await this.tokenProvider.readToken(endpoint));
		if (this.session?.endpoint === endpoint && this.session.token === token) {return this.session;}
		const session = { endpoint, token, client: new McpClient(undefined, this.log), initialized: false, catalog: undefined };
		this.session = session;
		return session;
	}

	private parseTextResponse(text: string | undefined): Record<string, unknown> | undefined {
		if (!text) {return undefined;}
		try {
			const parsed: unknown = JSON.parse(text);
			return asObject(parsed);
		} catch (error) {
			throw MAIFlowApiError.protocol("The MAIFlow tool response was not valid JSON", error);
		}
	}

	private normalizeOrThrow(value: string): string {
		try { return normalizeEndpoint(value); }
		catch (error) { throw MAIFlowApiError.configuration(error instanceof Error ? error.message : "MAIFlow server URL is invalid."); }
	}

	private requireToken(token: string | undefined): string {
		if (!token?.trim()) {throw MAIFlowApiError.configuration("Add your MAIFlow API token in Settings or run Configure MAIFlow.");}
		if (!token.startsWith("mf_live_")) {throw MAIFlowApiError.configuration("MAIFlow API tokens must start with mf_live_.");}
		return token;
	}

	private validateCreate(request: CreateTaskRequest): void {
		if (!request.title.trim() || request.title.trim().length > 160) {throw new MAIFlowApiError("Task title must be between 1 and 160 characters.", "validation");}
		if (!request.flowId.trim()) {throw new MAIFlowApiError("A MAIFlow flow is required to create a task.", "validation");}
		this.validateScore("priority", request.priority ?? 5);
		if (request.urgency !== undefined) {this.validateScore("urgency", request.urgency);}
		if (request.impact !== undefined) {this.validateScore("impact", request.impact);}
		if (request.effortPoints !== undefined) {this.validateScore("effort", request.effortPoints);}
		if ((request.description ?? "").length > 4000) {throw new MAIFlowApiError("Task description must be 4,000 characters or fewer.", "validation");}
	}

	private validateUpdate(request: UpdateTaskRequest): void {
		const hasChange = request.title !== undefined || request.description !== undefined || request.status !== undefined ||
			request.priority !== undefined || request.urgency !== undefined || request.impact !== undefined ||
			request.effortPoints !== undefined || request.assigneeId !== undefined || request.projectId !== undefined || request.detachProject === true;
		if (!hasChange) {throw new MAIFlowApiError("Choose at least one task field to update.", "validation");}
		if (request.title !== undefined && (!request.title.trim() || request.title.trim().length > 160)) {throw new MAIFlowApiError("Task title must be between 1 and 160 characters.", "validation");}
		if (request.description !== undefined && request.description.length > 4000) {throw new MAIFlowApiError("Task description must be 4,000 characters or fewer.", "validation");}
		if (request.priority !== undefined) {this.validateScore("priority", request.priority);}
		if (request.urgency !== undefined) {this.validateScore("urgency", request.urgency);}
		if (request.impact !== undefined) {this.validateScore("impact", request.impact);}
		if (request.effortPoints !== undefined) {this.validateScore("effort", request.effortPoints);}
	}

	private validateScore(name: string, value: number): void {
		if (!Number.isInteger(value) || value < 0 || value > 10) {throw new MAIFlowApiError(`${name} must be between 0 and 10.`, "validation");}
	}
}

const mapMember = (value: unknown): MemberSummary | undefined => {
	const object = asObject(value);
	const id = object && (asString(object.id) ?? asString(object._id));
	if (!id) {return undefined;}
	const name = asString(object.name) ?? asString(object.displayName) ?? asString(object.email) ?? "MAIFlow member";
	return { id, name, initials: asString(object.initials) ?? initials(name), role: asString(object.role) ?? "Member", imageUrl: asString(object.imageUrl) };
};

export const mapWorkspace = (root: Record<string, unknown>): WorkspaceSnapshot => {
	const organizations: OrganizationSummary[] = Array.isArray(root.organizations) ? root.organizations.flatMap((value) => {
		const object = asObject(value); const id = object && (asString(object.id) ?? asString(object._id));
		return id ? [{ id, name: asString(object.name) ?? "Untitled organization", viewerRole: asString(object.viewerRole) ?? "Member" }] : [];
	}) : [];
	const projects: ProjectSummary[] = Array.isArray(root.projects) ? root.projects.flatMap((value) => {
		const object = asObject(value); const id = object && (asString(object.id) ?? asString(object._id));
		return id ? [{ id, name: asString(object.name) ?? "Untitled project", description: asString(object.description) ?? "", organizationId: reference(object, "orgId") ?? reference(object, "organizationId") }] : [];
	}) : [];
	const flows: FlowSummary[] = Array.isArray(root.flows) ? root.flows.flatMap((value) => {
		const object = asObject(value); const id = object && (asString(object.id) ?? asString(object._id));
		return id ? [{ id, name: asString(object.name) ?? "Untitled flow", scope: asString(object.scope) ?? "personal", organizationId: reference(object, "orgId") ?? reference(object, "organizationId") }] : [];
	}) : [];
	const flowById = new Map(flows.map((flow) => [flow.id, flow]));
	const projectById = new Map(projects.map((project) => [project.id, project]));
	const viewer = mapMember(root.viewer);
	const tasks: TaskSummary[] = Array.isArray(root.tasks) ? root.tasks.flatMap((value) => {
		const object = asObject(value); if (!object) {return [];}
		const id = asString(object.id) ?? asString(object._id); if (!id) {return [];}
		const flowId = reference(object, "flowId") ?? reference(object, "flow") ?? "unknown-flow";
		const projectId = reference(object, "projectId") ?? reference(object, "project");
		const flow = flowById.get(flowId); const project = projectId ? projectById.get(projectId) : undefined;
		const createdAt = asString(object.createdAt) ?? asString(object.created_at) ?? "";
		const rawStatus = asString(object.status);
		const status: TaskStatus = rawStatus === "in_progress" || rawStatus === "blocked" || rawStatus === "completed" ? rawStatus : "todo";
		return [{
			id,
			title: asString(object.title) ?? "Untitled task",
			description: asString(object.description) ?? "",
			status,
			flowId,
			flowName: asString(object.flowName) ?? flow?.name ?? "Unknown flow",
			projectId,
			projectName: asString(object.projectName) ?? project?.name,
			assignee: mapMember(object.assignee) ?? viewer,
			priority: score(firstNumber(object, ["priority"]), 5),
			urgency: score(firstNumber(object, ["urgency", "priority"]), 5),
			impact: score(firstNumber(object, ["impact", "priority"]), 5),
			effortPoints: score(firstNumber(object, ["effortPoints", "effort_points", "effort"]), 3),
			engineScore: engineScore(firstNumber(object, ["engineScore", "score_engine_score"]), 0),
			createdAt,
			updatedAt: asString(object.updatedAt) ?? asString(object.updated_at) ?? createdAt,
		}];
	}) : [];
	return { viewer, organizations, projects, flows, tasks, tasksComplete: typeof root.tasksComplete === "boolean" ? root.tasksComplete : true };
};
