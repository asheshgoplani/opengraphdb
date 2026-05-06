class Opengraphdb < Formula
  desc "Embedded property + RDF graph database with Cypher, vector kNN, and MCP"
  homepage "https://github.com/asheshgoplani/opengraphdb"
  version "0.5.1"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/asheshgoplani/opengraphdb/releases/download/v0.5.1/ogdb-0.5.1-aarch64-apple-darwin.tar.xz"
      sha256 "1bc04d1bb20612bb87fde7d135f2a5df8c90b73b485980646a409759f410f816"
    end
    on_intel do
      url "https://github.com/asheshgoplani/opengraphdb/releases/download/v0.5.1/ogdb-0.5.1-x86_64-apple-darwin.tar.xz"
      sha256 "a758bbda14e5551d3c718dda8d86ff60237da3bc89518864d8ac73ae9d16adcd"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/asheshgoplani/opengraphdb/releases/download/v0.5.1/ogdb-0.5.1-aarch64-unknown-linux-gnu.tar.xz"
      sha256 "7fdf270a921422f207974b5c471946bf7ff6698fa64c1611b8051bd927019d23"
    end
    on_intel do
      url "https://github.com/asheshgoplani/opengraphdb/releases/download/v0.5.1/ogdb-0.5.1-x86_64-unknown-linux-gnu.tar.xz"
      sha256 "f9d69b27b1a411c8190375acee1798432965063c32d5afb15b95147747f5d4ef"
    end
  end

  def install
    bin.install "ogdb"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ogdb --version")
  end
end
