import io
import os
import json
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise ValueError(".env 파일에서 MONGODB_URI를 읽을 수 없습니다.")

client = MongoClient(MONGODB_URI)
db = client.get_database("mirisalim")  # DB명: mirisalim

def seed_database():
    files = {
        "parameters": "config/parameters.json",
        "coefficients": "config/coefficients.json",
        "ranges": "config/ranges.json",
        "benchmarks": "config/benchmarks.json"
    }
    
    for collection_name, file_path in files.items():
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # 기존 데이터 정리 후 신규 동기화
            collection = db[collection_name]
            collection.delete_many({})
            collection.insert_one({"_id": "current_config", "data": data})
            print(f"✅ [{collection_name}] 컬렉션 시드 데이터 업로드 완료")
        else:
            print(f"⚠️ {file_path} 파일이 없어 해당 컬렉션 생성을 스킵합니다.")

if __name__ == "__main__":
    seed_database()
    print("🚀 모든 DB 시드 데이터 구축 완료!")