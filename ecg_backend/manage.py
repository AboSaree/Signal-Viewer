#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "ecg_backend.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Make sure it's installed and that you "
            "have activated your virtual environment."
        ) from exc
    execute_from_command_line(sys.argv)

if __name__ == "__main__":
    main()