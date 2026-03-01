Feature: MATCH category basic coverage

  Scenario: MATCH RETURN from seeded graph
    Given an empty graph
    And having executed:
      """
      CREATE (n:Person {name: 'alice'})
      """
    When executing query:
      """
      MATCH (n:Person) RETURN n.name AS name
      """
    Then the result should be, in any order:
      | name  |
      | alice |
