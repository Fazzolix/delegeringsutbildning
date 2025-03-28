#!/usr/bin/env bash
# Exit on error
set -o errexit

# Create python virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create static directories if they don't exist
mkdir -p static/images
