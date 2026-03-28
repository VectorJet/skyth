export interface SuperuserPasswordRecord {
	version: 1;
	kind: "superuser_password";
	created_at: string;
	salt_bits: 32;
	salt_b64: string;
	kdf: {
		algorithm: "argon2id";
		salt_derivation: "sha256(seed32)[0:16]";
		hash: string;
		memory_cost: number;
		time_cost: number;
		parallelism: number;
		hash_length: number;
	};
	encryption: {
		algorithm: "aes-256-gcm";
		key_derivation: "sha256(argon2id_hash)";
		iv_b64: string;
		auth_tag_b64: string;
		ciphertext_b64: string;
	};
}

export interface VerifyAttempt {
	timestamp: number;
	success: boolean;
}