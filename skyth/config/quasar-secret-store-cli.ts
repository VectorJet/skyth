import {
	persistSecretValue,
	readLatestSecretValue,
} from "@/config/quasar-secret-store";

const [command, scope, subject, keyPath, value] = process.argv.slice(2);

if (!command || !scope || !subject || !keyPath) {
	process.exit(2);
}

if (command === "get") {
	const found = await readLatestSecretValue({ scope, subject, keyPath });
	if (found) process.stdout.write(found);
	process.exit(0);
}

if (command === "set") {
	await persistSecretValue({ scope, subject, keyPath, value: value ?? "" });
	process.exit(0);
}

process.exit(2);
