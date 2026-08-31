/**
 * Thrown by an adapter when a backend cannot implement a feature at all —
 * as opposed to a transient failure or a bad request.
 *
 * Adapters are free to leave parts of the surface unimplemented (the AWS
 * DynamoDB adapter has no Actions support, for example). Throwing this
 * instead of a plain `Error` lets HTTP callers recognise the gap and map it
 * to `501 Not Implemented` rather than a generic `500`.
 */
export class FeatureNotSupportedError extends Error {
  /** The feature that is missing, e.g. `"actions"`. */
  readonly feature: string;
  /** The adapter that does not support it, e.g. `"aws-dynamodb"`. */
  readonly adapter: string;

  constructor(
    feature: string,
    adapter: string,
    /** Optional extra context appended to the message. */
    details?: string,
  ) {
    super(
      `${feature} is not supported by the ${adapter} adapter.` +
        (details ? ` ${details}` : ""),
    );
    this.name = "FeatureNotSupportedError";
    this.feature = feature;
    this.adapter = adapter;
  }
}

/**
 * Narrows an unknown thrown value to a {@link FeatureNotSupportedError}.
 *
 * Uses the `name` rather than `instanceof` so it keeps working across module
 * instances (a bundled adapter and the host can carry separate copies of the
 * class).
 */
export function isFeatureNotSupportedError(
  error: unknown,
): error is FeatureNotSupportedError {
  return error instanceof Error && error.name === "FeatureNotSupportedError";
}
