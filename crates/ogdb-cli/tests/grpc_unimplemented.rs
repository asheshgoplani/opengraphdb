// Regression for C4-H2: README must not advertise gRPC as a runnable
// protocol while `handle_serve_grpc` always returns the "not enabled" /
// "not generated" stub error. If gRPC ever lights up for real, this test
// flips and the README claim must be restored.

use std::process::Command;

#[test]
fn grpc_subcommand_errors_until_v2() {
    let output = Command::new(env!("CARGO_BIN_EXE_ogdb"))
        .args(["serve", "--grpc", "/tmp/c4-h2-probe.ogdb"])
        .output()
        .expect("run ogdb serve --grpc");

    assert!(
        !output.status.success(),
        "ogdb serve --grpc must fail until v2; status: {:?}",
        output.status
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{stderr}\n{stdout}");

    assert!(
        combined.contains("gRPC support is not enabled")
            || combined.contains("gRPC server bindings are not generated"),
        "ogdb serve --grpc must surface the not-implemented stub error \
         until v2; got stderr={stderr} stdout={stdout}"
    );
}
