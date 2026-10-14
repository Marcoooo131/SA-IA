# Console executable used by the IT team and the CI to check an installation.
import sys

from sms_desktop.app import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["--selftest"]))
