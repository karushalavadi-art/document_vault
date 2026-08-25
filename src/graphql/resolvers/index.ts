import { collectionResolvers } from "./collection.js";
import { documentResolvers } from "./document.js";

export const resolvers = {
  Query: {
    ...collectionResolvers.Query,
    ...documentResolvers.Query,
  },
  Mutation: {
    ...collectionResolvers.Mutation,
    ...documentResolvers.Mutation,
  },
  Collection: collectionResolvers.Collection,
  Document: documentResolvers.Document,
};
