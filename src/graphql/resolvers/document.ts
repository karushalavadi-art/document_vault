import type { Document, Prisma } from "@prisma/client";
import type { GraphQLContext } from "../context.js";
import { assertNonEmpty, normalizeTags, resolveTake } from "../../validation/validators.js";
import { badUserInput, notFound } from "../../lib/errors.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { assertCollectionExists } from "./collection.js";

interface CreateDocumentInput {
  title: string;
  content: string;
  tags?: string[] | null;
  collectionId: string;
}

interface UpdateDocumentInput {
  title?: string | null;
  content?: string | null;
  tags?: string[] | null;
  isArchived?: boolean | null;
}

interface DocumentsArgs {
  collectionId?: string | null;
  isArchived?: boolean | null;
  search?: string | null;
  take?: number | null;
  cursor?: string | null;
}

async function loadDocumentOrThrow(
  ctx: GraphQLContext,
  id: string
): Promise<Document> {
  const doc = await ctx.prisma.document.findUnique({ where: { id } });
  if (!doc) {
    throw notFound("Document", id);
  }
  return doc;
}

export const documentResolvers = {
  Query: {
    documents: async (
      _parent: unknown,
      args: DocumentsArgs,
      ctx: GraphQLContext
    ) => {
      const take = resolveTake(args.take);

      const where: Prisma.DocumentWhereInput = {};
      if (args.collectionId) where.collectionId = args.collectionId;
      if (typeof args.isArchived === "boolean") where.isArchived = args.isArchived;
      if (args.search && args.search.trim().length > 0) {
        const term = args.search.trim();
        where.OR = [
          { title: { contains: term, mode: "insensitive" } },
          { content: { contains: term, mode: "insensitive" } },
        ];
      }

      const cursorId = args.cursor ? decodeCursor(args.cursor) : undefined;

      // Fetch one extra row to know whether there's a next page, without a
      // separate count query.
      const rows = await ctx.prisma.document.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursorId
          ? { cursor: { id: cursorId }, skip: 1 }
          : {}),
      });

      const hasNextPage = rows.length > take;
      const page = hasNextPage ? rows.slice(0, take) : rows;

      return {
        edges: page.map((doc) => ({ cursor: encodeCursor(doc.id), node: doc })),
        pageInfo: {
          endCursor: page.length > 0 ? encodeCursor(page[page.length - 1]!.id) : null,
          hasNextPage,
        },
      };
    },
  },

  Mutation: {
    createDocument: async (
      _parent: unknown,
      args: { input: CreateDocumentInput },
      ctx: GraphQLContext
    ): Promise<Document> => {
      const { input } = args;
      assertNonEmpty(input.title, "title");
      assertNonEmpty(input.content, "content");
      if (!input.collectionId || input.collectionId.trim().length === 0) {
        throw badUserInput("collectionId must not be empty", "collectionId");
      }
      await assertCollectionExists(ctx, input.collectionId);

      return ctx.prisma.document.create({
        data: {
          title: input.title.trim(),
          content: input.content,
          tags: normalizeTags(input.tags),
          collectionId: input.collectionId,
        },
      });
    },

    updateDocument: async (
      _parent: unknown,
      args: { id: string; input: UpdateDocumentInput },
      ctx: GraphQLContext
    ): Promise<Document> => {
      await loadDocumentOrThrow(ctx, args.id);
      const { input } = args;

      const data: Prisma.DocumentUpdateInput = {};
      if (input.title !== undefined && input.title !== null) {
        assertNonEmpty(input.title, "title");
        data.title = input.title.trim();
      }
      if (input.content !== undefined && input.content !== null) {
        assertNonEmpty(input.content, "content");
        data.content = input.content;
      }
      if (input.tags !== undefined && input.tags !== null) {
        data.tags = normalizeTags(input.tags);
      }
      if (input.isArchived !== undefined && input.isArchived !== null) {
        data.isArchived = input.isArchived;
      }

      return ctx.prisma.document.update({ where: { id: args.id }, data });
    },

    deleteDocument: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ): Promise<boolean> => {
      await loadDocumentOrThrow(ctx, args.id);
      await ctx.prisma.document.delete({ where: { id: args.id } });
      return true;
    },

    moveDocument: async (
      _parent: unknown,
      args: { id: string; collectionId: string },
      ctx: GraphQLContext
    ): Promise<Document> => {
      await loadDocumentOrThrow(ctx, args.id);
      if (!args.collectionId || args.collectionId.trim().length === 0) {
        throw badUserInput("collectionId must not be empty", "collectionId");
      }
      await assertCollectionExists(ctx, args.collectionId);

      return ctx.prisma.document.update({
        where: { id: args.id },
        data: { collectionId: args.collectionId },
      });
    },
  },

  Document: {
    createdAt: (parent: Document): string => parent.createdAt.toISOString(),
    collection: async (parent: Document, _args: unknown, ctx: GraphQLContext) => {
      // parent.collection is always present in the DB (FK is required), so
      // findUniqueOrThrow is safe and gives a clearer failure than `null` if
      // data ever gets corrupted.
      return ctx.prisma.collection.findUniqueOrThrow({
        where: { id: parent.collectionId },
      });
    },
  },
};
