export type MAIFlowErrorKind =
	| "authentication"
	| "paid-plan"
	| "permission"
	| "validation"
	| "not-found"
	| "rate-limited"
	| "server"
	| "network"
	| "protocol"
	| "configuration";

const sanitize = (value: string | undefined): string => (value ?? "")
	.replace(/mf_live_[A-Za-z0-9_-]+/g, "mf_live_[redacted]")
	.replace(/\s+/g, " ")
	.trim();

export class MAIFlowApiError extends Error {
	public readonly status?: number;
	public readonly kind: MAIFlowErrorKind;
	public readonly canRetryRead: boolean;

	public constructor(message: string, kind: MAIFlowErrorKind, options: { status?: number; canRetryRead?: boolean; cause?: unknown } = {}) {
		super(message, { cause: options.cause });
		this.name = "MAIFlowApiError";
		this.status = options.status;
		this.kind = kind;
		this.canRetryRead = options.canRetryRead ?? false;
	}

	public static fromStatus(status: number, upstreamMessage?: string): MAIFlowApiError {
		const detail = sanitize(upstreamMessage);
		const suffix = detail ? `: ${detail}` : ".";
		switch (status) {
			case 401: return new MAIFlowApiError("MAIFlow token is invalid, revoked, or missing.", "authentication", { status });
			case 402: return new MAIFlowApiError("MAIFlow MCP access requires an active Personal or Team plan.", "paid-plan", { status });
			case 403: return new MAIFlowApiError(`MAIFlow denied this operation because the account, verification, organization membership, role, or entitlement does not allow it${suffix}`, "permission", { status });
			case 400: return new MAIFlowApiError(`MAIFlow rejected the request${suffix}`, "validation", { status });
			case 404: return new MAIFlowApiError("The MAIFlow task or flow no longer exists or is inaccessible.", "not-found", { status });
			case 429: return new MAIFlowApiError("MAIFlow is rate-limiting requests. Please retry shortly.", "rate-limited", { status, canRetryRead: true });
			default:
				if (status >= 500 && status <= 599) {return new MAIFlowApiError("MAIFlow is temporarily unavailable. Please retry.", "server", { status, canRetryRead: true });}
				return new MAIFlowApiError(`MAIFlow returned an unexpected HTTP status (${status}).`, "server", { status });
		}
	}

	public static configuration(message: string): MAIFlowApiError {
		return new MAIFlowApiError(message, "configuration");
	}

	public static network(message: string, cause?: unknown): MAIFlowApiError {
		return new MAIFlowApiError(message, "network", { canRetryRead: true, cause });
	}

	public static protocol(detail: string, cause?: unknown): MAIFlowApiError {
		return new MAIFlowApiError("MAIFlow returned an unexpected protocol response. Please retry or contact support.", "protocol", { canRetryRead: true, cause });
	}

	public static sanitize(value: string | undefined): string {
		return sanitize(value);
	}
}
