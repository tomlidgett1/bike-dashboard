// Postgrest pagination helpers for CRM.
//
// supabase/config.toml sets max_rows = 1000. Any .select() without paging, or
// with .limit/.range larger than 1000, is silently truncated. Always page at
// POSTGREST_PAGE_SIZE and order by a unique column.

export const POSTGREST_PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type PageArgs<T> = {
  /**
   * Fetch one page. Must apply .order(uniqueCol).range(from, to) itself.
   * Accepts a Promise or a Supabase thenable filter builder.
   */
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>;
  pageSize?: number;
  /** Safety cap on pages (default 500 → 500k rows). */
  maxPages?: number;
};

/** Page through a PostgREST query until a short page is returned. */
export async function fetchAllPostgrestPages<T>(args: PageArgs<T>): Promise<T[]> {
  const pageSize = Math.min(args.pageSize ?? POSTGREST_PAGE_SIZE, POSTGREST_PAGE_SIZE);
  const maxPages = args.maxPages ?? 500;
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await args.fetchPage(from, to);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}
