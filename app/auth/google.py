from dataclasses import dataclass
from typing import Any

from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import id_token


class GoogleCredentialError(ValueError):
    pass


@dataclass(frozen=True)
class GoogleClaims:
    subject: str
    email: str
    email_verified: bool
    full_name: str
    hosted_domain: str | None = None


class GoogleTokenVerifier:
    def __init__(self, client_id: str) -> None:
        self.client_id = client_id

    def verify(self, credential: str) -> GoogleClaims:
        try:
            claims: dict[str, Any] = id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
                credential,
                Request(),
                self.client_id,
                clock_skew_in_seconds=5,
            )
        except (GoogleAuthError, ValueError) as error:
            raise GoogleCredentialError("Google credential is invalid or expired") from error

        subject = claims.get("sub")
        email = claims.get("email")
        email_verified = claims.get("email_verified") is True
        if not isinstance(subject, str) or not subject:
            raise GoogleCredentialError("Google credential has no subject")
        if not isinstance(email, str) or not email or not email_verified:
            raise GoogleCredentialError("Google email is missing or unverified")

        full_name = claims.get("name")
        if not isinstance(full_name, str) or not full_name.strip():
            full_name = email.split("@", maxsplit=1)[0]
        hosted_domain = claims.get("hd")
        return GoogleClaims(
            subject=subject,
            email=email.lower(),
            email_verified=True,
            full_name=full_name.strip(),
            hosted_domain=hosted_domain if isinstance(hosted_domain, str) else None,
        )
