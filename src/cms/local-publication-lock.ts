let activeOperation: string | undefined;

export class LocalPublicationInProgressError extends Error {}

export async function withLocalPublicationLock<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  if (activeOperation) {
    throw new LocalPublicationInProgressError(
      `${activeOperation} is already running. Wait for it to finish before starting ${operation}.`,
    );
  }
  activeOperation = operation;
  try {
    return await run();
  } finally {
    activeOperation = undefined;
  }
}
