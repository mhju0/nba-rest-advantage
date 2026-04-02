import kagglehub
import os
import shutil

# 1. Download the dataset to Kaggle's hidden cache
print("Downloading from Kaggle...")
path = kagglehub.dataset_download("ehallmar/nba-historical-stats-and-betting-data")
print(f"Downloaded to hidden cache: {path}")

# 2. List the files so we know the exact names Kaggle uses
files = os.listdir(path)
print(f"\nFiles found in this dataset: {files}")

# 3. Define the file we want to grab from the cache
# NOTE: Look at the printout from step 2. You might need to change "nba_betting.csv" 
# to the exact name of the file that contains the spread data.
target_kaggle_file = "nba_betting_spread.csv" 
source_path = os.path.join(path, target_kaggle_file)

# 4. Define where we want to save it in your project
destination_path = "scripts/spreads_data.csv"

# 5. Copy the file over
if os.path.exists(source_path):
    # Ensure the scripts folder exists
    os.makedirs("scripts", exist_ok=True)
    
    # Copy the file
    shutil.copy(source_path, destination_path)
    print(f"\nSuccess! The file was copied to your project as: {destination_path}")
else:
    print(f"\nError: Could not find '{target_kaggle_file}' in the downloaded files.")
    print("Check the 'Files found' list above and update the 'target_kaggle_file' variable!")