import { describe, expect, test } from "bun:test";
import {
  assertNonEmpty,
  assertValidSlug,
  normalizeTags,
  resolveTake,
} from "../../src/validation/validators";
import { GraphQLError } from "graphql";

describe("assertNonEmpty", () => {
  test("passes through a non-empty string", () => {
    expect(assertNonEmpty("Hello", "title")).toBe("Hello");
  });

  test("rejects an empty string", () => {
    expect(() => assertNonEmpty("", "title")).toThrow(GraphQLError);
  });

  test("rejects a whitespace-only string", () => {
    expect(() => assertNonEmpty("   ", "content")).toThrow(GraphQLError);
  });

  test("error carries a BAD_USER_INPUT code and the offending field", () => {
    try {
      assertNonEmpty("", "title");
      throw new Error("expected assertNonEmpty to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError);
      const gqlErr = err as GraphQLError;
      expect(gqlErr.extensions.code).toBe("BAD_USER_INPUT");
      expect(gqlErr.extensions.field).toBe("title");
    }
  });
});

describe("assertValidSlug", () => {
  test.each([
    "engineering",
    "my-collection",
    "q4-2026-planning",
    "a",
    "a1-b2-c3",
  ])("accepts valid slug %p", (slug) => {
    expect(assertValidSlug(slug)).toBe(slug);
  });

  test.each([
    "",
    "Engineering",
    "my collection",
    "-leading-hyphen",
    "trailing-hyphen-",
    "double--hyphen",
    "has_underscore",
    "emoji-😀",
  ])("rejects malformed slug %p", (slug) => {
    expect(() => assertValidSlug(slug)).toThrow(GraphQLError);
  });
});

describe("normalizeTags", () => {
  test("returns an empty array for null/undefined", () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });

  test("trims whitespace and drops empty entries", () => {
    expect(normalizeTags(["  hr ", "", "  ", "onboarding"])).toEqual([
      "hr",
      "onboarding",
    ]);
  });

  test("de-duplicates while preserving first-seen order", () => {
    expect(normalizeTags(["hr", "onboarding", "hr"])).toEqual([
      "hr",
      "onboarding",
    ]);
  });
});

describe("resolveTake", () => {
  test("defaults to 20 when not provided", () => {
    expect(resolveTake(null)).toBe(20);
    expect(resolveTake(undefined)).toBe(20);
  });

  test("passes through a valid value", () => {
    expect(resolveTake(5)).toBe(5);
  });

  test("caps at 100", () => {
    expect(resolveTake(500)).toBe(100);
  });

  test("rejects zero or negative values", () => {
    expect(() => resolveTake(0)).toThrow(GraphQLError);
    expect(() => resolveTake(-3)).toThrow(GraphQLError);
  });

  test("rejects non-integer values", () => {
    expect(() => resolveTake(2.5)).toThrow(GraphQLError);
  });
});
