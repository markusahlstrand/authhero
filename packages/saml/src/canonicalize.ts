import { XMLBuilder, XMLParser } from "fast-xml-parser";

export function canonicalize(xml: string): string {
  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    preserveOrder: true,
  });

  const builder = new XMLBuilder({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    suppressEmptyNode: true,
    format: false,
    preserveOrder: true,
    // tagValueProcessor: (val) => {
    //   return val?.trim();
    // },
  });

  function sortXmlObject(obj: any): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sortXmlObject);
    }

    const result: any = {};
    const attrs: { [key: string]: string } = {};
    const children: { [key: string]: any } = {};

    // Separate attributes, namespaces, and child nodes
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("@_")) {
        const attrName = key.slice(2);
        if (attrName === "xmlns" || attrName.startsWith("xmlns:")) {
          attrs[key] = value as string;
        } else {
          attrs[key] = value as string;
        }
      } else {
        children[key] = sortXmlObject(value);
      }
    }

    // Sort and add namespaces
    Object.entries(attrs)
      .filter(
        ([key]) =>
          key.slice(2) === "xmlns" || key.slice(2).startsWith("xmlns:"),
      )
      .sort(([a], [b]) => {
        if (a.slice(2) === "xmlns") return -1;
        if (b.slice(2) === "xmlns") return 1;
        return a.localeCompare(b);
      })
      .forEach(([key, value]) => {
        result[key] = value;
      });

    // Sort and add regular attributes
    Object.entries(attrs)
      .filter(
        ([key]) =>
          key.slice(2) !== "xmlns" && !key.slice(2).startsWith("xmlns:"),
      )
      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      )
      .forEach(([key, value]) => {
        result[key] = value;
      });

    // Sort and add child nodes
    Object.entries(children)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => {
        result[key] = value;
      });

    return result;
  }

  const sortedXmlData = sortXmlObject(parser.parse(xml));
  return builder.build(sortedXmlData);
}
