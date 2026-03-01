Feature: DELETE category coverage

  Scenario: DELETE removes a node
    Given an empty graph
    And having executed:
      """
      CREATE (n:Temp)
      """
    When executing query:
      """
      MATCH (n:Temp) DELETE n RETURN 1 AS ok
      """
    Then the result should be, in any order:
      | ok |
      | 1  |
