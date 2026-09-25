import * as vscode from "vscode";
import { normalizeEndpoint } from "../api/endpointIdentity";
import { MAIFlowTokenProvider } from "../api/maiflowApi";

/** Secret Storage is intentionally the only persistence boundary for the API token. */
export class MAIFlowTokenStore implements MAIFlowTokenProvider {
	public constructor(private readonly secrets: vscode.SecretStorage) {}

	public async readToken(endpoint: string): Promise<string | undefined> {
		return this.secrets.get(this.key(endpoint));
	}

	public async saveToken(endpoint: string, token: string): Promise<void> {
		await this.secrets.store(this.key(endpoint), token);
	}

	public async clearToken(endpoint: string): Promise<void> {
		await this.secrets.delete(this.key(endpoint));
	}

	public async hasToken(endpoint: string): Promise<boolean> {
		return Boolean((await this.readToken(endpoint))?.trim());
	}

	public redactedPrefix(token: string): string {
		return `${token.slice(0, 12)}${token.length > 12 ? "…" : ""}`;
	}

	private key(endpoint: string): string {
		const normalized = normalizeEndpoint(endpoint);
		return `maiflow.mcpToken.${Buffer.from(normalized, "utf8").toString("base64url")}`;
	}
}
