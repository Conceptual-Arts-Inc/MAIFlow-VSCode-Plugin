import * as vscode from "vscode";
import { normalizeEndpoint } from "../api/endpointIdentity";
import { MAIFlowApi } from "../api/maiflowApi";
import { showMAIFlowError, updateConfiguredContext } from "./commandSupport";
import { MAIFlowSettings } from "../services/maiflowSettings";
import { MAIFlowTokenStore } from "../services/maiflowTokenStore";

export const testConnection = async (settings: MAIFlowSettings, tokenStore: MAIFlowTokenStore, api: MAIFlowApi): Promise<void> => {
	let endpoint: string;
	try { endpoint = normalizeEndpoint(settings.getServerUrl()); }
	catch (error) { await showMAIFlowError(error); return; }
	const token = await tokenStore.readToken(endpoint);
	if (!token) {
		const action = await vscode.window.showWarningMessage("Add an MAIFlow API token before testing the connection.", "Configure MAIFlow", "Open Settings");
		if (action === "Configure MAIFlow") {await vscode.commands.executeCommand("maiflow.configure");}
		if (action === "Open Settings") {await vscode.commands.executeCommand("maiflow.openSettings");}
		return;
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Testing MAIFlow connection", cancellable: true }, async (_progress, cancellationToken) => {
		const controller = new AbortController();
		const cancellation = cancellationToken.onCancellationRequested(() => controller.abort());
		try {
			const result = await api.testConnection(endpoint, token, controller.signal);
			await settings.recordSuccessfulConnection(endpoint, tokenStore.redactedPrefix(token));
			await updateConfiguredContext(true);
			vscode.window.showInformationMessage(`MAIFlow connection succeeded (${result.catalog.routes.length} routes available).`);
		} catch (error) {
			if (!controller.signal.aborted) {await showMAIFlowError(error);}
		} finally {
			cancellation.dispose();
		}
	});
};
