// Bot "Przypominajka": WhatsApp z numeru nadawcy (Baileys, nieoficjalne).
// Uruchamiany co ~20 min przez GitHub Actions; każde uruchomienie: połącz → odbierz zaległe wiadomości → ew. wyślij → zakończ.
//   node bot.js --polacz   jednorazowe połączenie z WhatsAppem (kod QR), na laptopie
//   node bot.js            jedno uruchomienie (to robi GitHub)
// Zasady: szkic do nadawcy raz dziennie / po zmianie treści; "możesz puścić" → do odbiorcy co ≥60 min
// pon–pt w godzinach z config.json (czas polski), aż odbiorca odpisze.
const fs = require('fs')
const path = require('path')
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

// libsignal wypisuje klucze sesji przez console.log — nie chcemy ich w logach GitHuba
const _log = console.log
console.log = (...a) => { if (typeof a[0] === 'string' && /^Closing (open )?session/.test(a[0])) return; _log(...a) }
const pino = require('pino')

const dir = __dirname
const plik = (n) => path.join(dir, n)
const cfg = JSON.parse(fs.readFileSync(plik('config.json'), 'utf8'))
const odbiorcaNr = String(cfg.numer_odbiorcy).replace(/\D/g, '')
const POLACZ = process.argv.includes('--polacz')
const GODZINA = 60 * 60 * 1000

// czas polski niezależnie od strefy serwera
const pl = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }))
const dzis = `${pl.getFullYear()}-${pl.getMonth() + 1}-${pl.getDate()}`
const wOknie = cfg.dni.includes(pl.getDay()) && cfg.godziny.includes(pl.getHours())

const tresc = () => fs.readFileSync(plik('tresc.txt'), 'utf8').trim()
const nr = (jid) => String(jid || '').split('@')[0].split(':')[0]
const bezOgonkow = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').toLowerCase().replace(/[.!\s]+/g, ' ').trim()
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms))

const stanPlik = plik('stan.json')
const stan = Object.assign({ akcept: '', szkicDzien: '', szkicTresc: '', ostatniaWysylka: 0, sprawdzonoDo: Math.floor(Date.now() / 1000) },
  fs.existsSync(stanPlik) ? JSON.parse(fs.readFileSync(stanPlik, 'utf8')) : {})
const zapisz = () => fs.writeFileSync(stanPlik, JSON.stringify(stan, null, 2))
const log = (m) => { const l = `${pl.toLocaleString('pl-PL')}  ${m}`; console.log(l); fs.appendFileSync(plik('log.txt'), l + '\n') }

// Kod QR jako strona (odświeża się sama) — do zeskanowania z ekranu
function zapiszQrHtml(qr) {
  const QRCode = require('qrcode-terminal/vendor/QRCode'), Lvl = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel')
  const q = new QRCode(-1, Lvl.L); q.addData(qr); q.make()
  const n = q.getModuleCount(); let r = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) r += `<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`
  fs.writeFileSync(plik('qr.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>WhatsApp QR</title>
<body style="background:#fff;font-family:sans-serif;text-align:center"><p>WhatsApp → Połączone urządzenia → Połącz urządzenie</p>
<svg viewBox="0 0 ${n + 8} ${n + 8}" width="360" height="360" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${r}</svg>`)
}

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState(plik('auth'))
  const sock = makeWASocket({ auth: state, markOnlineOnConnect: false, logger: pino({ level: 'silent' }) })
  sock.ev.on('creds.update', saveCreds)

  const odebrane = []
  sock.ev.on('messages.upsert', ({ messages }) => odebrane.push(...messages))

  const numerNadawcy = process.argv[process.argv.indexOf('--polacz') + 1]?.replace(/\D/g, '')
  let kodWyslany = false
  const otwarte = await new Promise((resolve) => {
    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
      if (qr) {
        if (!POLACZ) { log('BŁĄD: WhatsApp wylogowany — trzeba ponownie połączyć (node bot.js --polacz na laptopie).'); return resolve(false) }
        if (numerNadawcy && !kodWyslany) { // łączenie kodem zamiast QR
          kodWyslany = true
          const kod = await sock.requestPairingCode(numerNadawcy)
          console.log('KOD: ' + kod)
          fs.writeFileSync(plik('qr.html'), `<!doctype html><meta charset="utf-8"><title>Kod WhatsApp</title><body style="font-family:sans-serif;text-align:center;background:#fff">
<p>WhatsApp → Połączone urządzenia → Połącz urządzenie → <b>Połącz za pomocą numeru telefonu</b></p><h1 style="font-size:64px;letter-spacing:8px">${kod}</h1>`)
        } else if (!numerNadawcy) { qrcode.generate(qr, { small: true }); zapiszQrHtml(qr) }
      }
      // po zeskanowaniu WhatsApp wymusza restart połączenia (kod 515)
      if (connection === 'close' && POLACZ && lastDisconnect?.error?.output?.statusCode === 515) resolve('restart')
      if (connection === 'open') resolve(true)
    })
    setTimeout(() => resolve(false), POLACZ ? 300000 : 60000)
  })
  if (otwarte === 'restart') { sock.end(); return main() }
  if (!otwarte) { log('Nie udało się połączyć.'); process.exit(1) }
  if (POLACZ) { log('Połączono. Można wgrać folder auth na GitHuba.'); await czekaj(10000); process.exit(0) }

  await czekaj(25000) // czas na dostarczenie wiadomości, które przyszły od ostatniego uruchomienia
  const ja = nr(sock.user.id) + '@s.whatsapp.net'
  const moje = [nr(sock.user.id), nr(sock.user.lid)]
  const doMnie = (t) => sock.sendMessage(ja, { text: t })
  const odKiedy = stan.sprawdzonoDo
  stan.sprawdzonoDo = Math.floor(Date.now() / 1000)

  // 1. Nowe wiadomości (tylko nowsze niż poprzednie uruchomienie — bez starej historii)
  for (const m of odebrane.sort((a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp))) {
    if (Number(m.messageTimestamp) <= odKiedy) continue
    const k = m.key
    const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').trim()
    // Odbiorca: jego numer bywa ukryty jako @lid, numer telefonu jest wtedy w polach *Alt / senderPn
    if (!k.fromMe && [k.remoteJid, k.remoteJidAlt, k.senderPn].map(nr).includes(odbiorcaNr)) {
      if (stan.akcept) { stan.akcept = ''; await doMnie('Odbiorca odpisał — przypominajki zatrzymane.') }
      log('Odbiorca odpisał — stop.')
    } else if (k.fromMe && moje.includes(nr(k.remoteJid)) && text) {
      if (bezOgonkow(text) === 'mozesz puscic') { stan.akcept = tresc(); stan.ostatniaWysylka = 0; log('Nadawca zaakceptował treść.') }
      else if (/^przypominajka:/i.test(text)) { fs.writeFileSync(plik('tresc.txt'), text + '\n'); stan.akcept = ''; log('Nadawca zmienił treść w WhatsAppie.') }
    }
  }

  const t = tresc()
  // 2. Szkic do nadawcy: po zmianie treści (WhatsApp albo edycja tresc.txt w repo) lub raz dziennie w oknie — nie co godzinę
  if (t && t !== stan.akcept && (t !== stan.szkicTresc || (wOknie && stan.szkicDzien !== dzis))) {
    await doMnie('[SZKIC do akceptu — odpisz „możesz puścić”]\n\n' + t)
    stan.szkicTresc = t; stan.szkicDzien = dzis; log('Wysłano szkic do nadawcy.')
  }

  // 3. Przypominajka do odbiorcy: zaakceptowana, w oknie, ≥60 min od poprzedniej
  if (t && stan.akcept === t && wOknie && Date.now() - stan.ostatniaWysylka >= GODZINA - 60000) {
    await sock.sendMessage(odbiorcaNr + '@s.whatsapp.net', { text: t })
    stan.ostatniaWysylka = Date.now(); log('Wysłano przypominajkę do odbiorcy.')
  }

  zapisz()
  await czekaj(5000) // dosłanie wiadomości i zapis kluczy
  process.exit(0)
}

main().catch((e) => { log('Błąd: ' + e.message); zapisz(); process.exit(1) })
