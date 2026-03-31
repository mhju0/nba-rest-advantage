/**
 * Maps unknown errors to a client-safe message. In production, internal
 * details (stack traces, DB errors) are never returned from API routes.
 */
export function getPublicApiErrorMessage(err: unknown): string {
  const isProd = process.env.NODE_ENV === "production";

  if (err instanceof Error) {
    if (!isProd) {
      return err.message;
    }
    const msg = err.message.toLowerCase();
    if (
      msg.includes("invalid") ||
      msg.includes("validation") ||
      msg.includes("not found")
    ) {
      return err.message;
    }
  }

  return "Something went wrong. Please try again later.";
}
