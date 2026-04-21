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

      if (!res.headersSent) {
        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
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
        status: 500,
        message: 'Internal server error',
        data: null,
        error: {
          type: 'internal_error',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  };
}

export function validateInput(input, options = {}) {
  const { 
    allowEmpty = false, 
    maxLength = 1000, 
    pattern = null,
    allowedChars = null 
  } = options;

  if (input === undefined || input === null) {
    if (allowEmpty) return { valid: true, value: '' };
    return { valid: false, error: 'Input is required' };
  }

  const value = String(input);

  if (!allowEmpty && !value.trim()) {
    return { valid: false, error: 'Input cannot be empty' };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `Input exceeds maximum length of ${maxLength}` };
  }

  if (allowedChars) {
    const regex = new RegExp(`^[${allowedChars}]+$`);
    if (!regex.test(value)) {
      return { valid: false, error: `Input contains invalid characters` };
    }
  }

  if (pattern) {
    const regex = new RegExp(pattern);
    if (!regex.test(value)) {
      return { valid: false, error: 'Input format is invalid' };
    }
  }

  return { valid: true, value: value.trim() };
}

export function sanitizeSearchQuery(query) {
  if (!query || typeof query !== 'string') {
    return '';
  }

  let sanitized = query.trim();

  sanitized = sanitized.replace(/[<>{}[\]\\]/g, '');

  sanitized = sanitized.replace(/(\bOR\b|\bAND\b|\bNOT\b)/gi, '');

  const dangerous = [
    /\$\d+/g,
    /\/\*.*?\*\//g,
    /--.*$/gm,
    /;/g,
    /xp_/gi,
    /sp_/gi,
    /exec\s*\(/gi,
    /execute\s*\(/gi,
    /eval\s*\(/gi,
    /script/gi
  ];

  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.substring(0, 500);
}

export function validateProjectName(project) {
  if (!project || typeof project !== 'string') {
    return { valid: false, error: 'Project is required' };
  }

  const dangerous = ['../', '..\\', '/', '\\', ':', '%00', '\0', '..', '~'];
  for (const d of dangerous) {
    if (project.includes(d)) {
      return { valid: false, error: 'Project name contains invalid characters' };
    }
  }

  const safePattern = /^[a-zA-Z0-9_-]+$/;
  if (!safePattern.test(project)) {
    return { valid: false, error: 'Project name must be alphanumeric with - or _' };
  }

  if (project.length > 100) {
    return { valid: false, error: 'Project name is too long' };
  }

  return { valid: true, value: project };
}

export function validateAgentId(agentId) {
  if (!agentId || typeof agentId !== 'string') {
    return { valid: false, error: 'Agent ID is required' };
  }

  const safePattern = /^[a-zA-Z0-9_-]+$/;
  if (!safePattern.test(agentId)) {
    return { valid: false, error: 'Agent ID contains invalid characters' };
  }

  return { valid: true, value: agentId };
}

export function createErrorResponse(status, message, errorType = 'validation_error') {
  return {
    success: false,
    status,
    message,
    data: null,
    error: {
      type: errorType,
      code: `ERR_${errorType.toUpperCase()}`
    }
  };
}

export function withValidation(validator, handler) {
  return async (req, res) => {
    const validation = validator(req.body);
    
    if (!validation.valid) {
      return res.status(400).json(createErrorResponse(400, validation.error));
    }

    req.body = { ...req.body, ...validation };
    
    return handler(req, res);
  };
}