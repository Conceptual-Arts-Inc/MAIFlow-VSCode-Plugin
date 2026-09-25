import * as vscode from "vscode";
import { normalizeEndpoint } from "../api/endpointIdentity";
import { MAIFlowApi } from "../api/maiflowApi";
import { MAIFlowSettings } from "../services/maiflowSettings";
import { MAIFlowTokenStore } from "../services/maiflowTokenStore";
import { updateConfiguredContext, showMAIFlowError } from "./commandSupport";

export const configureMAIFlow = async (settings: MAIFlowSettings, tokenStore: MAIFlowTokenStore, api: MAIFlowApi): Promise<void> => {
	const currentEndpoint = settings.getServerUrl();
	const endpointValue = await vscode.window.showInputBox({
		title: "Configure MAIFlow",
		prompt: "MAIFlow MCP server URL",
		value: currentEndpoint,
		ignoreFocusOut: true,
		validateInput: (value) => {
			try { normalizeEndpoint(value); return undefined; }
			catch (error) { return error instanceof Error ? error.message : "Enter a valid MAIFlow server URL."; }
		},
	});
	if (endpointValue === undefined) {return;}
	const endpoint = normalizeEndpoint(endpointValue);
	const token = await vscode.window.showInputBox({
		title: "Configure MAIFlow",
		prompt: "MAIFlow API token from Profile → API access (leave blank to keep the existing token)",
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => value && !value.startsWith("mf_live_") ? "MAIFlow API tokens must start with mf_live_." : undefined,
	});
	if (token === undefined) {return;}
	const suppliedToken = token.trim();
	const effectiveToken = suppliedToken || await tokenStore.readToken(endpoint);
	if (!effectiveToken) {
		vscode.window.showWarningMessage("Enter an MAIFlow API token before continuing.");
		return;
	}
	try {
		const previousEndpoint = (() => { try { return normalizeEndpoint(currentEndpoint); } catch { return ""; } })();
		if (endpoint !== previousEndpoint) {await settings.clearConnectionMetadata();}
		await settings.updateServerUrl(endpoint);
		if (suppliedToken) {
			await tokenStore.saveToken(endpoint, suppliedToken);
			await settings.setTokenPrefix(tokenStore.redactedPrefix(suppliedToken));
		}
		api.clearSession();
		await updateConfiguredContext(true);
		vscode.window.showInformationMessage("MAIFlow settings saved. Test the connection to verify access.");
	} catch (error) {
		await showMAIFlowError(error);
	}
};
