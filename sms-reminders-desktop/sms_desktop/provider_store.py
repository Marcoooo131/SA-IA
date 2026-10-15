"""SMS provider settings entered from the application (Paramètres → Fournisseur SMS).

- Provider name and Twilio Account SID: %APPDATA%\\RelancesSMS\\config.env (not secret).
- Twilio Auth Token: Windows Credential Manager (keyring), never written to a file.
"""

from __future__ import annotations

from pathlib import Path

KEYRING_SERVICE = "RelancesSMS"
TOKEN_KEY = "twilio_auth_token"
MANAGED = ("SMR_SMS_PROVIDER", "SMR_TWILIO_ACCOUNT_SID", "SMR_TWILIO_AUTH_TOKEN")


def _default_keyring():
    import keyring

    return keyring


class ProviderStore:
    def __init__(self, path: Path, keyring_module=None):
        self.path = path
        self._keyring = keyring_module

    @property
    def keyring(self):
        if self._keyring is None:
            self._keyring = _default_keyring()
        return self._keyring

    def get_token(self) -> str | None:
        try:
            return self.keyring.get_password(KEYRING_SERVICE, TOKEN_KEY)
        except Exception:  # noqa: BLE001 - no usable credential store
            return None

    def _values(self) -> dict[str, str]:
        from .app import read_config

        return read_config(self.path)

    def describe(self) -> dict:
        values = self._values()
        return {
            "provider": values.get("SMR_SMS_PROVIDER", "twilio"),
            "account_sid": values.get("SMR_TWILIO_ACCOUNT_SID", ""),
            "has_token": bool(self.get_token()),
            "location": str(self.path),
        }

    def save(self, provider: str, account_sid: str, auth_token: str | None) -> None:
        if auth_token:
            self.keyring.set_password(KEYRING_SERVICE, TOKEN_KEY, auth_token)  # may raise: reported to the user
        lines = []
        if self.path.is_file():
            lines = [ln for ln in self.path.read_text(encoding="utf-8-sig").splitlines()
                     if ln.split("=", 1)[0].strip() not in MANAGED]
        lines += [f"SMR_SMS_PROVIDER={provider}", f"SMR_TWILIO_ACCOUNT_SID={account_sid}"]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
