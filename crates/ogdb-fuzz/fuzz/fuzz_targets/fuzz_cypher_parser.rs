#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // parse_cypher takes &str; non-UTF-8 is the UTF-8 decoder's problem,
    // not the parser's contract. See PLAN §3.1.
    let Ok(s) = std::str::from_utf8(data) else {
        return;
    };

    // Any Result — Ok or Err — is acceptable. Only panics / aborts /
    // infinite loops are bugs this target hunts for.
    let _ = ogdb_core::parse_cypher(s);
});
