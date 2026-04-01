# Návod na nasazení aplikace uteach

## Co může uživatel uteach provést sám

### Krok 1 — Nahrát skript a spustit

```bash
# Přihlásit se na server
ssh uteach@uteach.kky.zcu.cz

# Zkopírovat deploy.sh na server (spustit lokálně):
scp deploy/deploy.sh uteach@uteach.kky.zcu.cz:/srv/uteach/deploy.sh

# Na serveru spustit:
bash /srv/uteach/deploy.sh
```

Skript provede následující kroky:
1. Stáhne archiv z GitHubu (větev `main`) pomocí `curl` — `git` není potřeba
2. Vytvoří virtuální prostředí v `/srv/uteach/.venv` (Python 3.13)
3. Nainstaluje závislosti z `backend/requirements.txt` + `gunicorn`
4. Ověří importovatelnost `server:app`

Výsledná struktura souborů:
```
/srv/uteach/
├── .venv/                 ← Python virtuální prostředí
├── backend/
│   ├── server.py          ← Flask aplikace
│   └── requirements.txt
├── frontend/
├── prompts/
└── deploy.sh
```

---

## Co musí provést správce serveru (vyžaduje root/sudo)

### Krok 2 — Nainstalovat systemd unit

Soubor `deploy/uteach.service` je připraven v repozitáři. Správce jej zkopíruje a aktivuje:

```bash
# Zkopírovat unit soubor:
sudo cp uteach.service /etc/systemd/system/uteach.service

# Aktivovat a spustit:
sudo systemctl daemon-reload
sudo systemctl enable uteach
sudo systemctl start uteach

# Ověřit stav:
sudo systemctl status uteach
```

---

## Testování (bez sudo, provede uteach)

### Přímo na serveru po přihlášení přes SSH:
```bash
curl -v http://127.0.0.1:5001/health
```

### Z lokálního počítače přes SSH tunel:
```bash
# Otevřít tunel (nechat terminál otevřený)
ssh -N -L 8080:127.0.0.1:5001 uteach@uteach.kky.zcu.cz

# V druhém terminálu:
curl http://localhost:8080/health

# Nebo v prohlížeči: http://localhost:8080
```

---

## Logy aplikace
```bash
sudo journalctl -u uteach -f              # živé logy
sudo journalctl -u uteach --since today   # logy za dnešek
```

---

## Důležité poznámky

- **gunicorn** je použit místo Flask dev-serveru — příznak `debug=True` v `server.py` nemá vliv, gunicorn spouští objekt `app` přímo
- Port `5001` naslouchá pouze na `127.0.0.1` — není přístupný zvenčí, což je správné chování za HTTPS proxy
- Správce následně předřadí HTTPS proxy (nginx/caddy) s certifikátem na tento port
