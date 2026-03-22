import urllib.request
import urllib.parse
import json

data = urllib.parse.urlencode({"username": "at.ast7172@gmail.com", "password": "password123"}).encode()
req = urllib.request.Request("http://89.167.122.76:4080/auth/login", data=data)
try:
    with urllib.request.urlopen(req) as res:
        token = json.loads(res.read())["access_token"]
        
        req2 = urllib.request.Request("http://89.167.122.76:4080/auth/me", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req2) as res2:
            print(json.dumps(json.loads(res2.read()), indent=2))
except Exception as e:
    print(e)
