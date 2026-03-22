import requests
import base64
import json
try:
    r = requests.get('http://89.167.122.76:4081/status')
    data = r.json()
    b64 = data.get('error_screenshot')
    if b64:
        with open('bot_error5.png', 'wb') as f:
            f.write(base64.b64decode(b64))
        print("Image saved as bot_error5.png")
    else:
        print("No screenshot in JSON")
except Exception as e:
    print(e)
