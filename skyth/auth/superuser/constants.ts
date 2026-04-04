export const SUPERUSER_HASH_FILE = "superuser_password.jsonl";
export const VERIFY_ATTEMPTS_FILE = "verify_attempts.jsonl";
export const AUDIT_LOG_FILE = "audit_log.jsonl";

export const ARGON2_MEMORY_COST = 19456;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;
export const SALT_BYTES = 4;
export const ARGON2_SALT_BYTES = 16;
export const IV_BYTES = 12;

export const MAX_PASSWORD_HISTORY = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const MAX_VERIFY_ATTEMPTS = 5;

export const COMMON_PASSWORDS = [
	"password",
	"123456",
	"12345678",
	"qwerty",
	"abc123",
	"monkey",
	"1234567",
	"letmein",
	"trustno1",
	"dragon",
	"baseball",
	"iloveyou",
	"master",
	"sunshine",
	"ashley",
	"bailey",
	"shadow",
	"123123",
	"654321",
	"superman",
	"qazwsx",
	"michael",
	"football",
	"password1",
	"password123",
	"welcome",
	"welcome1",
];
