export const DEFAULT_ENDPOINT = "https://app.maiflow.org/api/mcp";

export const isLoopback = (host: string): boolean => {
	const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
	return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1";
};

export const normalizeEndpoint = (raw: string): string => {
	const value = raw.trim();
	if (!value) {throw new Error("MAIFlow server URL cannot be empty.");}

	let url: URL;
	try {
		url = new URL(value);
	} catch (error) {
		throw new Error("MAIFlow server URL is not valid.", { cause: error });
	}

	const scheme = url.protocol.toLowerCase();
	if (scheme !== "https:" && scheme !== "http:") {throw new Error("MAIFlow server URL must use HTTP or HTTPS.");}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error("MAIFlow server URL must not contain credentials, a query, or a fragment.");
	}
	const host = url.hostname.toLowerCase();
	if (!host) {throw new Error("MAIFlow server URL must include a host.");}
	if (scheme === "http:" && !isLoopback(host)) {throw new Error("HTTPS is required for non-local MAIFlow endpoints.");}

	const path = url.pathname.replace(/\/+$/, "") || "/api/mcp";
	const port = url.port && !((scheme === "https:" && url.port === "443") || (scheme === "http:" && url.port === "80"))
		? `:${url.port}`
		: "";
	const authority = host.includes(":") ? `[${host.replace(/^\[|\]$/g, "")}]` : host;
	return `${scheme}//${authority}${port}${path}`;
};

export const endpointOrigin = (endpoint: string): string => {
	const url = new URL(normalizeEndpoint(endpoint));
	return `${url.protocol}//${url.host}`;
};

export const profileUrl = (endpoint: string): string => `${endpointOrigin(endpoint)}/profile`;

export const taskUrl = (endpoint: string, taskId: string): string => `${endpointOrigin(endpoint)}/tasks/${encodeURIComponent(taskId)}`;
