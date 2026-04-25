export interface SearchResult {
  event: any;
  matchField: "bbl" | "address" | "owner" | "brief";
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  hasMore: boolean;
}

export interface WebIntelResult {
  articles: Array<{ title: string; url: string; snippet: string; source: string }>;
  listings: Array<{ address: string; price: string; beds?: number; url: string; source: string }>;
}
