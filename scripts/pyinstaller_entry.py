"""PyInstaller entrypoint — absolute imports only (no package-relative __main__)."""

from wiki.cli import main

if __name__ == "__main__":
    main()
