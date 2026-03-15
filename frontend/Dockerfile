FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy frontend files
COPY . .

# Expose port
EXPOSE 3000

# Run the HTTP server
CMD ["python3", "-m", "http.server", "3000"]
