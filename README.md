# Aster House — stays, meetings and gatherings

A hotel-style booking experience for overnight rooms, hourly discussion rooms, and event spaces. Built with Node.js, Express, MongoDB's native driver, and plain HTML/CSS/JavaScript.

## Run it

1. Start MongoDB locally at `mongodb://127.0.0.1:27017`.
2. Run `npm install` once.
3. Run `npm start` and open `http://127.0.0.1:3000/`.

The app uses the dedicated `Hack_RoomBooking` database. Startup upgrades the original three sample room documents in place, preserving their MongoDB ids and any linked bookings, then adds the new hotel inventory. Rates are sample INR amounts. New reservations remain in MongoDB when the server restarts.

## MongoDB collections

- `rooms`: name, category (`stay`, `meeting`, `event`), capacity, rate, rate unit, description, amenities, and image.
- `bookings`: room reference, dates and optional times, guest details, rate snapshot, calculated total, reservation reference, and status.

## API routes

- `GET /api/rooms?category=stay&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` — room inventory with availability. Hourly categories also accept `startTime` and `endTime`.
- `POST /api/bookings` — validate availability, calculate a total on the server from the room rate and number of nights or hours, and save the reservation.
- `GET /api/bookings?email=guest@example.com` — look up active reservations for the supplied email.
- `DELETE /api/bookings/:id` — cancel a reservation when the matching email is supplied in the JSON body; the booking is retained with `cancelled` status.
