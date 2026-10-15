"""Sending phones entered from the application (Paramètres → Téléphones d'envoi).

- Mode and, for each service, the phone's address and login: %APPDATA%\\RelancesSMS\\config.env.
- Phone passwords: Windows Credential Manager (keyring), never written to a file.
"""

from __future__ import annotations

from pathlib import Path

KEYRING_SERVICE = "RelancesSMS"
SERVICES = ("movers", "takeovers")
MANAGED = ("SMR_SMS_PROVIDER",) + tuple(
    f"SMR_PHONE_{sv.upper()}_{k}" for sv in SERVICES for k in ("URL", "USER", "PASSWORD")
)


def _default_keyring():
    import keyring

    return keyring


def password_key(service: str) -> str:
    return f"phone_{service}_password"


class ProviderStore:
    def __init__(self, path: Path, keyring_module=None):
        self.path = path
        self._keyring = keyring_module

    @property
    def keyring(self):
        if self._keyring is None:
            self._keyring = _default_keyring()
        return self._keyring

    def get_password(self, service: str) -> str | None:
        try:
            return self.keyring.get_password(KEYRING_SERVICE, password_key(service))
        except Exception:  # noqa: BLE001 - no usable credential store
            return None

    def _values(self) -> dict[str, str]:
        from .app import read_config

        return read_config(self.path)

    def describe(self) -> dict:
        values = self._values()
        return {
            "provider": values.get("SMR_SMS_PROVIDER", "telephone"),
            "phones": {
                sv: {
                    "url": values.get(f"SMR_PHONE_{sv.upper()}_URL", ""),
                    "user": values.get(f"SMR_PHONE_{sv.upper()}_USER", ""),
                    "has_password": bool(self.get_password(sv)),
                }
                for sv in SERVICES
            },
            "location": str(self.path),
        }

    def save_phones(self, provider: str, phones: dict[str, tuple[str, str, str | None]]) -> None:
        """phones: service -> (url, login, password or None to keep the stored one)."""
        for sv, (_, _, password) in phones.items():
            if password:
                self.keyring.set_password(KEYRING_SERVICE, password_key(sv), password)  # may raise: reported
        lines = []
        if self.path.is_file():
            lines = [ln for ln in self.path.read_text(encoding="utf-8-sig").splitlines()
                     if ln.split("=", 1)[0].strip() not in MANAGED and not ln.startswith("SMR_TWILIO_")]
        lines.append(f"SMR_SMS_PROVIDER={provider}")
        for sv, (url, login, _) in phones.items():
            lines += [f"SMR_PHONE_{sv.upper()}_URL={url}", f"SMR_PHONE_{sv.upper()}_USER={login}"]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
