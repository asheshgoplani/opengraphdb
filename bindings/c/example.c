#include "opengraphdb.h"

#include <stdint.h>
#include <stdio.h>

int main(void) {
  OgdbHandle* db = ogdb_init("example.ogdb");
  if (db == NULL) {
    fprintf(stderr, "failed to initialize database\n");
    return 1;
  }

  uint64_t a = ogdb_create_node(db, "[\"Person\"]", "{\"name\":\"Alice\"}");
  uint64_t b = ogdb_create_node(db, "[\"Person\"]", "{\"name\":\"Bob\"}");
  (void)ogdb_add_edge(db, a, b, "KNOWS", "{\"since\":2024}");

  char* rows = ogdb_query(db, "MATCH (n:Person) RETURN n ORDER BY n");
  if (rows != NULL) {
    printf("%s\n", rows);
    ogdb_free(rows);
  }

  ogdb_close(db);
  return 0;
}
