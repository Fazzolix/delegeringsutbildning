import multiprocessing

# Gunicorn configuration file
bind = "0.0.0.0:$PORT"  # Render will provide the PORT environment variable
workers = multiprocessing.cpu_count() * 2 + 1
threads = 2
timeout = 120  # Increased timeout for AI responses
