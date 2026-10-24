export interface NameSelector {
  col: number;
  kind: "name";
  name: string;
}

export interface WildSelector {
  col: number;
  kind: "wild";
}

export interface IndexSelector {
  col: number;
  kind: "index";
  index: number;
}

export interface SliceSelector {
  col: number;
  kind: "slice";
  start: number | null;
  end: number | null;
  step: number | null;
}

export interface FilterSelector {
  col: number;
  kind: "filter";
  expr: Expr;
  source: string;
}

export type Selector = NameSelector | WildSelector | IndexSelector | SliceSelector | FilterSelector;

export interface Segment {
  col: number;
  mode: "child" | "descendant";
  selectors: Selector[];
}

export interface Query {
  col: number;
  root: "$" | "@";
  segments: Segment[];
}

export interface LiteralExpr {
  col: number;
  kind: "lit";
  value: null | boolean | number | string;
}

export interface QueryExpr {
  col: number;
  kind: "query";
  query: Query;
}

export interface CallExpr {
  col: number;
  kind: "call";
  name: string;
  args: Expr[];
}

export interface ComparisonExpr {
  col: number;
  kind: "cmp";
  op: "==" | "!=" | "<=" | ">=" | "<" | ">";
  left: Expr;
  right: Expr;
}

export interface NotExpr {
  col: number;
  kind: "not";
  expr: Expr;
}

export interface ParenthesizedExpr {
  col: number;
  kind: "paren";
  expr: Expr;
}

export interface OrExpr {
  col: number;
  kind: "or";
  left: Expr;
  right: Expr;
}

export interface AndExpr {
  col: number;
  kind: "and";
  left: Expr;
  right: Expr;
}

export type Expr =
  | LiteralExpr
  | QueryExpr
  | CallExpr
  | ComparisonExpr
  | NotExpr
  | ParenthesizedExpr
  | OrExpr
  | AndExpr;
