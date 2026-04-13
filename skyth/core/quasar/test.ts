import { QuasarClient } from "./client.js";

async function main() {
	const q = new QuasarClient();

	console.log("Ping:", await q.ping());

	await q.mkdir("/test");
	await q.write("/test/file.txt", "SGVsbG8gV29ybGQ=");

	console.log("Read:", await q.read("/test/file.txt"));
	console.log("Ls:", await q.ls("/test"));

	q.close();
	console.log("Done");
}

main().catch(console.error);
