"""Local Authorization Code + PKCE smoke test. Tokens stay in process memory."""
import base64, hashlib, json, secrets, urllib.parse, urllib.request, webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

issuer = "http://localhost:18080/realms/3p-poc"
redirect = "http://127.0.0.1:18082/callback"
state = secrets.token_urlsafe(32)
verifier = secrets.token_urlsafe(64)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
result = {}
class Callback(BaseHTTPRequestHandler):
    def log_message(self, *_): pass  # Authorization codes must not enter access logs.
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(url.query)
        valid = url.path == "/callback" and query.get("state") == [state]
        if valid:
            result.update(query)
        self.send_response(200 if valid else 400)
        self.end_headers()
        self.wfile.write(b"Return to the terminal." if valid else b"Invalid callback.")

with HTTPServer(("127.0.0.1", 18082), Callback) as server:
    server.timeout = 180
    params = urllib.parse.urlencode(dict(client_id="3p-poc-cli", response_type="code",
        scope="openid profile", redirect_uri=redirect, state=state,
        code_challenge=challenge, code_challenge_method="S256"))
    webbrowser.open(issuer + "/protocol/openid-connect/auth?" + params)
    server.handle_request()
if "code" not in result:
    raise SystemExit("Login not completed or denied; no token obtained.")
data = urllib.parse.urlencode(dict(grant_type="authorization_code", client_id="3p-poc-cli",
    code=result["code"][0], redirect_uri=redirect, code_verifier=verifier)).encode()
with urllib.request.urlopen(issuer + "/protocol/openid-connect/token", data=data, timeout=15) as response:
    token = json.load(response)["access_token"]
request = urllib.request.Request("http://127.0.0.1:18081/api/poc/keycloak/me",
    headers={"Authorization": "Bearer " + token})
with urllib.request.urlopen(request, timeout=15) as response:
    print("HTTP", response.status)
    print(json.dumps(json.load(response), indent=2))
