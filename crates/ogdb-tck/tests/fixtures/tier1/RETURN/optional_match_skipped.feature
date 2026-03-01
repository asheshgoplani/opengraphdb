Feature: RETURN category with optional match

  Scenario: OPTIONAL MATCH executes in an empty graph
    Given an empty graph
    When executing query:
      """
      OPTIONAL MATCH (n:Person) RETURN n
      """
    Then the query should execute
