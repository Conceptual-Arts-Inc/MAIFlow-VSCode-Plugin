import * as vscode from "vscode";
import { taskStatusLabel, TASK_STATUSES, TaskStatus, TaskSummary, UpdateTaskRequest } from "../model/workspaceModels";
import { MAIFlowWorkspaceService } from "../services/maiflowWorkspaceService";
import { MAIFlowSettings } from "../services/maiflowSettings";
import { MAIFlowApiError } from "../api/maiflowApiError";
import { taskUrl } from "../api/endpointIdentity";

const panels = new Map<string, vscode.WebviewPanel>();

export const openTaskDetail = (context: vscode.ExtensionContext, task: TaskSummary, service: MAIFlowWorkspaceService, settings: MAIFlowSettings): void => {
	service.setSelectedTask(task);
	const existing = panels.get(task.id);
	if (existing) {
		existing.reveal(vscode.ViewColumn.Beside);
		existing.webview.html = renderHtml(existing.webview, task);
		return;
	}

	const panel = vscode.window.createWebviewPanel("maiflow.taskDetail", `MAIFlow: ${task.title}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
	panels.set(task.id, panel);
	panel.webview.html = renderHtml(panel.webview, task);
	const messageSubscription = panel.webview.onDidReceiveMessage(async (message: unknown) => {
		if (!isRecord(message)) {return;}
		if (message.type === "open") {
			await vscode.env.openExternal(vscode.Uri.parse(taskUrl(settings.getServerUrl(), task.id)));
			return;
		}
		if (message.type !== "update" || !isRecord(message.data)) {return;}
		try {
			const request = parseUpdate(message.data);
			await service.updateTask(task.id, request);
			vscode.window.showInformationMessage("MAIFlow task updated successfully.");
			panel.webview.postMessage({ type: "saved" });
		} catch (error) {
			vscode.window.showErrorMessage(error instanceof MAIFlowApiError ? error.message : error instanceof Error ? error.message : "Could not update the MAIFlow task.");
		}
	});
	panel.onDidDispose(() => {
		panels.delete(task.id);
		messageSubscription.dispose();
	}, undefined, context.subscriptions);
};

const parseUpdate = (data: Record<string, unknown>): UpdateTaskRequest => {
	const status = data.status;
	if (typeof data.title !== "string" || typeof data.description !== "string" || typeof status !== "string" || !TASK_STATUSES.includes(status as TaskStatus)) {throw new Error("Task details are invalid.");}
	const numeric = (key: string): number => {
		const value = data[key];
		if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {throw new Error(`${key} must be between 0 and 10.`);}
		return value;
	};
	return { title: data.title, description: data.description, status: status as TaskStatus, priority: numeric("priority"), urgency: numeric("urgency"), impact: numeric("impact"), effortPoints: numeric("effortPoints") };
};

const renderHtml = (webview: vscode.Webview, task: TaskSummary): string => {
	const nonce = Math.random().toString(36).slice(2);
	const option = (status: TaskStatus): string => `<option value="${status}" ${task.status === status ? "selected" : ""}>${taskStatusLabel(status)}</option>`;
	const value = (value: string | number): string => escapeHtml(String(value));
	const project = task.projectName ?? "No project";
	const assignee = task.assignee?.name ?? "Unassigned";
	const statusClass = task.status.replace("_", "-");
	return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MAIFlow task</title>
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:28px 24px 36px;max-width:720px;margin:auto;line-height:1.45}
.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--vscode-panel-border)}
.eyebrow,.section-title,label{font-size:11px;color:var(--vscode-descriptionForeground);letter-spacing:.04em;text-transform:uppercase}
h1{font-size:22px;line-height:1.25;margin:4px 0 8px;font-weight:600}.context{color:var(--vscode-descriptionForeground);font-size:13px}
.status{flex:none;border:1px solid var(--vscode-widget-border);border-radius:999px;padding:4px 9px;font-size:12px;white-space:nowrap}.status.in-progress{border-color:var(--vscode-charts-blue);color:var(--vscode-charts-blue)}.status.blocked{border-color:var(--vscode-charts-red);color:var(--vscode-charts-red)}.status.completed{border-color:var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
.section{margin-top:24px}.section-title{margin:0 0 10px;font-weight:600}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}.field{display:flex;flex-direction:column;gap:6px}.wide{grid-column:1/-1}label{letter-spacing:0;text-transform:none}input,textarea,select{box-sizing:border-box;width:100%;font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:4px;padding:8px 10px}input:focus,textarea:focus,select:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}textarea{min-height:112px;resize:vertical}
.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}.info{padding:9px 10px;border:1px solid var(--vscode-widget-border);background:var(--vscode-textBlockQuote-background)}.info label{display:block;margin-bottom:3px}.readonly{color:var(--vscode-foreground);font-size:13px;overflow-wrap:anywhere}
.actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:26px;padding-top:18px;border-top:1px solid var(--vscode-panel-border)}button{font:inherit;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:2px;padding:8px 12px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}#saved{color:var(--vscode-testing-iconPassed);font-size:13px}
@media(max-width:560px){body{padding:20px 16px}.header{display:block}.status{display:inline-block;margin-top:12px}.grid,.info-grid{grid-template-columns:1fr}.wide{grid-column:auto}}
</style></head><body>
<header class="header"><div><div class="eyebrow">MAIFlow task</div><h1>${value(task.title || "Untitled task")}</h1><div class="context">${value(task.flowName)} · ${value(project)} · Engine score ${value(task.engineScore)}</div></div><div class="status ${statusClass}">${value(taskStatusLabel(task.status))}</div></header>
<form id="form">
<section class="section"><h2 class="section-title">Task details</h2><div class="grid">
<div class="field wide"><label for="title">Title</label><input id="title" maxlength="160" required value="${value(task.title)}"></div>
<div class="field wide"><label for="description">Description</label><textarea id="description" maxlength="4000">${value(task.description)}</textarea></div>
</div></section>
<section class="section"><h2 class="section-title">Planning</h2><div class="grid">
<div class="field"><label for="status">Status</label><select id="status">${TASK_STATUSES.map(option).join("")}</select></div>
<div class="field"><label for="priority">Priority <span>(0–10)</span></label><input id="priority" type="number" min="0" max="10" value="${value(task.priority)}"></div>
<div class="field"><label for="urgency">Urgency <span>(0–10)</span></label><input id="urgency" type="number" min="0" max="10" value="${value(task.urgency)}"></div>
<div class="field"><label for="impact">Impact <span>(0–10)</span></label><input id="impact" type="number" min="0" max="10" value="${value(task.impact)}"></div>
<div class="field"><label for="effortPoints">Effort <span>(0–10)</span></label><input id="effortPoints" type="number" min="0" max="10" value="${value(task.effortPoints)}"></div>
</div></section>
<section class="section"><h2 class="section-title">Context</h2><div class="info-grid">
<div class="info"><label>Flow</label><div class="readonly">${value(task.flowName)}</div></div><div class="info"><label>Project</label><div class="readonly">${value(project)}</div></div>
<div class="info"><label>Assignee</label><div class="readonly">${value(assignee)}</div></div><div class="info"><label>Engine score</label><div class="readonly">${value(task.engineScore)}</div></div>
</div></section>
<div class="actions"><button type="submit">Save changes</button><button type="button" class="secondary" id="open">Open in MAIFlow</button><span id="saved" hidden>Saved</span></div></form>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();const form=document.getElementById('form');const get=(id)=>document.getElementById(id);form.addEventListener('submit',(event)=>{event.preventDefault();vscode.postMessage({type:'update',data:{title:get('title').value,description:get('description').value,status:get('status').value,priority:Number(get('priority').value),urgency:Number(get('urgency').value),impact:Number(get('impact').value),effortPoints:Number(get('effortPoints').value)}})});get('open').addEventListener('click',()=>vscode.postMessage({type:'open'}));window.addEventListener('message',(event)=>{if(event.data&&event.data.type==='saved'){get('saved').hidden=false;setTimeout(()=>get('saved').hidden=true,2500)}});</script></body></html>`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
