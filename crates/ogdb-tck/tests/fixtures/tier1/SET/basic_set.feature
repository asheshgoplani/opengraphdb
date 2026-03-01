Feature: SET category coverage

  Scenario: SET mutates properties
    Given an empty graph
    And having executed:
      """
      CREATE (n:Person {name: 'alice'})
      """
    When executing query:
      """
      MATCH (n:Person) SET n.name = 'alicia' RETURN n.name AS name
      """
    Then the result should be, in any order:
      | name   |
      | alicia |
