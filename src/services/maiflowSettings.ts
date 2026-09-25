import * as vscode from "vscode";
import { DEFAULT_ENDPOINT, normalizeEndpoint } from "../api/endpointIdentity";

export class MAIFlowSettings {
	public constructor(private readonly context: vscode.ExtensionContext) {}

	public getServerUrl(): string {
		return vscode.workspace.getConfiguration("maiflow").get<string>("serverUrl", DEFAULT_ENDPOINT);
	}

	public async updateServerUrl(value: string): Promise<string> {
		const normalized = normalizeEndpoint(value);
		await vscode.workspace.getConfiguration("maiflow").update("serverUrl", normalized, vscode.ConfigurationTarget.Global);
		return normalized;
	}

	public getTokenPrefix(): string {
		return vscode.workspace.getConfiguration("maiflow").get<string>("tokenPrefix", "");
	}

	public getLastSuccessfulConnectionAt(): number {
		return vscode.workspace.getConfiguration("maiflow").get<number>("lastSuccessfulConnection", 0);
	}

	public async recordSuccessfulConnection(endpoint: string, tokenPrefix: string): Promise<void> {
		const normalized = normalizeEndpoint(endpoint);
		const configuration = vscode.workspace.getConfiguration("maiflow");
		await configuration.update("serverUrl", normalized, vscode.ConfigurationTarget.Global);
		await configuration.update("tokenPrefix", tokenPrefix, vscode.ConfigurationTarget.Global);
		await configuration.update("lastSuccessfulConnection", Date.now(), vscode.ConfigurationTarget.Global);
	}

	public async clearConnectionMetadata(): Promise<void> {
		const configuration = vscode.workspace.getConfiguration("maiflow");
		await configuration.update("tokenPrefix", "", vscode.ConfigurationTarget.Global);
		await configuration.update("lastSuccessfulConnection", 0, vscode.ConfigurationTarget.Global);
	}

	public async setTokenPrefix(prefix: string): Promise<void> {
		await vscode.workspace.getConfiguration("maiflow").update("tokenPrefix", prefix, vscode.ConfigurationTarget.Global);
	}

	public async isConfigured(tokenStore: { hasToken(endpoint: string): Promise<boolean> }): Promise<boolean> {
		try {
			return await tokenStore.hasToken(normalizeEndpoint(this.getServerUrl()));
		} catch {
			return false;
		}
	}

	public async getMapping(): Promise<{ flowId: string; projectId: string; useForNewTasks: boolean }> {
		return {
			flowId: this.context.workspaceState.get<string>("maiflow.flowId", ""),
			projectId: this.context.workspaceState.get<string>("maiflow.projectId", ""),
			useForNewTasks: this.context.workspaceState.get<boolean>("maiflow.useMappingForNewTasks", false),
		};
	}

	public async setMapping(flowId: string, projectId: string, useForNewTasks: boolean): Promise<void> {
		await this.context.workspaceState.update("maiflow.flowId", flowId.trim());
		await this.context.workspaceState.update("maiflow.projectId", projectId.trim());
		await this.context.workspaceState.update("maiflow.useMappingForNewTasks", useForNewTasks);
	}

	public getStatusText(): string {
		const prefix = this.getTokenPrefix();
		const last = this.getLastSuccessfulConnectionAt();
		if (!prefix) {return "No token configured. Test the connection after saving your settings.";}
		if (!last) {return `Token: ${prefix}. Test the connection after saving your settings.`;}
		return `Token: ${prefix}. Last successful connection: ${new Date(last).toLocaleString()}`;
	}
}
