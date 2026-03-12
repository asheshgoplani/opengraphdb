# Graph Modeling Patterns

Graph data modeling patterns and anti-patterns for OpenGraphDB. Use these patterns when
designing schemas from domain descriptions.

## Good Patterns

### 1. Entity-Relationship Pattern

The fundamental pattern: core entities as labeled nodes, relationships as typed directed edges.

```cypher
CREATE (p:Person {name: 'Alice', born: 1990})
CREATE (c:Company {name: 'Acme', founded: 2005})
CREATE (city:City {name: 'Berlin', country: 'Germany'})
CREATE (p)-[:WORKS_AT {since: 2020}]->(c)
CREATE (c)-[:LOCATED_IN]->(city)
```

Use when: you have clear entities with well-defined relationships between them.

### 2. Intermediate Node Pattern

When a relationship has rich properties or connects multiple entities, promote it to a node.

**Instead of:**
```cypher
CREATE (p)-[:WORKS_AT {title: 'Engineer', since: 2020, salary: 100000}]->(c)
```

**Use:**
```cypher
CREATE (p:Person {name: 'Alice'})
CREATE (role:Role {title: 'Engineer', since: 2020, salary: 100000})
CREATE (c:Company {name: 'Acme'})
CREATE (p)-[:HAS_ROLE]->(role)-[:AT]->(c)
```

Use when: a relationship has 3+ properties, or you need to query by relationship attributes,
or the relationship itself participates in other relationships.

### 3. Hyperedge Pattern

When a relationship involves 3 or more entities, model it as a central node connecting all parties.

```cypher
CREATE (contract:Contract {date: '2024-01-15', value: 50000})
CREATE (buyer:Company {name: 'Acme'})
CREATE (seller:Company {name: 'WidgetCo'})
CREATE (property:RealEstate {address: '123 Main St'})
CREATE (contract)-[:BUYER]->(buyer)
CREATE (contract)-[:SELLER]->(seller)
CREATE (contract)-[:COVERS]->(property)
```

Use when: an event or transaction involves multiple participants in different roles.

### 4. Temporal Modeling Pattern

Use timestamp properties for versioning and time-based queries.

```cypher
CREATE (e:Event {name: 'Conference', date: '2024-06-15', endDate: '2024-06-17'})
CREATE (p:Person {name: 'Alice'})
CREATE (p)-[:ATTENDED {registeredAt: '2024-05-01'}]->(e)
```

For OpenGraphDB's temporal query support, nodes can be queried at specific time points:

```cypher
MATCH (n:Person {name: 'Alice'}) AT TIME '2024-01-01'
RETURN n
```

Use when: you need historical tracking, versioning, or time-based analysis.

### 5. Hierarchical Structure Pattern

Model parent-child relationships with explicit directional edges.

```cypher
CREATE (root:Category {name: 'Electronics'})
CREATE (sub:Category {name: 'Laptops'})
CREATE (leaf:Category {name: 'Gaming Laptops'})
CREATE (root)-[:PARENT_OF]->(sub)
CREATE (sub)-[:PARENT_OF]->(leaf)
```

Query ancestors:
```cypher
MATCH (c:Category {name: 'Gaming Laptops'})<-[:PARENT_OF*]-(ancestor:Category)
RETURN ancestor.name
```

Use when: you have trees, taxonomies, organizational charts, or file systems.

### 6. Tagging Pattern

Flexible categorization using tag nodes connected by edges.

```cypher
CREATE (article:Article {title: 'Graph Databases 101'})
CREATE (tag1:Tag {name: 'database'})
CREATE (tag2:Tag {name: 'tutorial'})
CREATE (article)-[:TAGGED]->(tag1)
CREATE (article)-[:TAGGED]->(tag2)
```

Query by tag:
```cypher
MATCH (a:Article)-[:TAGGED]->(t:Tag {name: 'database'}) RETURN a.title
```

Use when: entities need flexible, user-defined categorization. Prefer over array properties
when you need to query by tag across entities.

### 7. Linked List Pattern

Model ordered sequences using NEXT relationships.

```cypher
CREATE (v1:Version {number: '1.0', date: '2024-01-01'})
CREATE (v2:Version {number: '1.1', date: '2024-03-15'})
CREATE (v3:Version {number: '2.0', date: '2024-06-01'})
CREATE (v1)-[:NEXT]->(v2)-[:NEXT]->(v3)
```

Use when: you need to represent ordered sequences, version chains, or timelines.

### 8. Star Schema Pattern

A central fact node connected to dimension nodes for analytical queries.

```cypher
CREATE (sale:Sale {amount: 150.00, quantity: 3})
CREATE (sale)-[:SOLD_TO]->(customer:Customer {name: 'Alice'})
CREATE (sale)-[:CONTAINS]->(product:Product {name: 'Widget'})
CREATE (sale)-[:ON_DATE]->(date:Date {year: 2024, month: 6, day: 15})
CREATE (sale)-[:AT_STORE]->(store:Store {name: 'Downtown'})
```

Use when: modeling transactional data for analytical queries with multiple dimensions.

## Anti-Patterns

### 1. God Node Anti-Pattern

**Problem:** One node type stores everything as properties instead of creating proper graph structure.

**Bad:**
```cypher
CREATE (u:User {name: 'Alice', companyName: 'Acme', companyCity: 'Berlin',
  managerName: 'Bob', departmentName: 'Engineering'})
```

**Fix:** Split into labeled nodes with relationships:
```cypher
CREATE (u:Person {name: 'Alice'})
CREATE (c:Company {name: 'Acme'})
CREATE (city:City {name: 'Berlin'})
CREATE (mgr:Person {name: 'Bob'})
CREATE (dept:Department {name: 'Engineering'})
CREATE (u)-[:WORKS_AT]->(c), (c)-[:LOCATED_IN]->(city)
CREATE (u)-[:REPORTS_TO]->(mgr), (u)-[:IN_DEPARTMENT]->(dept)
```

### 2. Property Overload Anti-Pattern

**Problem:** Storing structured data as JSON strings in properties.

**Bad:**
```cypher
CREATE (o:Order {items: '[{"product":"Widget","qty":3},{"product":"Gadget","qty":1}]'})
```

**Fix:** Create proper graph structure:
```cypher
CREATE (o:Order {date: '2024-06-15'})
CREATE (li1:LineItem {quantity: 3})-[:PART_OF]->(o)
CREATE (li2:LineItem {quantity: 1})-[:PART_OF]->(o)
CREATE (li1)-[:FOR_PRODUCT]->(p1:Product {name: 'Widget'})
CREATE (li2)-[:FOR_PRODUCT]->(p2:Product {name: 'Gadget'})
```

### 3. Implicit Types Anti-Pattern

**Problem:** Using a `type` property instead of labels.

**Bad:**
```cypher
CREATE (n:Entity {type: 'person', name: 'Alice'})
CREATE (n2:Entity {type: 'company', name: 'Acme'})
```

**Fix:** Use labels:
```cypher
CREATE (n:Person {name: 'Alice'})
CREATE (n2:Company {name: 'Acme'})
```

Labels enable efficient filtering via OpenGraphDB's roaring bitmap label indexes.

### 4. Missing Relationships Anti-Pattern

**Problem:** Storing foreign keys as properties instead of creating edges.

**Bad:**
```cypher
CREATE (o:Order {customerId: 42, productId: 99})
```

**Fix:** Create proper relationships:
```cypher
CREATE (c:Customer)-[:PLACED]->(o:Order)-[:CONTAINS]->(p:Product)
```

### 5. Redundant Properties Anti-Pattern

**Problem:** Storing values computable from graph structure.

**Bad:**
```cypher
CREATE (p:Person {name: 'Alice', friendCount: 15, totalOrders: 42})
```

**Fix:** Compute from the graph when needed:
```cypher
MATCH (p:Person {name: 'Alice'})-[:FRIENDS_WITH]-(friend) RETURN count(friend)
MATCH (p:Person {name: 'Alice'})-[:PLACED]->(o:Order) RETURN count(o)
```

Exception: cache computed values as properties when query performance is critical and the
value changes infrequently.

### 6. Over-Normalization Anti-Pattern

**Problem:** Creating separate nodes for simple enum-like values.

**Bad:**
```cypher
CREATE (s:Status {value: 'active'})
CREATE (order:Order)-[:HAS_STATUS]->(s)
```

**Fix:** Use a property for small value sets (under 10 distinct values):
```cypher
CREATE (order:Order {status: 'active'})
```

Create separate nodes only when the value set is large, has its own properties, or needs
to be queried as a first-class entity.

## Domain-Specific Templates

### Social Network

```
(:Person)-[:FOLLOWS]->(:Person)
(:Person)-[:POSTED]->(:Post)
(:Person)-[:LIKES]->(Post)
(:Post)-[:REPLY_TO]->(:Post)
(:Person)-[:MEMBER_OF]->(:Group)
(:Post)-[:TAGGED]->(:Tag)
```

Key indexes: `Person(name)`, `Person(email)`, `Post(createdAt)`

### E-Commerce

```
(:Customer)-[:PLACED]->(:Order)-[:CONTAINS]->(:LineItem)-[:FOR_PRODUCT]->(:Product)
(:Product)-[:IN_CATEGORY]->(:Category)
(:Customer)-[:REVIEWED]->(:Review)-[:ABOUT]->(:Product)
(:Category)-[:PARENT_OF]->(:Category)
```

Key indexes: `Customer(email)`, `Product(sku)`, `Order(date)`, `Product(name)`

### Knowledge Graph

```
(:Entity {_uri: 'http://...'})-[:RELATED_TO {predicate: '...'}]->(:Entity)
(:Entity)-[:INSTANCE_OF]->(:Concept)
(:Concept)-[:BROADER]->(:Concept)
```

Key indexes: `Entity(_uri)`, `Entity(name)`, `Concept(label)`
Note: preserve `_uri` for RDF round-trip fidelity.

### IoT / Sensor Network

```
(:Device {serialNumber: '...'})-[:LOCATED_AT]->(:Location)
(:Device)-[:RECORDED]->(:Reading {value: 23.5, timestamp: '...'})
(:Reading)-[:TRIGGERED]->(:Alert {severity: 'high'})
(:Device)-[:PART_OF]->(:DeviceGroup)
```

Key indexes: `Device(serialNumber)`, `Reading(timestamp)`, `Alert(severity)`

### Organizational

```
(:Employee)-[:REPORTS_TO]->(:Employee)
(:Employee)-[:IN_DEPARTMENT]->(:Department)
(:Department)-[:PART_OF]->(:Division)
(:Employee)-[:WORKS_ON]->(:Project)
(:Project)-[:OWNED_BY]->(:Department)
```

Key indexes: `Employee(email)`, `Employee(employeeId)`, `Project(name)`
