import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from app.core.security import create_access_token
from datetime import timedelta

token = create_access_token(
    data={"sub": "at.ast7172@gmail.com", "role": "supervisor"}, 
    expires_delta=timedelta(minutes=60)
)

import urllib.request
import json

req = urllib.request.Request("http://89.167.122.76:4080/auth/me", headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req) as res:
        print(json.dumps(json.loads(res.read()), indent=2))
except Exception as e:
    print(e)
