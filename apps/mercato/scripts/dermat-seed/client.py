"""Small HTTP client for the Dermat seed and export scripts (Python standard library only)."""

import getpass
import http.cookiejar
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
PNG = bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082'
)


def read_api_key(path=None):
    """API key from DERMAT_SEED_API_KEY, or from a file holding the key (or the CLI output of `mercato api_keys add`)."""
    value = os.environ.get('DERMAT_SEED_API_KEY', '').strip()
    if value:
        return value
    if not path:
        raise SystemExit('Set DERMAT_SEED_API_KEY or pass --api-key-file')
    text = open(path, encoding='utf-8').read()
    match = re.search(r'Secret \(store immediately\):\s*(\S+)', text) or re.search(r'(omk_\S+)', text)
    if not match:
        raise SystemExit(f'No API key found in {path}')
    return match.group(1)


class Api:
    def __init__(self, base_url, api_key=None, verbose=False):
        self.base = base_url.rstrip('/')
        self.key = api_key
        self.verbose = verbose
        self.problems = []
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def login(self, email, password):
        """Sign in as the admin created by `mercato init`; used instead of an API key."""
        data = json.dumps({'email': email, 'password': password}).encode()
        req = urllib.request.Request(self.base + '/api/auth/login', data=data, method='POST')
        req.add_header('content-type', 'application/json')
        try:
            with self.opener.open(req, timeout=120) as resp:
                resp.read()
        except urllib.error.HTTPError as err:
            raise SystemExit(f'Admin login failed ({err.code}). Check the email and password.')
        for cookie in self.jar:
            if cookie.secure and self.base.startswith('http://'):
                cookie.secure = False
        status, _ = self.call('GET', '/api/directory/organizations?pageSize=1')
        if status != 200:
            raise SystemExit('Admin login did not stick. On a plain-http server set ALLOW_INSECURE_HTTP_COOKIES=true in apps/mercato/.env and restart.')

    def call(self, method, path, body=None, headers=None, retries=2):
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(retries + 1):
            req = urllib.request.Request(self.base + path, data=data, method=method)
            if self.key:
                req.add_header('x-api-key', self.key)
            if data is not None:
                req.add_header('content-type', 'application/json')
            for key, value in (headers or {}).items():
                req.add_header(key, value)
            try:
                with self.opener.open(req, timeout=300) as resp:
                    text = resp.read().decode('utf-8-sig')
                    try:
                        return resp.status, json.loads(text) if text else {}
                    except ValueError:
                        return resp.status, {'raw': text}
            except urllib.error.HTTPError as err:
                text = err.read().decode('utf-8', 'replace')
                if err.code in (502, 503, 504) and attempt < retries:
                    time.sleep(3)
                    continue
                try:
                    return err.code, json.loads(text)
                except ValueError:
                    return err.code, {'raw': text[:300]}
            except urllib.error.URLError as err:
                if attempt < retries:
                    time.sleep(3)
                    continue
                raise SystemExit(f'Cannot reach {self.base}: {err.reason}')
        return 599, {}

    def get(self, path):
        status, res = self.call('GET', path)
        if status != 200:
            raise SystemExit(f'GET {path} failed: {status} {json.dumps(res)[:300]}')
        return res

    def get_all(self, path, page_size=100):
        sep = '&' if '?' in path else '?'
        items, page = [], 1
        while True:
            res = self.get(f'{path}{sep}page={page}&pageSize={page_size}')
            batch = res.get('items', [])
            items.extend(batch)
            total_pages = res.get('totalPages') or 1
            if page >= total_pages or not batch:
                return items
            page += 1

    def ok(self, step, status, res, good=(200, 201)):
        if status not in good:
            message = f'{step}: {status} {json.dumps(res)[:300]}'
            self.problems.append(message)
            print(f'  !! {message}', flush=True)
            return False
        if self.verbose:
            print(f'  ok {step}', flush=True)
        return True

    def upload_stage_doc(self, record_id, name='proof.png'):
        boundary = uuid.uuid4().hex
        parts = [
            f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"\r\n\r\n{value}\r\n'.encode()
            for field, value in (('entityId', 'dermat_orders:order_stage'), ('recordId', record_id))
        ]
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n'.encode()
            + PNG
            + b'\r\n'
        )
        parts.append(f'--{boundary}--\r\n'.encode())
        req = urllib.request.Request(self.base + '/api/attachments', data=b''.join(parts), method='POST')
        if self.key:
            req.add_header('x-api-key', self.key)
        req.add_header('content-type', f'multipart/form-data; boundary={boundary}')
        try:
            with self.opener.open(req, timeout=180) as resp:
                return resp.status
        except urllib.error.HTTPError as err:
            return err.code


def connect(args, verbose=False):
    """Api signed in with --admin-email (password from DERMAT_ADMIN_PASSWORD or a prompt), or with an API key."""
    if getattr(args, 'admin_email', None):
        password = os.environ.get('DERMAT_ADMIN_PASSWORD') or getpass.getpass(f'Password for {args.admin_email}: ')
        api = Api(args.url, verbose=verbose)
        api.login(args.admin_email, password)
        return api
    return Api(args.url, read_api_key(getattr(args, 'api_key_file', None)), verbose=verbose)


def quote(value):
    return urllib.parse.quote(str(value))
