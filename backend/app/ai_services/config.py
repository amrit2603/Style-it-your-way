import ipaddress
from urllib.parse import urlsplit


def service_origin(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError(
            "Configure the HTTPS origin of the Kaggle tunnel, without credentials or a path"
        )
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(
        (".local", ".internal")
    ):
        raise ValueError("Kaggle URL must be a public HTTPS tunnel")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Kaggle URL must not point to a private address")
    return url.rstrip("/")
