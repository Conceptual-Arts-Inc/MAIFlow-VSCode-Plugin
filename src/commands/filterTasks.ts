import * as vscode from "vscode";
import { MAIFlowTreeDataProvider } from "../views/maiflowTreeDataProvider";
import { MAIFlowWorkspaceService } from "../services/maiflowWorkspaceService";

export const filterTasks = async (provider: MAIFlowTreeDataProvider, service: MAIFlowWorkspaceService): Promise<void> => {
	const snapshot = service.getSnapshot();
	if (!snapshot) {return;}
	const flow = await vscode.window.showQuickPick([{ label: "All flows", id: undefined }, ...snapshot.flows.map((item) => ({ label: item.name, id: item.id }))], { title: "Filter MAIFlow tasks by flow" });
	if (!flow) {return;}
	const project = await vscode.window.showQuickPick([{ label: "All projects", id: undefined }, ...snapshot.projects.map((item) => ({ label: item.name, id: item.id }))], { title: "Filter MAIFlow tasks by project" });
	if (!project) {return;}
	provider.setFilter({ flowId: flow.id, projectId: project.id });
};
