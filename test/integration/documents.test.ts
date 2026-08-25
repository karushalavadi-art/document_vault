import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { documentResolvers } from "../../src/graphql/resolvers/document";
import { collectionResolvers } from "../../src/graphql/resolvers/collection";
import type { GraphQLContext } from "../../src/graphql/context";

/**
 * Integration test: exercises real resolver code against a real Postgres
 * database (the one started by `docker compose up -d`), going through the
 * actual Prisma client rather than a mock.
 *
 * Requires DATABASE_URL to point at a database with migrations applied
 * (see README: `docker compose up -d && bun run gendb`).
 */

const prisma = new PrismaClient();
const ctx: GraphQLContext = { prisma };

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean slate between tests; cascade takes documents with it.
  await prisma.document.deleteMany();
  await prisma.collection.deleteMany();
});

describe("documents query (search, filter, cursor pagination)", () => {
  test("search matches substrings in either title or content, case-insensitively", async () => {
    const collection = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "Engineering", slug: "engineering" } },
      ctx
    );

    await documentResolvers.Mutation.createDocument(
      undefined,
      {
        input: {
          title: "Onboarding Guide",
          content: "Read this before your first day.",
          collectionId: collection.id,
        },
      },
      ctx
    );
    await documentResolvers.Mutation.createDocument(
      undefined,
      {
        input: {
          title: "Deploy Runbook",
          content: "Steps to onboard a new service to production.",
          collectionId: collection.id,
        },
      },
      ctx
    );
    await documentResolvers.Mutation.createDocument(
      undefined,
      {
        input: {
          title: "Unrelated Notes",
          content: "Nothing to see here.",
          collectionId: collection.id,
        },
      },
      ctx
    );

    const result = await documentResolvers.Query.documents(
      undefined,
      { search: "onboard" },
      ctx
    );

    expect(result.edges.length).toBe(2);
    const titles = result.edges.map((e: { node: { title: string } }) => e.node.title).sort();
    expect(titles).toEqual(["Deploy Runbook", "Onboarding Guide"]);
  });

  test("filters by collectionId and isArchived together", async () => {
    const colA = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "A", slug: "col-a" } },
      ctx
    );
    const colB = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "B", slug: "col-b" } },
      ctx
    );

    const doc1 = await documentResolvers.Mutation.createDocument(
      undefined,
      { input: { title: "Doc 1", content: "content", collectionId: colA.id } },
      ctx
    );
    await documentResolvers.Mutation.createDocument(
      undefined,
      { input: { title: "Doc 2", content: "content", collectionId: colA.id } },
      ctx
    );
    await documentResolvers.Mutation.createDocument(
      undefined,
      { input: { title: "Doc 3", content: "content", collectionId: colB.id } },
      ctx
    );

    await documentResolvers.Mutation.updateDocument(
      undefined,
      { id: doc1.id, input: { isArchived: true } },
      ctx
    );

    const result = await documentResolvers.Query.documents(
      undefined,
      { collectionId: colA.id, isArchived: false },
      ctx
    );

    expect(result.edges.length).toBe(1);
    expect(result.edges[0]?.node.title).toBe("Doc 2");
  });

  test("cursor pagination walks through all pages without gaps or duplicates", async () => {
    const collection = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "Paginated", slug: "paginated" } },
      ctx
    );

    for (let i = 0; i < 5; i++) {
      await documentResolvers.Mutation.createDocument(
        undefined,
        {
          input: {
            title: `Doc ${i}`,
            content: "content",
            collectionId: collection.id,
          },
        },
        ctx
      );
    }

    const seenIds = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;

    // take=2 over 5 docs should take 3 pages: 2, 2, 1.
    for (;;) {
      const page = await documentResolvers.Query.documents(
        undefined,
        { collectionId: collection.id, take: 2, cursor },
        ctx
      );
      pages += 1;
      for (const edge of page.edges) {
        seenIds.add(edge.node.id);
      }
      if (!page.pageInfo.hasNextPage) break;
      cursor = page.pageInfo.endCursor;
      if (pages > 10) throw new Error("pagination did not terminate");
    }

    expect(pages).toBe(3);
    expect(seenIds.size).toBe(5);
  });
});

describe("moveDocument", () => {
  test("moving a document changes its collectionId and it disappears from the old collection's list", async () => {
    const colA = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "Source", slug: "source" } },
      ctx
    );
    const colB = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "Destination", slug: "destination" } },
      ctx
    );

    const doc = await documentResolvers.Mutation.createDocument(
      undefined,
      { input: { title: "Movable", content: "content", collectionId: colA.id } },
      ctx
    );

    await documentResolvers.Mutation.moveDocument(
      undefined,
      { id: doc.id, collectionId: colB.id },
      ctx
    );

    const sourceDocs = await documentResolvers.Query.documents(
      undefined,
      { collectionId: colA.id },
      ctx
    );
    const destDocs = await documentResolvers.Query.documents(
      undefined,
      { collectionId: colB.id },
      ctx
    );

    expect(sourceDocs.edges.length).toBe(0);
    expect(destDocs.edges.length).toBe(1);
    expect(destDocs.edges[0]?.node.id).toBe(doc.id);
  });
});

describe("deleting a collection cascades to its documents", () => {
  test("removes documents when the parent collection is deleted", async () => {
    const collection = await collectionResolvers.Mutation.createCollection(
      undefined,
      { input: { name: "Temp", slug: "temp" } },
      ctx
    );
    await documentResolvers.Mutation.createDocument(
      undefined,
      { input: { title: "Doc", content: "content", collectionId: collection.id } },
      ctx
    );

    await prisma.collection.delete({ where: { id: collection.id } });

    const remaining = await prisma.document.findMany({
      where: { collectionId: collection.id },
    });
    expect(remaining.length).toBe(0);
  });
});
