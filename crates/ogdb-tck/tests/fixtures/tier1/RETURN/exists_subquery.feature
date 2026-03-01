Feature: RETURN category with EXISTS subquery

  Scenario: EXISTS subquery executes
    Given an empty graph
    When executing query:
      """
      OPTIONAL MATCH (n) RETURN EXISTS { OPTIONAL MATCH (n)-[:KNOWS]->(m) RETURN m } AS has_knows
      """
    Then the query should execute
