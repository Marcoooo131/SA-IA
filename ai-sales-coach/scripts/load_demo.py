"""Charge le jeu de démonstration fictif : python scripts/load_demo.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sales_coach.demo import load_demo  # noqa: E402

if __name__ == "__main__":
    print(f"{load_demo()} analyses fictives créées.")
