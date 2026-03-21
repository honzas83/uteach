"""
Obecný LLM API klient s podporou YAML promptů
Podporuje libovolný OpenAI-kompatibilní endpoint (Ollama, vLLM, LM Studio, atd.)
"""

import os
import json
import yaml
import requests
from pathlib import Path


# ── Konfigurace ──────────────────────────────────────────────────────────────

API_URL       = os.getenv("LLM_API_URL",      "http://localhost:11434/v1/chat/completions")
API_KEY       = os.getenv("LLM_API_KEY",      "")        # nech prázdné pokud není potřeba
DEFAULT_MODEL = os.getenv("LLM_MODEL",        "llama3")  # fallback, pokud prompt model neuvede
PROMPTS_FILE  = os.getenv("LLM_PROMPTS_FILE", "prompts.yml")


# ── Načítání YAML promptů ─────────────────────────────────────────────────────

def load_prompts(path: str = PROMPTS_FILE) -> dict:
    """
    Načte prompts.yml a vrátí slovník {id: prompt_dict}.

    Struktura YAML:
        prompts:
          - id: lecture_summary
            name: Shrnutí přednášky
            model: llama3          # volitelné, přepisuje DEFAULT_MODEL
            parameters:
              - name: subject_code
                description: ...
            template: |
              ...{subject_code}...
    """
    file = Path(path)
    if not file.exists():
        raise FileNotFoundError(f"Soubor s prompty nenalezen: {path}")

    with file.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)

    prompts = {}
    for p in data.get("prompts", []):
        pid = p.get("id")
        if not pid:
            raise ValueError(f"Prompt bez 'id': {p}")
        prompts[pid] = p

    print(f"[Prompty] Načteno {len(prompts)} promptů z '{path}': {', '.join(prompts)}")
    return prompts


def render_prompt(prompt: dict, params: dict) -> str:
    """
    Doplní parametry do šablony promptu.

    Args:
        prompt: Slovník promptu z YAML (obsahuje 'template' a 'parameters').
        params: Hodnoty parametrů, např. {"subject_code": "KKY/ITE"}.

    Returns:
        Výsledný text promptu s doplněnými hodnotami.

    Raises:
        ValueError: Pokud chybí povinný parametr.
    """
    for p in prompt.get("parameters", []):
        if p["name"] not in params:
            raise ValueError(
                f"Chybí parametr '{p['name']}' pro prompt '{prompt['id']}' "
                f"({p.get('description', '')})"
            )

    return prompt["template"].format(**params)


# ── Hlavní API funkce ─────────────────────────────────────────────────────────

def chat(
    prompt: str,
    system: str = "You are a helpful assistant.",
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    stream: bool = False,
) -> str:
    """
    Pošle zprávu na LLM endpoint a vrátí odpověď jako string.

    Args:
        prompt:      Text promptu.
        system:      Systémový prompt (chování modelu).
        model:       Název modelu – přepisuje DEFAULT_MODEL.
        temperature: Kreativita odpovědí (0.0 – 2.0).
        max_tokens:  Maximální délka odpovědi.
        stream:      Streaming výstup do konzole (True/False).

    Returns:
        Odpověď modelu jako string.
    """
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    payload = {
        "model":       model,
        "messages":    [
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens":  max_tokens,
        "stream":      stream,
    }

    response = requests.post(API_URL, headers=headers, json=payload, stream=stream, timeout=120)
    response.raise_for_status()

    if stream:
        return _handle_stream(response)
    else:
        data = response.json()
        return data["choices"][0]["message"]["content"]


def run_prompt(
    prompt_id: str,
    params: dict,
    prompts: dict,
    stream: bool = False,
) -> str:
    """
    Spustí prompt ze YAML konfigurace podle jeho ID.

    Args:
        prompt_id: ID promptu definované v YAML (např. "lecture_summary").
        params:    Hodnoty parametrů šablony (např. {"subject_code": "KKY/ITE"}).
        prompts:   Slovník načtených promptů (výstup load_prompts()).
        stream:    Streaming výstup do konzole.

    Returns:
        Odpověď modelu jako string.

    Raises:
        KeyError:   Pokud prompt_id neexistuje.
        ValueError: Pokud chybí povinný parametr.
    """
    if prompt_id not in prompts:
        dostupne = ", ".join(prompts.keys())
        raise KeyError(f"Prompt '{prompt_id}' nenalezen. Dostupné: {dostupne}")

    prompt_def  = prompts[prompt_id]
    filled_text = render_prompt(prompt_def, params)
    model       = prompt_def.get("model", DEFAULT_MODEL)

    print(f"[Spouštím] '{prompt_def['name']}' (model: {model})")
    return chat(filled_text, model=model, stream=stream)


def _handle_stream(response: requests.Response) -> str:
    """Zpracuje streaming odpověď a průběžně ji vypisuje."""
    full_text = ""
    for line in response.iter_lines():
        if not line:
            continue
        line = line.decode("utf-8")
        if line.startswith("data: "):
            chunk = line[6:]
            if chunk == "[DONE]":
                break
            try:
                data  = json.loads(chunk)
                delta = data["choices"][0]["delta"].get("content", "")
                print(delta, end="", flush=True)
                full_text += delta
            except json.JSONDecodeError:
                pass
    print()
    return full_text


# ── Ukázky použití ────────────────────────────────────────────────────────────

if __name__ == "__main__":

    # Načti prompty ze souboru
    prompts = load_prompts("prompts.yml")
    print()

    # 1) Spuštění promptu ze YAML
    print("=== Shrnutí přednášky ===")
    odpoved = run_prompt(
        prompt_id="lecture_summary",
        params={"subject_code": "KKY/ITE"},
        prompts=prompts,
    )
    print(f"\nOdpověď:\n{odpoved}\n")

    # 2) Výpis všech dostupných promptů
    print("=== Dostupné prompty ===")
    for pid, p in prompts.items():
        param_names = [par["name"] for par in p.get("parameters", [])]
        print(f"  {pid:20s} | {p['name']:30s} | parametry: {param_names}")
    print()

    # 3) Přímé volání bez YAML (jako dřív)
    print("=== Přímý dotaz (bez YAML) ===")
    odpoved2 = chat("Vysvětli kvantové provázání jednou větou.")
    print(f"Odpověď: {odpoved2}\n")