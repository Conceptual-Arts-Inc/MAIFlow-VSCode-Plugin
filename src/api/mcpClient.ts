import { MAIFlowApiError } from "./maiflowApiError";
import { McpCapabilityCatalog, McpInitialization, McpRoute, McpToolResult, asRecord, isRecord } from "./mcpModels";
import { McpHttpTransport, McpTransport } from "./mcpHttpTransport";

export class McpClient {
	private nextRequestId = 0;

	public constructor(private readonly transport: McpTransport = new McpHttpTransport(), private readonly log?: (message: string) => void) {}

	public async initialize(endpoint: string, token: string, pluginVersion: string, signal?: AbortSignal): Promise<McpInitialization> {
		const result = await this.callRpc(endpoint, token, "initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "maiflow-vscode-plugin", version: pluginVersion },
		}, signal);
		const protocolVersion = typeof result.protocolVersion === "string" ? result.protocolVersion : undefined;
		if (!protocolVersion) {throw this.protocolError("initialize result omitted protocolVersion");}
		const serverInfo = asRecord(result.serverInfo);
		return {
			protocolVersion,
			serverName: typeof serverInfo?.name === "string" ? serverInfo.name : undefined,
			serverVersion: typeof serverInfo?.version === "string" ? serverInfo.version : undefined,
		};
	}

	public async capabilities(endpoint: string, token: string, signal?: AbortSignal): Promise<McpCapabilityCatalog> {
		const result = await this.callTool(endpoint, token, "maiflow_capabilities", {}, signal);
		const document = result.structuredContent ?? this.parseTextObject(result.textContent, "capabilities content");
		const rawRoutes = Array.isArray(document?.routes) ? document.routes : undefined;
		if (!rawRoutes) {throw this.protocolError("capabilities result omitted routes");}
		const routes: McpRoute[] = rawRoutes.flatMap((value) => {
			if (!isRecord(value) || typeof value.path !== "string" || !Array.isArray(value.methods)) {return [];}
			const methods = new Set(value.methods.filter((method): method is string => typeof method === "string").map((method) => method.toUpperCase()));
			return methods.size ? [{ path: value.path, methods, description: typeof value.description === "string" ? value.description : "" }] : [];
		});
		return new McpCapabilityCatalog(typeof document?.endpoint === "string" ? document.endpoint : "/api/mcp", routes);
	}

	public async callTool(endpoint: string, token: string, name: string, argumentsValue: Record<string, unknown>, signal?: AbortSignal): Promise<McpToolResult> {
		const result = await this.callRpc(endpoint, token, "tools/call", { name, arguments: argumentsValue }, signal);
		return {
			structuredContent: asRecord(result.structuredContent),
			textContent: this.textContent(result),
			isError: result.isError === true,
		};
	}

	private async callRpc(endpoint: string, token: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
		const id = ++this.nextRequestId;
		const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
		const response = await this.transport.post(endpoint, token, body, signal);
		const root = this.parseObject(response.body, "JSON-RPC response", response.status);
		if (response.status < 200 || response.status >= 300) {
			const error = asRecord(root.error);
			throw MAIFlowApiError.fromStatus(response.status, typeof error?.message === "string" ? error.message : undefined);
		}
		if (root.jsonrpc !== "2.0") {throw this.protocolError("JSON-RPC version was not 2.0");}
		if (root.id !== id && root.id !== String(id)) {throw this.protocolError("JSON-RPC response id did not match the request");}
		const rpcError = asRecord(root.error);
		if (rpcError) {
			const code = typeof rpcError.code === "number" ? rpcError.code : undefined;
			const status = code === -32001 ? 401 : code === -32002 ? 402 : code === -32003 ? 403 : undefined;
			if (status) {throw MAIFlowApiError.fromStatus(status, typeof rpcError.message === "string" ? rpcError.message : undefined);}
			throw this.protocolError(`JSON-RPC error ${code ?? "unknown"}: ${typeof rpcError.message === "string" ? MAIFlowApiError.sanitize(rpcError.message) : "request failed"}`);
		}
		const result = asRecord(root.result);
		if (!result) {throw this.protocolError("JSON-RPC response omitted result");}
		return result;
	}

	private parseObject(body: string, context: string, status?: number): Record<string, unknown> {
		try {
			const parsed: unknown = JSON.parse(body);
			if (!isRecord(parsed)) {throw new Error("response was not an object");}
			return parsed;
		} catch (error) {
			if (status !== undefined && (status < 200 || status >= 300)) {throw MAIFlowApiError.fromStatus(status);}
			this.log?.(`MAIFlow protocol error: ${context} was malformed (bodyLength=${body.length})`);
			throw this.protocolError(`${context} was malformed`, error);
		}
	}

	private parseTextObject(text: string | undefined, context: string): Record<string, unknown> | undefined {
		if (!text) {return undefined;}
		try {
			const parsed: unknown = JSON.parse(text);
			return isRecord(parsed) ? parsed : undefined;
		} catch (error) {
			throw this.protocolError(`${context} was not valid JSON`, error);
		}
	}

	private textContent(result: Record<string, unknown>): string | undefined {
		if (!Array.isArray(result.content)) {return undefined;}
		const item = result.content.find((value) => isRecord(value) && value.type === "text");
		return isRecord(item) && typeof item.text === "string" ? item.text : undefined;
	}

	private protocolError(detail: string, cause?: unknown): MAIFlowApiError {
		this.log?.(`MAIFlow protocol error: ${MAIFlowApiError.sanitize(detail)}`);
		return MAIFlowApiError.protocol(detail, cause);
	}
}
