import os
import sys

# Windowed executable: there is no console, sys.stdout / sys.stderr are None.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")


def _fatal(exc: BaseException) -> None:
    """Readable message instead of PyInstaller's raw Python error dialog."""
    import traceback

    try:
        from sms_desktop.app import data_dir

        log_file = data_dir() / "erreur-demarrage.txt"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        log_file.write_text("".join(traceback.format_exception(exc)), encoding="utf-8")
        where = f"\n\nDétail technique enregistré dans :\n{log_file}"
    except Exception:  # noqa: BLE001
        where = ""
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(
            None, f"Relances SMS n'a pas pu démarrer.\n\n{type(exc).__name__}: {exc}{where}", "Relances SMS", 0x10
        )


if __name__ == "__main__":
    try:
        from sms_desktop.app import main

        sys.exit(main())
    except SystemExit:
        raise
    except BaseException as exc:  # noqa: BLE001
        _fatal(exc)
        sys.exit(1)
