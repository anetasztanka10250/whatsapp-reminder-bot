# Przypominajka: bot WhatsApp

Szef nie pamięta, a terminy gonią, więc trzeba sobie radzić. Napisałam bota, który przypomina mu o zaległych sprawach, dopóki nie odpisze.

## Jak działa
1. Rano bot wysyła mi szkic przypomnienia na czat „Wiadomość do siebie” w WhatsAppie.
2. Odpisuję „możesz puścić” i dopiero wtedy przypomnienie idzie do odbiorcy. Bez mojej zgody nic nie wychodzi.
3. Potem bot ponawia je nie częściej niż co 60 minut, od poniedziałku do piątku w ustalonych godzinach.
4. Gdy odbiorca odpisze, bot przestaje wysyłać i daje mi znać.
5. W ciągu dnia mogę zmienić treść, wysyłając sobie wiadomość zaczynającą się od „Przypominajka:”. Po każdej zmianie bot znowu czeka na moją zgodę.

## Technologia
- Node.js i Baileys (nieoficjalna biblioteka WhatsApp Web).
- GitHub Actions jako darmowy harmonogram. Nie potrzeba serwera ani laptopa włączonego przez cały dzień.
- Po każdym uruchomieniu stan i klucze sesji zapisują się w repozytorium.

## Uruchomienie
```
npm ci
cp config.example.json config.json   # wpisz numer odbiorcy
cp tresc.example.txt tresc.txt
node bot.js --polacz 48XXXXXXXXX     # Twój numer; wpisz kod w WhatsApp → Połączone urządzenia
```
Potem usuń z `.gitignore` wpisy `auth/`, `config.json`, `stan.json`, `log.txt` i `tresc.txt`, wgraj całość do **prywatnego** repozytorium i odkomentuj `schedule` w `.github/workflows/przypominajka.yml`.

## Uwaga
- Repozytorium z działającym botem musi być prywatne, bo folder `auth` daje dostęp do Twojego WhatsAppa.
- Baileys nie jest oficjalnym API WhatsAppa i za automatyczne wiadomości numer może zostać zablokowany. Używasz na własne ryzyko.
