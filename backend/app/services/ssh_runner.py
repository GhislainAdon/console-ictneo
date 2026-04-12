"""One-shot SSH command runner used by the Node Terminal widget.

Supports the three auth modes declared on a Node:
- agent: rely on a running ssh-agent / ~/.ssh/config on the host running the
  console. No credentials are stored anywhere.
- password: use the password recorded on the Node row.
- key: read the private key from ssh_key_path (local file on the console
  host) and authenticate with it.

This is intentionally NOT interactive: a single command is sent and the
stdout/stderr/exit status are captured and returned. For an interactive
shell, users should still SSH from their own terminal.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import paramiko


@dataclass
class SshResult:
    ok: bool
    stdout: str
    stderr: str
    exit_code: int


def _resolve_key_path(raw: str) -> Path:
    p = Path(raw).expanduser()
    if not p.is_absolute():
        p = p.resolve()
    return p


def run(
    *,
    host: str,
    port: int,
    user: str,
    auth: str,
    password: str | None,
    key_path: str | None,
    command: str,
    timeout: int = 30,
) -> SshResult:
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    kwargs: dict = {
        "hostname": host,
        "port": port,
        "username": user,
        "timeout": 10,
        "banner_timeout": 10,
        "auth_timeout": 10,
    }

    try:
        if auth == "password":
            if not password:
                return SshResult(False, "", "no password stored", 2)
            kwargs["password"] = password
            kwargs["look_for_keys"] = False
            kwargs["allow_agent"] = False
        elif auth == "key":
            if not key_path:
                return SshResult(False, "", "no key path stored", 2)
            kp = _resolve_key_path(key_path)
            if not kp.exists():
                return SshResult(False, "", f"key not found: {kp}", 2)
            # Try the standard key formats paramiko knows about, in order.
            loaders = [
                paramiko.Ed25519Key.from_private_key_file,
                paramiko.ECDSAKey.from_private_key_file,
                paramiko.RSAKey.from_private_key_file,
            ]
            pkey = None
            last_err: Exception | None = None
            for loader in loaders:
                try:
                    pkey = loader(str(kp))
                    break
                except Exception as exc:  # noqa: BLE001
                    last_err = exc
            if pkey is None:
                return SshResult(False, "", f"unsupported key: {last_err}", 2)
            kwargs["pkey"] = pkey
            kwargs["look_for_keys"] = False
            kwargs["allow_agent"] = False
        elif auth == "agent":
            # Let paramiko use the agent / ~/.ssh/*.pub as-is.
            kwargs["look_for_keys"] = True
            kwargs["allow_agent"] = True
        else:
            return SshResult(False, "", f"unknown auth mode: {auth}", 2)

        client.connect(**kwargs)
        stdin_, stdout_, stderr_ = client.exec_command(command, timeout=timeout)
        out = stdout_.read().decode("utf-8", errors="replace")
        err = stderr_.read().decode("utf-8", errors="replace")
        rc = stdout_.channel.recv_exit_status()
        return SshResult(ok=(rc == 0), stdout=out, stderr=err, exit_code=rc)
    except Exception as exc:  # noqa: BLE001
        return SshResult(False, "", f"ssh error: {exc}", 1)
    finally:
        client.close()
