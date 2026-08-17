export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  total: number;
}

export interface CursorPaginatedResponse<T> extends PaginatedResponse<T> {
  nextCursor: string | null;
}
