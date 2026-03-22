const express = require('express');

function mountRouteWithMockedFetchService({
  routeModulePath,
  fetchServiceExports,
  mountPath = '/api',
  env = {}
}) {
  const fetchServicePath = require.resolve('../../services/fetch');
  const oldFetchService = require.cache[fetchServicePath];
  const oldEnv = {};

  for (const [k, v] of Object.entries(env)) {
    oldEnv[k] = process.env[k];
    process.env[k] = String(v);
  }

  delete require.cache[fetchServicePath];
  delete require.cache[routeModulePath];

  require.cache[fetchServicePath] = {
    id: fetchServicePath,
    filename: fetchServicePath,
    loaded: true,
    exports: fetchServiceExports
  };

  const app = express();
  app.use(mountPath, require(routeModulePath));

  return {
    app,
    restore() {
      delete require.cache[routeModulePath];
      if (oldFetchService) require.cache[fetchServicePath] = oldFetchService;
      else delete require.cache[fetchServicePath];
      for (const k of Object.keys(env)) {
        if (oldEnv[k] === undefined) delete process.env[k];
        else process.env[k] = oldEnv[k];
      }
    }
  };
}

module.exports = { mountRouteWithMockedFetchService };

