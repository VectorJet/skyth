export function normalizeInteractiveError(error: unknown): never {
  if (error instanceof Error && error.name === "EOFError") {
    throw new Error("KeyboardInterrupt");
  }
  throw error;
}
