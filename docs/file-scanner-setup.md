# File Scanner Setup

Longtail Forge treats file scanning as Files-owned runtime infrastructure. The app-level contract is the same on every operating system: uploads create pending Files records, queue `file.scan`, and stay unavailable for download or preview until the inline worker or a separate `node worker.js` process applies the configured scanner disposition.

## Scanner Modes

| Mode | Use | Result |
| --- | --- | --- |
| `none` | Default disabled-scanning mode for development/local installs that have accepted that risk. Production requires the explicit unscanned-upload override. | `file.scan` does not read file bytes and marks pending files `available` with `scan_status = not_required`. |
| `noop` | Explicit pass-through mode for development or accepted self-hosted troubleshooting only. | `file.scan` marks files `available` with `scan_status = passed` without an external scanner. |
| `clamscan` | ClamAV command-line executable. Useful when a local CLI install is easier than a daemon. | Clean files pass; infected, unavailable, or timed-out scans quarantine the file for review. |
| `clamd` | ClamAV daemon over TCP. Useful for service-style installs and separate workers. | Clean files pass; infected, unavailable, malformed, or timed-out scans quarantine the file for review. |

`LONGTAIL_FILE_SCANNER` must be one of `none`, `noop`, `clamscan`, or `clamd`. Production requires `clamscan` or `clamd`, and both the app and separate worker require its startup health probe to succeed before serving or polling. `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true` is the narrowly scoped escape hatch for an explicitly accepted production deployment without malware scanning; it emits an unsafe-override warning and is not supported for an internet preview. Unix-socket scanning is deferred in this branch; there is no active `LONGTAIL_CLAMD_SOCKET` setting.

## Linux Service Setup

Use `clamd` when the scanner runs as a local service or attached trusted service.

1. Install ClamAV and the daemon package for your distribution.
2. Update virus definitions with the distribution's `freshclam` service or scheduled update path.
3. Configure `clamd` to listen on a TCP address reachable by the Longtail Forge app and worker. The default Longtail Forge client target is `127.0.0.1:3310`.
4. Start and enable the ClamAV daemon through your service manager.
5. Set runtime config:

```env
LONGTAIL_FILE_SCANNER=clamd
LONGTAIL_CLAMD_HOST=127.0.0.1
LONGTAIL_CLAMD_PORT=3310
```

6. Restart the app server and any separate worker process so both load the same scanner mode.
7. Check Workspace Settings -> Runtime Diagnostics. Scanner status should report `clamd` with safe availability, without hostnames, ports, or daemon internals.

If the app and worker run on different hosts, make sure both processes can reach the configured daemon. Keep the daemon on a trusted private network; Longtail Forge does not expose scanner host or port values in diagnostics.

## Windows Executable Path Setup

Use `clamscan` when the Windows install provides a local ClamAV executable.

1. Install ClamAV for Windows and update virus definitions.
2. Confirm the executable path for `clamscan.exe`.
3. Set runtime config. Quote paths in your service manager if required by that service manager; the `.env` value itself should be the path string.

```env
LONGTAIL_FILE_SCANNER=clamscan
LONGTAIL_CLAMSCAN_PATH=C:\Program Files\ClamAV\clamscan.exe
```

4. Restart the app server and any separate worker process.
5. Check Workspace Settings -> Runtime Diagnostics. Scanner status should report `clamscan` with safe availability, without exposing the executable path.

If `LONGTAIL_CLAMSCAN_PATH` is blank, Longtail Forge runs `clamscan` from `PATH`.

## macOS/Homebrew Setup

Use `clamscan` for the simplest local setup, or `clamd` if you already operate the daemon.

1. Install ClamAV with Homebrew and update virus definitions.
2. For `clamscan`, set the executable path for your Homebrew prefix:

```env
LONGTAIL_FILE_SCANNER=clamscan
LONGTAIL_CLAMSCAN_PATH=/opt/homebrew/bin/clamscan
```

Intel Homebrew installs commonly use `/usr/local/bin/clamscan` instead.

3. For `clamd`, configure the daemon to listen on TCP and set:

```env
LONGTAIL_FILE_SCANNER=clamd
LONGTAIL_CLAMD_HOST=127.0.0.1
LONGTAIL_CLAMD_PORT=3310
```

4. Restart the app server and any separate worker process.
5. Check Workspace Settings -> Runtime Diagnostics for safe scanner mode and availability.

## When The Scanner Is Unavailable

Unavailable scanners do not silently pass files and do not delete stored bytes.

- `clamscan` unavailable, scanner error, and timeout results mark the file `quarantined` with `scan_status = error`.
- `clamd` unavailable, malformed, scanner error, and timeout results mark the file `quarantined` with `scan_status = error`.
- Infected results mark the file `quarantined` with `scan_status = failed`.
- Quarantined files stay unavailable for normal download and preview until an authorized review path restores them.
- Scanner diagnostics report safe status and warning copy without exposing executable paths, hostnames, ports, sockets, raw scanner output, storage keys, protected paths, signed URLs, or raw environment values.

`none` is different from scanner-unavailable ClamAV modes: `none` is an explicit disabled-scanning configuration and completes pending scan jobs as `not_required`/`available`. Use it only when the install deliberately accepts disabled scanning. In production it fails configuration validation unless `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true`; a configured but unavailable `clamd`/`clamscan` fails readiness before the app listens or the worker polls.
