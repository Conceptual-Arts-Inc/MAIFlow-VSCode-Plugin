import * as vscode from "vscode";
import { MAIFlowWorkspaceService } from "../services/maiflowWorkspaceService";

export const mapWorkspace = async (service: MAIFlowWorkspaceService): Promise<void> => {
	const snapshot = service.getSnapshot();
	if (!snapshot) {
		vscode.window.showWarningMessage("Refresh MAIFlow before mapping this workspace.");
		return;
	}
	const current = await service.getMapping();
	const flow = await vscode.window.showQuickPick([{ label: "Clear mapping", item: undefined }, ...snapshot.flows.map((item) => ({ label: item.name, description: item.scope, item }))], { title: "Map workspace to a MAIFlow flow", placeHolder: "Flow used for new tasks" });
	if (!flow) {return;}
	let projectId = "";
	if (flow.item) {
		const project = await vscode.window.showQuickPick([{ label: "No project", item: undefined }, ...snapshot.projects.map((item) => ({ label: item.name, description: item.description, item }))], { title: "Map workspace to a project (optional)" });
		if (!project) {return;}
		projectId = project.item?.id ?? "";
	}
	const use = flow.item ? await vscode.window.showQuickPick(["Use this mapping for new tasks", "Save mapping only"], { title: "Use mapping for new tasks?" }) : "Save mapping only";
	if (!use) {return;}
	await service.setMapping({ flowId: flow.item?.id ?? "", projectId, useForNewTasks: use === "Use this mapping for new tasks" });
	vscode.window.showInformationMessage(flow.item ? "MAIFlow workspace mapping saved." : "MAIFlow workspace mapping cleared.");
	void current;
};
