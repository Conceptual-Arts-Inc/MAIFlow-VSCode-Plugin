import { MAIFlowApiError } from "./maiflowApiError";
import { McpHttpResponse } from "./mcpModels";

export interface McpTransport {
	post(endpoint: string, token: string, body: string, signal?: AbortSignal): Promise<McpHttpResponse>;
}

/** The only module that transports JSON-RPC over HTTP. It never logs credentials or response bodies. */
export class McpHttpTransport implements McpTransport {
	public constructor(private readonly timeoutMs = 45_000) {}

	public async post(endpoint: string, token: string, body: string, signal?: AbortSignal): Promise<McpHttpResponse> {
		const controller = new AbortController();
		const abortFromCaller = (): void => controller.abort();
		signal?.addEventListener("abort", abortFromCaller, { once: true });
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body,
				redirect: "manual",
				signal: controller.signal,
			});
			return { status: response.status, body: await response.text() };
		} catch (error) {
			if (signal?.aborted) {throw MAIFlowApiError.network("The MAIFlow request was cancelled.", error);}
			if (controller.signal.aborted) {throw MAIFlowApiError.network("MAIFlow did not respond before the request timed out.", error);}
			throw MAIFlowApiError.network("Could not connect to MAIFlow. Check the server URL and your network connection.", error);
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abortFromCaller);
		}
	}
}
