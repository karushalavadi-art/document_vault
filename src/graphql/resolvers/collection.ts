import type { Collection } from "@prisma/client";
import type { GraphQLContext } from "../context.js";
import { assertNonEmpty, assertValidSlug } from "../../validation/validators.js";
import { badUserInput, conflict, notFound } from "../../lib/errors.js";

interface CreateCollectionInput {
  name: string;
  slug: string;
}

export const collectionResolvers = {
  Query: {
    collections: async (
      _parent: unknown,
      _args: unknown,
      ctx: GraphQLContext
    ): Promise<Collection[]> => {
      return ctx.prisma.collection.findMany({
        orderBy: { createdAt: "desc" },
      });
    },

    collection: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ): Promise<Collection | null> => {
      if (!args.id || args.id.trim().length === 0) {
        throw badUserInput("id must not be empty", "id");
      }
      return ctx.prisma.collection.findUnique({ where: { id: args.id } });
    },
  },

  Mutation: {
    createCollection: async (
      _parent: unknown,
      args: { input: CreateCollectionInput },
      ctx: GraphQLContext
    ): Promise<Collection> => {
      const { input } = args;
      assertNonEmpty(input.name, "name");
      assertValidSlug(input.slug);

      const existing = await ctx.prisma.collection.findUnique({
        where: { slug: input.slug },
      });
      if (existing) {
        throw conflict(`a collection with slug "${input.slug}" already exists`);
      }

      return ctx.prisma.collection.create({
        data: { name: input.name.trim(), slug: input.slug },
      });
    },
  },

  Collection: {
    createdAt: (parent: Collection): string => parent.createdAt.toISOString(),
    documents: async (parent: Collection, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.document.findMany({
        where: { collectionId: parent.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    },
  },
};

// Shared helper used by document resolvers to confirm a collection exists
// before attaching/moving a document into it.
export async function assertCollectionExists(
  ctx: GraphQLContext,
  collectionId: string
): Promise<void> {
  const collection = await ctx.prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) {
    throw notFound("Collection", collectionId);
  }
}
