const state = { category: 'stay', rooms: [], lastEmail: localStorage.getItem('aster_guest_email') || '' };
const $ = selector => document.querySelector(selector);
const checkIn = $('#check-in');
const checkOut = $('#check-out');
const guestCount = $('#guest-count');
const roomGrid = $('#room-grid');
const dialog = $('#booking-dialog');
const dialogContent = $('#dialog-content');
const toast = $('#toast');
const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function addLocalDays(value, count) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + count);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
checkIn.value = localDate;
checkOut.value = addLocalDays(localDate, 1);
$('#lookup-email').value = state.lastEmail;

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function money(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value); }
function shortDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', options);
}
function duration(room) {
  if (room.rateUnit === 'night') return Math.max(1, Math.round((Date.parse(`${checkOut.value}T00:00:00Z`) - Date.parse(`${checkIn.value}T00:00:00Z`)) / 86400000));
  const from = $('#start-time').value;
  const to = $('#end-time').value;
  return Math.max(0, (Date.parse(`1970-01-01T${to}:00Z`) - Date.parse(`1970-01-01T${from}:00Z`)) / 3600000);
}
function unitLabel(room) { return room.rateUnit === 'night' ? 'night' : 'hour'; }
function categoryName(category) { return ({ stay: 'STAY', meeting: 'MEETING ROOM', event: 'EVENT SPACE' })[category] || 'SPACE'; }

function syncCategory() {
  const overnight = state.category === 'stay';
  $('#checkout-field').classList.toggle('hidden', !overnight);
  $('#start-field').classList.toggle('hidden', overnight);
  $('#end-field').classList.toggle('hidden', overnight);
  $('#arrival-label').textContent = overnight ? 'CHECK IN' : 'DATE';
  $('#search-note').textContent = overnight
    ? 'A considered stay, from one night to a long weekend.'
    : state.category === 'meeting' ? 'Thoughtful spaces for better conversations, by the hour.' : 'Gather beautifully, with a setting made for the occasion.';
  $('#guest-count').innerHTML = overnight
    ? '<option value="1">1 guest</option><option value="2" selected>2 guests</option><option value="3">3 guests</option>'
    : state.category === 'meeting'
      ? '<option value="2">2 guests</option><option value="4">4 guests</option><option value="6">6 guests</option><option value="10" selected>10 guests</option>'
      : '<option value="10">10 guests</option><option value="20">20 guests</option><option value="30">30 guests</option><option value="50" selected>50 guests</option>';
}

function roomImage(room, extra = '') {
  return `<div class="room-photo ${extra}"><img loading="lazy" src="https://images.unsplash.com/${esc(room.image)}?auto=format&fit=crop&w=1100&q=82" alt="${esc(room.name)} at Aster House" onerror="this.style.display='none'"><span class="photo-kicker">ASTER HOUSE · ${categoryName(room.category)}</span><span class="photo-number">✳</span></div>`;
}

function renderRooms(rooms) {
  if (!rooms.length) {
    roomGrid.innerHTML = '<div class="empty-state"><span>✳</span><h3>No spaces in this collection just yet.</h3><p>Try another category or a different date.</p></div>';
    return;
  }
  roomGrid.innerHTML = rooms.map((room, index) => {
    const rate = `${money(room.price)} <small>/ ${unitLabel(room)}</small>`;
    return `<article class="room-card ${index === 0 ? 'room-card-featured' : ''}">
      <button class="room-photo-button" type="button" data-select="${room._id}" aria-label="View ${esc(room.name)}">${roomImage(room)}</button>
      <div class="room-card-body"><div class="room-card-top"><span class="category-pill">${categoryName(room.category)}</span><span class="capacity">◌ &nbsp;Up to ${room.capacity}</span></div>
        <h3>${esc(room.name)}</h3><p class="room-description">${esc(room.description)}</p>
        <div class="amenity-list">${room.amenities.slice(0, 3).map(item => `<span>${esc(item)}</span>`).join('')}</div>
        <div class="room-card-bottom"><div class="rate">${rate}<span class="availability ${room.available ? '' : 'unavailable'}"><i></i>${room.available ? 'Available for your dates' : 'Unavailable for these dates'}</span></div><button class="reserve-button" type="button" data-select="${room._id}" ${room.available ? '' : 'disabled'}>${room.available ? 'View & reserve' : 'Choose another'} <span>↗</span></button></div>
      </div></article>`;
  }).join('');
}

async function searchRooms() {
  roomGrid.innerHTML = '<div class="loading-state">Finding the right space…</div>';
  const params = new URLSearchParams({ category: state.category, checkIn: checkIn.value, checkOut: state.category === 'stay' ? checkOut.value : checkIn.value });
  if (state.category !== 'stay') {
    params.set('startTime', $('#start-time').value);
    params.set('endTime', $('#end-time').value);
  }
  try {
    state.rooms = await api(`/api/rooms?${params}`);
    const availableCount = state.rooms.filter(room => room.available).length;
    $('#result-label').textContent = `${availableCount} ${availableCount === 1 ? 'SPACE' : 'SPACES'} FOR YOUR DATES`;
    renderRooms(state.rooms);
  } catch (error) {
    roomGrid.innerHTML = `<div class="empty-state"><h3>We couldn’t load availability.</h3><p>${esc(error.message)}</p></div>`;
  }
}

function openBooking(room) {
  if (!room.available) return;
  const units = duration(room);
  const estimate = Math.round(room.price * units);
  const checkoutOrTime = room.rateUnit === 'night'
    ? `<span>${shortDate(checkOut.value)}</span>`
    : `<span>${esc($('#start-time').value)} – ${esc($('#end-time').value)}</span>`;
  dialogContent.innerHTML = `<div class="dialog-layout"><div class="dialog-photo">${roomImage(room, 'dialog-room-photo')}</div><div class="dialog-form-wrap"><span class="section-label">YOUR ASTER HOUSE RESERVATION</span><h2>Make it yours.</h2><p class="dialog-intro">${esc(room.name)} · ${room.capacity} guest capacity</p>
    <div class="quote-box"><div class="quote-dates"><div><small>${room.rateUnit === 'night' ? 'ARRIVAL' : 'DATE'}</small><span>${shortDate(checkIn.value)}</span></div><span class="quote-arrow">→</span><div><small>${room.rateUnit === 'night' ? 'DEPARTURE' : 'TIME'}</small>${checkoutOrTime}</div></div><div class="quote-total"><span>${units} ${units === 1 ? unitLabel(room) : `${unitLabel(room)}s`} × ${money(room.price)}</span><strong>${money(estimate)}</strong></div></div>
    <form id="confirm-form" class="confirm-form"><label class="field"><span>YOUR NAME</span><input name="guestName" autocomplete="name" placeholder="Full name" required maxlength="90"></label><label class="field"><span>EMAIL ADDRESS</span><input name="guestEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(state.lastEmail)}" required maxlength="150"></label><label class="field"><span>NUMBER OF GUESTS</span><select name="guests">${Array.from({ length: room.capacity }, (_, i) => `<option value="${i + 1}" ${Number(guestCount.value) === i + 1 ? 'selected' : ''}>${i + 1} ${i ? 'guests' : 'guest'}</option>`).join('')}</select></label><button class="confirm-button" type="submit">Confirm reservation <span>↗</span></button><p class="fine-print">Your rate is held for these dates. The total is calculated securely by Aster House.</p><p class="form-error" id="booking-error" role="status"></p></form></div></div>`;
  dialog.showModal();
  $('#confirm-form').addEventListener('submit', event => confirmBooking(event, room));
}

async function confirmBooking(event, room) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const submit = form.querySelector('button[type="submit"]');
  const errorEl = $('#booking-error');
  submit.disabled = true;
  submit.innerHTML = 'Confirming…';
  const payload = {
    roomId: room._id,
    checkIn: checkIn.value,
    checkOut: room.rateUnit === 'night' ? checkOut.value : checkIn.value,
    startTime: room.rateUnit === 'hour' ? $('#start-time').value : undefined,
    endTime: room.rateUnit === 'hour' ? $('#end-time').value : undefined,
    guests: Number(values.guests),
    guestName: values.guestName,
    guestEmail: values.guestEmail
  };
  try {
    const reservation = await api('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    state.lastEmail = reservation.guestEmail || values.guestEmail.trim().toLowerCase();
    localStorage.setItem('aster_guest_email', state.lastEmail);
    renderConfirmation(reservation, room);
    $('#lookup-email').value = state.lastEmail;
    await loadReservations(state.lastEmail);
    searchRooms();
  } catch (error) {
    errorEl.textContent = error.message;
    submit.disabled = false;
    submit.innerHTML = 'Confirm reservation <span>↗</span>';
  }
}

function renderConfirmation(reservation, room) {
  dialogContent.innerHTML = `<div class="confirmation"><div class="confirmation-mark">✓</div><span class="section-label">ASTER HOUSE · CONFIRMED</span><h2>We’re looking forward<br>to welcoming you.</h2><p>Your reservation is saved. A summary is ready whenever you need it.</p><div class="confirmation-card">${roomImage(room, 'confirmation-photo')}<div class="confirmation-details"><div><span>${categoryName(room.category)}</span><h3>${esc(room.name)}</h3></div><strong>${money(reservation.totalPrice)}</strong></div><div class="confirmation-meta"><span>${shortDate(reservation.checkIn)}${reservation.rateUnit === 'night' ? ` — ${shortDate(reservation.checkOut)}` : ` · ${esc(reservation.startTime)}–${esc(reservation.endTime)}`}</span><span>Reference ${esc(reservation.reference)}</span></div></div><button class="confirm-button" type="button" id="done-button">Continue exploring <span>↗</span></button></div>`;
  $('#done-button').addEventListener('click', () => dialog.close());
}

async function loadReservations(email) {
  const host = $('#reservation-list');
  if (!email) { host.innerHTML = '<p class="quiet-note">Your confirmed stays and space bookings will appear here.</p>'; return; }
  host.innerHTML = '<p class="quiet-note">Looking for your reservations…</p>';
  try {
    const reservations = await api(`/api/bookings?email=${encodeURIComponent(email)}`);
    if (!reservations.length) { host.innerHTML = '<p class="quiet-note">No active reservations found for that email.</p>'; return; }
    host.innerHTML = reservations.map(item => `<article class="reservation-card"><div class="reservation-icon">✳</div><div class="reservation-main"><span class="category-pill">${categoryName(item.category)}</span><h3>${esc(item.roomName)}</h3><p>${shortDate(item.checkIn)}${item.rateUnit === 'night' ? ` — ${shortDate(item.checkOut)}` : ` · ${esc(item.startTime)}–${esc(item.endTime)}`} · ${item.guests} ${item.guests === 1 ? 'guest' : 'guests'}</p><small>REF ${esc(item.reference)}</small></div><div class="reservation-price"><strong>${money(item.totalPrice)}</strong><button class="cancel-link" type="button" data-cancel="${item._id}">Cancel reservation</button></div></article>`).join('');
  } catch (error) { host.innerHTML = `<p class="quiet-note error-note">${esc(error.message)}</p>`; }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3600);
}

document.querySelectorAll('.category-tab').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.category-tab.active')?.classList.remove('active');
  button.classList.add('active');
  state.category = button.dataset.category;
  syncCategory();
  searchRooms();
}));
$('#search-form').addEventListener('submit', event => { event.preventDefault(); searchRooms(); });
checkIn.addEventListener('change', () => {
  if (checkOut.value <= checkIn.value) checkOut.value = addLocalDays(checkIn.value, 1);
});
roomGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-select]');
  if (!button) return;
  const room = state.rooms.find(item => item._id === button.dataset.select);
  if (room) openBooking(room);
});
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#lookup-form').addEventListener('submit', event => {
  event.preventDefault();
  state.lastEmail = $('#lookup-email').value.trim().toLowerCase();
  localStorage.setItem('aster_guest_email', state.lastEmail);
  loadReservations(state.lastEmail);
});
$('#reservation-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel]');
  if (!button) return;
  if (!window.confirm('Cancel this reservation?')) return;
  button.disabled = true;
  try {
    await api(`/api/bookings/${button.dataset.cancel}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: state.lastEmail }) });
    showToast('Reservation cancelled.');
    await loadReservations(state.lastEmail);
    searchRooms();
  } catch (error) { showToast(error.message); button.disabled = false; }
});

syncCategory();
searchRooms();
if (state.lastEmail) loadReservations(state.lastEmail);
