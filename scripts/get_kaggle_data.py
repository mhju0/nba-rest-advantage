"""Download NBA betting data from Kaggle into scripts/.

Dataset: ehallmar/nba-historical-stats-and-betting-data
Expected files after download:
    - nba_spread.csv      (spread lines per game per sportsbook)
    - nba_moneyline.csv   (moneyline prices per game per sportsbook)

After downloading, run:
    python scripts/import_kaggle_spreads.py
"""

import kagglehub
import os
import shutil

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Files we want from the dataset
TARGET_FILES = ["nba_spread.csv", "nba_moneyline.csv"]

# 1. Download the dataset to Kaggle's hidden cache
print("Downloading from Kaggle...")
path = kagglehub.dataset_download("ehallmar/nba-historical-stats-and-betting-data")
print(f"Downloaded to hidden cache: {path}")

# 2. List the files so we know what's available
files = os.listdir(path)
print(f"\nFiles found in this dataset: {files}")

# 3. Copy target files to scripts/
copied = 0
for filename in TARGET_FILES:
    source_path = os.path.join(path, filename)
    destination_path = os.path.join(SCRIPTS_DIR, filename)

    if os.path.exists(source_path):
        shutil.copy(source_path, destination_path)
        print(f"  Copied {filename} → {destination_path}")
        copied += 1
    else:
        print(f"  WARNING: '{filename}' not found in downloaded files.")

if copied > 0:
    print(f"\nDone! Copied {copied} file(s). Next step:")
    print("  python scripts/import_kaggle_spreads.py")
else:
    print("\nNo target files found. Available files:")
    for f in files:
        print(f"  - {f}")
    print("Update TARGET_FILES in this script to match.")