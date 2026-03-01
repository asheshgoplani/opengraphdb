const test = require('node:test');
const assert = require('node:assert/strict');

const { Database } = require('../index.js');

test('node binding smoke', () => {
  const db = Database.init('/tmp/opengraphdb-node-smoke.ogdb');
  const a = db.createNode(['Person'], { name: 'Alice', age: 30 });
  const b = db.createNode(['Person'], { name: 'Bob', age: 28 });
  assert.equal(a, 0);
  assert.equal(b, 1);

  const edgeId = db.addEdge(a, b, 'KNOWS', { since: 2024 });
  assert.equal(edgeId, 0);

  const rows = db.query('MATCH (n:Person) RETURN n ORDER BY n');
  assert.deepEqual(rows, [{ n: 0 }, { n: 1 }]);

  const metrics = db.metrics();
  assert.equal(metrics.node_count, 2);
  assert.equal(metrics.edge_count, 1);

  db.close();
});
