package opengraphdb

import "testing"

func TestDatabaseTypeExists(t *testing.T) {
	var db *Database
	if db != nil {
		t.Fatal("expected nil db pointer in zero-value test")
	}
}
