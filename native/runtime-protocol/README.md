# NexOS Rust runtime protocol prototype

This `no_std` crate mirrors the 16-byte binary frame implemented by `@nexos/runtime`. It is deliberately limited to framing and version negotiation; it is not a kernel and is not linked into the Electron release.

The next Rust-host milestone can wrap these frames in an authenticated local transport and implement capability-scoped methods. Keeping this crate dependency-free makes it suitable for both a user-space daemon and an eventual kernel-facing runtime.
