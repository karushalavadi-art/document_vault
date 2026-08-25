import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSchema, createYoga } from "graphql-yoga";
import { resolvers } from "./graphql/resolvers/index.js";
import { createContext } from "./graphql/context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(
  join(__dirname, "graphql", "schema", "schema.graphql"),
  "utf8"
);

const schema = createSchema({
  typeDefs,
  resolvers,
});

const yoga = createYoga({
  schema,
  context: createContext,
  // Keep default error masking ON: unexpected/unhandled errors are reported
  // to the client as a generic message rather than leaking stack traces or
  // becoming a raw 500. Errors we throw intentionally (see src/lib/errors.ts)
  // are created with `createGraphQLError` and bypass this masking.
  graphqlEndpoint: "/graphql",
});

const port = Number(process.env.PORT ?? 4000);
const server = createServer(yoga);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Document Vault API ready at http://localhost:${port}/graphql`);
});
