import * as vscode from "vscode";
import { CreateTaskRequest } from "../model/workspaceModels";
import { MAIFlowWorkspaceService } from "../services/maiflowWorkspaceService";
import { showMAIFlowError } from "./commandSupport";

export const createTask = async (service: MAIFlowWorkspaceService): Promise<void> => {
	let snapshot = service.getSnapshot();
	if (!snapshot) {
		await service.refresh();
		snapshot = service.getSnapshot();
	}
	if (!snapshot?.flows.length) {
		vscode.window.showWarningMessage("Refresh MAIFlow to load at least one reachable flow before creating a task.");
		return;
	}
	const mapping = await service.getMapping();
	const title = await vscode.window.showInputBox({ title: "Create MAIFlow task", prompt: "Task title", ignoreFocusOut: true, validateInput: (value) => value.trim() ? undefined : "A task title is required." });
	if (title === undefined) {return;}
	const mappedFlow = mapping.useForNewTasks ? snapshot.flows.find((item) => item.id === mapping.flowId) : undefined;
	const flow = await vscode.window.showQuickPick([
		...(mappedFlow ? [{ label: `Use workspace mapping: ${mappedFlow.name}`, description: mappedFlow.scope, item: mappedFlow }] : []),
		...snapshot.flows.filter((item) => item.id !== mappedFlow?.id).map((item) => ({ label: item.name, description: item.scope, item })),
	], { title: "Choose a MAIFlow flow", placeHolder: "Flow for the new task", canPickMany: false });
	if (!flow) {return;}
	const mappedProject = mapping.useForNewTasks ? snapshot.projects.find((item) => item.id === mapping.projectId) : undefined;
	const project = await vscode.window.showQuickPick([
		...(mappedProject ? [{ label: `Use workspace mapping: ${mappedProject.name}`, description: mappedProject.description, item: mappedProject }] : []),
		{ label: "No project", item: undefined },
		...snapshot.projects.filter((item) => item.id !== mappedProject?.id).map((item) => ({ label: item.name, description: item.description, item })),
	], { title: "Choose a project (optional)", canPickMany: false, placeHolder: "Project grouping" });
	if (!project) {return;}
	const description = await vscode.window.showInputBox({ title: "Create MAIFlow task", prompt: "Description (optional; source code and selected text are never included)", ignoreFocusOut: true });
	if (description === undefined) {return;}
	const priority = await scoreInput("Priority", 5); if (priority === undefined) {return;}
	const urgency = await scoreInput("Urgency", priority); if (urgency === undefined) {return;}
	const impact = await scoreInput("Impact", priority); if (impact === undefined) {return;}
	const effortPoints = await scoreInput("Effort", 3); if (effortPoints === undefined) {return;}
	const request: CreateTaskRequest = { title, flowId: flow.item.id, projectId: project.item?.id, description, priority, urgency, impact, effortPoints };
	try {
		await service.createTask(request);
		vscode.window.showInformationMessage("MAIFlow task created successfully.");
	} catch (error) {
		await showMAIFlowError(error);
	}
};

const scoreInput = async (label: string, value: number): Promise<number | undefined> => {
	const input = await vscode.window.showInputBox({ title: "Create MAIFlow task", prompt: `${label} score from 0 to 10`, value: String(value), ignoreFocusOut: true, validateInput: (raw) => /^(?:10|[0-9])$/.test(raw) ? undefined : "Enter an integer from 0 to 10." });
	return input === undefined ? undefined : Number(input);
};
