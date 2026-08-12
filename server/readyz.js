const fs = require('fs');

// Readiness check for the backend container.
function createReadyzHandler(storageModule) {
  return function readyzHandler(req, res) {
    var dataRoot = storageModule.DATA_DIR || storageModule.FIXTURES_DIR;
    var checks = [];

    try {
      fs.accessSync(dataRoot, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      checks.push('data directory not readable/writable');
    }

    if (checks.length > 0) {
      res.status(503).json({ status: 'error', reasons: checks });
    } else {
      res.json({ status: 'ok', sha: process.env.GIT_SHA || 'dev', upSince: startedAt });
    }
  };
}

const startedAt = new Date().toISOString();

module.exports = { createReadyzHandler };
