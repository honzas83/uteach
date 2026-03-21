# Lecture Prompt Templates

YAML šablony promptů pro zpracování přepisů přednášek a prezentací.

## Struktura
```yaml
prompts:
  - id: lecture_summary
  - id: not_in_slides
  - id: glossary
```

Každý prompt přijímá parametr `subject_code` (zkratka předmětu, např. `KKY/ITE`).

## Použití

Nahraď `{subject_code}` zkratkou předmětu a výsledný text použij jako prompt spolu s přepisem přednášky (a případně prezentací).

## TODO

- [ ] **Přidat podporu pro různé jazykové modely** – optimalizovat prompty pro specifické modely:
  - [ ] Mistral – `ministral-3` a další varianty
  - [ ] Alibaba – `Qwen 3.5` a další varianty
  - [ ] Anthropic – `Claude haiku`, `Claude Opus`
  - [ ] případně další modely (GPT-4o, Gemini, ...)
  - Různé modely reagují odlišně na instrukce ohledně formátování, délky a struktury výstupu – může být potřeba prompt ladit zvlášť pro každý model