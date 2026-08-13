import io
import json
import sys
from pathlib import Path

# Windows 콘솔 출력 인코딩 UTF-8 설정
if sys.platform == "win32" and isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

from main import app


def generate_openapi_json_string() -> str:
    """FastAPI 앱에서 OpenAPI 스키마를 추출하여 결정적(deterministic) JSON 문자열로 변환합니다."""
    openapi_schema = app.openapi()
    # clean diff를 보장하기 위해 sort_keys=True, indent=2, trailing newline 적용
    return json.dumps(openapi_schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"

def export_openapi() -> None:
    """OpenAPI 스키마를 백엔드 및 프론트엔드 계약 파일에 내보냅니다."""
    json_content = generate_openapi_json_string()

    backend_output_path = Path(__file__).resolve().parent / "openapi.json"
    with open(backend_output_path, "w", encoding="utf-8", newline="") as f:
        f.write(json_content)
    print(f"[OK] [Backend] OpenAPI 스냅샷 생성 완료: {backend_output_path.resolve()}")

    frontend_output_path = Path(__file__).resolve().parents[1] / "frontend" / "openapi.json"
    with open(frontend_output_path, "w", encoding="utf-8", newline="") as f:
        f.write(json_content)
    print(f"[OK] [Frontend] OpenAPI 스냅샷 생성 완료: {frontend_output_path.resolve()}")

def verify_clean_diff() -> bool:
    """2회 연속 생성하여 내용이 완전히 동일(clean diff)한지 검증합니다."""
    run1 = generate_openapi_json_string()
    run2 = generate_openapi_json_string()
    if run1 == run2:
        print("[OK] [Clean Diff 검증 통과] 2회 연속 생성 결과가 100% 일치합니다.")
        return True
    else:
        print("[FAIL] [Clean Diff 검증 실패] 생성 결과 간 차이가 발생했습니다.")
        return False

if __name__ == "__main__":
    is_clean = verify_clean_diff()
    if not is_clean:
        sys.exit(1)
    export_openapi()
