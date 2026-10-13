import sys

if __name__ == "__main__":
    if "--selftest" in sys.argv:
        from phonecall_desktop.app import main

        sys.exit(main(["--selftest"]))
    from phonecall_desktop.diag import main

    sys.exit(main())
