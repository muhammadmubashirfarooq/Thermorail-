import os
import requests
from dotenv import load_dotenv

# Load FortyGuard API key from .env file
load_dotenv()

api_key = os.getenv("FORTYGUARD_API_KEY")

# FortyGuard API authentication endpoint
url = "https://api.fortyguard.com/v1/heatmap" 
headers = {
    "api-key": api_key,
    "Content-Type": "application/json"
}

try:
    print("Testing FortyGuard API connection...")
    response = requests.post(url, headers=headers, json={})
    
    print(f"Status Code: {response.status_code}")
    print("Response Output:", response.text)

except Exception as e:
    print(f"Execution Error: {e}")