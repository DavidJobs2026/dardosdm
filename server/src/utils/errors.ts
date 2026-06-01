export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (resource: string) =>
  new AppError(`${resource} not found`, 404);

export const unauthorized = (msg = "Unauthorized") =>
  new AppError(msg, 401);

export const forbidden = (msg = "Forbidden") =>
  new AppError(msg, 403);

export const badRequest = (msg: string, errors?: Record<string, string[]>) =>
  new AppError(msg, 400, errors);
