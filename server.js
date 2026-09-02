const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'bookings.json');
const GUESTBOOK_FILE = path.join(__dirname, 'guestbook.json');

const MASTER_ADMIN_KEY = 'admin123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getBookings() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch { return []; }
}

function saveBookings(bookings) {
  fs.writeFileSync(DB_FILE, JSON.stringify(bookings, null, 2));
}

function getGuestbook() {
  if (!fs.existsSync(GUESTBOOK_FILE)) fs.writeFileSync(GUESTBOOK_FILE, '[]');
  try { return JSON.parse(fs.readFileSync(GUESTBOOK_FILE, 'utf-8')); } catch { return []; }
}

function saveGuestbook(entries) {
  fs.writeFileSync(GUESTBOOK_FILE, JSON.stringify(entries, null, 2));
}

// Buchungen abrufen
app.get('/api/bookings', (req, res) => {
  const bookings = getBookings();
  res.json(bookings.map(b => ({
    id: b.id,
    startDate: b.startDate,
    endDate: b.endDate,
    guestName: b.guestName
  })));
});

// Buchung erstellen
app.post('/api/bookings', (req, res) => {
  const { guestName, startDate, endDate } = req.body;
  if (!guestName || !startDate || !endDate) return res.status(400).json({ error: 'Alle Felder ausfüllen.' });

  const newStart = new Date(startDate);
  const newEnd = new Date(endDate);
  if (newStart >= newEnd) return res.status(400).json({ error: 'Abreise muss nach Anreise liegen.' });

  const bookings = getBookings();
  const overlap = bookings.some(b => newStart < new Date(b.endDate) && newEnd > new Date(b.startDate));
  if (overlap) return res.status(409).json({ error: 'Zeitraum bereits belegt.' });

  const cancelToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  bookings.push({
    id: crypto.randomUUID(),
    guestName,
    startDate,
    endDate,
    cancelToken,
    createdAt: new Date().toISOString()
  });
  saveBookings(bookings);

  res.status(201).json({ message: 'Buchung erfolgreich!', cancelToken });
});

// Buchung stornieren / löschen
app.delete('/api/bookings/:identifier', (req, res) => {
  const identifier = req.params.identifier.trim();
  const targetId = req.query.id;
  const bookings = getBookings();

  let index = -1;
  if (identifier === MASTER_ADMIN_KEY) {
    index = targetId ? bookings.findIndex(b => b.id === targetId) : 0;
  } else {
    index = bookings.findIndex(b => b.cancelToken.toUpperCase() === identifier.toUpperCase());
  }

  if (index === -1) return res.status(404).json({ error: 'Ungültiger Code oder Schlüssel.' });
  bookings.splice(index, 1);
  saveBookings(bookings);
  res.json({ message: 'Buchung erfolgreich entfernt.' });
});

// Gästebuch abrufen
app.get('/api/guestbook', (req, res) => {
  res.json(getGuestbook());
});

// Gästebuch-Eintrag erstellen
app.post('/api/guestbook', (req, res) => {
  const { author, text } = req.body;
  if (!author || !text || !author.trim() || !text.trim()) {
    return res.status(400).json({ error: 'Name und Text erforderlich.' });
  }
  const entries = getGuestbook();
  const now = new Date();
  const formattedDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  const newEntry = {
    id: crypto.randomUUID(),
    author: author.trim(),
    text: text.trim(),
    date: formattedDate
  };
  entries.unshift(newEntry);
  saveGuestbook(entries);
  res.status(201).json(newEntry);
});

// Gästebuch-Eintrag löschen (nur mit Admin-Schlüssel)
app.delete('/api/guestbook/:id', (req, res) => {
  const { id } = req.params;
  const adminKey = req.query.adminKey;

  if (adminKey !== MASTER_ADMIN_KEY) {
    return res.status(403).json({ error: 'Keine Berechtigung.' });
  }

  const entries = getGuestbook();
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });

  entries.splice(index, 1);
  saveGuestbook(entries);
  res.json({ message: 'Kommentar erfolgreich gelöscht.' });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});