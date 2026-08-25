import { createGraphQLError } from "graphql-yoga";
import type { GraphQLError } from "graphql";

/**
 * All user-facing failures in this API should be thrown as one of these
 * helpers rather than a bare Error or `new GraphQLError(...)`.
 *
 * graphql-yoga masks *unexpected* errors by default (returning a generic
 * "Unexpected error" message instead of leaking stack traces / internals) -
 * that's what stands in for "no unhandled 500s" here. Errors created via
 * `createGraphQLError` are explicitly exempted from that masking, so our
 * validation/not-found/conflict errors reach the client with their real
 * message and a stable `extensions.code`, while genuine bugs still get
 * masked.
 */

export function badUserInput(message: string, field?: string): GraphQLError {
  return createGraphQLError(message, {
    extensions: {
      code: "BAD_USER_INPUT",
      ...(field ? { field } : {}),
    },
  });
}

export function notFound(entity: string, id: string): GraphQLError {
  return createGraphQLError(`${entity} with id "${id}" was not found`, {
    extensions: {
      code: "NOT_FOUND",
      entity,
      id,
    },
  });
}

export function conflict(message: string): GraphQLError {
  return createGraphQLError(message, {
    extensions: {
      code: "CONFLICT",
    },
  });
}
