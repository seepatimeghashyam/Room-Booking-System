const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = 3000;
const MONGO_URL = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'Hack_RoomBooking';
const client = new MongoClient(MONGO_URL);
let rooms;
let bookings;

// Fictional hotel inventory. Existing starter rooms are upgraded by slug/name
// while their MongoDB _id values (and linked bookings) are retained.
const seedRooms = [
  { slug: 'orchid-suite', legacyName: 'Orchid Room', name: 'The Orchid Suite', category: 'stay', rateUnit: 'night', capacity: 2, price: 8200, description: 'A quiet, light-filled suite with a king bed and a private balcony.', amenities: ['King bed', 'Balcony', 'Breakfast'], image: 'photo-1611892440504-42a792e24d32' },
  { slug: 'garden-deluxe', name: 'Garden Deluxe', category: 'stay', rateUnit: 'night', capacity: 2, price: 6800, description: 'Thoughtful comforts and leafy garden views for a restorative stay.', amenities: ['Queen bed', 'Garden view', 'Wi-Fi'], image: 'photo-1618221195710-dd6b41faaea6' },
  { slug: 'presidential-suite', name: 'The Presidential Suite', category: 'stay', rateUnit: 'night', capacity: 3, price: 14500, description: 'A generous signature suite with a separate lounge and room to unwind.', amenities: ['King bed', 'Separate lounge', 'Breakfast'], image: 'photo-1616486338812-3dadae4b4ace' },
  { slug: 'cedar-boardroom', legacyName: 'Cedar Room', name: 'Cedar Boardroom', category: 'meeting', rateUnit: 'hour', capacity: 10, price: 2400, description: 'A private boardroom with natural light and everything ready for ideas.', amenities: ['10 seats', 'Display screen', 'Coffee service'], image: 'photo-1497366754035-f200968a6e72' },
  { slug: 'the-library', name: 'The Library', category: 'meeting', rateUnit: 'hour', capacity: 6, price: 1600, description: 'An intimate discussion room for focused conversations and small teams.', amenities: ['6 seats', 'Whiteboard', 'Tea service'], image: 'photo-1497366811353-6870744d04b2' },
  { slug: 'summit-hall', legacyName: 'Summit Hall', name: 'Summit Event Hall', category: 'event', rateUnit: 'hour', capacity: 50, price: 7200, description: 'A versatile, beautifully finished space for celebrations and gatherings.', amenities: ['50 guests', 'Flexible layout', 'Event support'], image: 'photo-1519167758481-83f550bb49b3' }
];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ''); }
function nightsBetween(checkIn, checkOut) {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000);
}
function intervalsOverlap(startA, endA, startB, endB) { return startA < endB && startB < endA; }
function toPublicBooking(booking) {
  const { guestEmail, ...publicBooking } = booking;
  return publicBooking;
}

async function findConflicts(roomId, room, checkIn, checkOut, startTime, endTime) {
  // Old demo bookings used `date/start/end`; read those too so upgrading the
  // app does not make existing MongoDB bookings disappear or double-bookable.
  const oldAndNew = await bookings.find({ roomId }).toArray();
  return oldAndNew.filter(booking => {
    if (booking.status === 'cancelled') return false;
    if (room.rateUnit === 'night') {
      const bookedStart = booking.checkIn || booking.startDate || booking.date;
      const bookedEnd = booking.checkOut || booking.endDate || (booking.date ? new Date(Date.parse(`${booking.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : null);
      return bookedStart && bookedEnd && intervalsOverlap(checkIn, checkOut, bookedStart, bookedEnd);
    }
    const bookedDate = booking.checkIn || booking.startDate || booking.date;
    const bookedStart = booking.startTime || booking.start;
    const bookedEnd = booking.endTime || booking.end;
    return bookedDate === checkIn && bookedStart && bookedEnd && intervalsOverlap(startTime, endTime, bookedStart, bookedEnd);
  });
}

app.get('/api/rooms', async (req, res) => {
  const { checkIn, checkOut, startTime, endTime, category } = req.query;
  if (checkIn && !validDate(checkIn)) return res.status(400).json({ error: 'Choose a valid arrival date.' });
  if (checkOut && !validDate(checkOut)) return res.status(400).json({ error: 'Choose a valid departure date.' });
  if (category && !['stay', 'meeting', 'event'].includes(category)) return res.status(400).json({ error: 'Choose a valid space category.' });

  const inventory = await rooms.find(category ? { category } : {}).sort({ category: 1, price: 1 }).toArray();
  const ready = await Promise.all(inventory.map(async room => {
    if (!checkIn || !checkOut) return { ...room, available: true };
    if (room.rateUnit === 'night' && checkOut <= checkIn) return { ...room, available: false };
    if (room.rateUnit === 'hour' && (!validTime(startTime) || !validTime(endTime) || startTime >= endTime)) return { ...room, available: false };
    const conflicts = await findConflicts(room._id, room, checkIn, checkOut, startTime, endTime);
    return { ...room, available: conflicts.length === 0 };
  }));
  res.json(ready);
});

app.get('/api/bookings', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Provide the email used for your reservation.' });
  const result = await bookings.find({ guestEmail: email, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(25).toArray();
  res.json(result.map(toPublicBooking));
});

app.post('/api/bookings', async (req, res) => {
  const { roomId, checkIn, checkOut, startTime, endTime, guests, guestName, guestEmail } = req.body || {};
  if (!ObjectId.isValid(roomId || '') || !validDate(checkIn) || !validDate(checkOut) ||
      !Number.isInteger(Number(guests)) || Number(guests) < 1 || !String(guestName || '').trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(guestEmail || '').trim())) {
    return res.status(400).json({ error: 'Enter valid stay dates, guest details, and a room.' });
  }
  const room = await rooms.findOne({ _id: new ObjectId(roomId) });
  if (!room) return res.status(404).json({ error: 'That room or space was not found.' });
  if (Number(guests) > room.capacity) return res.status(400).json({ error: `This space accommodates up to ${room.capacity} guests.` });

  let units;
  let dateFields;
  if (room.rateUnit === 'night') {
    units = nightsBetween(checkIn, checkOut);
    if (units < 1 || units > 30) return res.status(400).json({ error: 'Choose a stay between 1 and 30 nights.' });
    dateFields = { checkIn, checkOut };
  } else {
    if (checkIn !== checkOut || !validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
      return res.status(400).json({ error: 'Choose one valid date and an end time later than the start time.' });
    }
    units = Math.round((Date.parse(`1970-01-01T${endTime}:00Z`) - Date.parse(`1970-01-01T${startTime}:00Z`)) / 3600000 * 100) / 100;
    if (units <= 0 || units > 12) return res.status(400).json({ error: 'Hourly bookings can be between 30 minutes and 12 hours.' });
    dateFields = { checkIn, checkOut, startTime, endTime };
  }

  const conflicts = await findConflicts(room._id, room, checkIn, checkOut, startTime, endTime);
  if (conflicts.length) {
    const clash = conflicts[0];
    const when = room.rateUnit === 'night'
      ? `already reserved from ${clash.checkIn || clash.startDate || clash.date} to ${clash.checkOut || clash.endDate || 'the following day'}`
      : `unavailable between ${clash.startTime || clash.start} and ${clash.endTime || clash.end}`;
    return res.status(409).json({ error: `${room.name} is ${when}. Please choose another time.` });
  }

  const totalPrice = Math.round(room.price * units);
  const booking = {
    roomId: room._id,
    roomName: room.name,
    category: room.category,
    rateUnit: room.rateUnit,
    ...dateFields,
    guests: Number(guests),
    guestName: String(guestName).trim(),
    guestEmail: String(guestEmail).trim().toLowerCase(),
    rateAtBooking: room.price,
    units,
    totalPrice,
    currency: 'INR',
    status: 'confirmed',
    reference: `AS${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date()
  };
  const result = await bookings.insertOne(booking);
  res.status(201).json(toPublicBooking({ ...booking, _id: result.insertedId }));
});

app.delete('/api/bookings/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid reservation reference.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Enter the email used for this reservation.' });
  const result = await bookings.updateOne(
    { _id: new ObjectId(req.params.id), guestEmail: email, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', cancelledAt: new Date() } }
  );
  if (!result.modifiedCount) return res.status(404).json({ error: 'Active reservation not found for that email.' });
  res.json({ message: 'Reservation cancelled.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = error instanceof SyntaxError && error.status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Request body must be valid JSON.' : 'Something went wrong on the server.' });
});

async function main() {
  await client.connect();
  const db = client.db(DB_NAME);
  rooms = db.collection('rooms');
  bookings = db.collection('bookings');
  for (const seed of seedRooms) {
    const { legacyName, ...room } = seed;
    const existing = await rooms.findOne({ $or: [{ slug: room.slug }, { name: legacyName || room.name }] });
    if (existing) await rooms.updateOne({ _id: existing._id }, { $set: room });
    else await rooms.insertOne(room);
  }
  await bookings.createIndex({ roomId: 1, checkIn: 1, checkOut: 1 });
  await bookings.createIndex({ guestEmail: 1, createdAt: -1 });
  app.listen(PORT, '127.0.0.1', () => console.log(`Aster House is open at http://127.0.0.1:${PORT}`));
}

main().catch(error => { console.error('Could not connect to MongoDB:', error.message); process.exit(1); });
