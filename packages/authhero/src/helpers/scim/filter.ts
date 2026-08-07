/**
 * Minimal SCIM 2.0 filter support (RFC 7644 §3.4.2.2), scoped to what Okta and
 * Microsoft Entra actually send when provisioning: equality (`eq`) on a small
 * set of attributes, optionally combined with `and` / `or` and parentheses.
 * Anything outside this subset throws `UnsupportedFilterError`, which the route
 * layer turns into a SCIM 501 error — we never silently mis-evaluate a filter.
 *
 * Auth0's inbound SCIM documents exactly this operator set (eq / and / or), so
 * the subset is also the parity target.
 */

export class UnsupportedFilterError extends Error {}
export class InvalidFilterError extends Error {}

export type ScimFilterValue = string | boolean | number;

export type ScimFilterNode =
  | { type: "eq"; attribute: string; value: ScimFilterValue }
  | { type: "and"; left: ScimFilterNode; right: ScimFilterNode }
  | { type: "or"; left: ScimFilterNode; right: ScimFilterNode };

interface Token {
  kind: "lparen" | "rparen" | "word" | "string" | "number";
  value: string;
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ")" });
      i++;
      continue;
    }
    if (ch === '"') {
      let str = "";
      i++;
      while (i < input.length && input.charAt(i) !== '"') {
        if (input.charAt(i) === "\\" && i + 1 < input.length) {
          // JSON string escapes (RFC 7644 filter values are JSON strings).
          // Unknown escapes keep the escaped character verbatim rather than
          // rejecting a filter a real IdP might send.
          i++;
          str += ESCAPES[input.charAt(i)] ?? input.charAt(i);
          i++;
          continue;
        }
        str += input.charAt(i);
        i++;
      }
      if (i >= input.length) {
        throw new InvalidFilterError("Unterminated string literal");
      }
      i++; // closing quote
      tokens.push({ kind: "string", value: str });
      continue;
    }
    // bareword: attribute path, operator, or true/false/number
    let word = "";
    while (i < input.length && !" \t\n()".includes(input.charAt(i))) {
      word += input.charAt(i);
      i++;
    }
    if (/^-?\d+(\.\d+)?$/.test(word)) {
      tokens.push({ kind: "number", value: word });
    } else {
      tokens.push({ kind: "word", value: word });
    }
  }
  return tokens;
}

/**
 * Recursive-descent parser. Grammar (precedence: or < and < comparison):
 *   filter     := orExpr
 *   orExpr     := andExpr ( "or" andExpr )*
 *   andExpr    := primary ( "and" primary )*
 *   primary    := "(" filter ")" | comparison
 *   comparison := ATTR "eq" VALUE
 */
export function parseScimFilter(input: string): ScimFilterNode {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  function parseOr(): ScimFilterNode {
    let left = parseAnd();
    while (peek()?.kind === "word" && peek()!.value.toLowerCase() === "or") {
      next();
      const right = parseAnd();
      left = { type: "or", left, right };
    }
    return left;
  }

  function parseAnd(): ScimFilterNode {
    let left = parsePrimary();
    while (peek()?.kind === "word" && peek()!.value.toLowerCase() === "and") {
      next();
      const right = parsePrimary();
      left = { type: "and", left, right };
    }
    return left;
  }

  function parsePrimary(): ScimFilterNode {
    const t = peek();
    if (!t) throw new InvalidFilterError("Unexpected end of filter");
    if (t.kind === "lparen") {
      next();
      const inner = parseOr();
      const close = next();
      if (!close || close.kind !== "rparen") {
        throw new InvalidFilterError("Missing closing parenthesis");
      }
      return inner;
    }
    return parseComparison();
  }

  function parseComparison(): ScimFilterNode {
    const attr = next();
    if (!attr || attr.kind !== "word") {
      throw new InvalidFilterError("Expected an attribute name");
    }
    const op = next();
    if (!op || op.kind !== "word") {
      throw new InvalidFilterError("Expected an operator");
    }
    const operator = op.value.toLowerCase();
    if (operator !== "eq") {
      // pr, ne, co, sw, ew, gt, ge, lt, le — none sent by Okta/Entra for user
      // provisioning. Reject loudly rather than guess.
      throw new UnsupportedFilterError(
        `Unsupported filter operator "${op.value}" (only "eq" is supported)`,
      );
    }
    const valueToken = next();
    if (!valueToken)
      throw new InvalidFilterError("Expected a comparison value");
    let value: ScimFilterValue;
    if (valueToken.kind === "string") {
      value = valueToken.value;
    } else if (valueToken.kind === "number") {
      value = Number(valueToken.value);
    } else if (
      valueToken.kind === "word" &&
      (valueToken.value === "true" || valueToken.value === "false")
    ) {
      value = valueToken.value === "true";
    } else {
      throw new InvalidFilterError("Invalid comparison value");
    }
    return { type: "eq", attribute: attr.value, value };
  }

  const ast = parseOr();
  if (pos !== tokens.length) {
    throw new InvalidFilterError("Unexpected trailing tokens in filter");
  }
  return ast;
}

/**
 * Evaluate a parsed filter against a flat attribute map (a SCIM resource
 * projected to the attributes we support: `userName`, `externalId`, `active`,
 * `emails.value`/`emails`). Attribute matching is case-insensitive on the name
 * (SCIM attribute names are case-insensitive), and so is string value
 * comparison: `userName` and `emails.value` are `caseExact: false` in our
 * schema, and the targeted `userName` lookup is case-insensitive too, so an
 * exact comparison here would make the same filter behave differently
 * depending on which path served it.
 */
export function evaluateScimFilter(
  node: ScimFilterNode,
  attributes: Record<string, ScimFilterValue | undefined>,
): boolean {
  switch (node.type) {
    case "and":
      return (
        evaluateScimFilter(node.left, attributes) &&
        evaluateScimFilter(node.right, attributes)
      );
    case "or":
      return (
        evaluateScimFilter(node.left, attributes) ||
        evaluateScimFilter(node.right, attributes)
      );
    case "eq": {
      const key = Object.keys(attributes).find(
        (k) => k.toLowerCase() === node.attribute.toLowerCase(),
      );
      if (key === undefined) return false;
      const actual = attributes[key];
      if (actual === undefined) return false;
      if (typeof node.value === "string" && typeof actual === "string") {
        return actual.toLowerCase() === node.value.toLowerCase();
      }
      return actual === node.value;
    }
  }
}

/**
 * If the filter is a single `attr eq "value"` (the overwhelmingly common IdP
 * case — lookup before create), return that pair so the route can do a
 * targeted DB lookup instead of scanning the connection. Returns null for
 * compound filters.
 */
export function asSingleEquality(
  node: ScimFilterNode,
): { attribute: string; value: ScimFilterValue } | null {
  return node.type === "eq"
    ? { attribute: node.attribute, value: node.value }
    : null;
}
