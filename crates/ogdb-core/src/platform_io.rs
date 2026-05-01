//! Cross-platform positional file I/O shim.
//!
//! `std::os::unix::fs::FileExt::{read_at, write_at}` exists only on Unix.
//! Windows exposes `std::os::windows::fs::FileExt::{seek_read, seek_write}`
//! with the same positional semantics but different method names. This
//! module unifies them under a single `FileExt` trait so the rest of the
//! crate can call `file.read_at(buf, offset)` / `file.write_at(buf, offset)`
//! on every supported target.
//!
//! On non-unix / non-windows targets (e.g. wasm32) we fall back to a
//! `try_clone + seek + read/write` implementation that preserves the
//! "positional" contract from the caller's perspective.

use std::fs::File;
use std::io;

/// Positional read/write trait, identical on Unix and Windows.
pub trait FileExt {
    /// Reads up to `buf.len()` bytes from `self` starting at `offset`,
    /// returning the number of bytes read. May return short reads.
    fn read_at(&self, buf: &mut [u8], offset: u64) -> io::Result<usize>;

    /// Writes up to `buf.len()` bytes from `buf` to `self` starting at
    /// `offset`, returning the number of bytes written. May return short
    /// writes.
    fn write_at(&self, buf: &[u8], offset: u64) -> io::Result<usize>;
}

#[cfg(unix)]
impl FileExt for File {
    fn read_at(&self, buf: &mut [u8], offset: u64) -> io::Result<usize> {
        std::os::unix::fs::FileExt::read_at(self, buf, offset)
    }

    fn write_at(&self, buf: &[u8], offset: u64) -> io::Result<usize> {
        std::os::unix::fs::FileExt::write_at(self, buf, offset)
    }
}

#[cfg(windows)]
impl FileExt for File {
    fn read_at(&self, buf: &mut [u8], offset: u64) -> io::Result<usize> {
        // `seek_read` is the Windows counterpart of POSIX `pread` — it
        // advances the file's internal cursor as a side-effect, but every
        // call site in this crate passes an explicit offset, so the cursor
        // position is irrelevant for correctness.
        std::os::windows::fs::FileExt::seek_read(self, buf, offset)
    }

    fn write_at(&self, buf: &[u8], offset: u64) -> io::Result<usize> {
        std::os::windows::fs::FileExt::seek_write(self, buf, offset)
    }
}

#[cfg(not(any(unix, windows)))]
impl FileExt for File {
    fn read_at(&self, buf: &mut [u8], offset: u64) -> io::Result<usize> {
        use std::io::{Read, Seek, SeekFrom};
        let mut cloned = self.try_clone()?;
        cloned.seek(SeekFrom::Start(offset))?;
        cloned.read(buf)
    }

    fn write_at(&self, buf: &[u8], offset: u64) -> io::Result<usize> {
        use std::io::{Seek, SeekFrom, Write};
        let mut cloned = self.try_clone()?;
        cloned.seek(SeekFrom::Start(offset))?;
        cloned.write(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::FileExt;
    use std::fs::OpenOptions;
    use std::io::Write;

    fn temp_path(tag: &str) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        let pid = std::process::id();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        p.push(format!("ogdb-platform-io-{tag}-{pid}-{ts}.bin"));
        p
    }

    #[test]
    fn round_trip_positional_read_write() {
        let path = temp_path("rt");
        let mut f = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)
            .expect("open temp file");

        // Pre-extend so `write_at` past EOF is well-defined on Windows
        // (where seek_write extends the file but Unix pwrite-style is
        // happy to extend implicitly anyway).
        f.write_all(&[0u8; 256]).expect("pre-extend");
        f.sync_all().expect("sync");
        drop(f);

        let f = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .expect("reopen");

        // Two non-overlapping positional writes.
        let payload_a = b"hello-positional-world";
        let payload_b = b"OFFSET-128-PAYLOAD";

        let mut written = 0usize;
        while written < payload_a.len() {
            let n = FileExt::write_at(&f, &payload_a[written..], (16 + written) as u64)
                .expect("write_at a");
            assert!(n > 0, "short write returned 0");
            written += n;
        }

        let mut written = 0usize;
        while written < payload_b.len() {
            let n = FileExt::write_at(&f, &payload_b[written..], (128 + written) as u64)
                .expect("write_at b");
            assert!(n > 0, "short write returned 0");
            written += n;
        }

        // Read them back via the positional API and confirm content.
        let mut buf_a = vec![0u8; payload_a.len()];
        let mut read = 0usize;
        while read < buf_a.len() {
            let n =
                FileExt::read_at(&f, &mut buf_a[read..], (16 + read) as u64).expect("read_at a");
            assert!(n > 0, "short read returned 0");
            read += n;
        }
        assert_eq!(&buf_a, payload_a);

        let mut buf_b = vec![0u8; payload_b.len()];
        let mut read = 0usize;
        while read < buf_b.len() {
            let n =
                FileExt::read_at(&f, &mut buf_b[read..], (128 + read) as u64).expect("read_at b");
            assert!(n > 0, "short read returned 0");
            read += n;
        }
        assert_eq!(&buf_b, payload_b);

        // Reading from a region we never touched (still within the
        // pre-extended zero region) returns zero bytes.
        let mut zeros = [0xFFu8; 8];
        let n = FileExt::read_at(&f, &mut zeros, 64).expect("read_at zero region");
        assert_eq!(n, 8);
        assert_eq!(&zeros, &[0u8; 8]);

        drop(f);
        let _ = std::fs::remove_file(&path);
    }
}
