import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Wraps a Vercel function's default export so an unexpected exception
 * returns a clean `{ error }` JSON response instead of escaping to Vercel's
 * raw "A server error has occurred / FUNCTION_INVOCATION_FAILED" page, which
 * gives the caller nothing to act on and (for the admin UI) leaves the form
 * stuck with no way to tell what happened.
 *
 * Every api/*.ts handler should be wrapped with this.
 */
export function withErrorHandling(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`Unhandled error in ${req.url ?? "unknown route"}:`, err);
      if (!res.headersSent) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Internal server error",
        });
      }
    }
  };
}
