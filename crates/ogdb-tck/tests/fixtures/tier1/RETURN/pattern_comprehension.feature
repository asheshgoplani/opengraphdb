Feature: RETURN category with pattern comprehension

  Scenario: Pattern comprehension executes
    Given an empty graph
    When executing query:
      """
      OPTIONAL MATCH (n) RETURN [(n)-[:KNOWS]->(m) | m] AS neighbors
      """
    Then the query should execute
