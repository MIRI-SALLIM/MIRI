import io
import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient

if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE") or os.getenv("MONGODB_DB_NAME") or "mirisalim"

if not MONGODB_URI:
    raise ValueError(".env 파일에서 MONGODB_URI를 읽을 수 없습니다.")

client: MongoClient[dict[str, Any]] = MongoClient(MONGODB_URI)
db = client.get_database(MONGODB_DATABASE)

def seed_database() -> None:
    config_dir = Path(__file__).resolve().parent / "config"
    files = {
        "parameters": config_dir / "parameters.json",
        "coefficients": config_dir / "coefficients.json",
        "ranges": config_dir / "ranges.json",
        "benchmarks": config_dir / "benchmarks.json",
        "light_questions": config_dir / "light_questions.json",
        "light_types": config_dir / "light_types.json",
    }
    
    for collection_name, file_path in files.items():
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            collection = db[collection_name]
            collection.delete_many({})
            collection.insert_one({"_id": "current_config", "data": data})
            print(f"✅ [{collection_name}] 컬렉션 시드 데이터 업로드 완료")
        else:
            print(f"⚠️ {file_path} 파일이 없어 해당 컬렉션 생성을 스킵합니다.")

if __name__ == "__main__":
    seed_database()
    print("🚀 모든 DB 시드 데이터 구축 완료!")