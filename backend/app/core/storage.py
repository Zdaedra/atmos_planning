import os
from minio import Minio

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "atmos_admin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "atmos_minio_password")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "atmos-photos")

# The minio client
client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

def get_minio_client():
    return client

def ensure_bucket_exists():
    found = client.bucket_exists(MINIO_BUCKET)
    if not found:
        client.make_bucket(MINIO_BUCKET)
        print(f"Created bucket {MINIO_BUCKET}")
    else:
        print(f"Bucket {MINIO_BUCKET} already exists")

# Initialize bucket upon startup
try:
    ensure_bucket_exists()
except Exception as e:
    print(f"Error ensuring MinIO bucket exists: {e}")
