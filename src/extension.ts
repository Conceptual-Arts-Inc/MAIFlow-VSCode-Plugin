import * as vscode from "vscode";
import { normalizeEndpoint, profileUrl } from "./api/endpointIdentity";
import { MAIFlowApi } from "./api/maiflowApi";
import { configureMAIFlow } from "./commands/configureMAIFlow";
import { createTask } from "./commands/createTask";
import { filterTasks } from "./commands/filterTasks";
import { mapWorkspace } from "./commands/mapWorkspace";
import { openSelectedTaskInMAIFlow, openTask } from "./commands/openTask";
import { showMAIFlowError, updateConfiguredContext } from "./commands/commandSupport";
import { testConnection } from "./commands/testConnection";
import { MAIFlowSettings } from "./services/maiflowSettings";
import { MAIFlowTokenStore } from "./services/maiflowTokenStore";
import { MAIFlowWorkspaceService } from "./services/maiflowWorkspaceService";
import { MAIFlowTreeDataProvider } from "./views/maiflowTreeDataProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel("MAIFlow");
	const settings = new MAIFlowSettings(context);
	const tokenStore = new MAIFlowTokenStore(context.secrets);
	const packageVersion = String((context.extension.packageJSON as { version?: unknown }).version ?? "1.0.0");
	const api = new MAIFlowApi(settings, tokenStore, packageVersion, (message) => output.appendLine(message));
	const service = new MAIFlowWorkspaceService(api, settings, tokenStore);
	const provider = new MAIFlowTreeDataProvider(service);
	const treeView = vscode.window.createTreeView("maiflow.view", { treeDataProvider: provider, showCollapseAll: false });

	context.subscriptions.push(output, service, provider, treeView);
	await updateConfiguredContext(await settings.isConfigured(tokenStore));

	const refresh = async (): Promise<void> => { await service.refresh(); };
	const openView = async (): Promise<void> => {
		const configured = await settings.isConfigured(tokenStore);
		await vscode.commands.executeCommand("setContext", "maiflow.showUnconfigured", !configured);
		if (!configured) {
			await vscode.commands.executeCommand("workbench.view.extension.maiflow");
			return;
		}
		await vscode.commands.executeCommand("workbench.view.extension.maiflow");
	};

	context.subscriptions.push(
		vscode.commands.registerCommand("maiflow.open", openView),
		vscode.commands.registerCommand("maiflow.configure", () => configureMAIFlow(settings, tokenStore, api)),
		vscode.commands.registerCommand("maiflow.testConnection", () => testConnection(settings, tokenStore, api)),
		vscode.commands.registerCommand("maiflow.refresh", refresh),
		vscode.commands.registerCommand("maiflow.createTask", () => createTask(service)),
		vscode.commands.registerCommand("maiflow.openTask", (task) => openTask(context, service, settings, task)),
		vscode.commands.registerCommand("maiflow.openSelection", () => openSelectedTaskInMAIFlow(service, settings)),
		vscode.commands.registerCommand("maiflow.mapWorkspace", () => mapWorkspace(service)),
		vscode.commands.registerCommand("maiflow.filter", () => filterTasks(provider, service)),
		vscode.commands.registerCommand("maiflow.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", "@ext:conceptualarts.maiflow")),
		vscode.commands.registerCommand("maiflow.openProfile", async () => {
			try { await vscode.env.openExternal(vscode.Uri.parse(profileUrl(settings.getServerUrl()))); }
			catch (error) { await showMAIFlowError(error); }
		}),
		vscode.commands.registerCommand("maiflow.copyMcpTemplate", async () => {
			try {
				const endpoint = normalizeEndpoint(settings.getServerUrl());
				await vscode.env.clipboard.writeText(JSON.stringify({ mcpServers: { maiflow: { url: endpoint, headers: { Authorization: "Bearer mf_live_<paste-token-from-profile>" } } } }, null, 2));
				vscode.window.showInformationMessage("Copied a redacted MAIFlow MCP template.");
			} catch (error) { await showMAIFlowError(error); }
		}),
		vscode.commands.registerCommand("maiflow.clearToken", async () => {
			try {
				const endpoint = normalizeEndpoint(settings.getServerUrl());
				const confirmation = await vscode.window.showWarningMessage("Clear the MAIFlow token stored for this endpoint?", { modal: true }, "Clear token");
				if (confirmation !== "Clear token") {return;}
				await tokenStore.clearToken(endpoint);
				await settings.clearConnectionMetadata();
				api.clearSession();
				await updateConfiguredContext(false);
				await service.refresh();
				vscode.window.showInformationMessage("MAIFlow token cleared.");
			} catch (error) { await showMAIFlowError(error); }
		}),
		treeView.onDidChangeVisibility((event) => { if (event.visible) {void refresh();} }),
		vscode.workspace.onDidChangeConfiguration(async (event) => {
			if (!event.affectsConfiguration("maiflow.serverUrl")) {return;}
			api.clearSession();
			await settings.clearConnectionMetadata();
			await updateConfiguredContext(await settings.isConfigured(tokenStore));
			void refresh();
		}),
	);
}

export function deactivate(): void {
	// Workspace service disposal cancels any in-flight network request.
}
