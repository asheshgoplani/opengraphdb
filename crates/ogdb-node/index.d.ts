export type PropertyValue = boolean | number | string | Uint8Array | number[];

export class Database {
  constructor(path: string);
  static init(path: string): Database;
  static open(path: string): Database;
  close(): void;

  createNode(labels: string[], properties?: Record<string, PropertyValue>): number;
  addEdge(
    src: number,
    dst: number,
    edgeType?: string,
    properties?: Record<string, PropertyValue>
  ): number;
  query(cypher: string): Array<Record<string, unknown>>;

  importCsv(path: string): void;
  importJson(path: string): void;
  importRdf(path: string): void;
  export(path: string, format?: string): void;

  createVectorIndex(
    name: string,
    label: string | undefined,
    propertyKey: string,
    dimensions: number,
    metric?: string
  ): void;
  createFulltextIndex(name: string, label: string | undefined, propertyKeys: string[]): void;
  vectorSearch(indexName: string, queryVector: number[], k: number): Array<Record<string, unknown>>;
  textSearch(indexName: string, queryText: string, k: number): Array<Record<string, unknown>>;

  backup(destPath: string): void;
  checkpoint(): void;
  metrics(): Record<string, unknown>;
}
