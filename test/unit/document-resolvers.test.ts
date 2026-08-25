import { describe, expect, test } from "bun:test";
import { GraphQLError } from "graphql";
import { documentResolvers } from "../../src/graphql/resolvers/document";
import type { GraphQLContext } from "../../src/graphql/context";

// A minimal fake matching only the Prisma Client surface these resolvers
// touch. Kept intentionally loose (any-cast at the boundary) so the fake
// stays small and readable rather than reimplementing Prisma's types.
function makeFakeContext(overrides: Record<string, unknown> = {}): GraphQLContext {
  const fake = {
    document: {
      create: async (_args: unknown) => ({
        id: "doc-1",
        title: "Untitled",
        content: "placeholder",
        tags: [],
        isArchived: false,
        createdAt: new Date(),
        collectionId: "col-1",
      }),
      findUnique: async () => null,
      findMany: async () => [],
      update: async () => ({}),
      delete: async () => ({}),
    },
    collection: {
      findUnique: async () => null,
    },
    ...overrides,
  };
  return { prisma: fake } as unknown as GraphQLContext;
}

describe("createDocument resolver", () => {
  test("rejects an empty title before touching the database", async () => {
    const ctx = makeFakeContext();
    await expect(
      documentResolvers.Mutation.createDocument(
        undefined,
        {
          input: { title: "", content: "some content", collectionId: "col-1" },
        },
        ctx
      )
    ).rejects.toThrow(GraphQLError);
  });

  test("rejects an empty content", async () => {
    const ctx = makeFakeContext();
    await expect(
      documentResolvers.Mutation.createDocument(
        undefined,
        {
          input: { title: "Title", content: "   ", collectionId: "col-1" },
        },
        ctx
      )
    ).rejects.toThrow(GraphQLError);
  });

  test("rejects when the target collection does not exist", async () => {
    const ctx = makeFakeContext({
      collection: { findUnique: async () => null },
    });
    await expect(
      documentResolvers.Mutation.createDocument(
        undefined,
        {
          input: {
            title: "Title",
            content: "Body",
            collectionId: "missing-collection",
          },
        },
        ctx
      )
    ).rejects.toThrow(/was not found/);
  });

  test("creates the document with trimmed title and normalized tags when input is valid", async () => {
    let receivedData: Record<string, unknown> | undefined;
    const ctx = makeFakeContext({
      collection: { findUnique: async () => ({ id: "col-1" }) },
      document: {
        create: async (args: { data: Record<string, unknown> }) => {
          receivedData = args.data;
          return { id: "doc-1", ...args.data, createdAt: new Date() };
        },
      },
    });

    const result = await documentResolvers.Mutation.createDocument(
      undefined,
      {
        input: {
          title: "  Onboarding Guide  ",
          content: "Welcome!",
          tags: ["hr", " hr ", "onboarding"],
          collectionId: "col-1",
        },
      },
      ctx
    );

    expect(result.id).toBe("doc-1");
    expect(receivedData?.title).toBe("Onboarding Guide");
    expect(receivedData?.tags).toEqual(["hr", "onboarding"]);
  });
});

describe("moveDocument resolver", () => {
  test("throws NOT_FOUND when the document does not exist", async () => {
    const ctx = makeFakeContext({
      document: {
        findUnique: async () => null,
      },
    });

    await expect(
      documentResolvers.Mutation.moveDocument(
        undefined,
        { id: "missing-doc", collectionId: "col-1" },
        ctx
      )
    ).rejects.toThrow(/was not found/);
  });

  test("throws NOT_FOUND when the destination collection does not exist", async () => {
    const ctx = makeFakeContext({
      document: {
        findUnique: async () => ({ id: "doc-1", collectionId: "col-1" }),
      },
      collection: { findUnique: async () => null },
    });

    await expect(
      documentResolvers.Mutation.moveDocument(
        undefined,
        { id: "doc-1", collectionId: "missing-collection" },
        ctx
      )
    ).rejects.toThrow(/was not found/);
  });

  test("moves the document when both exist", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const ctx = makeFakeContext({
      document: {
        findUnique: async () => ({ id: "doc-1", collectionId: "col-1" }),
        update: async (args: Record<string, unknown>) => {
          updateArgs = args;
          return { id: "doc-1", collectionId: "col-2" };
        },
      },
      collection: { findUnique: async () => ({ id: "col-2" }) },
    });

    const result = await documentResolvers.Mutation.moveDocument(
      undefined,
      { id: "doc-1", collectionId: "col-2" },
      ctx
    );

    expect(result.collectionId).toBe("col-2");
    expect(updateArgs?.where).toEqual({ id: "doc-1" });
  });
});
