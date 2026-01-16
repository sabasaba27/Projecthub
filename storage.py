from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO

from config import Settings, UPLOAD_DIR


@dataclass
class StoredFile:
    url: str
    path: str


class StorageClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def save(self, file_obj: BinaryIO, filename: str) -> StoredFile:
        if self.settings.storage_backend == "s3":
            return self._save_s3(file_obj, filename)
        return self._save_local(file_obj, filename)

    def _save_local(self, file_obj: BinaryIO, filename: str) -> StoredFile:
        saved_path = UPLOAD_DIR / filename
        file_obj.save(saved_path)
        url = f"/static/uploads/{filename}"
        return StoredFile(url=url, path=str(saved_path))

    def _save_s3(self, file_obj: BinaryIO, filename: str) -> StoredFile:
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required for S3 storage") from exc

        if not self.settings.s3_bucket:
            raise RuntimeError("S3_BUCKET must be set when STORAGE_BACKEND=s3")

        session = boto3.session.Session(
            aws_access_key_id=self.settings.s3_access_key or None,
            aws_secret_access_key=self.settings.s3_secret_key or None,
            region_name=self.settings.s3_region or None,
        )
        client_kwargs = {}
        if self.settings.s3_endpoint:
            client_kwargs["endpoint_url"] = self.settings.s3_endpoint
        s3_client = session.client("s3", **client_kwargs)
        key = f"uploads/{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{filename}"
        s3_client.upload_fileobj(file_obj, self.settings.s3_bucket, key)
        if self.settings.s3_endpoint:
            base = self.settings.s3_endpoint.rstrip("/")
            url = f"{base}/{self.settings.s3_bucket}/{key}"
        elif self.settings.s3_region:
            url = f"https://{self.settings.s3_bucket}.s3.{self.settings.s3_region}.amazonaws.com/{key}"
        else:
            url = f"https://{self.settings.s3_bucket}.s3.amazonaws.com/{key}"
        return StoredFile(url=url, path=key)
