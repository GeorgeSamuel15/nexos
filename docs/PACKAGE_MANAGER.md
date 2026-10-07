# NexOS package manager

`nx` is the NexOS application package manager. In v0.2 it always exposes an in-process, version-pinned local registry and can query a compatible HTTPS registry when the user explicitly enables online access in Settings. Terminal and App Manager use the same system-service implementation.

```text
nx list
nx search focus
nx info focus-timer
nx install focus-timer
nx remove community.nexos.focus-timer
nx update
```

The local registry deliberately contains a small demonstrator package. `nx install` validates a package and persists it through the application repository. `nx remove` refuses to remove built-in applications and stops running instances before uninstalling a third-party package. `nx update` queries the active registry, compares semantic versions, validates each eligible replacement, stops its running instances, and updates the stored package. It reports that no update is available when the registry contains no newer version.

## `.nxapp` v1 format

The current format is one UTF-8 JSON document with these top-level keys:

- `format`: exactly `nexos-app-v1`
- `manifest`: validated application identity, dimensions, associations and permissions
- `application`: declarative content; v1 accepts only `document-viewer`
- `assets`: string-keyed inline assets with package-relative safe paths
- `publisher` (optional): publisher ID, display name, key ID, and PEM Ed25519 public key
- `signature` (optional): Ed25519 signature, key ID, and signing timestamp

The installer enforces a 5 MiB limit. It rejects invalid UTF-8, malformed JSON, unknown shapes, unsafe paths, reserved IDs, duplicate app IDs, invalid signatures, and arbitrary runtime types. It does not run lifecycle scripts.

The signature covers a recursively key-sorted JSON serialization of the complete package except the `signature` property. The application service records the SHA-256 hash of the original blob. Local packages may be unsigned for development; packages downloaded from an online registry must have a valid Ed25519 signature.

## Online registry protocol

Online access is off by default. A server URL is configured under Settings → Applications and must use a public HTTPS host. A compatible registry exposes:

- `GET <base>/v1/packages?q=<query>` returning `{ "packages": RegistryPackageSummary[] }`
- `GET <base>/v1/packages/<name>` returning one `.nxapp` JSON document

Responses must use a JSON content type. Search payloads are capped at 512 KiB, package payloads at 5 MiB, requests time out after 10 seconds, and redirects are not followed. DNS answers are checked against non-public address ranges and the approved address is pinned for the TLS connection. The renderer never receives registry credentials or a general-purpose network API.

The configured URL describes a protocol endpoint; NexOS does not ship or imply a live public registry. The production registry milestone still needs immutable blobs, compatibility metadata, permission-delta review, rollback/cache support, publisher revocation and key rotation, and a transparency mechanism.
