# proto/

gRPC service definition for OpenGraphDB. The `OpenGraphDb` service
mirrors the existing C FFI / HTTP surface (`Query`, `CreateNode`,
`AddEdge`, `Import`, `Export`, `Backup`, `Metrics`) over a
language-neutral wire format.

## Status

**v0.5-pre / reserved.** The `.proto` file ships, but no language
generates a stub from it — there is no `proto/build.rs`, no
`tonic_build` invocation in `crates/`, and no entry in
`documentation/COMPATIBILITY.md` for gRPC. Today the file's syntax
is unverified by any build tool.

The file is preserved so cycle-5+ work that wires gRPC into a real
slice (likely a `crates/ogdb-grpc` server) inherits the schema
without reverse-engineering it from the C ABI.

## Verify the proto parses

```bash
# protoc 3.x or later
protoc --proto_path=proto --descriptor_set_out=/dev/null proto/opengraphdb.proto
```

This is a syntax check only; it does not generate code.

## Generate language stubs (for downstream consumers)

The schema is BSD/Apache-friendly; consumers can codegen ahead of
the workspace landing a server by themselves:

```bash
# Go (with protoc-gen-go + protoc-gen-go-grpc on PATH)
protoc --proto_path=proto --go_out=. --go-grpc_out=. proto/opengraphdb.proto

# Python (grpcio-tools)
python -m grpc_tools.protoc --proto_path=proto \
  --python_out=. --grpc_python_out=. proto/opengraphdb.proto

# Rust (tonic-build, in a future crate's build.rs)
tonic_build::compile_protos("proto/opengraphdb.proto").unwrap();
```

## Wire format notes

- `auth_token` is repeated on every authenticated RPC. Empty string
  means "no token"; the server enforces the workspace's existing
  bearer-token scheme — same shape as the HTTP `Authorization`
  header.
- `Import` carries the raw payload inline (`bytes payload`); large
  imports are expected to use the existing CLI `import` flow rather
  than streaming over gRPC until the v0.6 streaming work lands.
- `MetricsResponse.json_metrics` mirrors the HTTP `/metrics` JSON
  response byte-for-byte; clients can share the existing JSON
  parser.
