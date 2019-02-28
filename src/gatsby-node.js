const { join } = require('path');
const copy = require('recursive-copy');
const {
  makeExecutableSchema,
  makeRemoteExecutableSchema,
  mergeSchemas,
  addSchemaLevelResolveFunction,
} = require('graphql-tools');
const { introspectionFromSchema, buildClientSchema } = require('graphql');
const fetch = require('isomorphic-unfetch');
const { createHttpLink } = require('apollo-link-http');

exports.onCreateNode = async (
  { store, actions },
  { schemaModules = [], path = './' }
) => {
  const { addThirdPartySchema, createPageDependency, createNode } = actions;
  const { directory } = store.getState().program;
  const srcDir = join(directory, path);
  const dstDir = join(__dirname, '.cache');

  await copy(srcDir, dstDir, { overwrite: true });

  const jsSchemaModules = schemaModules.map(name =>
    require(`./.cache/${name}`)
  );
  const hasSchema = Boolean(jsSchemaModules.length);

  if (!hasSchema) return;

  const hasRemoteSchema = Boolean(jsSchemaModules.some(x => x.uri));
  const schema = makeExecutableSchema({
    typeDefs: jsSchemaModules.map(({ typeDefs }) => typeDefs).filter(Boolean),
    resolvers: jsSchemaModules
      .map(({ resolvers }) => resolvers)
      .filter(Boolean),
  });

  addSchemaLevelResolveFunction(schema, (parent, args, ctx, info) => {
    jsSchemaModules
      .map(module => module.context || {})
      .filter(Boolean)
      .forEach(context => Object.assign(ctx, context));
  });

  const schemas = hasRemoteSchema
    ? jsSchemaModules
        .filter(x => x.uri)
        .filter(Boolean)
        .map(x => {
          const link = createHttpLink({
            uri: x.uri,
            headers: x.headers,
            fetch,
          });

          return makeRemoteExecutableSchema({
            schema,
            link,
          });
        })
    : [schema];

  addThirdPartySchema({
    schema: mergeSchemas({ schemas }),
  });
};
