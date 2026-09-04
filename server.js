const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const MASTER_ADMIN_KEY = 'admin123';

// Dein Atlas Verbindungs-Link
const uri = "mongodb+srv://alinkapusuzoglu_db_user:VYMUZ31AJGzvQpeK@cluster0.44angng.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

let db, bookingsCollection, guestbookCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('ferienhaus');
    bookingsCollection = db.collection('bookings');
    guestbookCollection = db.collection('guestbook');
    console.log("Erfolgreich mit MongoDB Atlas verbunden!");
  } catch (e) {
    console.error("Fehler bei der Datenbankverbindung:", e);
  }
}
connectDB();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Buchungen abrufen
app.get('/api/bookings', async (req, res) => {
  try {
    const bookings = await bookingsCollection.find({}).toArray();
    res.json(bookings.map(b => ({
      id: b._id.toString(),
      startDate: b.startDate,
      endDate: b.endDate,
      guestName: b.guestName
    })));
  } catch (e) {
    res.status(500).json({ error: "Fehler beim Laden der Buchungen" });
  }
});

// Buchung erstellen
app.post('/api/bookings', async (req, res) => {
  try {
    const { guestName, startDate, endDate } = req.body;
    if (!guestName || !startDate || !endDate) return res.status(400).json({ error: 'Alle Felder ausfüllen.' });

    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);
    if (newStart >= newEnd) return res.status(400).json({ error: 'Abreise muss nach Anreise liegen.' });

    const bookings = await bookingsCollection.find({}).toArray();
    const overlap = bookings.some(b => newStart < new Date(b.endDate) && newEnd > new Date(b.startDate));
    if (overlap) return res.status(409).json({ error: 'Zeitraum bereits belegt.' });

    const cancelToken = crypto.randomBytes(4).toString('hex').toUpperCase();
    const newBooking = {
      guestName,
      startDate,
      endDate,
      cancelToken,
      createdAt: new Date().toISOString()
    };
    
    const result = await bookingsCollection.insertOne(newBooking);
    res.status(201).json({ message: 'Buchung erfolgreich!', cancelToken, id: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: "Fehler beim Speichern der Buchung" });
  }
});

// Buchung stornieren / löschen
app.delete('/api/bookings/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier.trim();
    const targetId = req.query.id;

    let query = {};
    if (identifier === MASTER_ADMIN_KEY) {
      if (targetId) {
        query = { _id: new ObjectId(targetId) };
      } else {
        return res.status(400).json({ error: 'ID für Admin-Löschung fehlt.' });
      }
    } else {
      query = { cancelToken: { $regex: new RegExp(`^${identifier}$`, 'i') } };
    }

    const result = await bookingsCollection.deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Ungültiger Code oder Schlüssel.' });
    }

    res.json({ message: 'Buchung erfolgreich entfernt.' });
  } catch (e) {
    res.status(500).json({ error: "Fehler beim Löschen der Buchung" });
  }
});

// Gästebuch abrufen
app.get('/api/guestbook', async (req, res) => {
  try {
    const entries = await guestbookCollection.find({}).sort({ _id: -1 }).toArray();
    res.json(entries.map(e => ({
      id: e._id.toString(),
      author: e.author,
      text: e.text,
      date: e.date
    })));
  } catch (e) {
    res.status(500).json({ error: "Fehler beim Laden des Gästebuchs" });
  }
});

// Gästebuch-Eintrag erstellen
app.post('/api/guestbook', async (req, res) => {
  try {
    const { author, text } = req.body;
    if (!author || !text || !author.trim() || !text.trim()) {
      return res.status(400).json({ error: 'Name und Text erforderlich.' });
    }

    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

    const newEntry = {
      author: author.trim(),
      text: text.trim(),
      date: formattedDate,
      createdAt: new Date()
    };

    const result = await guestbookCollection.insertOne(newEntry);
    res.status(201).json({
      id: result.insertedId.toString(),
      author: newEntry.author,
      text: newEntry.text,
      date: newEntry.date
    });
  } catch (e) {
    res.status(500).json({ error: "Fehler beim Speichern des Eintrags" });
  }
});

// Gästebuch-Eintrag löschen (nur mit Admin-Schlüssel)
app.delete('/api/guestbook/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const adminKey = req.query.adminKey;

    if (adminKey !== MASTER_ADMIN_KEY) {
      return res.status(403).json({ error: 'Keine Berechtigung.' });
    }

    const result = await guestbookCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    }

    res.json({ message: 'Kommentar erfolgreich gelöscht.' });
  } catch (e) {
    res.status(500).json({ error: "Fehler beim Löschen des Kommentars" });
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});