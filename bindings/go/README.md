# bindings/go

Cgo wrapper for OpenGraphDB's C ABI. Wraps the `bindings/c/`
auto-generated header (`opengraphdb.h`) into idiomatic Go API
shapes (`Database`, `Init`, `Open`, `Query`, `CreateNode`,
`AddEdge`, `Import`, `Export`, `Backup`, `Checkpoint`, `Metrics`).

## Status

Experimental. The Go surface tracks the C surface, which is stable
per the workspace `v0.x` semver guarantee — see
`crates/ogdb-ffi/src/lib.rs` `//!` block.

## Module layout

```
bindings/go/
└── opengraphdb/
    ├── go.mod                  # module opengraphdb (no remote yet)
    ├── opengraphdb.go          # cgo wrapper
    └── opengraphdb_test.go     # smoke tests (zero-value sanity)
```

The cgo directives live at the top of `opengraphdb.go`:

```go
/*
#cgo CFLAGS: -I${SRCDIR}/../../c
#include "opengraphdb.h"
#include <stdlib.h>
*/
import "C"
```

## Build and test

```bash
cargo build --release -p ogdb-ffi
cd bindings/go/opengraphdb
CGO_LDFLAGS="-L$(git rev-parse --show-toplevel)/target/release -logdb_ffi -ldl -lpthread" \
  go test ./...
```

On macOS, replace `-ldl -lpthread` with the platform-default linker
flags (the standard libdl / libpthread are part of libSystem).

The wrapper assumes `target/release/libogdb_ffi.{so,dylib}` exists
relative to the workspace root; package up your own dynamic library
distribution path before publishing the Go module to a remote.

## Memory ownership

`Query` and `Metrics` JSON-decode the C-side string into a Go
`map[string]any` in a single call; the C buffer is freed via
`C.ogdb_free` before the function returns. `Database.Close()`
zeroes the handle field — calling any method on a closed
`*Database` returns the sentinel error `"database is closed"`.
