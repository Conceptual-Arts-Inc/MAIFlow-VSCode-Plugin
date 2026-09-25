import * as vscode from "vscode";
import { MAIFlowApiError } from "../api/maiflowApiError";

export const showMAIFlowError = async (error: unknown): Promise<void> => {
	const apiError = error instanceof MAIFlowApiError ? error : undefined;
	const message = apiError?.message ?? (error instanceof Error ? error.message : "MAIFlow request failed.");
	const actions: string[] = [];
	if (apiError?.kind === "authentication" || apiError?.kind === "configuration") {actions.push("Settings");}
	if (apiError?.kind === "paid-plan" || apiError?.kind === "permission") {actions.push("Profile");}
	if (apiError?.canRetryRead || apiError?.kind === "network" || apiError?.kind === "not-found") {actions.push("Retry");}
	const choice = await vscode.window.showErrorMessage(message, ...actions);
	if (choice === "Settings") {await vscode.commands.executeCommand("maiflow.openSettings");}
	if (choice === "Profile") {await vscode.commands.executeCommand("maiflow.openProfile");}
	if (choice === "Retry") {await vscode.commands.executeCommand("maiflow.refresh");}
};

export const updateConfiguredContext = async (configured: boolean): Promise<void> => {
	await vscode.commands.executeCommand("setContext", "maiflow.configured", configured);
};
