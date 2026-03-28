import {
	REDACTED_BLOCK,
	deepGet,
	deepSet,
	isRedactedBlock,
	persistSecretValue,
	readLatestSecretValue,
} from "@/auth/secret_store";

export function hydrateSecretField(params: {
	runtimeObject: Record<string, any>;
	storageObject: Record<string, any>;
	path: string;
	scope: string;
	subject: string;
}): boolean {
	const current = deepGet(params.runtimeObject, params.path);
	if (typeof current !== "string") return false;
	const trimmed = current.trim();
	if (!trimmed) return false;

	if (isRedactedBlock(trimmed)) {
		const resolved = readLatestSecretValue({
			scope: params.scope,
			subject: params.subject,
			keyPath: params.path,
		});
		deepSet(params.runtimeObject, params.path, resolved ?? "");
		deepSet(params.storageObject, params.path, REDACTED_BLOCK);
		return false;
	}

	persistSecretValue({
		scope: params.scope,
		subject: params.subject,
		keyPath: params.path,
		value: trimmed,
	});
	deepSet(params.storageObject, params.path, REDACTED_BLOCK);
	deepSet(params.runtimeObject, params.path, trimmed);
	return true;
}