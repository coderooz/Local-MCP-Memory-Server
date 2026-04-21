import { v4 as uuidv4 } from 'uuid';

const STATUS_CODES = {
  SUCCESS: 200,
  CREATED: 201,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SERVER_ERROR: 500
};

export function successResponse({
  message = "Success",
  data = null,
  status = STATUS_CODES.SUCCESS,
  tool = null,
  meta = {}
}) {
  return {
    success: true,
    status,
    message,
    data,
    error: null,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: uuidv4(),
      tool,
      ...meta
    }
  };
}

export function errorResponse({
  message = "Error",
  status = STATUS_CODES.SERVER_ERROR,
  errorCode = "UNKNOWN_ERROR",
  details = null,
  tool = null
}) {
  return {
    success: false,
    status,
    message,
    data: null,
    error: {
      code: errorCode,
      details
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: uuidv4(),
      tool
    }
  };
}

export function validationError({
  message = "Validation Error",
  details = null,
  tool = null
}) {
  return errorResponse({
    message,
    status: STATUS_CODES.VALIDATION_ERROR,
    errorCode: "VALIDATION_ERROR",
    details,
    tool
  });
}

export function notFoundError({
  message = "Resource Not Found",
  details = null,
  tool = null
}) {
  return errorResponse({
    message,
    status: STATUS_CODES.NOT_FOUND,
    errorCode: "NOT_FOUND",
    details,
    tool
  });
}

export function conflictError({
  message = "Conflict",
  details = null,
  tool = null
}) {
  return errorResponse({
    message,
    status: STATUS_CODES.CONFLICT,
    errorCode: "CONFLICT",
    details,
    tool
  });
}

export function serverError({
  message = "Internal Server Error",
  details = null,
  tool = null
}) {
  return errorResponse({
    message,
    status: STATUS_CODES.SERVER_ERROR,
    errorCode: "SERVER_ERROR",
    details,
    tool
  });
}

export function toMCPResponse(response) {
  const textContent = typeof response === 'string' 
    ? response 
    : JSON.stringify(response, null, 2);
  return {
    content: [
      {
        type: 'text',
        text: textContent
      }
    ]
  };
}

export function wrapToolHandler(handler, toolName) {
  return async function (args, config) {
    try {
      const result = await handler(args, config);
      return toMCPResponse(successResponse({
        message: "Tool executed successfully",
        data: result,
        tool: toolName
      }));
    } catch (error) {
      return toMCPResponse(errorResponse({
        message: error.message || "Tool execution failed",
        errorCode: "TOOL_EXECUTION_ERROR",
        details: error.stack,
        tool: toolName
      }));
    }
  };
}

export function createMCPContentResponse(data, toolName, customMessage = null) {
  const response = successResponse({
    message: customMessage || "Tool executed successfully",
    data,
    tool: toolName
  });
  return toMCPResponse(response);
}

export function createMCPErrorResponse(error, toolName) {
  const response = errorResponse({
    message: error.message || "Tool execution failed",
    errorCode: "TOOL_EXECUTION_ERROR",
    details: error.stack,
    tool: toolName
  });
  return toMCPResponse(response);
}

export { STATUS_CODES };