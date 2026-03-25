

export function routeHandler(collectionName, handler) {
  return async (req, res) => {
    try {
      const db = req.app.locals.db;
      const collection = db.collection(collectionName);

      const result = await handler({
        req,
        res,
        db,
        collection
      });

      // Auto response handling
      if (!res.headersSent) {
        res.json(result);
      }
    } catch (error) {
      const logError = req.app.locals.logError;

      if (logError) {
        await logError(error, {
          route: req.originalUrl,
          method: req.method
        });
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  };
}