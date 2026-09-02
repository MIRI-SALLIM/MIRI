import pytest

import main


VALID_ORIGINS = ["https://mirisalim.vercel.app"]
VALID_PEPPER = "p" * 32


@pytest.mark.parametrize(
    ("mongodb_uri", "pepper", "ttl_days", "origins", "expected_name"),
    [
        (None, VALID_PEPPER, "7", VALID_ORIGINS, "MONGODB_URI"),
        (
            "mongodb+srv://example",
            "mirisalim_dev_pepper_secret_2026",
            "7",
            VALID_ORIGINS,
            "PARTICIPANT_TOKEN_PEPPER",
        ),
        (
            "mongodb+srv://example",
            "short",
            "7",
            VALID_ORIGINS,
            "PARTICIPANT_TOKEN_PEPPER",
        ),
        (
            "mongodb+srv://example",
            VALID_PEPPER,
            "0",
            VALID_ORIGINS,
            "SESSION_TTL_DAYS",
        ),
        (
            "mongodb+srv://example",
            VALID_PEPPER,
            "seven",
            VALID_ORIGINS,
            "SESSION_TTL_DAYS",
        ),
        (
            "mongodb+srv://example",
            VALID_PEPPER,
            "7",
            [],
            "ALLOWED_ORIGINS",
        ),
        (
            "mongodb+srv://example",
            VALID_PEPPER,
            "7",
            ["http://mirisalim.vercel.app"],
            "ALLOWED_ORIGINS",
        ),
        (
            "mongodb+srv://example",
            VALID_PEPPER,
            "7",
            ["https://mirisalim.vercel.app/api"],
            "ALLOWED_ORIGINS",
        ),
    ],
)
def test_invalid_production_settings_name_the_variable_without_echoing_secrets(
    mongodb_uri,
    pepper,
    ttl_days,
    origins,
    expected_name,
):
    with pytest.raises(RuntimeError) as exc_info:
        main._validate_production_settings(
            "production", mongodb_uri, pepper, ttl_days, origins
        )

    assert expected_name in str(exc_info.value)
    assert "mongodb+srv://example" not in str(exc_info.value)
    assert VALID_PEPPER not in str(exc_info.value)


def test_valid_production_settings_return_ttl_days():
    assert (
        main._validate_production_settings(
            "production",
            "mongodb+srv://example",
            VALID_PEPPER,
            "7",
            VALID_ORIGINS,
        )
        == 7
    )


def test_production_cors_contains_only_configured_origins():
    assert main._cors_origins("production", VALID_ORIGINS) == VALID_ORIGINS


def test_test_environment_keeps_local_origins():
    origins = main._cors_origins("test", [])
    assert "http://localhost:3000" in origins
