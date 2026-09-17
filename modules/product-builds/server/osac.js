const EMPTY_DATA = { schemaVersion: 1, lastFetchedAt: null, builds: [] };

module.exports = function registerOsacRoutes(router, context) {
  const { readFromStorage } = context.storage;

  /**
   * @openapi
   * /api/modules/product-builds/osac/builds:
   *   get:
   *     tags: [Product Builds - OSAC]
   *     summary: Get OSAC CI build history
   *     description: Reads the normalized osac-builds-data.json build report history.
   *     responses:
   *       200:
   *         description: Build history, newest first
   */
  router.get('/osac/builds', function(req, res) {
    const data = readFromStorage('osac-builds-data.json');
    res.json(data || EMPTY_DATA);
  });
};
