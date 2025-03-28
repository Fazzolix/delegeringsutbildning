import multiprocessing
import os

# Gunicorn configuration file
port = os.environ.get('PORT', '10000')  # Använd PORT från miljövariabeln eller 10000 som standard
bind = f"0.0.0.0:{port}"  # Bind till alla interfaces på angiven port
workers = multiprocessing.cpu_count() * 2 + 1
threads = 2
timeout = 120  # Ökad timeout för AI-svar
