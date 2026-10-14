import os
import sys

# Windowed executable: there is no console, sys.stdout / sys.stderr are None.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

from sms_desktop.app import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
