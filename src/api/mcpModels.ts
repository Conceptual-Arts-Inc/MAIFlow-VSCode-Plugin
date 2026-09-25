export interface McpHttpResponse {
	status: number;
	body: string;
}

export interface McpRoute {
	path: string;
	methods: Set<string>;
	description: string;
}

export class McpCapabilityCatalog {
	public constructor(public readonly endpoint: string, public readonly routes: readonly McpRoute[]) {}

	public allows(method: string, path: string): boolean {
		return this.routes.some((route) => {
			const routeSegments = route.path.split("/");
			const pathSegments = path.split("/");
			return route.methods.has(method.toUpperCase()) && routeSegments.length === pathSegments.length &&
				routeSegments.every((segment, index) => segment.startsWith(":") || segment === pathSegments[index]);
		});
	}
}

export interface McpToolResult {
	structuredContent?: Record<string, unknown>;
	textContent?: string;
	isError: boolean;
}

export interface McpInitialization {
	protocolVersion: string;
	serverName?: string;
	serverVersion?: string;
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> | undefined => isRecord(value) ? value : undefined;
