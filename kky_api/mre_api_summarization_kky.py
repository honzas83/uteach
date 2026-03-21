from ollama import Client
import httpx
import os
import dotenv
dotenv.load_dotenv("./")

LLM_API_URL = os.getenv("LLM_API_URL")
USERNAME = os.getenv("USERNAME")
PASSWORD = os.getenv("PASSWORD")


client = Client(
  host='https://ollama.kky.zcu.cz',
  auth=httpx.DigestAuth(USERNAME, PASSWORD),
)

response = client.chat(model='gemma3:12b',
                       stream=True,
                       options={"num_ctx": 8192},
                       messages=[
  {
    'role': 'system',
    'content': 'Odpovídej v češtině.',
  },
  {
    'role': 'user',
    'content': 'Dobře, jdeme si povídat, ty budeš operátor na lince, která poskytuje informace o odjezdech a příjezdech vlaků.',
  },
])

for chunk in response:
    print(chunk['message']['content'], end='', flush=True)