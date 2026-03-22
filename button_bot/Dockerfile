FROM mcr.microsoft.com/playwright/python:v1.41.2-jammy

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run the FastAPI server which also manages the background loop
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
