Feature: CREATE category coverage

  Scenario: CREATE two nodes
    Given an empty graph
    When executing query:
      """
      CREATE (a:Person {name: 'alice'}), (b:Person {name: 'bob'}) RETURN a.name AS left, b.name AS right
      """
    Then the result should be, in any order:
      | left  | right |
      | alice | bob   |
