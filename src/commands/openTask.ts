import * as vscode from "vscode";
import { TaskSummary } from "../model/workspaceModels";
import { MAIFlowSettings } from "../services/maiflowSettings";
import { MAIFlowWorkspaceService } from "../services/maiflowWorkspaceService";
import { taskUrl } from "../api/endpointIdentity";
import { openTaskDetail } from "../views/taskDetail";

export const openTask = async (context: vscode.ExtensionContext, service: MAIFlowWorkspaceService, settings: MAIFlowSettings, task?: TaskSummary): Promise<void> => {
	const selected = task ?? service.getSelectedTask();
	if (!selected) {return;}
	openTaskDetail(context, selected, service, settings);
};

export const openSelectedTaskInMAIFlow = async (service: MAIFlowWorkspaceService, settings: MAIFlowSettings): Promise<void> => {
	const selected = service.getSelectedTask();
	if (selected) {await vscode.env.openExternal(vscode.Uri.parse(taskUrl(settings.getServerUrl(), selected.id)));}
};
