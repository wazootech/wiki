/**
 * Domain exceptions raised by library operations.
 *
 * Port of `src/wiki/errors.py`. The hierarchy is part of the library's public
 * contract — callers catch `WikiError` and branch on the subclasses — so the
 * names and relationships are preserved exactly. `name` is assigned explicitly
 * because a thrown `Error` subclass otherwise reports `"Error"` in its stack,
 * which would make py2ts-side debugging worse than the Python original.
 */

/** Base error for wiki library operations. */
export class WikiError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WikiError";
  }
}

/** Raised when a static site build cannot proceed safely. */
export class BuildError extends WikiError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BuildError";
  }
}

/** Raised when a self-upgrade cannot run. */
export class UpgradeError extends WikiError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UpgradeError";
  }
}
