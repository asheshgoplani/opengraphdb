Feature: RETURN category with UNION

  Scenario: UNION and UNION ALL execute
    Given an empty graph
    When executing query:
      """
      OPTIONAL MATCH (n:Person) RETURN n UNION OPTIONAL MATCH (m:Person) RETURN m
      """
    Then the query should execute

    When executing query:
      """
      OPTIONAL MATCH (n:Person) RETURN n UNION ALL OPTIONAL MATCH (m:Person) RETURN m
      """
    Then the query should execute
