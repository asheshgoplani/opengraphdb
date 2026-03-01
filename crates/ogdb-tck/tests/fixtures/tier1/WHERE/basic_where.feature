Feature: WHERE category coverage

  Scenario: WHERE filters rows
    Given an empty graph
    And having executed:
      """
      CREATE (a:Person {age: 30}), (b:Person {age: 41})
      """
    When executing query:
      """
      MATCH (n:Person) WHERE n.age > 35 RETURN n.age AS age
      """
    Then the result should be, in any order:
      | age |
      | 41  |
