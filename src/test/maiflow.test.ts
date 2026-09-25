import * as assert from "assert";
import { endpointOrigin, normalizeEndpoint } from "../api/endpointIdentity";
import { mapWorkspace } from "../api/maiflowApi";
import { MAIFlowApiError } from "../api/maiflowApiError";
import { McpClient } from "../api/mcpClient";
import { McpTransport } from "../api/mcpHttpTransport";

suite("MAIFlow protocol and endpoint tests", () => {
	test("normalizes secure endpoints and derives the app origin", () => {
		assert.strictEqual(normalizeEndpoint(" HTTPS://APP.MAIFLOW.ORG/api/mcp/ "), "https://app.maiflow.org/api/mcp");
		assert.strictEqual(endpointOrigin("https://app.maiflow.org/api/mcp"), "https://app.maiflow.org");
		assert.strictEqual(normalizeEndpoint("http://[::1]:3000/api/mcp/"), "http://[::1]:3000/api/mcp");
	});

	test("rejects insecure non-loopback endpoints and URL credentials", () => {
		assert.throws(() => normalizeEndpoint("http://example.com/api/mcp"), /HTTPS is required/);
		assert.throws(() => normalizeEndpoint("https://user:password@example.com/api/mcp"), /credentials/);
		assert.throws(() => normalizeEndpoint("https://example.com/api/mcp?token=secret"), /query/);
	});

	test("maps documented HTTP statuses without exposing a token", () => {
		const error = MAIFlowApiError.fromStatus(403, "authorization failed for mf_live_secret_value");
		assert.strictEqual(error.status, 403);
		assert.strictEqual(error.kind, "permission");
		assert.ok(!error.message.includes("mf_live_secret_value"));
	});

	test("preserves MAIFlow engine scores instead of clamping them to input-score range", () => {
		const snapshot = mapWorkspace({
			flows: [{ id: "flow-1", name: "Planning" }],
			tasks: [
				{ id: "task-1", title: "High score", flowId: "flow-1", priority: "0", urgency: "10", impact: "0", effort_points: "10", engineScore: "321" },
				{ id: "task-2", title: "Fallback score", flowId: "flow-1", priority: 4, score_engine_score: 987 },
			],
		});
		assert.strictEqual(snapshot.tasks[0].priority, 0);
		assert.strictEqual(snapshot.tasks[0].urgency, 10);
		assert.strictEqual(snapshot.tasks[0].impact, 0);
		assert.strictEqual(snapshot.tasks[0].effortPoints, 10);
		assert.strictEqual(snapshot.tasks[0].engineScore, 321);
		assert.strictEqual(snapshot.tasks[1].engineScore, 987);
	});

	test("initializes MCP and extracts structured capabilities", async () => {
		const transport = new RecordingTransport();
		const client = new McpClient(transport);
		const initialization = await client.initialize("https://app.maiflow.org/api/mcp", "mf_live_test", "1.0.0");
		const catalog = await client.capabilities("https://app.maiflow.org/api/mcp", "mf_live_test");
		assert.strictEqual(initialization.protocolVersion, "2025-06-18");
		assert.ok(catalog.allows("GET", "/api/workspace/tasks"));
		assert.ok(catalog.allows("PUT", "/api/tasks/task-123"));
		assert.ok(!catalog.allows("DELETE", "/api/tasks/task-123"));
		assert.strictEqual(transport.methods[0], "initialize");
		assert.strictEqual(transport.methods[1], "tools/call");
	});
});

class RecordingTransport implements McpTransport {
	public readonly methods: string[] = [];

	public async post(_endpoint: string, _token: string, body: string): Promise<{ status: number; body: string }> {
		const request = JSON.parse(body) as { id: number; method: string; params?: { name?: string } };
		this.methods.push(request.method);
		if (request.method === "initialize") {return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "maiflow" } } }) };}
		return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { structuredContent: { endpoint: "/api/mcp", routes: [{ path: "/api/workspace/tasks", methods: ["GET"] }, { path: "/api/tasks/:taskId", methods: ["PUT"] }] } } }) };
	}
}
